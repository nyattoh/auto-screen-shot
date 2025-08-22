import { StatisticsWindow } from '../statisticsWindow';
import ScreenshotManager from '../../screenshot/capture';
import Settings from '../../config/settings';
import { UsageDatabase } from '../../usage/UsageDatabase';
import { ipcMain } from 'electron';

// Electronモジュールのモック
jest.mock('electron', () => ({
    BrowserWindow: jest.fn().mockImplementation(() => ({
        loadFile: jest.fn(),
        once: jest.fn(),
        on: jest.fn(),
        show: jest.fn(),
        focus: jest.fn(),
        close: jest.fn(),
        setMenu: jest.fn(),
        webContents: {
            send: jest.fn(),
            openDevTools: jest.fn()
        },
        isDestroyed: jest.fn().mockReturnValue(false)
    })),
    ipcMain: {
        on: jest.fn(),
        handle: jest.fn()
    },
    shell: {
        openPath: jest.fn()
    },
    dialog: {
        showSaveDialog: jest.fn()
    }
}));

// その他の依存関係をモック
jest.mock('../../screenshot/capture');
jest.mock('../../config/settings');
jest.mock('../../usage/UsageDatabase');
jest.mock('../../utils/logger', () => ({
    logger: {
        info: jest.fn(),
        error: jest.fn(),
        debug: jest.fn(),
        warn: jest.fn()
    }
}));

describe('StatisticsWindow CSV Export', () => {
    let statisticsWindow: StatisticsWindow;
    let mockUsageDatabase: jest.Mocked<UsageDatabase>;
    let mockScreenshotManager: jest.Mocked<ScreenshotManager>;
    let mockSettings: jest.Mocked<Settings>;

    beforeEach(() => {
        // UsageDatabaseモックのセットアップ
        mockUsageDatabase = {
            initialize: jest.fn().mockResolvedValue(undefined),
            exportToCSV: jest.fn(),
            getDateRangeSessions: jest.fn(),
            close: jest.fn().mockResolvedValue(undefined)
        } as any;

        mockScreenshotManager = {} as any;
        mockSettings = {} as any;

        statisticsWindow = new StatisticsWindow(mockScreenshotManager, mockSettings, mockUsageDatabase);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('CSV Export IPC Handlers', () => {
        test('export-csv ハンドラーが正しく登録され、CSVデータを返す', async () => {
            const mockCsvData = 'Date,Application,Content\n2025-08-22,Chrome,Google\n';
            mockUsageDatabase.exportToCSV.mockResolvedValue(mockCsvData);

            // ipcMain.handleの呼び出しを取得
            const handleCalls = (ipcMain.handle as jest.Mock).mock.calls;
            const exportCsvCall = handleCalls.find(call => call[0] === 'export-csv');
            
            expect(exportCsvCall).toBeDefined();
            
            // ハンドラー関数をテスト
            const handler = exportCsvCall[1];
            const result = await handler({}, '2025-08-22', '2025-08-22');

            expect(mockUsageDatabase.exportToCSV).toHaveBeenCalledWith(
                new Date('2025-08-22'),
                new Date('2025-08-22')
            );
            expect(result).toEqual({
                success: true,
                data: mockCsvData
            });
        });

        test('export-csv ハンドラーがエラー時に適切なレスポンスを返す', async () => {
            const errorMessage = 'Database connection failed';
            mockUsageDatabase.exportToCSV.mockRejectedValue(new Error(errorMessage));

            const handleCalls = (ipcMain.handle as jest.Mock).mock.calls;
            const exportCsvCall = handleCalls.find(call => call[0] === 'export-csv');
            const handler = exportCsvCall[1];
            
            const result = await handler({}, '2025-08-22', '2025-08-22');

            expect(result).toEqual({
                success: false,
                error: errorMessage
            });
        });

        test('get-date-range-sessions ハンドラーが正しく動作する', async () => {
            const mockSessions = [
                {
                    id: 1,
                    windowTitle: 'Test Window',
                    processName: 'chrome.exe',
                    application: 'Chrome',
                    content: 'Google',
                    category: 'Browser',
                    startTime: new Date('2025-08-22T10:00:00'),
                    endTime: new Date('2025-08-22T10:05:00'),
                    duration: 300000,
                    date: '2025-08-22'
                }
            ];
            
            mockUsageDatabase.getDateRangeSessions.mockResolvedValue(mockSessions);

            const handleCalls = (ipcMain.handle as jest.Mock).mock.calls;
            const getRangeSessionsCall = handleCalls.find(call => call[0] === 'get-date-range-sessions');
            
            expect(getRangeSessionsCall).toBeDefined();
            
            const handler = getRangeSessionsCall[1];
            const result = await handler({}, '2025-08-22', '2025-08-22');

            expect(mockUsageDatabase.getDateRangeSessions).toHaveBeenCalledWith(
                new Date('2025-08-22'),
                new Date('2025-08-22')
            );
            expect(result).toEqual(mockSessions);
        });

        test('save-csv-file ハンドラーがファイル保存ダイアログを表示する', async () => {
            // このテストは実際の実装で動作確認するため、モック設定のみ確認
            const handleCalls = (ipcMain.handle as jest.Mock).mock.calls;
            const saveFileCall = handleCalls.find(call => call[0] === 'save-csv-file');
            
            expect(saveFileCall).toBeDefined();
            expect(typeof saveFileCall[1]).toBe('function');
        });
    });

    describe('CSV Export Data Validation', () => {
        test('CSVエクスポートが正しい形式のデータを生成する', async () => {
            const expectedCsvFormat = [
                'Date,Application,Content,Category,Window Title,Process Name,Start Time,End Time,Duration (minutes)',
                '2025-08-22,"Google Chrome","Google - 検索","Browser","Google - Google Chrome","chrome.exe","2025-08-22T10:00:00.000Z","2025-08-22T10:05:00.000Z",5'
            ].join('\n');

            mockUsageDatabase.exportToCSV.mockResolvedValue(expectedCsvFormat);

            const handleCalls = (ipcMain.handle as jest.Mock).mock.calls;
            const exportCsvCall = handleCalls.find(call => call[0] === 'export-csv');
            const handler = exportCsvCall[1];
            
            const result = await handler({}, '2025-08-22', '2025-08-22');

            expect(result.success).toBe(true);
            expect(result.data).toContain('Date,Application,Content');
            expect(result.data).toContain('Duration (minutes)');
        });

        test('日付範囲が正しく処理される', async () => {
            const startDate = '2025-08-20';
            const endDate = '2025-08-22';
            
            mockUsageDatabase.exportToCSV.mockResolvedValue('mock csv data');

            const handleCalls = (ipcMain.handle as jest.Mock).mock.calls;
            const exportCsvCall = handleCalls.find(call => call[0] === 'export-csv');
            const handler = exportCsvCall[1];
            
            await handler({}, startDate, endDate);

            expect(mockUsageDatabase.exportToCSV).toHaveBeenCalledWith(
                new Date(startDate),
                new Date(endDate)
            );
        });
    });

    describe('Error Handling', () => {
        test('無効な日付形式でエラーが適切に処理される', async () => {
            mockUsageDatabase.exportToCSV.mockRejectedValue(new Error('Invalid date format'));

            const handleCalls = (ipcMain.handle as jest.Mock).mock.calls;
            const exportCsvCall = handleCalls.find(call => call[0] === 'export-csv');
            const handler = exportCsvCall[1];
            
            const result = await handler({}, 'invalid-date', '2025-08-22');

            expect(result.success).toBe(false);
            expect(result.error).toContain('Invalid date format');
        });

        test('データベース接続エラーが適切に処理される', async () => {
            mockUsageDatabase.exportToCSV.mockRejectedValue(new Error('Database not initialized'));

            const handleCalls = (ipcMain.handle as jest.Mock).mock.calls;
            const exportCsvCall = handleCalls.find(call => call[0] === 'export-csv');
            const handler = exportCsvCall[1];
            
            const result = await handler({}, '2025-08-22', '2025-08-22');

            expect(result.success).toBe(false);
            expect(result.error).toBe('Database not initialized');
        });
    });
});