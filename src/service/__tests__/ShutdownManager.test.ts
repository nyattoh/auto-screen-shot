import { ShutdownManager, ShutdownReason } from '../ShutdownManager';
import { ProcessManager } from '../ProcessManager';
import { WindowsIntegration } from '../WindowsIntegration';

// モジュールをモック
jest.mock('../ProcessManager');
jest.mock('../WindowsIntegration');

describe('ShutdownManager', () => {
    let shutdownManager: ShutdownManager;
    let mockProcessManager: jest.Mocked<ProcessManager>;
    let mockWindowsIntegration: jest.Mocked<WindowsIntegration>;
    let originalProcessOn: typeof process.on;
    let originalProcessExit: typeof process.exit;

    beforeEach(() => {
        // プロセスメソッドをモック
        originalProcessOn = process.on;
        originalProcessExit = process.exit;
        
        process.on = jest.fn();
        process.exit = jest.fn() as any;

        // モックインスタンスを作成
        mockProcessManager = new ProcessManager() as jest.Mocked<ProcessManager>;
        mockWindowsIntegration = new WindowsIntegration() as jest.Mocked<WindowsIntegration>;

        // モックメソッドを設定
        mockProcessManager.removePidFile = jest.fn().mockResolvedValue(undefined);
        mockWindowsIntegration.detachProcess = jest.fn();

        shutdownManager = new ShutdownManager(mockProcessManager, mockWindowsIntegration);
    });

    afterEach(() => {
        // プロセスメソッドを復元
        process.on = originalProcessOn;
        process.exit = originalProcessExit;
    });

    describe('initialize', () => {
        test('正常に初期化されること', () => {
            expect(() => shutdownManager.initialize()).not.toThrow();
        });
    });

    describe('setupSignalHandlers', () => {
        test('標準的なシグナルハンドラーが設定されること', () => {
            shutdownManager.setupSignalHandlers();

            expect(process.on).toHaveBeenCalledWith('SIGINT', expect.any(Function));
            expect(process.on).toHaveBeenCalledWith('SIGTERM', expect.any(Function));
            expect(process.on).toHaveBeenCalledWith('SIGHUP', expect.any(Function));
        });

        test('Windows環境でWindows固有のシグナルハンドラーが設定されること', () => {
            Object.defineProperty(process, 'platform', {
                value: 'win32',
                writable: true
            });

            shutdownManager.setupSignalHandlers();

            expect(process.on).toHaveBeenCalledWith('SIGBREAK', expect.any(Function));
            expect(process.on).toHaveBeenCalledWith('beforeExit', expect.any(Function));
            expect(process.on).toHaveBeenCalledWith('exit', expect.any(Function));
        });
    });

    describe('setupCrashRecovery', () => {
        test('クラッシュ回復ハンドラーが設定されること', () => {
            shutdownManager.setupCrashRecovery();

            expect(process.on).toHaveBeenCalledWith('uncaughtException', expect.any(Function));
            expect(process.on).toHaveBeenCalledWith('unhandledRejection', expect.any(Function));
            expect(process.on).toHaveBeenCalledWith('warning', expect.any(Function));
        });
    });

    describe('shutdown', () => {
        test('正常なシャットダウンが実行されること', async () => {
            await shutdownManager.shutdown(ShutdownReason.MANUAL);

            expect(mockProcessManager.removePidFile).toHaveBeenCalled();
            expect(process.exit).toHaveBeenCalledWith(0);
        });

        test('エラー時のシャットダウンで適切な終了コードが設定されること', async () => {
            await shutdownManager.shutdown(ShutdownReason.ERROR);

            expect(mockProcessManager.removePidFile).toHaveBeenCalled();
            expect(process.exit).toHaveBeenCalledWith(1);
        });

        test('重複シャットダウンが防止されること', async () => {
            // 最初のシャットダウンを開始
            const firstShutdown = shutdownManager.shutdown(ShutdownReason.MANUAL);
            
            // 2回目のシャットダウンを試行
            const secondShutdown = shutdownManager.shutdown(ShutdownReason.MANUAL);

            await Promise.all([firstShutdown, secondShutdown]);

            // PIDファイル削除は1回だけ呼ばれる
            expect(mockProcessManager.removePidFile).toHaveBeenCalledTimes(1);
        });
    });

    describe('addShutdownCallback', () => {
        test('シャットダウンコールバックが追加されること', () => {
            const callback = jest.fn().mockResolvedValue(undefined);
            
            expect(() => shutdownManager.addShutdownCallback(callback)).not.toThrow();
        });

        test('シャットダウン時にコールバックが実行されること', async () => {
            const callback = jest.fn().mockResolvedValue(undefined);
            shutdownManager.addShutdownCallback(callback);

            await shutdownManager.shutdown(ShutdownReason.MANUAL);

            expect(callback).toHaveBeenCalled();
        });
    });

    describe('manualShutdown', () => {
        test('手動シャットダウンが正常に実行されること', async () => {
            await shutdownManager.manualShutdown();

            expect(mockProcessManager.removePidFile).toHaveBeenCalled();
            expect(process.exit).toHaveBeenCalledWith(0);
        });
    });

    describe('isShuttingDownNow', () => {
        test('シャットダウン前はfalseを返すこと', () => {
            expect(shutdownManager.isShuttingDownNow()).toBe(false);
        });
    });

    describe('setShutdownTimeout', () => {
        test('シャットダウンタイムアウトが設定されること', () => {
            expect(() => shutdownManager.setShutdownTimeout(5000)).not.toThrow();
        });
    });
});