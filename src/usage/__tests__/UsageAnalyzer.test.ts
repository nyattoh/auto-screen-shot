import { UsageAnalyzer, DailyAnalysis, AppUsage, CategoryUsage } from '../UsageAnalyzer';
import { IUsageDatabase, DailyUsage, HourlySessionData } from '../UsageDatabase';

// Mock database implementation for testing
class MockUsageDatabase implements IUsageDatabase {
    private mockDailyUsage: DailyUsage[] = [];
    private mockHourlyUsage: HourlySessionData[] = [];

    setMockDailyUsage(data: DailyUsage[]) {
        this.mockDailyUsage = data;
    }

    setMockHourlyUsage(data: HourlySessionData[]) {
        this.mockHourlyUsage = data;
    }

    async initialize(): Promise<void> {}
    
    async saveSession(): Promise<void> {}
    
    async getDailyUsage(date: Date): Promise<DailyUsage[]> {
        return this.mockDailyUsage;
    }

    async getHourlyUsage(date: Date): Promise<HourlySessionData[]> {
        return this.mockHourlyUsage;
    }
    
    async getDateRange() {
        return { startDate: new Date(), endDate: new Date() };
    }
    
    async cleanup(): Promise<void> {}
    
    async exportToCSV(): Promise<string> {
        return '';
    }
    
    async saveSitePattern(): Promise<void> {}
    
    async getSitePatterns() {
        return [];
    }
    
    async close(): Promise<void> {}
}

describe('UsageAnalyzer', () => {
    let analyzer: UsageAnalyzer;
    let mockDatabase: MockUsageDatabase;

    beforeEach(() => {
        mockDatabase = new MockUsageDatabase();
        analyzer = new UsageAnalyzer(mockDatabase);
    });

    describe('formatDuration', () => {
        test('should format minutes correctly', () => {
            expect(analyzer.formatDuration(0)).toBe('0:00');
            expect(analyzer.formatDuration(0.5)).toBe('0:00');
            expect(analyzer.formatDuration(5)).toBe('0:05');
            expect(analyzer.formatDuration(30)).toBe('0:30');
            expect(analyzer.formatDuration(60)).toBe('1:00');
            expect(analyzer.formatDuration(65)).toBe('1:05');
            expect(analyzer.formatDuration(125)).toBe('2:05');
            expect(analyzer.formatDuration(720)).toBe('12:00');
        });
    });

    describe('analyzeDailyUsage', () => {
        test('should return empty analysis for no data', async () => {
            mockDatabase.setMockDailyUsage([]);
            mockDatabase.setMockHourlyUsage([]);

            const result = await analyzer.analyzeDailyUsage(new Date('2024-01-15'));

            expect(result).toEqual({
                date: '2024-01-15',
                totalScreenTime: 0,
                applicationBreakdown: [],
                categoryBreakdown: [],
                peakHours: []
            });
        });

        test('should analyze daily usage correctly', async () => {
            const mockData: DailyUsage[] = [
                {
                    date: '2024-01-15',
                    application: 'Chrome',
                    content: 'ChatGPT',
                    category: 'Browser',
                    totalDuration: 120, // 2 hours
                    sessionCount: 3
                },
                {
                    date: '2024-01-15',
                    application: 'Chrome',
                    content: 'YouTube',
                    category: 'Browser',
                    totalDuration: 60, // 1 hour
                    sessionCount: 2
                },
                {
                    date: '2024-01-15',
                    application: 'VS Code',
                    content: 'TypeScript Project',
                    category: 'Development',
                    totalDuration: 180, // 3 hours
                    sessionCount: 1
                }
            ];

            const mockHourlyData: HourlySessionData[] = [
                { hour: 9, totalDuration: 60, sessionCount: 2 },
                { hour: 14, totalDuration: 120, sessionCount: 3 },
                { hour: 16, totalDuration: 180, sessionCount: 1 }
            ];

            mockDatabase.setMockDailyUsage(mockData);
            mockDatabase.setMockHourlyUsage(mockHourlyData);

            const result = await analyzer.analyzeDailyUsage(new Date('2024-01-15'));

            expect(result.date).toBe('2024-01-15');
            expect(result.totalScreenTime).toBe(360); // 6 hours total
            expect(result.applicationBreakdown).toHaveLength(3);
            expect(result.categoryBreakdown).toHaveLength(2);
            expect(result.peakHours).toHaveLength(3);

            // Check application breakdown
            const vsCodeApp = result.applicationBreakdown.find(app => app.application === 'VS Code');
            expect(vsCodeApp).toEqual({
                application: 'VS Code',
                content: 'TypeScript Project',
                duration: 180,
                percentage: 50, // 180/360 * 100
                formattedDuration: '3:00'
            });

            // Check category breakdown
            const browserCategory = result.categoryBreakdown.find(cat => cat.category === 'Browser');
            expect(browserCategory).toEqual({
                category: 'Browser',
                duration: 180, // 120 + 60
                percentage: 50, // 180/360 * 100
                formattedDuration: '3:00',
                applications: ['Chrome']
            });

            // Check peak hours (should be sorted by duration desc)
            expect(result.peakHours[0]).toEqual({
                hour: 16,
                duration: 180,
                formattedDuration: '3:00'
            });
        });
    });

    describe('getTopApplications', () => {
        test('should return empty array for no data', async () => {
            mockDatabase.setMockDailyUsage([]);

            const result = await analyzer.getTopApplications(new Date('2024-01-15'), 5);

            expect(result).toEqual([]);
        });

        test('should return top applications sorted by duration', async () => {
            const mockData: DailyUsage[] = [
                {
                    date: '2024-01-15',
                    application: 'Chrome',
                    content: 'ChatGPT',
                    category: 'Browser',
                    totalDuration: 60,
                    sessionCount: 2
                },
                {
                    date: '2024-01-15',
                    application: 'VS Code',
                    content: 'Project',
                    category: 'Development',
                    totalDuration: 120,
                    sessionCount: 1
                },
                {
                    date: '2024-01-15',
                    application: 'Slack',
                    content: 'Team Chat',
                    category: 'Communication',
                    totalDuration: 30,
                    sessionCount: 5
                }
            ];

            mockDatabase.setMockDailyUsage(mockData);

            const result = await analyzer.getTopApplications(new Date('2024-01-15'), 2);

            expect(result).toHaveLength(2);
            expect(result[0].application).toBe('VS Code');
            expect(result[0].duration).toBe(120);
            expect(result[1].application).toBe('Chrome');
            expect(result[1].duration).toBe(60);
        });
    });

    describe('getCategoryBreakdown', () => {
        test('should return empty array for no data', async () => {
            mockDatabase.setMockDailyUsage([]);

            const result = await analyzer.getCategoryBreakdown(new Date('2024-01-15'));

            expect(result).toEqual([]);
        });

        test('should group applications by category correctly', async () => {
            const mockData: DailyUsage[] = [
                {
                    date: '2024-01-15',
                    application: 'Chrome',
                    content: 'ChatGPT',
                    category: 'Browser',
                    totalDuration: 60,
                    sessionCount: 2
                },
                {
                    date: '2024-01-15',
                    application: 'Firefox',
                    content: 'GitHub',
                    category: 'Browser',
                    totalDuration: 40,
                    sessionCount: 1
                },
                {
                    date: '2024-01-15',
                    application: 'VS Code',
                    content: 'Project',
                    category: 'Development',
                    totalDuration: 120,
                    sessionCount: 1
                }
            ];

            mockDatabase.setMockDailyUsage(mockData);

            const result = await analyzer.getCategoryBreakdown(new Date('2024-01-15'));

            expect(result).toHaveLength(2);
            
            const developmentCategory = result.find(cat => cat.category === 'Development');
            expect(developmentCategory).toEqual({
                category: 'Development',
                duration: 120,
                percentage: 55, // 120/220 * 100 rounded
                formattedDuration: '2:00',
                applications: ['VS Code']
            });

            const browserCategory = result.find(cat => cat.category === 'Browser');
            expect(browserCategory).toEqual({
                category: 'Browser',
                duration: 100, // 60 + 40
                percentage: 45, // 100/220 * 100 rounded
                formattedDuration: '1:40',
                applications: ['Chrome', 'Firefox']
            });

            // Should be sorted by duration descending
            expect(result[0].category).toBe('Development');
            expect(result[1].category).toBe('Browser');
        });

        test('should calculate percentages correctly', async () => {
            const mockData: DailyUsage[] = [
                {
                    date: '2024-01-15',
                    application: 'App1',
                    content: 'Content1',
                    category: 'Category1',
                    totalDuration: 75, // 75% of total
                    sessionCount: 1
                },
                {
                    date: '2024-01-15',
                    application: 'App2',
                    content: 'Content2',
                    category: 'Category2',
                    totalDuration: 25, // 25% of total
                    sessionCount: 1
                }
            ];

            mockDatabase.setMockDailyUsage(mockData);

            const result = await analyzer.getCategoryBreakdown(new Date('2024-01-15'));

            expect(result[0].percentage).toBe(75);
            expect(result[1].percentage).toBe(25);
        });
    });
});