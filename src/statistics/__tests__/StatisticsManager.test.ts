import { StatisticsManager } from '../StatisticsManager';
import { UsageDatabase } from '../../usage/UsageDatabase';
import Settings from '../../config/settings';
import * as fs from 'fs-extra';
import * as path from 'path';
import * as os from 'os';

// モック
jest.mock('../../utils/logger');

describe('StatisticsManager', () => {
    let statisticsManager: StatisticsManager;
    let mockUsageDatabase: jest.Mocked<UsageDatabase>;
    let mockSettings: jest.Mocked<Settings>;
    let testDbPath: string;

    beforeEach(() => {
        // テスト用のデータベースパスを作成
        const tempDir = os.tmpdir();
        testDbPath = path.join(tempDir, `test-stats-${Date.now()}.db`);

        // モックの作成
        mockUsageDatabase = {
            cleanup: jest.fn(),
            getDailyUsage: jest.fn(),
            getDetailedSessions: jest.fn(),
            getApplicationSessions: jest.fn(),
            getAvailableDates: jest.fn(),
            getDateUsageSummary: jest.fn(),
            exportToCSV: jest.fn(),
            initialize: jest.fn(),
            saveSession: jest.fn(),
            getHourlyUsage: jest.fn(),
            getDateRange: jest.fn(),
            saveSitePattern: jest.fn(),
            getSitePatterns: jest.fn(),
            getDateRangeSessions: jest.fn(),
            close: jest.fn(),
        } as any;

        mockSettings = {
            getStatisticsConfig: jest.fn(),
            setStatisticsConfig: jest.fn(),
        } as any;

        // デフォルトの統計設定を返すように設定
        mockSettings.getStatisticsConfig.mockReturnValue({
            dataRetentionDays: 90,
            cleanupIntervalHours: 24,
            enableImageOptimization: true,
            webpQuality: 80
        });

        statisticsManager = new StatisticsManager(mockUsageDatabase, mockSettings);
    });

    afterEach(() => {
        statisticsManager.stop();
        
        // テストファイルをクリーンアップ
        if (fs.existsSync(testDbPath)) {
            fs.unlinkSync(testDbPath);
        }
    });

    describe('initialization', () => {
        it('should initialize with default configuration', () => {
            expect(mockSettings.getStatisticsConfig).toHaveBeenCalled();
            
            const config = statisticsManager.getConfig();
            expect(config.dataRetentionDays).toBe(90);
            expect(config.cleanupIntervalHours).toBe(24);
            expect(config.enableImageOptimization).toBe(true);
            expect(config.webpQuality).toBe(80);
        });

        it('should handle missing statistics config gracefully', () => {
            mockSettings.getStatisticsConfig.mockReturnValue(null);
            
            const newManager = new StatisticsManager(mockUsageDatabase, mockSettings);
            const config = newManager.getConfig();
            
            expect(config.dataRetentionDays).toBe(90); // デフォルト値
            newManager.stop();
        });
    });

    describe('configuration management', () => {
        it('should update configuration correctly', () => {
            const newConfig = {
                dataRetentionDays: 60,
                webpQuality: 70
            };

            statisticsManager.updateConfig(newConfig);

            expect(mockSettings.setStatisticsConfig).toHaveBeenCalled();
            
            const config = statisticsManager.getConfig();
            expect(config.dataRetentionDays).toBe(60);
            expect(config.webpQuality).toBe(70);
            expect(config.cleanupIntervalHours).toBe(24); // 変更されていない値はそのまま
        });
    });

    describe('maintenance operations', () => {
        it('should perform maintenance successfully', async () => {
            mockUsageDatabase.cleanup.mockResolvedValue();

            await statisticsManager.performMaintenance();

            expect(mockUsageDatabase.cleanup).toHaveBeenCalledWith(90);
        });

        it('should handle maintenance errors', async () => {
            const error = new Error('Cleanup failed');
            mockUsageDatabase.cleanup.mockRejectedValue(error);

            await expect(statisticsManager.performMaintenance()).rejects.toThrow('Cleanup failed');
        });

        it('should perform manual cleanup with result reporting', async () => {
            const beforeDates = ['2025-01-01', '2025-01-02', '2025-01-03'];
            const afterDates = ['2025-01-02', '2025-01-03'];

            mockUsageDatabase.getAvailableDates
                .mockResolvedValueOnce(beforeDates)
                .mockResolvedValueOnce(afterDates);
            mockUsageDatabase.cleanup.mockResolvedValue();

            const result = await statisticsManager.manualCleanup();

            expect(result.deletedRecords).toBe(1);
            expect(mockUsageDatabase.cleanup).toHaveBeenCalledWith(90);
        });
    });

    describe('data retrieval', () => {
        it('should get daily usage data', async () => {
            const mockData = [
                {
                    date: '2025-01-01',
                    application: 'Chrome',
                    content: 'Google',
                    category: 'Browser',
                    totalDuration: 120,
                    sessionCount: 3
                }
            ];
            mockUsageDatabase.getDailyUsage.mockResolvedValue(mockData);

            const result = await statisticsManager.getDailyUsage(new Date('2025-01-01'));

            expect(result).toEqual(mockData);
            expect(mockUsageDatabase.getDailyUsage).toHaveBeenCalledWith(new Date('2025-01-01'));
        });

        it('should handle data retrieval errors gracefully', async () => {
            mockUsageDatabase.getDailyUsage.mockRejectedValue(new Error('Database error'));

            const result = await statisticsManager.getDailyUsage(new Date('2025-01-01'));

            expect(result).toEqual([]);
        });

        it('should get detailed sessions', async () => {
            const mockSessions = [
                {
                    id: 1,
                    windowTitle: 'Test Window',
                    processName: 'chrome.exe',
                    application: 'Chrome',
                    content: 'Google',
                    category: 'Browser',
                    startTime: new Date('2025-01-01T10:00:00'),
                    endTime: new Date('2025-01-01T10:30:00'),
                    duration: 1800000,
                    date: '2025-01-01'
                }
            ];
            mockUsageDatabase.getDetailedSessions.mockResolvedValue(mockSessions);

            const result = await statisticsManager.getDetailedSessions(new Date('2025-01-01'));

            expect(result).toEqual(mockSessions);
        });

        it('should get available dates', async () => {
            const mockDates = ['2025-01-01', '2025-01-02', '2025-01-03'];
            mockUsageDatabase.getAvailableDates.mockResolvedValue(mockDates);

            const result = await statisticsManager.getAvailableDates();

            expect(result).toEqual(mockDates);
        });
    });

    describe('health check', () => {
        it('should report healthy status with recent data', async () => {
            const today = new Date().toISOString().split('T')[0];
            mockUsageDatabase.getAvailableDates.mockResolvedValue([today]);

            const result = await statisticsManager.performHealthCheck();

            expect(result.healthy).toBe(true);
            expect(result.issues).toHaveLength(0);
        });

        it('should report issues with old data', async () => {
            const oldDate = new Date();
            oldDate.setDate(oldDate.getDate() - 10);
            const oldDateStr = oldDate.toISOString().split('T')[0];
            
            mockUsageDatabase.getAvailableDates.mockResolvedValue([oldDateStr]);

            const result = await statisticsManager.performHealthCheck();

            expect(result.healthy).toBe(false);
            expect(result.issues).toContain('最新データが10日前と古すぎます');
        });

        it('should report issues with no data', async () => {
            mockUsageDatabase.getAvailableDates.mockResolvedValue([]);

            const result = await statisticsManager.performHealthCheck();

            expect(result.healthy).toBe(false);
            expect(result.issues).toContain('統計データが存在しません');
        });

        it('should report issues with short retention period', async () => {
            statisticsManager.updateConfig({ dataRetentionDays: 3 });
            
            const today = new Date().toISOString().split('T')[0];
            mockUsageDatabase.getAvailableDates.mockResolvedValue([today]);

            const result = await statisticsManager.performHealthCheck();

            expect(result.healthy).toBe(false);
            expect(result.issues).toContain('データ保持期間が短すぎます（推奨: 最低7日）');
        });

        it('should handle health check errors', async () => {
            mockUsageDatabase.getAvailableDates.mockRejectedValue(new Error('Database error'));

            const result = await statisticsManager.performHealthCheck();

            expect(result.healthy).toBe(false);
            expect(result.issues[0]).toContain('健全性チェック実行エラー');
        });
    });

    describe('CSV export', () => {
        it('should export data to CSV', async () => {
            const mockCsv = 'Date,Application,Content\n2025-01-01,Chrome,Google';
            mockUsageDatabase.exportToCSV.mockResolvedValue(mockCsv);

            const startDate = new Date('2025-01-01');
            const endDate = new Date('2025-01-01');
            const result = await statisticsManager.exportToCSV(startDate, endDate);

            expect(result).toBe(mockCsv);
            expect(mockUsageDatabase.exportToCSV).toHaveBeenCalledWith(startDate, endDate);
        });

        it('should handle CSV export errors', async () => {
            mockUsageDatabase.exportToCSV.mockRejectedValue(new Error('Export failed'));

            const startDate = new Date('2025-01-01');
            const endDate = new Date('2025-01-01');

            await expect(statisticsManager.exportToCSV(startDate, endDate)).rejects.toThrow('Export failed');
        });
    });

    describe('cleanup scheduling', () => {
        it('should stop cleanup timer when stopped', () => {
            // タイマーが設定されていることを確認（間接的に）
            expect(statisticsManager.getConfig().cleanupIntervalHours).toBe(24);

            // 停止
            statisticsManager.stop();

            // 再度停止しても問題ないことを確認
            expect(() => statisticsManager.stop()).not.toThrow();
        });
    });
});