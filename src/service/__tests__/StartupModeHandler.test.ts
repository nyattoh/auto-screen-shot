import { StartupModeHandler } from '../StartupModeHandler';
import { StartupMode } from '../BackgroundServiceManager';
import { ProcessManager } from '../ProcessManager';
import { WindowsIntegration } from '../WindowsIntegration';

// モジュールをモック
jest.mock('../ProcessManager');
jest.mock('../WindowsIntegration');

describe('StartupModeHandler', () => {
    let startupModeHandler: StartupModeHandler;
    let mockProcessManager: jest.Mocked<ProcessManager>;
    let mockWindowsIntegration: jest.Mocked<WindowsIntegration>;
    let originalProcessExit: typeof process.exit;
    let originalConsoleLog: typeof console.log;

    beforeEach(() => {
        // プロセスメソッドをモック
        originalProcessExit = process.exit;
        originalConsoleLog = console.log;
        
        // 型不一致を避けるために any キャスト
        process.exit = jest.fn() as any;
        console.log = jest.fn();

        // モックインスタンスを作成
        mockProcessManager = new ProcessManager() as jest.Mocked<ProcessManager>;
        mockWindowsIntegration = new WindowsIntegration() as jest.Mocked<WindowsIntegration>;

        // モックメソッドを設定
        mockProcessManager.isAlreadyRunning = jest.fn().mockResolvedValue(false);
        mockProcessManager.detachFromParent = jest.fn();
        mockProcessManager.createPidFile = jest.fn().mockResolvedValue(undefined);
        mockProcessManager.getPidFilePath = jest.fn().mockReturnValue('/tmp/test.pid');
        mockProcessManager.getCurrentProcessInfo = jest.fn().mockReturnValue({
            pid: 1234,
            startTime: new Date(),
            mode: 'test'
        });

        mockWindowsIntegration.hideConsoleWindow = jest.fn();
        mockWindowsIntegration.showConsoleWindow = jest.fn();
        mockWindowsIntegration.setProcessPriority = jest.fn();
        mockWindowsIntegration.handleShutdownSignals = jest.fn();
        mockWindowsIntegration.isWindowsEnvironment = jest.fn().mockReturnValue(true);
        mockWindowsIntegration.getCurrentProcessInfo = jest.fn().mockReturnValue({});

        startupModeHandler = new StartupModeHandler(mockProcessManager, mockWindowsIntegration);
    });

    afterEach(() => {
        // プロセスメソッドを復元
        process.exit = originalProcessExit;
        console.log = originalConsoleLog;
    });

    describe('parseArguments', () => {
        test('--helpフラグでヘルプが表示されプロセスが終了すること', () => {
            startupModeHandler.parseArguments(['--help']);
            expect(process.exit).toHaveBeenCalledWith(0);
        });

        test('-hフラグでヘルプが表示されプロセスが終了すること', () => {
            startupModeHandler.parseArguments(['-h']);
            expect(process.exit).toHaveBeenCalledWith(0);
        });

        test('--devフラグで開発モードが返されること', () => {
            const mode = startupModeHandler.parseArguments(['--dev']);
            expect(mode).toBe(StartupMode.DEVELOPMENT);
        });

        test('-dフラグで開発モードが返されること', () => {
            const mode = startupModeHandler.parseArguments(['-d']);
            expect(mode).toBe(StartupMode.DEVELOPMENT);
        });

        test('--foregroundフラグでフォアグラウンドモードが返されること', () => {
            const mode = startupModeHandler.parseArguments(['--foreground']);
            expect(mode).toBe(StartupMode.FOREGROUND);
        });

        test('-fフラグでフォアグラウンドモードが返されること', () => {
            const mode = startupModeHandler.parseArguments(['-f']);
            expect(mode).toBe(StartupMode.FOREGROUND);
        });

        test('--backgroundフラグでバックグラウンドモードが返されること', () => {
            const mode = startupModeHandler.parseArguments(['--background']);
            expect(mode).toBe(StartupMode.BACKGROUND);
        });

        test('引数なしでバックグラウンドモードが返されること', () => {
            const mode = startupModeHandler.parseArguments([]);
            expect(mode).toBe(StartupMode.BACKGROUND);
        });
    });

    describe('validateMode', () => {
        test('有効なモードでtrueが返されること', () => {
            expect(startupModeHandler.validateMode(StartupMode.BACKGROUND)).toBe(true);
            expect(startupModeHandler.validateMode(StartupMode.DEVELOPMENT)).toBe(true);
            expect(startupModeHandler.validateMode(StartupMode.FOREGROUND)).toBe(true);
        });

        test('無効なモードでfalseが返されること', () => {
            expect(startupModeHandler.validateMode('invalid' as StartupMode)).toBe(false);
        });
    });

    describe('initializeMode', () => {
        test('バックグラウンドモードの初期化が正常に実行されること', async () => {
            await startupModeHandler.initializeMode(StartupMode.BACKGROUND);

            expect(mockProcessManager.isAlreadyRunning).toHaveBeenCalled();
            expect(mockWindowsIntegration.hideConsoleWindow).toHaveBeenCalled();
            expect(mockProcessManager.detachFromParent).toHaveBeenCalled();
            expect(mockProcessManager.createPidFile).toHaveBeenCalled();
            expect(mockWindowsIntegration.setProcessPriority).toHaveBeenCalledWith('normal');
            expect(mockWindowsIntegration.handleShutdownSignals).toHaveBeenCalled();
        });

        test('開発モードの初期化が正常に実行されること', async () => {
            await startupModeHandler.initializeMode(StartupMode.DEVELOPMENT);

            expect(mockWindowsIntegration.showConsoleWindow).toHaveBeenCalled();
            expect(mockWindowsIntegration.handleShutdownSignals).toHaveBeenCalled();
        });

        test('フォアグラウンドモードの初期化が正常に実行されること', async () => {
            await startupModeHandler.initializeMode(StartupMode.FOREGROUND);

            expect(mockWindowsIntegration.showConsoleWindow).toHaveBeenCalled();
            expect(mockWindowsIntegration.handleShutdownSignals).toHaveBeenCalled();
        });

        test('無効なモードでエラーが投げられること', async () => {
            await expect(startupModeHandler.initializeMode('invalid' as StartupMode))
                .rejects.toThrow('無効な起動モード');
        });

        test('既に実行中の場合にエラーが投げられること', async () => {
            mockProcessManager.isAlreadyRunning.mockResolvedValue(true);

            await expect(startupModeHandler.initializeMode(StartupMode.BACKGROUND))
                .rejects.toThrow('既に実行中です');
        });
    });

    describe('getCurrentModeSettings', () => {
        test('現在のモード設定が正しく取得されること', () => {
            process.env.STARTUP_MODE = 'test';
            
            const settings = startupModeHandler.getCurrentModeSettings();
            
            expect(settings).toHaveProperty('mode', 'test');
            expect(settings).toHaveProperty('pid', process.pid);
            expect(settings).toHaveProperty('ppid', process.ppid);
            expect(settings).toHaveProperty('platform', process.platform);
            expect(settings).toHaveProperty('isWindows');
            expect(settings).toHaveProperty('pidFilePath');
            expect(settings).toHaveProperty('processInfo');
        });
    });
});