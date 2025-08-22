import { UsageDatabase, UsageSession } from '../UsageDatabase';
import * as path from 'path';
import * as fs from 'fs-extra';
import * as os from 'os';

describe('CSV Export Integration Tests', () => {
    let database: UsageDatabase;
    let tempDbPath: string;

    beforeEach(async () => {
        // テスト用の一時データベースファイルを作成
        const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'csv-export-test-'));
        tempDbPath = path.join(tempDir, 'test-usage.db');
        database = new UsageDatabase(tempDbPath);
        await database.initialize();
    });

    afterEach(async () => {
        await database.close();
        await fs.remove(path.dirname(tempDbPath));
    });

    describe('CSV Export Functionality', () => {
        test('空のデータベースから空のCSVを生成する', async () => {
            const startDate = new Date('2025-08-22');
            const endDate = new Date('2025-08-22');
            
            const csvData = await database.exportToCSV(startDate, endDate);
            
            expect(csvData).toBe('Date,Application,Content,Category,Window Title,Process Name,Start Time,End Time,Duration (minutes)\n');
        });

        test('単一セッションのCSVエクスポート', async () => {
            const session: UsageSession = {
                windowTitle: 'Google - Google Chrome',
                processName: 'chrome.exe',
                processId: 1234,
                application: 'Google Chrome',
                content: 'Google',
                category: 'Browser',
                startTime: new Date('2025-08-22T10:00:00Z'),
                endTime: new Date('2025-08-22T10:05:00Z'),
                duration: 300000, // 5分
                date: '2025-08-22'
            };

            await database.saveSession(session);

            const csvData = await database.exportToCSV(
                new Date('2025-08-22'),
                new Date('2025-08-22')
            );

            const lines = csvData.trim().split('\n');
            expect(lines).toHaveLength(2); // ヘッダー + 1行のデータ
            
            const header = lines[0];
            expect(header).toBe('Date,Application,Content,Category,Window Title,Process Name,Start Time,End Time,Duration (minutes)');
            
            const dataLine = lines[1];
            expect(dataLine).toContain('2025-08-22');
            expect(dataLine).toContain('Google Chrome');
            expect(dataLine).toContain('Google');
            expect(dataLine).toContain('Browser');
            expect(dataLine).toContain('5'); // 5分
        });

        test('複数セッションのCSVエクスポート', async () => {
            const sessions: UsageSession[] = [
                {
                    windowTitle: 'Google - Google Chrome',
                    processName: 'chrome.exe',
                    processId: 1234,
                    application: 'Google Chrome',
                    content: 'Google',
                    category: 'Browser',
                    startTime: new Date('2025-08-22T10:00:00Z'),
                    endTime: new Date('2025-08-22T10:05:00Z'),
                    duration: 300000,
                    date: '2025-08-22'
                },
                {
                    windowTitle: 'Visual Studio Code',
                    processName: 'code.exe',
                    processId: 5678,
                    application: 'Visual Studio Code',
                    content: 'statisticsWindow.ts',
                    category: 'Development',
                    startTime: new Date('2025-08-22T11:00:00Z'),
                    endTime: new Date('2025-08-22T11:15:00Z'),
                    duration: 900000, // 15分
                    date: '2025-08-22'
                }
            ];

            for (const session of sessions) {
                await database.saveSession(session);
            }

            const csvData = await database.exportToCSV(
                new Date('2025-08-22'),
                new Date('2025-08-22')
            );

            const lines = csvData.trim().split('\n');
            expect(lines).toHaveLength(3); // ヘッダー + 2行のデータ
            
            // データが時系列順になっていることを確認
            expect(lines[1]).toContain('Google Chrome');
            expect(lines[2]).toContain('Visual Studio Code');
            expect(lines[2]).toContain('15'); // 15分
        });

        test('日付範囲指定でのCSVエクスポート', async () => {
            const sessions: UsageSession[] = [
                {
                    windowTitle: 'Day 1 App',
                    processName: 'app1.exe',
                    processId: 1111,
                    application: 'App1',
                    content: 'Content1',
                    category: 'Application',
                    startTime: new Date('2025-08-20T10:00:00Z'),
                    endTime: new Date('2025-08-20T10:10:00Z'),
                    duration: 600000, // 10分
                    date: '2025-08-20'
                },
                {
                    windowTitle: 'Day 2 App',
                    processName: 'app2.exe',
                    processId: 2222,
                    application: 'App2',
                    content: 'Content2',
                    category: 'Application',
                    startTime: new Date('2025-08-21T10:00:00Z'),
                    endTime: new Date('2025-08-21T10:20:00Z'),
                    duration: 1200000, // 20分
                    date: '2025-08-21'
                },
                {
                    windowTitle: 'Day 3 App',
                    processName: 'app3.exe',
                    processId: 3333,
                    application: 'App3',
                    content: 'Content3',
                    category: 'Application',
                    startTime: new Date('2025-08-22T10:00:00Z'),
                    endTime: new Date('2025-08-22T10:30:00Z'),
                    duration: 1800000, // 30分
                    date: '2025-08-22'
                }
            ];

            for (const session of sessions) {
                await database.saveSession(session);
            }

            // 2日間のデータをエクスポート
            const csvData = await database.exportToCSV(
                new Date('2025-08-20'),
                new Date('2025-08-21')
            );

            const lines = csvData.trim().split('\n');
            expect(lines).toHaveLength(3); // ヘッダー + 2行（day1, day2のみ）
            
            expect(lines[1]).toContain('App1');
            expect(lines[2]).toContain('App2');
            expect(csvData).not.toContain('App3'); // 範囲外なので含まれない
        });

        test('CSVフィールドエスケープ処理', async () => {
            const session: UsageSession = {
                windowTitle: 'Test, "Quote" Window\nWith newline',
                processName: 'test.exe',
                processId: 1234,
                application: 'Test Application',
                content: 'Content with, comma and "quotes"',
                category: 'Test',
                startTime: new Date('2025-08-22T10:00:00Z'),
                endTime: new Date('2025-08-22T10:05:00Z'),
                duration: 300000,
                date: '2025-08-22'
            };

            await database.saveSession(session);

            const csvData = await database.exportToCSV(
                new Date('2025-08-22'),
                new Date('2025-08-22')
            );

            // カンマやクォートを含むフィールドが正しくエスケープされていることを確認
            expect(csvData).toContain('"Test, ""Quote"" Window\nWith newline"');
            expect(csvData).toContain('"Content with, comma and ""quotes"""');
        });

        test('大量データのCSVエクスポート性能', async () => {
            const sessions: UsageSession[] = [];
            
            // 100件のセッションデータを生成（時刻を適切に計算）
            for (let i = 0; i < 100; i++) {
                const hour = Math.floor(i / 4) % 24;
                const minute = (i % 4) * 15;
                const startTime = new Date(`2025-08-22T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00Z`);
                const endTime = new Date(startTime.getTime() + 60000); // 1分後
                
                sessions.push({
                    windowTitle: `Window ${i}`,
                    processName: 'test.exe',
                    processId: 1000 + i,
                    application: `App ${i % 10}`,
                    content: `Content ${i}`,
                    category: i % 2 === 0 ? 'Browser' : 'Application',
                    startTime: startTime,
                    endTime: endTime,
                    duration: 60000, // 1分
                    date: '2025-08-22'
                });
            }

            // データを一括保存
            for (const session of sessions) {
                await database.saveSession(session);
            }

            const startTime = Date.now();
            const csvData = await database.exportToCSV(
                new Date('2025-08-22'),
                new Date('2025-08-22')
            );
            const endTime = Date.now();

            // 性能チェック（2秒以内）
            expect(endTime - startTime).toBeLessThan(2000);

            // データ件数チェック
            const lines = csvData.trim().split('\n');
            expect(lines).toHaveLength(101); // ヘッダー + 100行
        });
    });

    describe('Date Range Session Retrieval', () => {
        test('日付範囲でのセッション取得', async () => {
            const sessions: UsageSession[] = [
                {
                    windowTitle: 'App 1',
                    processName: 'app1.exe',
                    processId: 1111,
                    application: 'Application 1',
                    content: 'Content 1',
                    category: 'Application',
                    startTime: new Date('2025-08-20T10:00:00Z'),
                    endTime: new Date('2025-08-20T10:10:00Z'),
                    duration: 600000,
                    date: '2025-08-20'
                },
                {
                    windowTitle: 'App 2',
                    processName: 'app2.exe',
                    processId: 2222,
                    application: 'Application 2',
                    content: 'Content 2',
                    category: 'Application',
                    startTime: new Date('2025-08-22T10:00:00Z'),
                    endTime: new Date('2025-08-22T10:10:00Z'),
                    duration: 600000,
                    date: '2025-08-22'
                }
            ];

            for (const session of sessions) {
                await database.saveSession(session);
            }

            const rangeSessions = await database.getDateRangeSessions(
                new Date('2025-08-20'),
                new Date('2025-08-21')
            );

            expect(rangeSessions).toHaveLength(1);
            expect(rangeSessions[0].application).toBe('Application 1');
        });
    });
});