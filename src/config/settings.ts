import * as fs from 'fs-extra';
import * as path from 'path';
import { app } from 'electron';

export interface StatisticsConfig {
    dataRetentionDays: number;
    cleanupIntervalHours: number;
    enableImageOptimization: boolean;
    webpQuality: number;
}

export class Settings {
    private saveDirectory: string;
    private captureInterval: number;
    private autoStart: boolean;
    private statisticsConfig: StatisticsConfig;
    private configPath: string;

    constructor() {
        this.configPath = path.join(this.safeGetPath('userData'), 'config.json');
        this.loadSettings();
    }

    private safeGetPath(name: 'userData' | 'documents'): string {
        try {
            if (app && app.isReady()) {
                return app.getPath(name);
            }
        } catch {}
        // Electron が未準備のタイミングでも落ちないようフォールバック
        const home = process.env.USERPROFILE || process.env.HOME || process.cwd();
        if (name === 'documents') {
            // Windows の既定のドキュメントを推定
            const docs = process.env.USERPROFILE ? path.join(process.env.USERPROFILE, 'Documents') : path.join(home, 'Documents');
            return docs;
        }
        // userData フォールバック
        return path.join(home, 'AppData', 'Roaming', 'win-screenshot-app');
    }

    private loadSettings(): void {
        try {
            if (fs.existsSync(this.configPath)) {
                const config = fs.readJsonSync(this.configPath);
                this.saveDirectory = config.saveDirectory || path.join(this.safeGetPath('documents'), 'Screenshots');
                this.captureInterval = config.captureInterval || 180000; // 3分
                // booleanの既定値を正しく反映（falseを潰さない）
                this.autoStart = typeof config.autoStart === 'boolean' ? config.autoStart : true;
                this.statisticsConfig = config.statisticsConfig || this.getDefaultStatisticsConfig();
            } else {
                this.setDefaultSettings();
            }
        } catch (error) {
            this.setDefaultSettings();
        }
    }

    private setDefaultSettings(): void {
        this.saveDirectory = path.join(this.safeGetPath('documents'), 'Screenshots');
        this.captureInterval = 180000; // 3分
        this.autoStart = true;
        this.statisticsConfig = this.getDefaultStatisticsConfig();
        this.saveSettings();
    }

    private getDefaultStatisticsConfig(): StatisticsConfig {
        return {
            dataRetentionDays: 90, // 90日間データを保持
            cleanupIntervalHours: 24, // 24時間ごとにクリーンアップ
            enableImageOptimization: true,
            webpQuality: 80
        };
    }

    public saveSettings(): void {
        const config = {
            saveDirectory: this.saveDirectory,
            captureInterval: this.captureInterval,
            autoStart: this.autoStart,
            statisticsConfig: this.statisticsConfig
        };
        fs.ensureDirSync(path.dirname(this.configPath));
        fs.writeJsonSync(this.configPath, config, { spaces: 2 });
    }

    public setSaveDirectory(directory: string): void {
        this.saveDirectory = directory;
        this.saveSettings();
    }

    public getSaveDirectory(): string {
        return this.saveDirectory;
    }

    public setCaptureInterval(interval: number): void {
        this.captureInterval = interval;
        this.saveSettings();
    }

    public getCaptureInterval(): number {
        return this.captureInterval;
    }

    public getScreenshotInterval(): number {
        return this.captureInterval;
    }

    public setAutoStart(autoStart: boolean): void {
        this.autoStart = autoStart;
        this.saveSettings();
    }

    public getAutoStart(): boolean {
        return this.autoStart;
    }

    public setStatisticsConfig(config: StatisticsConfig): void {
        this.statisticsConfig = config;
        this.saveSettings();
    }

    public getStatisticsConfig(): StatisticsConfig {
        return { ...this.statisticsConfig };
    }
}

export default Settings;
