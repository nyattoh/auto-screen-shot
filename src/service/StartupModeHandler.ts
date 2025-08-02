import { logger } from '../utils/logger';
import { StartupMode } from './BackgroundServiceManager';
import { ProcessManager } from './ProcessManager';
import { WindowsIntegration } from './WindowsIntegration';

/**
 * 起動モードハンドラーインターフェース
 */
export interface IStartupModeHandler {
    parseArguments(args: string[]): StartupMode;       // 引数解析
    validateMode(mode: StartupMode): boolean;          // モード検証
    initializeMode(mode: StartupMode): Promise<void>;  // モード初期化
}

/**
 * 起動モードハンドラークラス
 */
export class StartupModeHandler implements IStartupModeHandler {
    private processManager: ProcessManager;
    private windowsIntegration: WindowsIntegration;

    constructor(processManager: ProcessManager, windowsIntegration: WindowsIntegration) {
        this.processManager = processManager;
        this.windowsIntegration = windowsIntegration;
    }

    /**
     * 引数を解析して起動モードを決定
     */
    parseArguments(args: string[]): StartupMode {
        try {
            logger.info('起動引数を解析します', { args });

            // ヘルプフラグをチェック
            if (args.includes('--help') || args.includes('-h')) {
                this.showHelp();
                process.exit(0);
            }

            // 開発モードフラグをチェック
            if (args.includes('--dev') || args.includes('-d')) {
                logger.info('開発モードが指定されました');
                return StartupMode.DEVELOPMENT;
            }

            // フォアグラウンドモードフラグをチェック
            if (args.includes('--foreground') || args.includes('-f')) {
                logger.info('フォアグラウンドモードが指定されました');
                return StartupMode.FOREGROUND;
            }

            // バックグラウンドモードフラグをチェック（明示的指定）
            if (args.includes('--background') || args.includes('-b')) {
                logger.info('バックグラウンドモードが明示的に指定されました');
                return StartupMode.BACKGROUND;
            }

            // デフォルトはバックグラウンドモード
            logger.info('デフォルトのバックグラウンドモードで起動します');
            return StartupMode.BACKGROUND;

        } catch (error) {
            logger.error('引数解析エラー', error);
            return StartupMode.BACKGROUND; // エラー時はデフォルトモード
        }
    }

    /**
     * モードの妥当性を検証
     */
    validateMode(mode: StartupMode): boolean {
        try {
            const validModes = Object.values(StartupMode);
            const isValid = validModes.includes(mode);

            if (!isValid) {
                logger.error('無効な起動モードが指定されました', { mode, validModes });
            }

            return isValid;

        } catch (error) {
            logger.error('モード検証エラー', error);
            return false;
        }
    }

    /**
     * 指定されたモードで初期化
     */
    async initializeMode(mode: StartupMode): Promise<void> {
        try {
            logger.info('起動モード初期化開始', { mode });

            // モードの妥当性を検証
            if (!this.validateMode(mode)) {
                throw new Error(`無効な起動モード: ${mode}`);
            }

            // 環境変数に起動モードを設定
            process.env.STARTUP_MODE = mode;

            // モードに応じた初期化処理を実行
            switch (mode) {
                case StartupMode.BACKGROUND:
                    await this.initializeBackgroundMode();
                    break;
                case StartupMode.DEVELOPMENT:
                    await this.initializeDevelopmentMode();
                    break;
                case StartupMode.FOREGROUND:
                    await this.initializeForegroundMode();
                    break;
                default:
                    throw new Error(`未対応の起動モード: ${mode}`);
            }

            logger.info('起動モード初期化完了', { mode });

        } catch (error) {
            logger.error('起動モード初期化エラー', error);
            throw error;
        }
    }

    /**
     * バックグラウンドモードの初期化
     */
    private async initializeBackgroundMode(): Promise<void> {
        try {
            logger.info('バックグラウンドモード初期化開始');

            // 1. コンソールウィンドウを非表示
            this.windowsIntegration.hideConsoleWindow();

            // 2. 親プロセスから分離
            this.processManager.detachFromParent();

            // 3. PIDファイルを作成（既存プロセスチェックはcreateePidFile内で実行）
            try {
                await this.processManager.createPidFile();
            } catch (error) {
                if (error.message.includes('既に実行中')) {
                    logger.warn('アプリケーションは既に実行中です。プロセスを継続します。');
                    // 既に実行中でも処理を継続
                } else {
                    throw error;
                }
            }

            // 4. プロセス優先度を設定（通常優先度）
            this.windowsIntegration.setProcessPriority('normal');

            // 5. シャットダウンシグナルハンドラーを設定
            this.windowsIntegration.handleShutdownSignals();

            logger.info('バックグラウンドモード初期化完了', {
                pid: process.pid,
                ppid: process.ppid,
                pidFile: this.processManager.getPidFilePath()
            });

        } catch (error) {
            logger.error('バックグラウンドモード初期化エラー', error);
            throw error;
        }
    }

    /**
     * 開発モードの初期化
     */
    private async initializeDevelopmentMode(): Promise<void> {
        try {
            logger.info('開発モード初期化開始');

            // 1. コンソールウィンドウを表示
            this.windowsIntegration.showConsoleWindow();

            // 2. デバッグログレベルを設定
            // TODO: ロガーのログレベル設定機能を実装後に有効化
            // logger.setLevel('debug');

            // 3. 開発用の詳細ログを出力
            logger.info('開発モードで起動しました', {
                pid: process.pid,
                ppid: process.ppid,
                platform: process.platform,
                nodeVersion: process.version,
                memoryUsage: process.memoryUsage()
            });

            // 4. シャットダウンシグナルハンドラーを設定
            this.windowsIntegration.handleShutdownSignals();

            // 5. 開発用のキーボードショートカットを設定
            this.setupDevelopmentShortcuts();

            logger.info('開発モード初期化完了');

        } catch (error) {
            logger.error('開発モード初期化エラー', error);
            throw error;
        }
    }

    /**
     * フォアグラウンドモードの初期化
     */
    private async initializeForegroundMode(): Promise<void> {
        try {
            logger.info('フォアグラウンドモード初期化開始');

            // 1. コンソールウィンドウを表示
            this.windowsIntegration.showConsoleWindow();

            // 2. 親プロセスとの接続を維持（分離しない）
            logger.info('親プロセスとの接続を維持します', {
                pid: process.pid,
                ppid: process.ppid
            });

            // 3. フォアグラウンド用のログ出力設定
            logger.info('フォアグラウンドモードで起動しました', {
                pid: process.pid,
                ppid: process.ppid,
                platform: process.platform
            });

            // 4. シャットダウンシグナルハンドラーを設定
            this.windowsIntegration.handleShutdownSignals();

            // 5. フォアグラウンド用のユーザーインタラクション設定
            this.setupForegroundInteraction();

            logger.info('フォアグラウンドモード初期化完了');

        } catch (error) {
            logger.error('フォアグラウンドモード初期化エラー', error);
            throw error;
        }
    }

    /**
     * 開発用のキーボードショートカットを設定
     */
    private setupDevelopmentShortcuts(): void {
        try {
            logger.info('開発用キーボードショートカットを設定します');

            // 標準入力からのキー入力を監視
            if (process.stdin.isTTY) {
                process.stdin.setRawMode(true);
                process.stdin.resume();
                process.stdin.setEncoding('utf8');

                process.stdin.on('data', (key: string) => {
                    // Ctrl+C で終了
                    if (key === '\u0003') {
                        logger.info('Ctrl+C が押されました。アプリケーションを終了します。');
                        process.exit(0);
                    }

                    // Ctrl+D でデバッグ情報表示
                    if (key === '\u0004') {
                        logger.info('デバッグ情報:', this.windowsIntegration.getCurrentProcessInfo());
                    }

                    // 'h' でヘルプ表示
                    if (key === 'h') {
                        this.showDevelopmentHelp();
                    }

                    // 'q' で終了
                    if (key === 'q') {
                        logger.info('アプリケーションを終了します。');
                        process.exit(0);
                    }
                });
            }

            logger.info('開発用キーボードショートカット設定完了');

        } catch (error) {
            logger.warn('開発用キーボードショートカット設定エラー', error);
        }
    }

    /**
     * フォアグラウンド用のユーザーインタラクション設定
     */
    private setupForegroundInteraction(): void {
        try {
            logger.info('フォアグラウンド用ユーザーインタラクションを設定します');

            // 基本的なキー入力監視
            if (process.stdin.isTTY) {
                process.stdin.setRawMode(true);
                process.stdin.resume();
                process.stdin.setEncoding('utf8');

                process.stdin.on('data', (key: string) => {
                    // Ctrl+C で終了
                    if (key === '\u0003') {
                        logger.info('Ctrl+C が押されました。アプリケーションを終了します。');
                        process.exit(0);
                    }

                    // 'q' で終了
                    if (key === 'q') {
                        logger.info('アプリケーションを終了します。');
                        process.exit(0);
                    }
                });
            }

            // フォアグラウンドモードの使用方法を表示
            console.log('\n=== フォアグラウンドモード ===');
            console.log('Ctrl+C または q キーでアプリケーションを終了できます。');
            console.log('アプリケーションはシステムトレイで動作しています。');
            console.log('==============================\n');

            logger.info('フォアグラウンド用ユーザーインタラクション設定完了');

        } catch (error) {
            logger.warn('フォアグラウンド用ユーザーインタラクション設定エラー', error);
        }
    }

    /**
     * ヘルプメッセージを表示
     */
    private showHelp(): void {
        console.log(`
Win Screenshot App - バックグラウンドサービス

使用方法:
  node main.js [オプション]

オプション:
  -h, --help        このヘルプメッセージを表示
  -b, --background  バックグラウンドモードで起動（デフォルト）
  -d, --dev         開発モードで起動（コンソール表示、デバッグログ有効）
  -f, --foreground  フォアグラウンドモードで起動（コンソール表示、親プロセス接続）

起動モード:
  background   - シェルから分離してバックグラウンドで動作
  development  - 開発用の詳細ログとキーボードショートカット
  foreground   - フォアグラウンドで動作、親プロセスと接続維持

例:
  node main.js                 # バックグラウンドモード
  node main.js --dev           # 開発モード
  node main.js --foreground    # フォアグラウンドモード
        `);
    }

    /**
     * 開発モード用ヘルプを表示
     */
    private showDevelopmentHelp(): void {
        console.log(`
=== 開発モード キーボードショートカット ===
  Ctrl+C  - アプリケーション終了
  Ctrl+D  - デバッグ情報表示
  h       - このヘルプを表示
  q       - アプリケーション終了
==========================================
        `);
    }

    /**
     * 現在の起動モード設定を取得
     */
    getCurrentModeSettings(): object {
        return {
            mode: process.env.STARTUP_MODE || 'unknown',
            pid: process.pid,
            ppid: process.ppid,
            platform: process.platform,
            isWindows: this.windowsIntegration.isWindowsEnvironment(),
            pidFilePath: this.processManager.getPidFilePath(),
            processInfo: this.processManager.getCurrentProcessInfo()
        };
    }
}