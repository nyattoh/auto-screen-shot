import { BrowserWindow, ipcMain, shell } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import ScreenshotManager from '../screenshot/capture';
import Settings from '../config/settings';
import { ScreenshotData } from '../types';
import { UsageDatabase, DailyUsage, DetailedSession, DateUsageSummary } from '../usage/UsageDatabase';
import { logger } from '../utils/logger';

export class StatisticsWindow {
    private window: BrowserWindow | null = null;
    private screenshotManager: ScreenshotManager;
    private settings: Settings;
    private usageDatabase: UsageDatabase;

    constructor(screenshotManager: ScreenshotManager, settings: Settings, usageDatabase?: UsageDatabase) {
        this.screenshotManager = screenshotManager;
        this.settings = settings;
        this.usageDatabase = usageDatabase || new UsageDatabase();
        this.setupIpcHandlers();
        this.initializeDatabase();
    }

    public async reopenDatabase(): Promise<void> {
        try {
            if (this.usageDatabase) {
                await this.usageDatabase.close();
            }
            this.usageDatabase = new UsageDatabase();
            await this.usageDatabase.initialize();
            logger.info('統計ウィンドウ: データベース接続を再オープンしました');
        } catch (error) {
            logger.error('統計ウィンドウ: データベース再オープンに失敗', error);
        }
    }

    private async initializeDatabase(): Promise<void> {
        try {
            await this.usageDatabase.initialize();
            logger.info('統計用データベース初期化完了');
        } catch (error) {
            logger.error('統計用データベース初期化エラー', error);
        }
    }

    private setupIpcHandlers(): void {
        ipcMain.on('request-statistics', () => {
            this.sendStatisticsData();
        });

        ipcMain.on('open-save-folder', () => {
            shell.openPath(this.settings.getSaveDirectory());
        });

        // 新しいIPC通信ハンドラー
        ipcMain.handle('get-available-dates', async () => {
            try {
                return await this.usageDatabase.getAvailableDates();
            } catch (error) {
                logger.error('利用可能な日付の取得に失敗', error);
                return [];
            }
        });

        ipcMain.handle('get-date-sessions', async (event, dateStr: string) => {
            try {
                const date = new Date(dateStr);
                return await this.usageDatabase.getDetailedSessions(date);
            } catch (error) {
                logger.error('日付別セッションの取得に失敗', error);
                return [];
            }
        });

        ipcMain.handle('get-application-sessions', async (event, dateStr: string, application: string) => {
            try {
                const date = new Date(dateStr);
                return await this.usageDatabase.getApplicationSessions(date, application);
            } catch (error) {
                logger.error('アプリケーション別セッションの取得に失敗', error);
                return [];
            }
        });

        ipcMain.handle('get-date-summary', async (event, dateStr: string) => {
            try {
                const date = new Date(dateStr);
                return await this.usageDatabase.getDateUsageSummary(date);
            } catch (error) {
                logger.error('日付サマリーの取得に失敗', error);
                return null;
            }
        });

        ipcMain.handle('get-daily-usage', async (event, dateStr: string) => {
            try {
                const date = new Date(dateStr);
                return await this.usageDatabase.getDailyUsage(date);
            } catch (error) {
                logger.error('日別使用時間の取得に失敗', error);
                return [];
            }
        });

        // CSVエクスポート関連のIPCハンドラー
        ipcMain.handle('export-csv', async (event, startDateStr: string, endDateStr: string) => {
            try {
                const startDate = new Date(startDateStr);
                const endDate = new Date(endDateStr);
                const csvData = await this.usageDatabase.exportToCSV(startDate, endDate);
                return { success: true, data: csvData };
            } catch (error) {
                logger.error('CSVエクスポートに失敗', error);
                return { success: false, error: error.message };
            }
        });

        ipcMain.handle('get-date-range-sessions', async (event, startDateStr: string, endDateStr: string) => {
            try {
                const startDate = new Date(startDateStr);
                const endDate = new Date(endDateStr);
                return await this.usageDatabase.getDateRangeSessions(startDate, endDate);
            } catch (error) {
                logger.error('日付範囲セッションの取得に失敗', error);
                return [];
            }
        });

        ipcMain.handle('save-csv-file', async (event, csvData: string, defaultFileName?: string) => {
            try {
                const { dialog } = require('electron');
                const result = await dialog.showSaveDialog(this.window, {
                    title: 'CSVファイルを保存',
                    defaultPath: defaultFileName || `usage-statistics-${new Date().toISOString().split('T')[0]}.csv`,
                    filters: [
                        { name: 'CSV Files', extensions: ['csv'] },
                        { name: 'All Files', extensions: ['*'] }
                    ]
                });

                if (!result.canceled && result.filePath) {
                    const fs = require('fs');
                    fs.writeFileSync(result.filePath, csvData, 'utf8');
                    return { success: true, filePath: result.filePath };
                } else {
                    return { success: false, canceled: true };
                }
            } catch (error) {
                logger.error('CSVファイル保存に失敗', error);
                return { success: false, error: error.message };
            }
        });
    }

    public create(): void {
        if (this.window) {
            this.window.focus();
            return;
        }

        this.window = new BrowserWindow({
            width: 1200,
            height: 800,
            minWidth: 800,
            minHeight: 600,
            title: 'スクリーンショット統計',
            icon: path.join(__dirname, '../../assets/icon.png'),
            autoHideMenuBar: true, // メニューバーを自動非表示
            webPreferences: {
                nodeIntegration: true,
                contextIsolation: false,
            },
            show: false,
        });

        // メニューバーを完全に削除
        this.window.setMenu(null);

        this.window.loadFile(path.join(__dirname, '../../assets/statistics.html'));

        this.window.once('ready-to-show', () => {
            this.window?.show();
            this.sendStatisticsData();
        });

        this.window.on('closed', () => {
            this.window = null;
        });

        // 開発時のデバッグ用
        if (process.env.NODE_ENV === 'development') {
            this.window.webContents.openDevTools();
        }
    }

    private async getActualScreenshotCounts(): Promise<{ totalCount: number; todayCount: number }> {
        try {
            const saveDir = this.settings.getSaveDirectory();
            if (!fs.existsSync(saveDir)) {
                return { totalCount: 0, todayCount: 0 };
            }

            const files = fs.readdirSync(saveDir);
            const screenshotFiles = files.filter(file => 
                file.startsWith('screenshot-') && file.endsWith('.png')
            );

            const totalCount = screenshotFiles.length;

            // 今日の日付文字列を生成 (ローカルタイムゾーン)
            const now = new Date();
            const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`; // YYYY-MM-DD

            const todayCount = screenshotFiles.filter(file => {
                // screenshot-2025-08-02T11-24-12-808Z.png の形式から日付を抽出
                const match = file.match(/screenshot-(\d{4}-\d{2}-\d{2})/);
                return match && match[1] === today;
            }).length;

            logger.debug('実際のスクリーンショット数を計算', { totalCount, todayCount, today });
            return { totalCount, todayCount };
        } catch (error) {
            logger.error('スクリーンショット数の計算に失敗', error);
            return { totalCount: 0, todayCount: 0 };
        }
    }

    private async sendStatisticsData(): Promise<void> {
        if (!this.window) return;

        try {
            // 実際のスクリーンショットファイルを読み込んで正確な数を計算
            const screenshotStats = await this.getActualScreenshotCounts();
            const history = this.screenshotManager.getScreenshotHistory();
            
            const totalCount = screenshotStats.totalCount;
            const todayCount = screenshotStats.todayCount;

            const lastCapture = this.screenshotManager.getLastScreenshot();

            // 実際の使用時間データを取得
            const realDailyStats = await this.getRealDailyUsageStats();
            
            // スクリーンショット間隔ベースの統計（後方互換性のため）
            const screenshotBasedStats = this.computeDailyScreenTime(history);

            const statisticsData = {
                totalCount,
                todayCount,
                isCapturing: this.screenshotManager.isCurrentlyCapturing(),
                lastCapture: lastCapture ? lastCapture.timestamp : null,
                history: history.slice(-20).reverse(), // 最新20件を逆順で表示
                dailyStats: screenshotBasedStats, // 後方互換性のため
                realUsageStats: realDailyStats, // 実際の使用時間データ
            };

            this.window.webContents.send('statistics-data', statisticsData);
            logger.debug('統計データを送信しました', { totalCount, todayCount, realUsageStatsCount: realDailyStats.length });
        } catch (error) {
            logger.error('統計データ送信エラー', error);
            
            // エラー時は基本的なデータのみ送信
            const history = this.screenshotManager.getScreenshotHistory();
            const basicStats = {
                totalCount: history.length,
                todayCount: 0,
                isCapturing: this.screenshotManager.isCurrentlyCapturing(),
                lastCapture: null,
                history: history.slice(-20).reverse(),
                dailyStats: {},
                realUsageStats: [],
                error: 'データベースエラーが発生しました'
            };
            
            this.window.webContents.send('statistics-data', basicStats);
        }
    }

    private async getRealDailyUsageStats(): Promise<DailyUsage[]> {
        try {
            const today = new Date();
            const dailyUsage = await this.usageDatabase.getDailyUsage(today);
            logger.debug(`今日の使用時間データを取得: ${dailyUsage.length}件`);
            return dailyUsage;
        } catch (error) {
            logger.warn('使用時間データの取得に失敗', error);
            return [];
        }
    }

    private computeDailyScreenTime(history: ScreenshotData[]): Record<string, Record<string, number>> {
        const dailyTime: Record<string, Record<string, number>> = {};

        history.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

        for (let i = 0; i < history.length - 1; i++) {
            const current = history[i];
            const next = history[i + 1];
            const timeDiff = (next.timestamp.getTime() - current.timestamp.getTime()) / 1000 / 60; // minutes
            const dateKey = current.timestamp.toISOString().split('T')[0];
            const screen = current.activeWindow || 'Unknown';

            if (!dailyTime[dateKey]) dailyTime[dateKey] = {};
            dailyTime[dateKey][screen] = (dailyTime[dateKey][screen] || 0) + timeDiff;
        }

        return dailyTime;
    }

    public refresh(): void {
        this.sendStatisticsData();
    }

    public isOpen(): boolean {
        return this.window !== null && !this.window.isDestroyed();
    }

    public close(): void {
        if (this.window) {
            this.window.close();
        }
    }
}

export function createStatisticsWindow(screenshotManager: ScreenshotManager, settings: Settings, usageDatabase?: UsageDatabase): StatisticsWindow {
    return new StatisticsWindow(screenshotManager, settings, usageDatabase);
}
