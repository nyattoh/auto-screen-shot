import { UsageDatabase, UsageSession, SitePattern } from '../UsageDatabase';
import * as fs from 'fs-extra';
import * as path from 'path';
import * as os from 'os';

describe('UsageDatabase', () => {
    let database: UsageDatabase;
    let testDbPath: string;

    beforeEach(async () => {
        // Create a temporary database file for testing
        const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'usage-db-test-'));
        testDbPath = path.join(tempDir, 'test.db');
        database = new UsageDatabase(testDbPath);
        await database.initialize();
    });

    afterEach(async () => {
        await database.close();
        // Clean up test database file
        if (await fs.pathExists(testDbPath)) {
            await fs.remove(path.dirname(testDbPath));
        }
    });

    describe('initialization', () => {
        it('should create database file and tables', async () => {
            expect(await fs.pathExists(testDbPath)).toBe(true);
        });

        it('should handle database directory creation', async () => {
            const nestedPath = path.join(path.dirname(testDbPath), 'nested', 'test.db');
            const nestedDb = new UsageDatabase(nestedPath);
            
            await nestedDb.initialize();
            expect(await fs.pathExists(nestedPath)).toBe(true);
            
            await nestedDb.close();
            await fs.remove(path.dirname(nestedPath));
        });
    });

    describe('session management', () => {
        const createTestSession = (overrides: Partial<UsageSession> = {}): UsageSession => {
            const now = new Date();
            const startTime = new Date(now.getTime() - 300000); // 5 minutes ago
            
            return {
                windowTitle: 'Test Window',
                processName: 'test.exe',
                processId: 1234,
                application: 'Test App',
                content: 'Test Content',
                category: 'Productivity',
                startTime,
                endTime: now,
                duration: 300000, // 5 minutes in milliseconds
                date: now.toISOString().split('T')[0],
                ...overrides
            };
        };

        it('should save and retrieve usage sessions', async () => {
            const session = createTestSession();
            await database.saveSession(session);

            const dailyUsage = await database.getDailyUsage(new Date(session.date));
            expect(dailyUsage).toHaveLength(1);
            expect(dailyUsage[0]).toMatchObject({
                date: session.date,
                application: session.application,
                content: session.content,
                category: session.category,
                totalDuration: 5, // 5 minutes
                sessionCount: 1
            });
        });

        it('should aggregate multiple sessions for the same application', async () => {
            const baseSession = createTestSession();
            const session1 = { ...baseSession, duration: 300000 }; // 5 minutes
            const session2 = { ...baseSession, duration: 600000 }; // 10 minutes

            await database.saveSession(session1);
            await database.saveSession(session2);

            const dailyUsage = await database.getDailyUsage(new Date(baseSession.date));
            expect(dailyUsage).toHaveLength(1);
            expect(dailyUsage[0]).toMatchObject({
                totalDuration: 15, // 15 minutes total
                sessionCount: 2
            });
        });

        it('should separate different applications', async () => {
            const session1 = createTestSession({ application: 'App1', content: 'Content1' });
            const session2 = createTestSession({ application: 'App2', content: 'Content2' });

            await database.saveSession(session1);
            await database.saveSession(session2);

            const dailyUsage = await database.getDailyUsage(new Date(session1.date));
            expect(dailyUsage).toHaveLength(2);
            expect(dailyUsage.map(u => u.application)).toContain('App1');
            expect(dailyUsage.map(u => u.application)).toContain('App2');
        });

        it('should handle empty results gracefully', async () => {
            const futureDate = new Date();
            futureDate.setFullYear(futureDate.getFullYear() + 1);

            const dailyUsage = await database.getDailyUsage(futureDate);
            expect(dailyUsage).toHaveLength(0);
        });
    });

    describe('date range functionality', () => {
        it('should return correct date range when data exists', async () => {
            const today = new Date();
            const yesterday = new Date(today);
            yesterday.setDate(yesterday.getDate() - 1);

            const session1 = createTestSession({ date: yesterday.toISOString().split('T')[0] });
            const session2 = createTestSession({ date: today.toISOString().split('T')[0] });

            await database.saveSession(session1);
            await database.saveSession(session2);

            const dateRange = await database.getDateRange();
            expect(dateRange.startDate.toISOString().split('T')[0]).toBe(yesterday.toISOString().split('T')[0]);
            expect(dateRange.endDate.toISOString().split('T')[0]).toBe(today.toISOString().split('T')[0]);
        });

        it('should return current date when no data exists', async () => {
            const dateRange = await database.getDateRange();
            const today = new Date().toISOString().split('T')[0];
            
            expect(dateRange.startDate.toISOString().split('T')[0]).toBe(today);
            expect(dateRange.endDate.toISOString().split('T')[0]).toBe(today);
        });
    });

    describe('data cleanup', () => {
        it('should remove old data beyond retention period', async () => {
            const today = new Date();
            const oldDate = new Date(today);
            oldDate.setDate(oldDate.getDate() - 35); // 35 days ago
            const recentDate = new Date(today);
            recentDate.setDate(recentDate.getDate() - 5); // 5 days ago

            const oldSession = createTestSession({ 
                date: oldDate.toISOString().split('T')[0],
                application: 'Old App'
            });
            const recentSession = createTestSession({ 
                date: recentDate.toISOString().split('T')[0],
                application: 'Recent App'
            });

            await database.saveSession(oldSession);
            await database.saveSession(recentSession);

            // Cleanup with 30 days retention
            await database.cleanup(30);

            // Old session should be removed
            const oldDayUsage = await database.getDailyUsage(oldDate);
            expect(oldDayUsage).toHaveLength(0);

            // Recent session should remain
            const recentDayUsage = await database.getDailyUsage(recentDate);
            expect(recentDayUsage).toHaveLength(1);
        });

        it('should handle cleanup when no old data exists', async () => {
            await expect(database.cleanup(30)).resolves.not.toThrow();
        });
    });

    describe('CSV export', () => {
        it('should export data to CSV format', async () => {
            const session = createTestSession({
                windowTitle: 'Test "Window" Title',
                application: 'Test,App',
                content: 'Test\nContent'
            });

            await database.saveSession(session);

            const startDate = new Date(session.date);
            const endDate = new Date(session.date);
            const csv = await database.exportToCSV(startDate, endDate);

            expect(csv).toContain('Date,Application,Content,Category');
            expect(csv).toContain(session.date);
            expect(csv).toContain('"Test,App"'); // CSV escaping
            expect(csv).toContain('"Test\nContent"'); // CSV escaping
            expect(csv).toContain('5'); // Duration in minutes
        });

        it('should handle date range filtering', async () => {
            const today = new Date();
            const yesterday = new Date(today);
            yesterday.setDate(yesterday.getDate() - 1);
            const tomorrow = new Date(today);
            tomorrow.setDate(tomorrow.getDate() + 1);

            const session1 = createTestSession({ 
                date: yesterday.toISOString().split('T')[0],
                application: 'Yesterday App'
            });
            const session2 = createTestSession({ 
                date: today.toISOString().split('T')[0],
                application: 'Today App'
            });

            await database.saveSession(session1);
            await database.saveSession(session2);

            // Export only today's data
            const csv = await database.exportToCSV(today, today);
            expect(csv).toContain('Today App');
            expect(csv).not.toContain('Yesterday App');
        });

        it('should return empty CSV when no data in range', async () => {
            const futureDate = new Date();
            futureDate.setFullYear(futureDate.getFullYear() + 1);

            const csv = await database.exportToCSV(futureDate, futureDate);
            expect(csv).toBe('Date,Application,Content,Category,Window Title,Process Name,Start Time,End Time,Duration (minutes)\n');
        });
    });

    describe('site patterns', () => {
        const createTestPattern = (overrides: Partial<SitePattern> = {}): SitePattern => ({
            name: 'Test Site',
            patterns: ['*test.com*', '*example.org*'],
            category: 'Social',
            icon: 'test-icon.png',
            ...overrides
        });

        it('should save and retrieve site patterns', async () => {
            const pattern = createTestPattern();
            await database.saveSitePattern(pattern);

            const patterns = await database.getSitePatterns();
            expect(patterns).toHaveLength(1);
            expect(patterns[0]).toMatchObject({
                name: pattern.name,
                patterns: pattern.patterns,
                category: pattern.category,
                icon: pattern.icon
            });
            expect(patterns[0].id).toBeDefined();
        });

        it('should update existing patterns', async () => {
            const pattern = createTestPattern();
            await database.saveSitePattern(pattern);

            const updatedPattern = { ...pattern, category: 'Updated Category' };
            await database.saveSitePattern(updatedPattern);

            const patterns = await database.getSitePatterns();
            expect(patterns).toHaveLength(1);
            expect(patterns[0].category).toBe('Updated Category');
        });

        it('should handle patterns without icons', async () => {
            const pattern = createTestPattern({ icon: undefined });
            await database.saveSitePattern(pattern);

            const patterns = await database.getSitePatterns();
            expect(patterns[0].icon).toBeNull();
        });

        it('should return empty array when no patterns exist', async () => {
            const patterns = await database.getSitePatterns();
            expect(patterns).toHaveLength(0);
        });
    });

    describe('error handling', () => {
        it('should throw error when database is not initialized', async () => {
            const uninitializedDb = new UsageDatabase();
            
            await expect(uninitializedDb.saveSession(createTestSession())).rejects.toThrow('Database not initialized');
            await expect(uninitializedDb.getDailyUsage(new Date())).rejects.toThrow('Database not initialized');
            await expect(uninitializedDb.getDateRange()).rejects.toThrow('Database not initialized');
        });

        it('should handle database close gracefully', async () => {
            await database.close();
            await expect(database.close()).resolves.not.toThrow();
        });
    });

    // Helper function to create test session
    function createTestSession(overrides: Partial<UsageSession> = {}): UsageSession {
        const now = new Date();
        const startTime = new Date(now.getTime() - 300000); // 5 minutes ago
        
        return {
            windowTitle: 'Test Window',
            processName: 'test.exe',
            processId: 1234,
            application: 'Test App',
            content: 'Test Content',
            category: 'Productivity',
            startTime,
            endTime: now,
            duration: 300000, // 5 minutes in milliseconds
            date: now.toISOString().split('T')[0],
            ...overrides
        };
    }
});