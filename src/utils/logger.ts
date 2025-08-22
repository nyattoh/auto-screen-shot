import * as fs from 'fs-extra';
import * as path from 'path';
import { app, dialog, BrowserWindow } from 'electron';

export enum LogLevel {
    DEBUG = 'DEBUG',
    INFO = 'INFO',
    WARN = 'WARN',
    ERROR = 'ERROR'
}

export interface NotificationOptions {
    showDialog: boolean;
    showTooltip: boolean;
    critical: boolean;
}

export class Logger {
    private logFile: string;
    private maxLogSize: number = 10 * 1024 * 1024; // 10MB
    private maxLogFiles: number = 5;
    private errorCount: number = 0;
    private lastNotificationTime: number = 0;
    private notificationThrottleMs: number = 5000; // 5秒間隔

    constructor() {
        try {
            // appが準備できていない場合は一時的なパスを使用
            let userDataPath: string;
            try {
                userDataPath = app.getPath('userData');
            } catch (e) {
                // appが準備できていない場合はデフォルトパスを使用
                userDataPath = path.join(process.cwd(), 'logs');
                console.log('App not ready, using temporary log path:', userDataPath);
            }
            
            const logsDir = path.join(userDataPath, 'logs');
            
            // ログディレクトリを作成
            fs.ensureDirSync(logsDir);
            
            this.logFile = path.join(logsDir, 'app.log');
            
            // 初期化成功メッセージ
            console.log('Logger initialized. Log file:', this.logFile);
        } catch (error) {
            console.error('Logger initialization error:', error);
            // フォールバックとして現在のディレクトリを使用
            this.logFile = path.join(process.cwd(), 'app.log');
        }
    }

    private formatMessage(level: LogLevel, message: string, error?: Error): string {
        const timestamp = new Date().toISOString();
        const errorInfo = error ? ` | Error: ${error.message}\n${error.stack}` : '';
        return `[${timestamp}] [${level}] ${message}${errorInfo}\n`;
    }

    private async writeLog(level: LogLevel, message: string, error?: Error): Promise<void> {
        try {
            const logMessage = this.formatMessage(level, message, error);
            
            // ログローテーション
            await this.rotateLogIfNeeded();
            
            // ログファイルに書き込み（UTF-8エンコーディングを明示的に指定）
            await fs.appendFile(this.logFile, logMessage, 'utf8');
            
            // テスト環境ではJestの終了後ログによる失敗を防ぐため、コンソール出力を抑制
            const isTestEnv = !!process.env.JEST_WORKER_ID;
            if (!isTestEnv) {
                // コンソールにも出力
                const consoleMessage = `[${level}] ${message}`;
                switch (level) {
                    case LogLevel.DEBUG:
                        console.debug(consoleMessage);
                        break;
                    case LogLevel.INFO:
                        console.info(consoleMessage);
                        break;
                    case LogLevel.WARN:
                        console.warn(consoleMessage);
                        break;
                    case LogLevel.ERROR:
                        console.error(consoleMessage, error);
                        break;
                }
            }
        } catch (writeError) {
            console.error('ログ書き込みエラー:', writeError);
        }
    }

    private async rotateLogIfNeeded(): Promise<void> {
        try {
            const stats = await fs.stat(this.logFile);
            
            if (stats.size > this.maxLogSize) {
                // 古いログファイルを削除
                for (let i = this.maxLogFiles - 1; i >= 1; i--) {
                    const oldFile = `${this.logFile}.${i}`;
                    const newFile = `${this.logFile}.${i + 1}`;
                    
                    if (await fs.pathExists(oldFile)) {
                        if (i === this.maxLogFiles - 1) {
                            await fs.remove(oldFile);
                        } else {
                            await fs.move(oldFile, newFile);
                        }
                    }
                }
                
                // 現在のログファイルをローテーション
                await fs.move(this.logFile, `${this.logFile}.1`);
            }
        } catch (error) {
            console.error('ログローテーションエラー:', error);
        }
    }

    public debug(message: string, data?: any): void {
        const fullMessage = data ? `${message} | Data: ${JSON.stringify(data, null, 2)}` : message;
        this.writeLog(LogLevel.DEBUG, fullMessage);
    }

    public info(message: string, data?: any): void {
        const fullMessage = data ? `${message} | Data: ${JSON.stringify(data, null, 2)}` : message;
        this.writeLog(LogLevel.INFO, fullMessage);
    }


    public error(message: string, error?: Error | any, notification?: NotificationOptions): void {
        this.errorCount++;
        
        if (error instanceof Error) {
            this.writeLog(LogLevel.ERROR, message, error);
        } else if (error) {
            const fullMessage = `${message} | Data: ${JSON.stringify(error, null, 2)}`;
            this.writeLog(LogLevel.ERROR, fullMessage);
        } else {
            this.writeLog(LogLevel.ERROR, message);
        }

        // ユーザー通知（オプション）
        if (notification && this.shouldShowNotification()) {
            this.showErrorNotification(message, error, notification);
        }
    }

    public warn(message: string, error?: Error | any, notification?: NotificationOptions): void {
        if (error instanceof Error) {
            this.writeLog(LogLevel.WARN, message, error);
        } else if (error) {
            const fullMessage = `${message} | Data: ${JSON.stringify(error, null, 2)}`;
            this.writeLog(LogLevel.WARN, fullMessage);
        } else {
            this.writeLog(LogLevel.WARN, message);
        }

        // 警告も通知対象にする場合
        if (notification && this.shouldShowNotification()) {
            this.showWarningNotification(message, error, notification);
        }
    }

    /**
     * 通知のスロットリング判定
     */
    private shouldShowNotification(): boolean {
        const now = Date.now();
        if (now - this.lastNotificationTime > this.notificationThrottleMs) {
            this.lastNotificationTime = now;
            return true;
        }
        return false;
    }

    /**
     * エラー通知を表示
     */
    private showErrorNotification(message: string, error?: Error | any, options?: NotificationOptions): void {
        try {
            if (!app || !app.isReady()) {
                return;
            }

            const errorMessage = error instanceof Error ? error.message : (error ? String(error) : '');
            const fullMessage = errorMessage ? `${message}\n\n詳細: ${errorMessage}` : message;

            if (options?.showDialog && dialog) {
                // 重要なエラーの場合はダイアログを表示
                if (options.critical) {
                    dialog.showErrorBox('重要なエラー', fullMessage);
                } else {
                    dialog.showMessageBox({
                        type: 'error',
                        title: 'エラー',
                        message: 'アプリケーションエラー',
                        detail: fullMessage,
                        buttons: ['OK', 'ログを確認']
                    }).then((result) => {
                        if (result.response === 1) {
                            // ログファイルを開く
                            const { shell } = require('electron');
                            shell.openPath(this.logFile);
                        }
                    });
                }
            }

        } catch (notificationError) {
            console.error('通知表示エラー:', notificationError);
        }
    }

    /**
     * 警告通知を表示
     */
    private showWarningNotification(message: string, error?: Error | any, options?: NotificationOptions): void {
        try {
            if (!app || !app.isReady() || !options?.showDialog) {
                return;
            }

            const errorMessage = error instanceof Error ? error.message : (error ? String(error) : '');
            const fullMessage = errorMessage ? `${message}\n\n詳細: ${errorMessage}` : message;

            if (dialog) {
                dialog.showMessageBox({
                    type: 'warning',
                    title: '警告',
                    message: 'アプリケーション警告',
                    detail: fullMessage,
                    buttons: ['OK']
                });
            }

        } catch (notificationError) {
            console.error('警告通知表示エラー:', notificationError);
        }
    }

    /**
     * エラー統計を取得
     */
    public getErrorStats(): { errorCount: number; lastNotification: Date | null } {
        return {
            errorCount: this.errorCount,
            lastNotification: this.lastNotificationTime > 0 ? new Date(this.lastNotificationTime) : null
        };
    }

    /**
     * エラーカウントをリセット
     */
    public resetErrorCount(): void {
        this.errorCount = 0;
    }

    public getLogFilePath(): string {
        return this.logFile;
    }

    public async getRecentLogs(lines: number = 100): Promise<string[]> {
        try {
            const content = await fs.readFile(this.logFile, 'utf8');
            const logLines = content.split('\n').filter(line => line.trim());
            return logLines.slice(-lines);
        } catch (error) {
            return [];
        }
    }
}

// シングルトンインスタンス
export const logger = new Logger();