import * as fs from 'fs-extra';
import * as path from 'path';
import * as os from 'os';
import { spawn, ChildProcess } from 'child_process';

describe('Background Service Integration Tests', () => {
    let testPidFilePath: string;
    let testProcess: ChildProcess | null = null;

    beforeEach(() => {
        testPidFilePath = path.join(os.tmpdir(), `test-integration-${Date.now()}.pid`);
    });

    afterEach(async () => {
        // テストプロセスをクリーンアップ
        if (testProcess && !testProcess.killed) {
            testProcess.kill('SIGTERM');
            testProcess = null;
        }

        // テストPIDファイルをクリーンアップ
        try {
            if (await fs.pathExists(testPidFilePath)) {
                await fs.remove(testPidFilePath);
            }
        } catch (error) {
            // クリーンアップエラーは無視
        }
    });

    describe('Startup Mode Integration', () => {
        test('バックグラウンドモードでプロセスが正常に起動すること', (done) => {
            const testScript = `
                const { BackgroundServiceManager } = require('./dist/service/BackgroundServiceManager');
                const manager = new BackgroundServiceManager();
                manager.initialize(['--background']).then(() => {
                    console.log('BACKGROUND_MODE_STARTED');
                    setTimeout(() => process.exit(0), 1000);
                }).catch(console.error);
            `;

            const tempScriptPath = path.join(os.tmpdir(), 'test-background.js');
            fs.writeFileSync(tempScriptPath, testScript);

            testProcess = spawn('node', [tempScriptPath], {
                stdio: 'pipe',
                cwd: path.join(__dirname, '../../../')
            });

            let output = '';
            testProcess.stdout?.on('data', (data) => {
                output += data.toString();
            });

            testProcess.on('exit', (code) => {
                expect(output).toContain('BACKGROUND_MODE_STARTED');
                expect(code).toBe(0);
                fs.removeSync(tempScriptPath);
                done();
            });

            // タイムアウト設定
            setTimeout(() => {
                if (testProcess && !testProcess.killed) {
                    testProcess.kill();
                    fs.removeSync(tempScriptPath);
                    done.fail('Test timeout');
                }
            }, 10000);
        });

        test('開発モードでプロセスが正常に起動すること', (done) => {
            const testScript = `
                const { BackgroundServiceManager } = require('./dist/service/BackgroundServiceManager');
                const manager = new BackgroundServiceManager();
                manager.initialize(['--dev']).then(() => {
                    console.log('DEVELOPMENT_MODE_STARTED');
                    setTimeout(() => process.exit(0), 1000);
                }).catch(console.error);
            `;

            const tempScriptPath = path.join(os.tmpdir(), 'test-development.js');
            fs.writeFileSync(tempScriptPath, testScript);

            testProcess = spawn('node', [tempScriptPath], {
                stdio: 'pipe',
                cwd: path.join(__dirname, '../../../')
            });

            let output = '';
            testProcess.stdout?.on('data', (data) => {
                output += data.toString();
            });

            testProcess.on('exit', (code) => {
                expect(output).toContain('DEVELOPMENT_MODE_STARTED');
                expect(code).toBe(0);
                fs.removeSync(tempScriptPath);
                done();
            });

            // タイムアウト設定
            setTimeout(() => {
                if (testProcess && !testProcess.killed) {
                    testProcess.kill();
                    fs.removeSync(tempScriptPath);
                    done.fail('Test timeout');
                }
            }, 10000);
        });
    });

    describe('Process Management Integration', () => {
        test('PIDファイルが正常に作成・削除されること', async () => {
            const { ProcessManager } = await import('../ProcessManager');
            const processManager = new ProcessManager(testPidFilePath);

            // PIDファイルが存在しないことを確認
            expect(await fs.pathExists(testPidFilePath)).toBe(false);

            // PIDファイルを作成
            await processManager.createPidFile();
            expect(await fs.pathExists(testPidFilePath)).toBe(true);

            // PIDファイルの内容を確認
            const pidContent = await fs.readFile(testPidFilePath, 'utf8');
            const pidData = JSON.parse(pidContent);
            expect(pidData.pid).toBe(process.pid);

            // PIDファイルを削除
            await processManager.removePidFile();
            expect(await fs.pathExists(testPidFilePath)).toBe(false);
        });

        test('重複起動が防止されること', async () => {
            const { ProcessManager } = await import('../ProcessManager');
            
            const processManager1 = new ProcessManager(testPidFilePath);
            const processManager2 = new ProcessManager(testPidFilePath);

            // 最初のプロセスでPIDファイルを作成
            await processManager1.createPidFile();

            // 2番目のプロセスで重複起動をチェック
            const isRunning = await processManager2.isAlreadyRunning();
            expect(isRunning).toBe(true);

            // 2番目のプロセスでPIDファイル作成を試行（エラーになるはず）
            await expect(processManager2.createPidFile()).rejects.toThrow('既に実行中です');

            // クリーンアップ
            await processManager1.removePidFile();
        });
    });

    describe('Windows Integration', () => {
        test('Windows環境の検出が正常に動作すること', async () => {
            const { WindowsIntegration } = await import('../WindowsIntegration');
            const windowsIntegration = new WindowsIntegration();

            const isWindows = windowsIntegration.isWindowsEnvironment();
            expect(typeof isWindows).toBe('boolean');
            expect(isWindows).toBe(process.platform === 'win32');
        });

        test('プロセス情報の取得が正常に動作すること', async () => {
            const { WindowsIntegration } = await import('../WindowsIntegration');
            const windowsIntegration = new WindowsIntegration();

            const processInfo = windowsIntegration.getCurrentProcessInfo();
            expect(processInfo).toHaveProperty('platform');
            expect(processInfo).toHaveProperty('pid');
            expect(processInfo).toHaveProperty('ppid');
            expect(processInfo).toHaveProperty('arch');
            expect(processInfo).toHaveProperty('version');
            expect(processInfo).toHaveProperty('memoryUsage');
            expect(processInfo).toHaveProperty('uptime');
        });

        test('プロセス優先度設定が正常に動作すること', async () => {
            const { WindowsIntegration } = await import('../WindowsIntegration');
            const windowsIntegration = new WindowsIntegration();

            // エラーが発生しないことを確認
            expect(() => windowsIntegration.setProcessPriority('normal')).not.toThrow();
            expect(() => windowsIntegration.setProcessPriority('high')).not.toThrow();
            expect(() => windowsIntegration.setProcessPriority('low')).not.toThrow();
        });
    });

    describe('Shutdown Management Integration', () => {
        test('シャットダウンマネージャーが正常に初期化されること', async () => {
            const { ShutdownManager } = await import('../ShutdownManager');
            const { ProcessManager } = await import('../ProcessManager');
            const { WindowsIntegration } = await import('../WindowsIntegration');

            const processManager = new ProcessManager(testPidFilePath);
            const windowsIntegration = new WindowsIntegration();
            const shutdownManager = new ShutdownManager(processManager, windowsIntegration);

            expect(() => shutdownManager.initialize()).not.toThrow();
            expect(shutdownManager.isShuttingDownNow()).toBe(false);
        });

        test('シャットダウンコールバックが正常に追加されること', async () => {
            const { ShutdownManager } = await import('../ShutdownManager');
            const { ProcessManager } = await import('../ProcessManager');
            const { WindowsIntegration } = await import('../WindowsIntegration');

            const processManager = new ProcessManager(testPidFilePath);
            const windowsIntegration = new WindowsIntegration();
            const shutdownManager = new ShutdownManager(processManager, windowsIntegration);

            const callback = jest.fn().mockResolvedValue(undefined);
            expect(() => shutdownManager.addShutdownCallback(callback)).not.toThrow();
        });
    });
});