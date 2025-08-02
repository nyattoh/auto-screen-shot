import { BackgroundServiceManager, StartupMode } from '../BackgroundServiceManager';

describe('BackgroundServiceManager', () => {
    let serviceManager: BackgroundServiceManager;

    beforeEach(() => {
        serviceManager = new BackgroundServiceManager();
    });

    describe('constructor', () => {
        test('デフォルト設定で初期化されること', () => {
            const config = serviceManager.getConfiguration();
            
            expect(config.mode).toBe(StartupMode.BACKGROUND);
            expect(config.hideConsole).toBe(true);
            expect(config.detachProcess).toBe(true);
            expect(config.logLevel).toBe('info');
            expect(config.pidFilePath).toContain('win-screenshot-app.pid');
        });
    });

    describe('parseArguments', () => {
        test('引数なしでバックグラウンドモードが選択されること', async () => {
            await serviceManager.initialize([]);
            expect(serviceManager.getCurrentMode()).toBe(StartupMode.BACKGROUND);
        });

        test('--devフラグで開発モードが選択されること', async () => {
            await serviceManager.initialize(['--dev']);
            expect(serviceManager.getCurrentMode()).toBe(StartupMode.DEVELOPMENT);
        });

        test('-dフラグで開発モードが選択されること', async () => {
            await serviceManager.initialize(['-d']);
            expect(serviceManager.getCurrentMode()).toBe(StartupMode.DEVELOPMENT);
        });

        test('--foregroundフラグでフォアグラウンドモードが選択されること', async () => {
            await serviceManager.initialize(['--foreground']);
            expect(serviceManager.getCurrentMode()).toBe(StartupMode.FOREGROUND);
        });

        test('-fフラグでフォアグラウンドモードが選択されること', async () => {
            await serviceManager.initialize(['-f']);
            expect(serviceManager.getCurrentMode()).toBe(StartupMode.FOREGROUND);
        });

        test('--backgroundフラグでバックグラウンドモードが選択されること', async () => {
            await serviceManager.initialize(['--background']);
            expect(serviceManager.getCurrentMode()).toBe(StartupMode.BACKGROUND);
        });
    });

    describe('updateConfigurationForMode', () => {
        test('バックグラウンドモードで適切な設定が適用されること', async () => {
            await serviceManager.initialize(['--background']);
            const config = serviceManager.getConfiguration();
            
            expect(config.mode).toBe(StartupMode.BACKGROUND);
            expect(config.hideConsole).toBe(true);
            expect(config.detachProcess).toBe(true);
            expect(config.logLevel).toBe('info');
        });

        test('開発モードで適切な設定が適用されること', async () => {
            await serviceManager.initialize(['--dev']);
            const config = serviceManager.getConfiguration();
            
            expect(config.mode).toBe(StartupMode.DEVELOPMENT);
            expect(config.hideConsole).toBe(false);
            expect(config.detachProcess).toBe(false);
            expect(config.logLevel).toBe('debug');
        });

        test('フォアグラウンドモードで適切な設定が適用されること', async () => {
            await serviceManager.initialize(['--foreground']);
            const config = serviceManager.getConfiguration();
            
            expect(config.mode).toBe(StartupMode.FOREGROUND);
            expect(config.hideConsole).toBe(false);
            expect(config.detachProcess).toBe(false);
            expect(config.logLevel).toBe('info');
        });
    });

    describe('getCurrentMode', () => {
        test('現在のモードが正しく取得されること', async () => {
            await serviceManager.initialize(['--dev']);
            expect(serviceManager.getCurrentMode()).toBe(StartupMode.DEVELOPMENT);
        });
    });

    describe('getConfiguration', () => {
        test('設定のコピーが返されること', () => {
            const config1 = serviceManager.getConfiguration();
            const config2 = serviceManager.getConfiguration();
            
            expect(config1).toEqual(config2);
            expect(config1).not.toBe(config2); // 異なるオブジェクトインスタンス
        });
    });

    describe('initialize', () => {
        test('初期化エラーが適切に処理されること', async () => {
            // 無効な引数で初期化を試行
            await expect(serviceManager.initialize(['--invalid-flag'])).resolves.not.toThrow();
            
            // デフォルトモードにフォールバック
            expect(serviceManager.getCurrentMode()).toBe(StartupMode.BACKGROUND);
        });
    });
});