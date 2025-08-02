import * as fs from 'fs-extra';
import * as path from 'path';
import { app } from 'electron';

export enum LogLevel {
    DEBUG = 'DEBUG',
    INFO = 'INFO',
    WARN = 'WARN',
    ERROR = 'ERROR'
}

export class Logger {
    private logFile: string;
    private maxLogSize: number = 10 * 1024 * 1024; // 10MB
    private maxLogFiles: number = 5;

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

    public warn(message: string, error?: Error | any): void {
        if (error instanceof Error) {
            this.writeLog(LogLevel.WARN, message, error);
        } else if (error) {
            const fullMessage = `${message} | Data: ${JSON.stringify(error, null, 2)}`;
            this.writeLog(LogLevel.WARN, fullMessage);
        } else {
            this.writeLog(LogLevel.WARN, message);
        }
    }

    public error(message: string, error?: Error | any): void {
        if (error instanceof Error) {
            this.writeLog(LogLevel.ERROR, message, error);
        } else if (error) {
            const fullMessage = `${message} | Data: ${JSON.stringify(error, null, 2)}`;
            this.writeLog(LogLevel.ERROR, fullMessage);
        } else {
            this.writeLog(LogLevel.ERROR, message);
        }
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