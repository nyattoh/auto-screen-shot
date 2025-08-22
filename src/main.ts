import * as electron from 'electron';
import { BackgroundServiceManager } from './service/BackgroundServiceManager';
import { ProcessManager } from './service/ProcessManager';

// Node単体実行時のフォールバック（テストやCLI動作用）
async function startNodeServiceFallback(): Promise<void> {
    const args = process.argv.slice(2);

    // --help の場合はヘルプ出力して終了
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
        process.exit(0);
        return;
    }

    // 重複起動の明示チェック（システムテスト要件）
    const isBackground = args.includes('--background') || args.includes('-b') || args.length === 0;
    if (isBackground) {
        const pm = new ProcessManager();
        if (await pm.isAlreadyRunning()) {
            console.error('既に別のインスタンスが実行中です');
            process.exit(1);
            return;
        }
    }

    const manager = new BackgroundServiceManager();
    await manager.initialize(args);

    // バックグラウンドではイベントループを維持
    if (isBackground) {
        // 何もしないintervalでプロセス維持（SIGTERMで終了可）
        setInterval(() => { /* keep alive */ }, 1 << 30);
    }
}

// Electronランタイム環境の検証
if (!electron || !electron.app || typeof electron.app.requestSingleInstanceLock !== 'function') {
    // Electronが無い場合はNode用フォールバックで起動
    startNodeServiceFallback().catch((err) => {
        console.error('Nodeサービス起動エラー:', err);
        process.exit(1);
    });
    // 以降のElectronコードは呼び出さず、Nodeフォールバックに委譲
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
import { ShutdownManager } from './service/ShutdownManager';
import { WindowsIntegration, WindowInfo as WindowsWindowInfo } from './service/WindowsIntegration';
import { WindowInfo } from './types';
import { UsageDatabase } from './usage/UsageDatabase';
import { TimeTracker } from './usage/TimeTracker';
import { StatisticsManager } from './statistics/StatisticsManager';
import { ImageOptimizer } from './optimization/ImageOptimizer';
import { PerformanceMonitor } from './monitoring/PerformanceMonitor';

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
    private statisticsManager: StatisticsManager;
    private imageOptimizer: ImageOptimizer;
    private windowsIntegration: WindowsIntegration | null = null;
    private performanceMonitor: PerformanceMonitor;

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
            
            // 統計管理を初期化
            this.statisticsManager = new StatisticsManager(this.usageDatabase, this.settings);
            
            // 画像最適化を初期化
            const statsConfig = this.settings.getStatisticsConfig();
            this.imageOptimizer = new ImageOptimizer({
                quality: statsConfig.webpQuality,
                format: statsConfig.enableImageOptimization ? 'webp' : 'png',
                removeOriginal: false
            });
            
            // パフォーマンス監視を初期化
            this.performanceMonitor = new PerformanceMonitor({
                maxHeapUsedMB: 400,
                maxRSSMemoryMB: 800,
                alertThresholdMB: 250,
                gcIntervalMs: 300000 // 5分間隔
            });
            
            this.statisticsWindow = new StatisticsWindow(this.screenshotManager, this.settings, this.usageDatabase);
            
            // シャットダウン管理を初期化
            this.initializeShutdownManager();
            
            this.initializeApp();
            
            logger.info('アプリケーション初期化完了');
        } catch (error) {
            logger.error('アプリケーション初期化エラー', error, {
                showDialog: true,
                showTooltip: false,
                critical: true
            });
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
                
                // 統計管理を停止
                try {
                    this.statisticsManager.stop();
                    logger.info('統計管理を停止しました');
                } catch (error) {
                    logger.error('統計管理の停止でエラー', error);
                }
                
                // ウィンドウ追跡を停止
                try {
                    if (this.windowsIntegration) {
                        this.windowsIntegration.stopActiveWindowTracking();
                        logger.info('ウィンドウ追跡を停止しました');
                    }
                } catch (error) {
                    logger.error('ウィンドウ追跡の停止でエラー', error);
                }
                
                // TimeTrackerのセッションを終了
                try {
                    this.timeTracker.endSession();
                    logger.info('TimeTrackerセッションを終了しました');
                } catch (error) {
                    logger.error('TimeTrackerセッションの終了でエラー', error);
                }
                
                // パフォーマンス監視を停止
                try {
                    this.performanceMonitor.stopMonitoring();
                    logger.info('パフォーマンス監視を停止しました');
                } catch (error) {
                    logger.error('パフォーマンス監視の停止でエラー', error);
                }
                
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
            
            // 使用統計追跡を開始
            this.startUsageTracking();
            
            // パフォーマンス監視を開始
            this.startPerformanceMonitoring();
            
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
            logger.error('アプリケーション初期化エラー', error, {
                showDialog: true,
                showTooltip: false,
                critical: true
            });
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
                    label: '画像最適化',
                    click: () => this.optimizeImages()
                },
                {
                    label: 'データメンテナンス',
                    click: () => this.performMaintenance()
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
                    label: 'パフォーマンス情報',
                    click: () => this.showPerformanceInfo()
                },
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
     * 画像最適化を実行
     */
    private async optimizeImages(): Promise<void> {
        try {
            const { dialog } = require('electron');
            
            // 確認ダイアログ
            const response = await dialog.showMessageBox({
                type: 'question',
                title: '画像最適化',
                message: 'スクリーンショット画像をWebP形式に変換して最適化しますか？',
                detail: 'この処理には時間がかかる場合があります。',
                buttons: ['キャンセル', '実行'],
                defaultId: 1
            });

            if (response.response === 1) {
                logger.info('画像最適化を開始します');
                
                const saveDir = this.settings.getSaveDirectory();
                const results = await this.imageOptimizer.optimizeDirectory(saveDir);
                
                const successful = results.filter(r => r.success);
                const totalSaved = successful.reduce((sum, r) => sum + (r.originalSize - r.optimizedSize), 0);
                
                dialog.showMessageBox({
                    type: 'info',
                    title: '画像最適化完了',
                    message: '画像最適化が完了しました',
                    detail: `
処理済みファイル: ${successful.length}個
失敗: ${results.length - successful.length}個
節約されたストレージ: ${ImageOptimizer.formatFileSize(totalSaved)}
                    `.trim()
                });
            }
        } catch (error) {
            logger.error('画像最適化エラー', error);
            
            const { dialog } = require('electron');
            dialog.showErrorBox('画像最適化エラー', `画像最適化中にエラーが発生しました:\n\n${error.message}`);
        }
    }

    /**
     * データメンテナンスを実行
     */
    private async performMaintenance(): Promise<void> {
        try {
            const { dialog } = require('electron');
            
            // 現在の設定を取得
            const config = this.statisticsManager.getConfig();
            
            // 確認ダイアログ
            const response = await dialog.showMessageBox({
                type: 'question',
                title: 'データメンテナンス',
                message: 'データベースのメンテナンスを実行しますか？',
                detail: `${config.dataRetentionDays}日より古いデータが削除されます。`,
                buttons: ['キャンセル', '実行'],
                defaultId: 1
            });

            if (response.response === 1) {
                logger.info('データメンテナンスを開始します');
                
                const result = await this.statisticsManager.manualCleanup();
                
                dialog.showMessageBox({
                    type: 'info',
                    title: 'メンテナンス完了',
                    message: 'データベースメンテナンスが完了しました',
                    detail: `削除されたデータ: ${result.deletedRecords}日分`
                });
            }
        } catch (error) {
            logger.error('データメンテナンスエラー', error);
            
            const { dialog } = require('electron');
            dialog.showErrorBox('メンテナンスエラー', `メンテナンス中にエラーが発生しました:\n\n${error.message}`);
        }
    }

    /**
     * 使用統計追跡を開始
     */
    private async startUsageTracking(): Promise<void> {
        try {
            logger.info('使用統計追跡を開始します');
            
            // WindowsIntegrationを通じてウィンドウ追跡を開始
            this.windowsIntegration = new WindowsIntegration();
            
            // ウィンドウ変更の監視を開始
            this.windowsIntegration.startActiveWindowTracking((windowsWindowInfo: WindowsWindowInfo | null) => {
                if (windowsWindowInfo) {
                    // WindowsWindowInfo を WindowInfo に変換
                    const windowInfo: WindowInfo = {
                        title: windowsWindowInfo.title,
                        processName: windowsWindowInfo.processName,
                        processId: windowsWindowInfo.pid,
                        bounds: {
                            x: windowsWindowInfo.x || 0,
                            y: windowsWindowInfo.y || 0,
                            width: windowsWindowInfo.width || 0,
                            height: windowsWindowInfo.height || 0
                        },
                        timestamp: new Date()
                    };
                    
                    this.timeTracker.startSession(windowInfo);
                    logger.debug('ウィンドウセッション開始', {
                        title: windowInfo.title,
                        processName: windowInfo.processName,
                        processId: windowInfo.processId
                    });
                }
            });
            
            logger.info('使用統計追跡が開始されました');
        } catch (error) {
            logger.error('使用統計追跡の開始に失敗しました', error);
        }
    }

    /**
     * パフォーマンス監視を開始
     */
    private startPerformanceMonitoring(): void {
        try {
            logger.info('パフォーマンス監視を開始します');
            
            // パフォーマンスアラートのコールバックを設定
            this.performanceMonitor.setAlertCallback((metrics) => {
                logger.warn('メモリ使用量が閾値を超えました', {
                    heapUsed: `${metrics.heapUsedMB}MB`,
                    rss: `${metrics.rssMemoryMB}MB`,
                    uptime: `${Math.floor(metrics.uptime / 60)}分`
                });
                
                // 自動最適化を実行
                this.performanceMonitor.optimizeMemoryUsage();
            });
            
            // 監視開始（30秒間隔）
            this.performanceMonitor.startMonitoring(30000);
            
            logger.info('パフォーマンス監視が開始されました');
        } catch (error) {
            logger.error('パフォーマンス監視の開始に失敗しました', error);
        }
    }

    /**
     * パフォーマンス情報を表示
     */
    private showPerformanceInfo(): void {
        try {
            const performanceStats = this.performanceMonitor.getPerformanceStats();
            const currentMetrics = this.performanceMonitor.getCurrentMetrics();
            
            logger.info('パフォーマンス情報を表示します', performanceStats);

            const { dialog } = require('electron');
            
            const healthStatus = performanceStats.isHealthy ? '良好' : '要注意';
            const healthIcon = performanceStats.isHealthy ? '✅' : '⚠️';
            
            const details = currentMetrics ? `
${healthIcon} パフォーマンス状態: ${healthStatus}

📊 メモリ使用量:
  • ヒープ使用量: ${performanceStats.stats.memoryUsage.heapUsed}
  • 総ヒープ: ${performanceStats.stats.memoryUsage.heapTotal}
  • RSS メモリ: ${performanceStats.stats.memoryUsage.rss}
  • 外部メモリ: ${performanceStats.stats.memoryUsage.external}

⏱️ 稼働時間: ${performanceStats.stats.uptime}

🔧 監視設定:
  • 監視状態: ${performanceStats.stats.monitoring ? '有効' : '無効'}
  • ヒープ閾値: ${performanceStats.stats.thresholds.maxHeapUsedMB}MB
  • RSS閾値: ${performanceStats.stats.thresholds.maxRSSMemoryMB}MB
  • アラート閾値: ${performanceStats.stats.thresholds.alertThresholdMB}MB

${performanceStats.isHealthy ? '' : '⚠️ メモリ使用量が高くなっています。自動最適化が実行される場合があります。'}
            `.trim() : 'パフォーマンスデータが利用できません';

            dialog.showMessageBox({
                type: performanceStats.isHealthy ? 'info' : 'warning',
                title: 'パフォーマンス情報',
                message: 'Win Screenshot App パフォーマンス状況',
                detail: details,
                buttons: ['OK', 'メモリ最適化を実行']
            }).then((result) => {
                if (result.response === 1) {
                    // メモリ最適化を実行
                    this.performanceMonitor.optimizeMemoryUsage();
                    
                    dialog.showMessageBox({
                        type: 'info',
                        title: 'メモリ最適化',
                        message: 'メモリ最適化を実行しました',
                        detail: 'ガベージコレクションとメモリクリーンアップを実行しました。',
                        buttons: ['OK']
                    });
                }
            });

        } catch (error) {
            logger.error('パフォーマンス情報表示エラー', error);
            
            const { dialog } = require('electron');
            dialog.showErrorBox('パフォーマンス情報エラー', `パフォーマンス情報の取得中にエラーが発生しました:\n\n${error.message}`);
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
if (electron && electron.app && typeof electron.app.requestSingleInstanceLock === 'function') {
    startApplication();
}