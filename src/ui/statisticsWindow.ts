import { BrowserWindow, ipcMain, shell } from 'electron';
import * as path from 'path';
import ScreenshotManager from '../screenshot/capture';
import Settings from '../config/settings';
import { ScreenshotData } from '../types';

export class StatisticsWindow {
    private window: BrowserWindow | null = null;
    private screenshotManager: ScreenshotManager;
    private settings: Settings;

    constructor(screenshotManager: ScreenshotManager, settings: Settings) {
        this.screenshotManager = screenshotManager;
        this.settings = settings;
        this.setupIpcHandlers();
    }

    private setupIpcHandlers(): void {
        ipcMain.on('request-statistics', () => {
            this.sendStatisticsData();
        });

        ipcMain.on('open-save-folder', () => {
            shell.openPath(this.settings.getSaveDirectory());
        });
    }

    public create(): void {
        if (this.window) {
            this.window.focus();
            return;
        }

        this.window = new BrowserWindow({
            width: 900,
            height: 700,
            minWidth: 600,
            minHeight: 500,
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

    private async sendStatisticsData(): Promise<void> {
        if (!this.window) return;

        const history = this.screenshotManager.getScreenshotHistory();
        const dailyStats = this.computeDailyScreenTime(history);

        const totalCount = history.length;
        
        // 今日の撮影数を計算
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todayCount = history.filter(item => {
            const itemDate = new Date(item.timestamp);
            itemDate.setHours(0, 0, 0, 0);
            return itemDate.getTime() === today.getTime();
        }).length;

        const lastCapture = this.screenshotManager.getLastScreenshot();

        const statisticsData = {
            totalCount,
            todayCount,
            isCapturing: this.screenshotManager.isCurrentlyCapturing(),
            lastCapture: lastCapture ? lastCapture.timestamp : null,
            history: history.slice(-20).reverse(), // 最新20件を逆順で表示
            dailyStats,
        };

        this.window.webContents.send('statistics-data', statisticsData);
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

export function createStatisticsWindow(screenshotManager: ScreenshotManager, settings: Settings): StatisticsWindow {
    return new StatisticsWindow(screenshotManager, settings);
}