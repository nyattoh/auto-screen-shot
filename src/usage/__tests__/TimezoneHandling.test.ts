import { UsageDatabase, UsageSession } from '../UsageDatabase';
import * as fs from 'fs-extra';
import * as path from 'path';
import * as os from 'os';

/**
 * このテストは、タイムゾーンによる日付のずれがあっても、
 * UsageDatabase#getDailyUsage が正しい日付のセッションを取得できることを検証します。
 */
describe('UsageDatabase Timezone Handling', () => {
    let database: UsageDatabase;
    let testDbPath: string;

    beforeAll(async () => {
        const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'usage-tz-test-'));
        testDbPath = path.join(tempDir, 'test.db');
        database = new UsageDatabase(testDbPath);
        await database.initialize();
    });

    afterAll(async () => {
        await database.close();
        await fs.remove(path.dirname(testDbPath));
    });

    it('should retrieve sessions saved early in the day regardless of timezone offset', async () => {
        // 00:30 (ローカル時間) に開始したセッションを用意
        const startTime = new Date();
        startTime.setHours(0, 30, 0, 0);

        const endTime = new Date(startTime.getTime() + 5 * 60 * 1000); // +5 分

        // YYYY-MM-DD 形式 (ローカル) の日付文字列を生成
        const sessionDate = `${startTime.getFullYear()}-${String(startTime.getMonth() + 1).padStart(2, '0')}-${String(startTime.getDate()).padStart(2, '0')}`;

        const session: UsageSession = {
            windowTitle: 'Test Window',
            processName: 'test.exe',
            processId: 1234,
            application: 'Test App',
            content: 'Test Content',
            category: 'Test',
            startTime,
            endTime,
            duration: 5 * 60 * 1000,
            date: sessionDate,
        };

        await database.saveSession(session);

        // 同じカレンダー日付 (ローカル) で検索 (setHours 0:00) – UI のクイック選択相当
        const queryDate = new Date(startTime.getFullYear(), startTime.getMonth(), startTime.getDate());
        const results = await database.getDailyUsage(queryDate);

        expect(results.length).toBeGreaterThan(0);
        expect(results[0].date).toBe(sessionDate);
    });
});