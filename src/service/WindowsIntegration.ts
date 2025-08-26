import { spawn, ChildProcess } from 'child_process';
import { logger } from '../utils/logger';

/**
 * ウィンドウ情報インターフェース
 */
export interface WindowInfo {
    title: string;
    processName: string;
    pid: number;
    className?: string;
    x?: number;
    y?: number;
    width?: number;
    height?: number;
}

/**
 * Windows統合インターフェース
 */
export interface IWindowsIntegration {
    hideConsoleWindow(): void;                         // コンソール非表示
    showConsoleWindow(): void;                         // コンソール表示
    handleShutdownSignals(): void;                     // シャットダウンシグナル処理
    setProcessPriority(priority: string): void;        // プロセス優先度設定
    detachProcess(command: string, args: string[]): ChildProcess; // プロセス分離
    startActiveWindowTracking(callback: (windowInfo: WindowInfo | null) => void): void; // ウィンドウ追跡開始
    stopActiveWindowTracking(): void;                  // ウィンドウ追跡停止
    getCurrentActiveWindow(): Promise<WindowInfo | null>; // 現在のアクティブウィンドウ取得
}

/**
 * Windows統合クラス
 */
export class WindowsIntegration implements IWindowsIntegration {
    private isWindows: boolean;
    private windowTrackingInterval: NodeJS.Timeout | null = null;
    private windowTrackingCallback: ((windowInfo: WindowInfo | null) => void) | null = null;
    private lastActiveWindowInfo: WindowInfo | null = null;
    private retryCount = 0;
    private maxRetries = 3;
    private retryDelay = 1000; // 1秒
    private esmImportWarned = false;

    constructor() {
        this.isWindows = process.platform === 'win32';
    }

    /**
     * コンソールウィンドウを非表示にする
     */
    hideConsoleWindow(): void {
        try {
            const isTestEnv = !!process.env.JEST_WORKER_ID;
            if (isTestEnv) {
                // テストでは外部PowerShell呼び出しをスキップ（遅延・ノイズ回避）
                return;
            }
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
            const isTestEnv = !!process.env.JEST_WORKER_ID;
            if (isTestEnv) {
                // テストでは外部PowerShell呼び出しをスキップ
                return;
            }
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
        
        // テスト環境でも、dist/main.js 経由で起動された子プロセスは正常終了させる
        const isTestEnv = !!process.env.JEST_WORKER_ID;
        const isMainEntry = (process.argv[1] || '').replace(/\\/g, '/').endsWith('/dist/main.js');
        if (isTestEnv && !isMainEntry) {
            logger.info('テスト環境（非mainエントリ）のため、即時exitは行いません');
            try {
                process.emit('exit', 0 as any);
            } catch {}
            return;
        }
        
        // 本番系は正常終了
        logger.info('アプリケーションを終了します');
        process.exit(0);
    }

    /**
     * プロセス優先度を設定する
     */
    setProcessPriority(priority: string): void {
        try {
            const isTestEnv = !!process.env.JEST_WORKER_ID;
            if (isTestEnv) {
                // テストでは実際の優先度変更をスキップ
                return;
            }
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
     * アクティブウィンドウの追跡を開始
     */
    startActiveWindowTracking(callback: (windowInfo: WindowInfo | null) => void): void {
        if (!this.isWindows) {
            logger.warn('ウィンドウ追跡はWindows環境でのみサポートされています');
            return;
        }

        if (this.windowTrackingInterval) {
            logger.warn('ウィンドウ追跡は既に開始されています');
            return;
        }

        this.windowTrackingCallback = callback;
        this.retryCount = 0;

        logger.info('アクティブウィンドウの追跡を開始します');

        // 定期的にアクティブウィンドウをチェック
        this.windowTrackingInterval = setInterval(async () => {
            try {
                const currentWindow = await this.getCurrentActiveWindow();
                
                // ウィンドウが変更された場合のみコールバックを呼び出す
                if (this.hasWindowChanged(currentWindow)) {
                    this.lastActiveWindowInfo = currentWindow;
                    
                    if (this.windowTrackingCallback) {
                        this.windowTrackingCallback(currentWindow);
                    }
                    
                    // 成功時はリトライカウントをリセット
                    this.retryCount = 0;
                }
            } catch (error) {
                await this.handleWindowTrackingError(error);
            }
        }, 2000); // 2秒間隔でチェック
    }

    /**
     * アクティブウィンドウの追跡を停止
     */
    stopActiveWindowTracking(): void {
        if (this.windowTrackingInterval) {
            clearInterval(this.windowTrackingInterval);
            this.windowTrackingInterval = null;
            this.windowTrackingCallback = null;
            this.lastActiveWindowInfo = null;
            this.retryCount = 0;
            
            logger.info('アクティブウィンドウの追跡を停止しました');
        }
    }

    /**
     * 現在のアクティブウィンドウを取得
     */
    async getCurrentActiveWindow(): Promise<WindowInfo | null> {
        if (!this.isWindows) {
            return null;
        }
        // まず get-windows のネイティブ実装を試す（高速・安定）。ESMなのでネイティブ dynamic import を使用
        try {
            // TypeScript (CJS) では import('...') が require にダウントランスパイルされる場合があるため、
            // eval を用いてネイティブ dynamic import を強制する
            const gwModule: any = await (eval('import("get-windows")'));
            const activeWindow = gwModule?.activeWindow;
            if (typeof activeWindow === 'function') {
                const res = await activeWindow();
                if (res && res.platform === 'windows') {
                    const title = (res.title || '').toString();
                    const processName = (res.owner?.name || '').toString();
                    const pid = Number(res.owner?.processId || 0);
                    return {
                        title,
                        processName,
                        pid,
                        x: res.bounds?.x || 0,
                        y: res.bounds?.y || 0,
                        width: res.bounds?.width || 0,
                        height: res.bounds?.height || 0
                    };
                }
            }
        } catch (e) {
            if (!this.esmImportWarned) {
                logger.debug('get-windows によるアクティブウィンドウ取得に失敗。PowerShellにフォールバックします', e);
                this.esmImportWarned = true;
            }
        }

        return new Promise((resolve) => {
            const { exec } = require('child_process');
            
            // PowerShellスクリプトを使用してアクティブウィンドウ情報を取得
            const script = `
                Add-Type @"
                    using System;
                    using System.Runtime.InteropServices;
                    using System.Text;
                    public class WindowInfo {
                        [DllImport("user32.dll")]
                        public static extern IntPtr GetForegroundWindow();
                        
                        [DllImport("user32.dll")]
                        public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);
                        
                        [DllImport("user32.dll")]
                        public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
                        
                        [DllImport("user32.dll")]
                        public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);
                        
                        [StructLayout(LayoutKind.Sequential)]
                        public struct RECT {
                            public int Left;
                            public int Top;
                            public int Right;
                            public int Bottom;
                        }
                    }
"@
                
                $hwnd = [WindowInfo]::GetForegroundWindow()
                if ($hwnd -eq [IntPtr]::Zero) {
                    Write-Output "null"
                    exit
                }
                
                # ウィンドウタイトル取得
                $title = New-Object System.Text.StringBuilder 256
                [void][WindowInfo]::GetWindowText($hwnd, $title, 256)
                
                # プロセスID取得
                $processId = 0
                [void][WindowInfo]::GetWindowThreadProcessId($hwnd, [ref]$processId)
                
                # プロセス名取得
                $processName = ""
                try {
                    $process = Get-Process -Id $processId -ErrorAction Stop
                    $processName = $process.ProcessName
                } catch {
                    $processName = "unknown"
                }
                
                # ウィンドウ位置・サイズ取得
                $rect = New-Object WindowInfo+RECT
                $rectResult = [WindowInfo]::GetWindowRect($hwnd, [ref]$rect)
                
                if ($rectResult) {
                    $width = $rect.Right - $rect.Left
                    $height = $rect.Bottom - $rect.Top
                    $x = $rect.Left
                    $y = $rect.Top
                } else {
                    $width = 0
                    $height = 0
                    $x = 0
                    $y = 0
                }
                
                # JSON形式で出力
                @{
                    title = $title.ToString()
                    processName = $processName
                    pid = $processId
                    x = $x
                    y = $y
                    width = $width
                    height = $height
                } | ConvertTo-Json -Compress
            `;

            const timeout = setTimeout(() => {
                logger.warn('ウィンドウ情報取得がタイムアウトしました');
                resolve(null);
            }, 5000);

            exec(`powershell -WindowStyle Hidden -Command "${script.replace(/"/g, '""')}"`, 
                { timeout: 10000, windowsHide: true }, 
                (error, stdout, stderr) => {
                    clearTimeout(timeout);
                    
                    if (error) {
                        logger.debug('ウィンドウ情報取得エラー', error);
                        resolve(null);
                        return;
                    }

                    try {
                        const output = stdout.trim();
                        if (output === 'null' || !output) {
                            resolve(null);
                            return;
                        }

                        const windowInfo = JSON.parse(output);
                        
                        // 有効なウィンドウ情報かチェック
                        if (windowInfo.title && windowInfo.processName && windowInfo.pid > 0) {
                            resolve({
                                title: windowInfo.title,
                                processName: windowInfo.processName,
                                pid: windowInfo.pid,
                                x: windowInfo.x || 0,
                                y: windowInfo.y || 0,
                                width: windowInfo.width || 0,
                                height: windowInfo.height || 0
                            });
                        } else {
                            resolve(null);
                        }
                    } catch (parseError) {
                        logger.debug('ウィンドウ情報パースエラー', { parseError, stdout });
                        resolve(null);
                    }
                }
            );
        });
    }

    /**
     * ウィンドウが変更されたかチェック
     */
    private hasWindowChanged(currentWindow: WindowInfo | null): boolean {
        if (!this.lastActiveWindowInfo && !currentWindow) {
            return false;
        }
        
        if (!this.lastActiveWindowInfo || !currentWindow) {
            return true;
        }
        
        return (
            this.lastActiveWindowInfo.pid !== currentWindow.pid ||
            this.lastActiveWindowInfo.title !== currentWindow.title ||
            this.lastActiveWindowInfo.processName !== currentWindow.processName
        );
    }

    /**
     * ウィンドウ追跡エラーハンドリング（再試行機能付き）
     */
    private async handleWindowTrackingError(error: any): Promise<void> {
        this.retryCount++;
        
        logger.warn(`ウィンドウ追跡でエラーが発生しました (試行 ${this.retryCount}/${this.maxRetries})`, error);
        
        if (this.retryCount >= this.maxRetries) {
            logger.error('ウィンドウ追跡の最大再試行回数に達しました。追跡を一時停止します');
            
            // 追跡を一時停止
            if (this.windowTrackingInterval) {
                clearInterval(this.windowTrackingInterval);
                this.windowTrackingInterval = null;
            }
            
            // 30秒後に再開を試行
            setTimeout(() => {
                if (this.windowTrackingCallback && !this.windowTrackingInterval) {
                    logger.info('ウィンドウ追跡の再開を試行します');
                    this.startActiveWindowTracking(this.windowTrackingCallback);
                }
            }, 30000);
            
        } else {
            // 指数バックオフで再試行間隔を延長
            const delay = this.retryDelay * Math.pow(2, this.retryCount - 1);
            
            logger.info(`${delay}ms後にウィンドウ追跡を再試行します`);
            
            setTimeout(async () => {
                try {
                    const currentWindow = await this.getCurrentActiveWindow();
                    
                    if (this.hasWindowChanged(currentWindow)) {
                        this.lastActiveWindowInfo = currentWindow;
                        
                        if (this.windowTrackingCallback) {
                            this.windowTrackingCallback(currentWindow);
                        }
                        
                        // 成功時はリトライカウントをリセット
                        this.retryCount = 0;
                    }
                } catch (retryError) {
                    logger.warn('ウィンドウ追跡の再試行でもエラーが発生しました', retryError);
                }
            }, delay);
        }
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
            uptime: process.uptime(),
            windowTracking: {
                active: this.windowTrackingInterval !== null,
                retryCount: this.retryCount,
                lastWindow: this.lastActiveWindowInfo
            }
        };
    }
}
