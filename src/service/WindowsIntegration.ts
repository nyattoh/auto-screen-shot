import { spawn, ChildProcess } from 'child_process';
import { logger } from '../utils/logger';

/**
 * Windows統合インターフェース
 */
export interface IWindowsIntegration {
    hideConsoleWindow(): void;                         // コンソール非表示
    showConsoleWindow(): void;                         // コンソール表示
    handleShutdownSignals(): void;                     // シャットダウンシグナル処理
    setProcessPriority(priority: string): void;        // プロセス優先度設定
    detachProcess(command: string, args: string[]): ChildProcess; // プロセス分離
}

/**
 * Windows統合クラス
 */
export class WindowsIntegration implements IWindowsIntegration {
    private isWindows: boolean;

    constructor() {
        this.isWindows = process.platform === 'win32';
    }

    /**
     * コンソールウィンドウを非表示にする
     */
    hideConsoleWindow(): void {
        try {
            if (!this.isWindows) {
                logger.warn('コンソール非表示はWindows環境でのみサポートされています');
                return;
            }

            logger.info('コンソールウィンドウを非表示にします');

            // Windows APIを使用してコンソールウィンドウを非表示にする
            // Node.jsからWindows APIを直接呼び出すためのFFI的なアプローチ
            try {
                const { exec } = require('child_process');
                
                // PowerShellを使用してコンソールウィンドウを非表示にする
                const hideCommand = `
                    Add-Type -Name Window -Namespace Console -MemberDefinition '
                    [DllImport("Kernel32.dll")]
                    public static extern IntPtr GetConsoleWindow();
                    [DllImport("user32.dll")]
                    public static extern bool ShowWindow(IntPtr hWnd, Int32 nCmdShow);
                    ';
                    $consolePtr = [Console.Window]::GetConsoleWindow();
                    [Console.Window]::ShowWindow($consolePtr, 0);
                `;

                exec(`powershell -WindowStyle Hidden -Command "${hideCommand}"`, (error) => {
                    if (error) {
                        logger.warn('PowerShellによるコンソール非表示に失敗しました', error);
                    } else {
                        logger.info('コンソールウィンドウを非表示にしました');
                    }
                });

            } catch (error) {
                logger.warn('コンソール非表示処理でエラーが発生しました', error);
            }

        } catch (error) {
            logger.error('コンソール非表示エラー', error);
        }
    }

    /**
     * コンソールウィンドウを表示する
     */
    showConsoleWindow(): void {
        try {
            if (!this.isWindows) {
                logger.warn('コンソール表示はWindows環境でのみサポートされています');
                return;
            }

            logger.info('コンソールウィンドウを表示します');

            try {
                const { exec } = require('child_process');
                
                // PowerShellを使用してコンソールウィンドウを表示する
                const showCommand = `
                    Add-Type -Name Window -Namespace Console -MemberDefinition '
                    [DllImport("Kernel32.dll")]
                    public static extern IntPtr GetConsoleWindow();
                    [DllImport("user32.dll")]
                    public static extern bool ShowWindow(IntPtr hWnd, Int32 nCmdShow);
                    ';
                    $consolePtr = [Console.Window]::GetConsoleWindow();
                    [Console.Window]::ShowWindow($consolePtr, 1);
                `;

                exec(`powershell -WindowStyle Hidden -Command "${showCommand}"`, (error) => {
                    if (error) {
                        logger.warn('PowerShellによるコンソール表示に失敗しました', error);
                    } else {
                        logger.info('コンソールウィンドウを表示しました');
                    }
                });

            } catch (error) {
                logger.warn('コンソール表示処理でエラーが発生しました', error);
            }

        } catch (error) {
            logger.error('コンソール表示エラー', error);
        }
    }

    /**
     * シャットダウンシグナルを処理する
     */
    handleShutdownSignals(): void {
        try {
            logger.info('シャットダウンシグナルハンドラーを設定します');

            // ShutdownManagerを使用する場合は、そちらに委譲
            // 現在は基本的なシグナルハンドリングのみ実装
            
            // 標準的なシグナル
            process.on('SIGINT', this.handleShutdown.bind(this, 'SIGINT'));
            process.on('SIGTERM', this.handleShutdown.bind(this, 'SIGTERM'));
            process.on('SIGHUP', this.handleShutdown.bind(this, 'SIGHUP'));

            // Windows固有のシグナル
            if (this.isWindows) {
                process.on('SIGBREAK', this.handleShutdown.bind(this, 'SIGBREAK'));
            }

            logger.info('シャットダウンシグナルハンドラー設定完了');

        } catch (error) {
            logger.error('シャットダウンシグナルハンドラー設定エラー', error);
        }
    }

    /**
     * シャットダウン処理
     */
    private handleShutdown(signal: string): void {
        logger.info(`シャットダウンシグナルを受信しました: ${signal}`);
        
        // 基本的なシャットダウン処理
        logger.info('アプリケーションを終了します');
        process.exit(0);
    }

    /**
     * プロセス優先度を設定する
     */
    setProcessPriority(priority: string): void {
        try {
            if (!this.isWindows) {
                logger.warn('プロセス優先度設定はWindows環境でのみサポートされています');
                return;
            }

            logger.info('プロセス優先度を設定します', { priority });

            // Node.jsの標準機能でプロセス優先度を設定
            let osPriority: number;
            
            switch (priority.toLowerCase()) {
                case 'high':
                    osPriority = -10;
                    break;
                case 'above_normal':
                    osPriority = -5;
                    break;
                case 'normal':
                    osPriority = 0;
                    break;
                case 'below_normal':
                    osPriority = 5;
                    break;
                case 'low':
                    osPriority = 10;
                    break;
                default:
                    osPriority = 0;
                    logger.warn('未知の優先度が指定されました。通常優先度を使用します', { priority });
            }

            // process.setpriorityはNode.js v10.10.0以降で利用可能
            // 代替としてos.setPriorityを使用
            const os = require('os');
            if (os.setPriority) {
                os.setPriority(process.pid, osPriority);
            } else {
                // フォールバック: wmicコマンドを使用
                const { execSync } = require('child_process');
                const priorityMap = {
                    '-10': '256',     // Realtime
                    '-5': '128',      // High
                    '0': '32',        // Normal
                    '5': '16384',     // Below Normal
                    '10': '64'        // Low
                };
                const wmicPriority = priorityMap[osPriority.toString()] || '32';
                execSync(`wmic process where ProcessId=${process.pid} CALL setpriority ${wmicPriority}`, {
                    windowsHide: true
                });
            }
            logger.info('プロセス優先度設定完了', { priority, osPriority });

        } catch (error) {
            logger.error('プロセス優先度設定エラー', error);
        }
    }

    /**
     * プロセスを分離して起動する
     */
    detachProcess(command: string, args: string[] = []): ChildProcess {
        try {
            logger.info('プロセス分離を開始します', { command, args });

            const options = {
                detached: true,           // プロセスを分離
                stdio: 'ignore' as any,   // 標準入出力を無視
                windowsHide: true,        // Windows: ウィンドウを非表示
                shell: false              // シェルを使用しない
            };

            // Windows固有の設定
            if (this.isWindows) {
                // Windows環境での追加設定
                Object.assign(options, {
                    windowsVerbatimArguments: false,  // 引数の自動エスケープを有効
                    windowsHide: true                 // コンソールウィンドウを非表示
                });
            }

            const childProcess = spawn(command, args, options);

            // 子プロセスを親プロセスから完全に分離
            childProcess.unref();

            // プロセス起動イベントのログ
            childProcess.on('spawn', () => {
                logger.info('分離プロセスが正常に起動しました', {
                    pid: childProcess.pid,
                    command,
                    args
                });
            });

            // エラーハンドリング
            childProcess.on('error', (error) => {
                logger.error('分離プロセスでエラーが発生しました', {
                    error,
                    command,
                    args
                });
            });

            // プロセス終了時のログ
            childProcess.on('exit', (code, signal) => {
                logger.info('分離プロセスが終了しました', {
                    pid: childProcess.pid,
                    code,
                    signal,
                    command
                });
            });

            logger.info('プロセス分離完了', {
                pid: childProcess.pid,
                command,
                args
            });

            return childProcess;

        } catch (error) {
            logger.error('プロセス分離エラー', error);
            throw error;
        }
    }

    /**
     * Windows環境かどうかを確認
     */
    isWindowsEnvironment(): boolean {
        return this.isWindows;
    }

    /**
     * 現在のプロセス情報を取得
     */
    getCurrentProcessInfo(): object {
        return {
            platform: process.platform,
            pid: process.pid,
            ppid: process.ppid,
            arch: process.arch,
            version: process.version,
            memoryUsage: process.memoryUsage(),
            uptime: process.uptime()
        };
    }
}