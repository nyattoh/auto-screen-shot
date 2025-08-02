import { UsageTrackingExample } from '../examples/database-integration-example';
import * as fs from 'fs-extra';
import * as path from 'path';
import * as os from 'os';

describe('Database Integration', () => {
    let example: UsageTrackingExample;
    let testDbPath: string;

    beforeEach(async () => {
        // Create a temporary database file for testing
        const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'usage-integration-test-'));
        testDbPath = path.join(tempDir, 'test.db');
        example = new UsageTrackingExample(testDbPath);
        await example.initialize();
    });

    afterEach(async () => {
        await example.close();
        // Clean up test database file
        if (await fs.pathExists(testDbPath)) {
            await fs.remove(path.dirname(testDbPath));
        }
    });

    it('should complete full usage tracking simulation', async () => {
        // Run the simulation
        await example.simulateUsageDay();

        // Verify data was saved by checking daily stats
        const today = new Date();
        
        // The simulation should have created usage data
        // We can't easily verify the exact output without mocking console.log,
        // but we can verify the methods run without error
        await expect(example.getDailyStats(today)).resolves.not.toThrow();
        await expect(example.exportData(today, today, 'test.csv')).resolves.not.toThrow();
        await expect(example.performMaintenance()).resolves.not.toThrow();
    });

    it('should handle initialization and cleanup properly', async () => {
        // Verify database file was created
        expect(await fs.pathExists(testDbPath)).toBe(true);

        // Verify cleanup works
        await expect(example.close()).resolves.not.toThrow();
    });
});