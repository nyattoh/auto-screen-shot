import * as electron from 'electron';

// Electronランタイム環境の検証
if (!electron || !electron.app || typeof electron.app.requestSingleInstanceLock !== 'function') {
    console.error('=== Electronランタイムエラー ===');
    console.error('このアプリケーションはElectronランタイムで実行する必要があります。');
    console.error('現在の実行環境:', {
        hasElectron: !!electron,
        electronType: typeof electron,
        hasApp: !!(electron && electron.app),
        appType: electron && electron.app ? typeof electron.app : 'undefined',
        nodeVersion: process.version,
        electronVersion: process.versions?.electron || 'undefined'
    });
    console.error('');
    console.error('正しい実行方法:');
    console.error('  npx electron dist/main.js');
    console.error('  または start.bat を使用してください');
    console.error('');
    console.error('間違った実行方法:');
    console.error('  node dist/main.js (これは動作しません)');
    console.error('==============================');
    process.exit(1);
}

const { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain, dialog } = electron;
import * as path from 'path';
import * as fs from 'fs';
import ScreenshotManager from './screenshot/capture';
import Settings from './config/settings';
import AutoStartManager from './autoLaunch/autoStart';
import { createSettingsWindow } from './ui/settingsWindow';
import { StatisticsWindow } from './ui/statisticsWindow';
import { logger } from './utils/logger';
import { BackgroundServiceManager } from './service/BackgroundServiceManager';
import { ShutdownManager } from './service/ShutdownManager';
import { ProcessManager } from './service/ProcessManager';
import { WindowsIntegration } from './service/WindowsIntegration';
import { UsageDatabase } from './usage/UsageDatabase';
import { TimeTracker } from './usage/TimeTracker';

// エラーダイアログの重複表示を防ぐフラグ
let errorDialogShown = false;

// グローバルエラーハンドラ
process.on('uncaughtException', (error) => {
    console.error('未処理の例外:', error);
    
    // エラーログファイルに書き込み
    const errorLogPath = path.join(__dirname, '../error.log');
    try {
        fs.appendFileSync(errorLogPath, `${new Date().toISOString()} - Uncaught Exception: ${error.stack}\n\n`);
    } catch (logError) {
        console.error('ログ書き込みエラー:', logError);
    }
    
    // エラーダイアログの重複表示を防ぐ
    if (!errorDialogShown && dialog && typeof dialog.showErrorBox === 'function') {
        errorDialogShown = true;
        try {
            dialog.showErrorBox('アプリケーションエラー', `予期しないエラーが発生しました:\n\n${error.message}\n\nアプリケーションを終了します。`);
        } catch (dialogError) {
            console.error('エラーダイアログ表示失敗:', dialogError);
        }
    }
    
    // アプリケーションを適切に終了
    setTimeout(() => {
        if (app && typeof app.quit === 'function') {
            app.quit();
        } else {
            process.exit(1);
        }
    }, 1000);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('未処理のPromise拒否:', reason);
    
    // エラーログファイルに書き込み
    const errorLogPath = path.join(__dirname, '../error.log');
    try {
        fs.appendFileSync(errorLogPath, `${new Date().toISOString()} - Unhandled Rejection: ${reason}\n\n`);
    } catch (logError) {
        console.error('ログ書き込みエラー:', logError);
    }
});

class AutoScreenCaptureApp {
    private mainWindow: electron.BrowserWindow | null = null;
    private tray: electron.Tray | null = null;
    private screenshotManager: ScreenshotManager;
    private settings: Settings;
    private autoStartManager: AutoStartManager;
    private statisticsWindow: StatisticsWindow;
    private backgroundServiceManager: BackgroundServiceManager;
    private shutdownManager: ShutdownManager;
    private usageDatabase: UsageDatabase;
    private timeTracker: TimeTracker;

    constructor() {
        try {
            logger.info('アプリケーション初期化開始');
            
            // バックグラウンドサービス管理を最初に初期化
            this.backgroundServiceManager = new BackgroundServiceManager();
            
            // 使用時間管理コンポーネントを初期化
            this.usageDatabase = new UsageDatabase();
            this.timeTracker = new TimeTracker();
            
            // 既存のコンポーネントを初期化
            this.screenshotManager = new ScreenshotManager();
            this.settings = new Settings();
            this.autoStartManager = new AutoStartManager();
            this.statisticsWindow = new StatisticsWindow(this.screenshotManager, this.settings, this.usageDatabase);
            
            // シャットダウン管理を初期化
            this.initializeShutdownManager();
            
            this.initializeApp();
            
            logger.info('アプリケーション初期化完了');
        } catch (error) {
            logger.error('アプリケーション初期化エラー', error);
            app.quit();
        }
    }

    /**
     * シャットダウン管理を初期化
     */
    private initializeShutdownManager(): void {
        try {
            const processManager = new ProcessManager();
            const windowsIntegration = new WindowsIntegration();
            
            this.shutdownManager = new ShutdownManager(processManager, windowsIntegration);
            this.shutdownManager.initialize();

            // アプリケーション固有のシャットダウンコールバックを追加
            this.shutdownManager.addShutdownCallback(async () => {
                logger.info('アプリケーション固有のシャットダウン処理を実行します');
                this.screenshotManager.stopCapture();
                
                // 使用時間データベースを閉じる
                try {
                    await this.usageDatabase.close();
                    logger.info('使用時間データベースを閉じました');
                } catch (error) {
                    logger.error('使用時間データベースの閉じる処理でエラー', error);
                }
                
                // トレイアイコンを削除
                if (this.tray) {
                    this.tray.destroy();
                    this.tray = null;
                }
                
                logger.info('アプリケーション固有のシャットダウン処理完了');
            });

            logger.info('シャットダウン管理初期化完了');
        } catch (error) {
            logger.error('シャットダウン管理初期化エラー', error);
        }
    }

    private async initializeApp(): Promise<void> {
        try {
            // バックグラウンドサービス管理を初期化
            await this.backgroundServiceManager.initialize(process.argv.slice(2));
            
            // Electronアプリケーションの準備を待つ
            await app.whenReady();
            
            this.createTray();
            this.setupAutoStart();
            this.startScreenshotCapture();
            this.setupIpcHandlers();
            
            // サービスモードログを追加
            logger.info('Electronアプリケーション準備完了', {
                mode: this.backgroundServiceManager.getCurrentMode(),
                configuration: this.backgroundServiceManager.getConfiguration()
            });

            app.on('window-all-closed', (event) => {
                event.preventDefault(); // アプリを終了させない
            });

            // activateイベントを削除 - メインウィンドウは作成しない
            
        } catch (error) {
            logger.error('アプリケーション初期化エラー', error);
            throw error;
        }
    }

    private createMainWindow(): void {
        this.mainWindow = new BrowserWindow({
            width: 400,
            height: 300,
            show: false, // 起動時は非表示
            skipTaskbar: true, // タスクバーに表示しない
            autoHideMenuBar: true, // メニューバーを自動非表示
            webPreferences: {
                nodeIntegration: true,
                contextIsolation: false,
            },
        });

        // メニューバーを完全に削除
        this.mainWindow.setMenu(null);

        this.mainWindow.loadFile(path.join(__dirname, '../assets/index.html'));

        this.mainWindow.on('closed', () => {
            this.mainWindow = null;
        });

        this.mainWindow.on('close', (event) => {
            event.preventDefault();
            this.mainWindow?.hide();
        });
    }

    private createTray(): void {
        try {
            // アイコンファイルが存在しない場合はデフォルトアイコンを使用
            let trayIcon;
            const iconPath = path.join(__dirname, '../assets/icon.png');
            
            try {
                trayIcon = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 });
                logger.debug(`トレイアイコン読み込み完了: ${iconPath}`);
            } catch (iconError) {
                logger.warn('カスタムアイコンが見つかりません。デフォルトアイコンを使用します', iconError);
                trayIcon = nativeImage.createEmpty().resize({ width: 16, height: 16 });
            }
            
            this.tray = new Tray(trayIcon);

            const contextMenu = Menu.buildFromTemplate([
                {
                    label: 'スクリーンショット開始/停止',
                    click: () => this.toggleScreenshotCapture()
                },
                {
                    label: '設定',
                    click: () => this.openSettings()
                },
                {
                    label: '統計を表示',
                    click: () => this.showStatistics()
                },
                { type: 'separator' },
                {
                    label: 'ログを表示',
                    click: () => this.showLogs()
                },
                { type: 'separator' },
                {
                    label: '終了',
                    click: () => this.quitApp()
                },
                { type: 'separator' },
                {
                    label: 'サービス情報',
                    click: () => this.showServiceInfo()
                }
            ]);

            this.tray.setContextMenu(contextMenu);
            this.tray.setToolTip('自動スクリーンキャプチャ');
            
            this.tray.on('double-click', () => {
                this.openSettings();
            });
            
            logger.info('システムトレイアイコン作成完了');
        } catch (error) {
            logger.error('システムトレイアイコン作成エラー', error);
        }
    }

    private async setupAutoStart(): Promise<void> {
        try {
            if (this.settings.getAutoStart()) {
                await this.autoStartManager.enableAutoStart();
                logger.info('自動起動が有効になりました');
            }
        } catch (error) {
            logger.error('自動起動設定エラー', error);
        }
    }

    private startScreenshotCapture(): void {
        const interval = this.settings.getCaptureInterval();
        const saveDir = this.settings.getSaveDirectory();
        
        this.screenshotManager.startPeriodicCapture(interval, saveDir);
        
        this.updateTrayTooltip();
    }

    private toggleScreenshotCapture(): void {
        if (this.screenshotManager.isCurrentlyCapturing()) {
            this.screenshotManager.stopCapture();
        } else {
            this.startScreenshotCapture();
        }
        this.updateTrayTooltip();
    }

    private updateTrayTooltip(): void {
        const status = this.screenshotManager.isCurrentlyCapturing() ? '実行中' : '停止中';
        this.tray?.setToolTip(`自動スクリーンキャプチャ - ${status}`);
    }

    private openSettings(): void {
        createSettingsWindow(this.settings);
    }

    private showStatistics(): void {
        this.statisticsWindow.create();
    }

    private showLogs(): void {
        const { shell } = require('electron');
        const logFilePath = logger.getLogFilePath();
        shell.openPath(logFilePath);
        logger.info('ログファイルを表示しました');
    }

    private setupIpcHandlers(): void {
        // 設定更新イベントを監視
        ipcMain.on('settings-updated', (event, newSettings) => {
            logger.info('設定が更新されました。スクリーンショット撮影を再開します。');
            
            // 既存の撮影を停止
            this.screenshotManager.stopCapture();
            
            // 新しい設定で撮影を再開
            setTimeout(() => {
                this.startScreenshotCapture();
                this.updateTrayTooltip();
            }, 1000);
        });
    }

    private quitApp(): void {
        logger.info('アプリケーション終了開始');
        
        try {
            // エラーダイアログの重複表示を防ぐフラグをリセット
            errorDialogShown = true;
            
            // ShutdownManagerを使用して適切にシャットダウン
            if (this.shutdownManager) {
                this.shutdownManager.manualShutdown();
            } else {
                // フォールバック処理
                this.screenshotManager.stopCapture();
                
                // データベースを閉じる
                if (this.usageDatabase) {
                    this.usageDatabase.close().catch(error => {
                        logger.error('データベース終了エラー:', error);
                    });
                }
                
                logger.info('アプリケーション終了完了');
                app.quit();
            }
        } catch (error) {
            logger.error('アプリケーション終了時エラー:', error);
            // 強制終了
            process.exit(0);
        }
    }

    /**
     * サービス情報を表示
     */
    private showServiceInfo(): void {
        try {
            const serviceInfo = {
                mode: this.backgroundServiceManager.getCurrentMode(),
                configuration: this.backgroundServiceManager.getConfiguration(),
                pid: process.pid,
                uptime: process.uptime(),
                memoryUsage: process.memoryUsage(),
                platform: process.platform
            };

            logger.info('サービス情報を表示します', serviceInfo);

            // 簡単な情報ダイアログを表示
            const { dialog } = require('electron');
            dialog.showMessageBox({
                type: 'info',
                title: 'サービス情報',
                message: 'Win Screenshot App サービス情報',
                detail: `
起動モード: ${serviceInfo.mode}
プロセスID: ${serviceInfo.pid}
稼働時間: ${Math.floor(serviceInfo.uptime)}秒
プラットフォーム: ${serviceInfo.platform}
メモリ使用量: ${Math.round(serviceInfo.memoryUsage.heapUsed / 1024 / 1024)}MB

詳細はログファイルを確認してください。
                `.trim(),
                buttons: ['OK']
            });

        } catch (error) {
            logger.error('サービス情報表示エラー', error);
        }
    }
}

// アプリケーション開始
async function startApplication() {
    try {
        console.log('=== Win Screenshot App 起動開始 ===');
        console.log('Node.js version:', process.version);
        console.log('Electron version:', process.versions.electron);
        console.log('Arguments:', process.argv);
        console.log('Working directory:', process.cwd());
        console.log('Platform:', process.platform);
        
        logger.info('アプリケーション開始', {
            args: process.argv,
            cwd: process.cwd(),
            platform: process.platform,
            nodeVersion: process.version,
            electronVersion: process.versions.electron
        });

        // 単一インスタンスチェック
        try {
            const gotTheLock = app.requestSingleInstanceLock();
            if (!gotTheLock) {
                console.log('既に別のインスタンスが実行中です');
                logger.info('既に別のインスタンスが実行中のため終了します');
                app.quit();
                return;
            }

            app.on('second-instance', () => {
                logger.info('2つ目のインスタンスが起動されました');
                // トレイアイコンをアニメーションする等の処理
            });
        } catch (error) {
            logger.warn('単一インスタンスチェックでエラーが発生しました。処理を継続します。', error);
        }

        new AutoScreenCaptureApp();
        
    } catch (error) {
        console.error('アプリケーション開始エラー:', error);
        logger.error('アプリケーション開始エラー', error);
        
        // エラーログファイルに書き込み
        const errorLogPath = path.join(__dirname, '../error.log');
        fs.appendFileSync(errorLogPath, `${new Date().toISOString()} - Startup Error: ${error}\n\n`);
        
        dialog.showErrorBox('起動エラー', `アプリケーションの起動に失敗しました:\n\n${error}`);
        process.exit(1);
    }
}

// アプリケーションを開始
startApplication();