import { logger } from '../utils/logger';

/**
 * 起動モード列挙型
 */
export enum StartupMode {
    BACKGROUND = 'background',    // バックグラウンド
    DEVELOPMENT = 'development',  // 開発
    FOREGROUND = 'foreground'     // フォアグラウンド
}

/**
 * 起動設定インターフェース
 */
export interface StartupConfiguration {
    mode: StartupMode;           // 起動モード
    pidFilePath: string;         // PIDファイルパス
    logLevel: string;            // ログレベル
    hideConsole: boolean;        // コンソール非表示フラグ
    detachProcess: boolean;      // プロセス分離フラグ
}

/**
 * バックグラウンドサービス管理インターフェース
 */
export interface IBackgroundServiceManager {
    initialize(args: string[]): Promise<void>;        // 初期化
    startBackgroundMode(): Promise<void>;              // バックグラウンドモード開始
    startDevelopmentMode(): Promise<void>;             // 開発モード開始
    startForegroundMode(): Promise<void>;              // フォアグラウンドモード開始
    shutdown(): Promise<void>;                         // シャットダウン
}

/**
 * バックグラウンドサービス管理クラス
 */
export class BackgroundServiceManager implements IBackgroundServiceManager {
    private currentMode: StartupMode = StartupMode.BACKGROUND;
    private configuration: StartupConfiguration;

    constructor() {
        this.configuration = this.getDefaultConfiguration();
    }

    /**
     * デフォルト設定を取得
     */
    private getDefaultConfiguration(): StartupConfiguration {
        return {
            mode: StartupMode.BACKGROUND,
            pidFilePath: this.getPidFilePath(),
            logLevel: 'info',
            hideConsole: true,
            detachProcess: true
        };
    }

    /**
     * PIDファイルパスを取得
     */
    private getPidFilePath(): string {
        const os = require('os');
        const path = require('path');
        return path.join(os.tmpdir(), 'win-screenshot-app.pid');
    }

    /**
     * 引数を解析して起動モードを決定
     */
    private parseArguments(args: string[]): StartupMode {
        logger.info('引数解析開始', { args });

        // --dev フラグをチェック
        if (args.includes('--dev') || args.includes('-d')) {
            logger.info('開発モードが指定されました');
            return StartupMode.DEVELOPMENT;
        }

        // --foreground フラグをチェック
        if (args.includes('--foreground') || args.includes('-f')) {
            logger.info('フォアグラウンドモードが指定されました');
            return StartupMode.FOREGROUND;
        }

        // デフォルトはバックグラウンドモード
        logger.info('バックグラウンドモードで起動します（デフォルト）');
        return StartupMode.BACKGROUND;
    }

    /**
     * 初期化
     */
    async initialize(args: string[]): Promise<void> {
        try {
            logger.info('BackgroundServiceManager初期化開始');
            try { console.log('BGM_INIT_START'); } catch {}

            // 引数を解析してモードを決定
            this.currentMode = this.parseArguments(args);
            this.configuration.mode = this.currentMode;

            // モードに応じた設定を更新
            this.updateConfigurationForMode(this.currentMode);

            logger.info('サービス初期化完了', {
                mode: this.currentMode,
                configuration: this.configuration
            });

        // --help/-h の場合はヘルプ表示して終了
        if (args.includes('--help') || args.includes('-h')) {
            const help = [
                'Win Screenshot App',
                '',
                '使用方法:',
                '  node dist/main.js [オプション]',
                '',
                'オプション:',
                '  -h, --help        このヘルプメッセージを表示',
                '  -b, --background  バックグラウンドモードで起動（デフォルト）',
                '  -d, --dev         開発モードで起動',
                '  -f, --foreground  フォアグラウンドモードで起動',
                ''
            ].join('\n');
            console.log(help);
            // テストで正常終了を検出できるようexit(0)
            process.exit(0);
        }

            // 選択されたモードで起動
            await this.startSelectedMode();
            try { console.log('BGM_INIT_DONE'); } catch {}

        } catch (error) {
            logger.error('BackgroundServiceManager初期化エラー', error);
            throw error;
        }
    }

    /**
     * モードに応じて設定を更新
     */
    private updateConfigurationForMode(mode: StartupMode): void {
        switch (mode) {
            case StartupMode.BACKGROUND:
                this.configuration.hideConsole = true;
                this.configuration.detachProcess = true;
                this.configuration.logLevel = 'info';
                break;

            case StartupMode.DEVELOPMENT:
                this.configuration.hideConsole = false;
                this.configuration.detachProcess = false;
                this.configuration.logLevel = 'debug';
                break;

            case StartupMode.FOREGROUND:
                this.configuration.hideConsole = false;
                this.configuration.detachProcess = false;
                this.configuration.logLevel = 'info';
                break;
        }

        logger.info('モード設定更新完了', {
            mode,
            configuration: this.configuration
        });
    }

    /**
     * 選択されたモードで起動
     */
    private async startSelectedMode(): Promise<void> {
        switch (this.currentMode) {
            case StartupMode.BACKGROUND:
                await this.startBackgroundMode();
                break;
            case StartupMode.DEVELOPMENT:
                await this.startDevelopmentMode();
                break;
            case StartupMode.FOREGROUND:
                await this.startForegroundMode();
                break;
            default:
                throw new Error(`未知の起動モード: ${this.currentMode}`);
        }
    }

    /**
     * バックグラウンドモード開始
     */
    async startBackgroundMode(): Promise<void> {
        logger.info('バックグラウンドモード開始');
        
        const { ProcessManager } = await import('./ProcessManager');
        const { WindowsIntegration } = await import('./WindowsIntegration');
        const { StartupModeHandler } = await import('./StartupModeHandler');
        
        const processManager = new ProcessManager(this.configuration.pidFilePath);
        const windowsIntegration = new WindowsIntegration();
        const startupModeHandler = new StartupModeHandler(processManager, windowsIntegration);
        
        await startupModeHandler.initializeMode(StartupMode.BACKGROUND);
        
        logger.info('バックグラウンドモード開始完了');
        // 統合テスト互換のマーカー出力
        try { console.log('BACKGROUND_MODE_STARTED'); } catch {}

        // dist/main.js 経由以外（テストの子スクリプトなど）は呼び出し側で終了させる。
        // Jestワーカー/Electron実行時はexitしない。
        const normalizedArg1 = (process.argv[1] || '').replace(/\\/g, '/');
        const isMainEntry = normalizedArg1.endsWith('/dist/main.js') || normalizedArg1.endsWith('dist/main.js');
        const isJest = !!process.env.JEST_WORKER_ID;
        const isElectron = !!(process.versions && (process.versions as any).electron);
        if (!isMainEntry && !isJest && !isElectron) {
            setTimeout(() => process.exit(0), 1000);
        }
    }

    /**
     * 開発モード開始
     */
    async startDevelopmentMode(): Promise<void> {
        logger.info('開発モード開始');
        
        const { ProcessManager } = await import('./ProcessManager');
        const { WindowsIntegration } = await import('./WindowsIntegration');
        const { StartupModeHandler } = await import('./StartupModeHandler');
        
        const processManager = new ProcessManager(this.configuration.pidFilePath);
        const windowsIntegration = new WindowsIntegration();
        const startupModeHandler = new StartupModeHandler(processManager, windowsIntegration);
        
        await startupModeHandler.initializeMode(StartupMode.DEVELOPMENT);
        
        logger.info('開発モード開始完了');
        // 統合テスト互換のマーカー出力
        try { console.log('DEVELOPMENT_MODE_STARTED'); } catch {}

        // dist/main.js 経由以外（テストの子スクリプトなど）は呼び出し側で終了させる。
        const normalizedArg1 = (process.argv[1] || '').replace(/\\/g, '/');
        const isMainEntry = normalizedArg1.endsWith('/dist/main.js') || normalizedArg1.endsWith('dist/main.js');
        const isJest = !!process.env.JEST_WORKER_ID;
        const isElectron = !!(process.versions && (process.versions as any).electron);
        if (!isMainEntry && !isJest && !isElectron) {
            setTimeout(() => process.exit(0), 1000);
        }
    }

    /**
     * フォアグラウンドモード開始
     */
    async startForegroundMode(): Promise<void> {
        logger.info('フォアグラウンドモード開始');
        
        const { ProcessManager } = await import('./ProcessManager');
        const { WindowsIntegration } = await import('./WindowsIntegration');
        const { StartupModeHandler } = await import('./StartupModeHandler');
        
        const processManager = new ProcessManager(this.configuration.pidFilePath);
        const windowsIntegration = new WindowsIntegration();
        const startupModeHandler = new StartupModeHandler(processManager, windowsIntegration);
        
        await startupModeHandler.initializeMode(StartupMode.FOREGROUND);
        
        logger.info('フォアグラウンドモード開始完了');
    }

    /**
     * シャットダウン
     */
    async shutdown(): Promise<void> {
        try {
            logger.info('BackgroundServiceManagerシャットダウン開始');
            
            // TODO: 次のタスクで実装
            // - PIDファイルクリーンアップ
            // - 適切なシャットダウン処理
            
            logger.info('BackgroundServiceManagerシャットダウン完了');
        } catch (error) {
            logger.error('シャットダウンエラー', error);
            throw error;
        }
    }

    /**
     * 現在のモードを取得
     */
    getCurrentMode(): StartupMode {
        return this.currentMode;
    }

    /**
     * 現在の設定を取得
     */
    getConfiguration(): StartupConfiguration {
        return { ...this.configuration };
    }
}