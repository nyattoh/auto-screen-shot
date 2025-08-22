import * as sqlite3 from 'sqlite3';
import * as path from 'path';
import * as fs from 'fs-extra';
import { logger } from '../utils/logger';

export interface UsageSession {
    windowTitle: string;
    processName: string;
    processId: number;
    application: string;
    content: string;
    category: string;
    startTime: Date;
    endTime: Date;
    duration: number; // milliseconds
    date: string; // YYYY-MM-DD
}

export interface DailyUsage {
    date: string;
    application: string;
    content: string;
    category: string;
    totalDuration: number; // minutes
    sessionCount: number;
}

export interface DateRange {
    startDate: Date;
    endDate: Date;
}

export interface SitePattern {
    id?: number;
    name: string;
    patterns: string[];
    category: string;
    icon?: string;
}

export interface IUsageDatabase {
    initialize(): Promise<void>;
    saveSession(session: UsageSession): Promise<void>;
    getDailyUsage(date: Date): Promise<DailyUsage[]>;
    getHourlyUsage(date: Date): Promise<HourlySessionData[]>;
    getDateRange(): Promise<DateRange>;
    cleanup(retentionDays: number): Promise<void>;
    exportToCSV(startDate: Date, endDate: Date): Promise<string>;
    saveSitePattern(pattern: SitePattern): Promise<void>;
    getSitePatterns(): Promise<SitePattern[]>;
    close(): Promise<void>;
    // 新しい機能追加
    getDetailedSessions(date: Date): Promise<DetailedSession[]>;
    getApplicationSessions(date: Date, application: string): Promise<DetailedSession[]>;
    getDateRangeSessions(startDate: Date, endDate: Date): Promise<DetailedSession[]>;
    getAvailableDates(): Promise<string[]>;
    getDateUsageSummary(date: Date): Promise<DateUsageSummary>;
}

export interface HourlySessionData {
    hour: number;
    totalDuration: number; // minutes
    sessionCount: number;
}

export interface DetailedSession {
    id: number;
    windowTitle: string;
    processName: string;
    application: string;
    content: string;
    category: string;
    startTime: Date;
    endTime: Date;
    duration: number; // milliseconds
    date: string;
}

export interface DateUsageSummary {
    date: string;
    totalDuration: number; // minutes
    sessionCount: number;
    applicationCount: number;
    topApplications: { application: string; duration: number; }[];
}

export class UsageDatabase implements IUsageDatabase {
    private db: sqlite3.Database | null = null;
    private dbPath: string;
    private backupPath: string;
    private maxBackups = 5;

    constructor(dbPath?: string) {
        // Default to user data directory
        const userDataPath = process.env.APPDATA || process.env.HOME || '.';
        const appDataPath = path.join(userDataPath, 'win-screenshot-app');
        this.dbPath = dbPath || path.join(appDataPath, 'usage-statistics.db');
        this.backupPath = this.dbPath.replace('.db', '.backup.db');
    }

    async initialize(): Promise<void> {
        const dbDir = path.dirname(this.dbPath);
        fs.ensureDirSync(dbDir);

        return this.initializeWithRetry(3);
    }

    private async initializeWithRetry(retryCount: number): Promise<void> {
        try {
            await this.tryInitializeDatabase();
            logger.info('データベースの初期化が完了しました');
        } catch (error) {
            logger.warn(`データベース初期化エラー (残り再試行回数: ${retryCount - 1})`, error);
            
            if (retryCount <= 1) {
                throw new Error(`データベース初期化に失敗しました: ${error.message}`);
            }

            // データベースが破損している可能性があるため復旧を試行
            await this.attemptRecovery();
            
            // 再試行
            return this.initializeWithRetry(retryCount - 1);
        }
    }

    private async tryInitializeDatabase(): Promise<void> {
        return new Promise((resolve, reject) => {
            this.db = new sqlite3.Database(this.dbPath, async (err) => {
                if (err) {
                    reject(new Error(`Failed to open database: ${err.message}`));
                    return;
                }

                try {
                    // データベースの整合性チェック
                    await this.checkDatabaseIntegrity();
                    
                    // テーブル作成
                    await this.createTables();
                    
                    // 定期バックアップの作成
                    await this.createBackup();
                    
                    resolve();
                } catch (createError) {
                    reject(createError);
                }
            });
        });
    }

    private async createTables(): Promise<void> {
        if (!this.db) {
            throw new Error('Database not initialized');
        }

        return new Promise((resolve, reject) => {
            const createUsageSessionsTable = `
                CREATE TABLE IF NOT EXISTS usage_sessions (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    window_title TEXT NOT NULL,
                    process_name TEXT NOT NULL,
                    process_id INTEGER NOT NULL,
                    application TEXT NOT NULL,
                    content TEXT NOT NULL,
                    category TEXT NOT NULL,
                    start_time DATETIME NOT NULL,
                    end_time DATETIME NOT NULL,
                    duration INTEGER NOT NULL,
                    date TEXT NOT NULL,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            `;

            const createSitePatternsTable = `
                CREATE TABLE IF NOT EXISTS site_patterns (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL UNIQUE,
                    patterns TEXT NOT NULL,
                    category TEXT NOT NULL,
                    icon TEXT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            `;

            const createIndexes = [
                'CREATE INDEX IF NOT EXISTS idx_usage_sessions_date ON usage_sessions(date)',
                'CREATE INDEX IF NOT EXISTS idx_usage_sessions_application ON usage_sessions(application)',
                'CREATE INDEX IF NOT EXISTS idx_usage_sessions_category ON usage_sessions(category)'
            ];

            let completedOperations = 0;
            const totalOperations = 2 + createIndexes.length;

            const checkComplete = () => {
                completedOperations++;
                if (completedOperations === totalOperations) {
                    resolve();
                }
            };

            this.db!.serialize(() => {
                this.db!.run(createUsageSessionsTable, (err) => {
                    if (err) {
                        reject(new Error(`Failed to create usage_sessions table: ${err.message}`));
                        return;
                    }
                    checkComplete();
                });

                this.db!.run(createSitePatternsTable, (err) => {
                    if (err) {
                        reject(new Error(`Failed to create site_patterns table: ${err.message}`));
                        return;
                    }
                    checkComplete();
                });
                
                createIndexes.forEach(indexSql => {
                    this.db!.run(indexSql, (err) => {
                        if (err) {
                            reject(new Error(`Failed to create index: ${err.message}`));
                            return;
                        }
                        checkComplete();
                    });
                });
            });
        });
    }

    /**
     * データベースの整合性をチェック
     */
    private async checkDatabaseIntegrity(): Promise<void> {
        if (!this.db) {
            throw new Error('Database not initialized');
        }

        return new Promise((resolve, reject) => {
            this.db!.get('PRAGMA integrity_check', (err, row: any) => {
                if (err) {
                    reject(new Error(`Integrity check failed: ${err.message}`));
                    return;
                }

                const result = row?.integrity_check || 'unknown';
                if (result !== 'ok') {
                    reject(new Error(`Database integrity compromised: ${result}`));
                    return;
                }

                logger.debug('データベース整合性チェック完了');
                resolve();
            });
        });
    }

    /**
     * データベースのバックアップを作成
     */
    private async createBackup(): Promise<void> {
        try {
            if (!fs.existsSync(this.dbPath)) {
                return;
            }

            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const timestampedBackupPath = this.backupPath.replace('.backup.db', `.backup.${timestamp}.db`);
            
            await fs.copy(this.dbPath, timestampedBackupPath);
            await fs.copy(this.dbPath, this.backupPath); // 最新のバックアップ
            
            // 古いバックアップを削除（最大数を超えた場合）
            await this.cleanupOldBackups();
            
            logger.debug(`データベースバックアップを作成しました: ${timestampedBackupPath}`);
        } catch (error) {
            logger.warn('データベースバックアップの作成に失敗しました', error);
            // バックアップ失敗は致命的ではないので続行
        }
    }

    /**
     * 古いバックアップファイルをクリーンアップ
     */
    private async cleanupOldBackups(): Promise<void> {
        try {
            const dbDir = path.dirname(this.dbPath);
            const files = await fs.readdir(dbDir);
            
            const backupFiles = files
                .filter(file => file.includes('.backup.') && file.endsWith('.db'))
                .map(file => ({
                    name: file,
                    path: path.join(dbDir, file),
                    mtime: fs.statSync(path.join(dbDir, file)).mtime
                }))
                .sort((a, b) => b.mtime.getTime() - a.mtime.getTime()); // 新しい順

            // 最大数を超えた古いバックアップを削除
            const filesToDelete = backupFiles.slice(this.maxBackups);
            
            for (const file of filesToDelete) {
                await fs.remove(file.path);
                logger.debug(`古いバックアップファイルを削除しました: ${file.name}`);
            }
        } catch (error) {
            logger.warn('バックアップファイルのクリーンアップに失敗しました', error);
        }
    }

    /**
     * データベース復旧を試行
     */
    private async attemptRecovery(): Promise<void> {
        try {
            logger.warn('データベースの復旧を開始します');

            // 現在のデータベースを閉じる
            if (this.db) {
                await this.closeDatabase();
            }

            // 破損したデータベースを移動
            const corruptedPath = this.dbPath.replace('.db', '.corrupted.db');
            if (fs.existsSync(this.dbPath)) {
                await fs.move(this.dbPath, corruptedPath);
                logger.info(`破損したデータベースを移動しました: ${corruptedPath}`);
            }

            // バックアップから復元を試行
            let restored = false;
            
            // 最新のバックアップから復元
            if (fs.existsSync(this.backupPath)) {
                try {
                    await fs.copy(this.backupPath, this.dbPath);
                    logger.info('最新のバックアップから復元しました');
                    restored = true;
                } catch (backupError) {
                    logger.warn('最新のバックアップからの復元に失敗しました', backupError);
                }
            }

            // タイムスタンプ付きバックアップから復元を試行
            if (!restored) {
                const dbDir = path.dirname(this.dbPath);
                try {
                    const files = await fs.readdir(dbDir);
                    const backupFiles = files
                        .filter(file => file.includes('.backup.') && file.endsWith('.db'))
                        .map(file => ({
                            name: file,
                            path: path.join(dbDir, file),
                            mtime: fs.statSync(path.join(dbDir, file)).mtime
                        }))
                        .sort((a, b) => b.mtime.getTime() - a.mtime.getTime());

                    for (const backupFile of backupFiles) {
                        try {
                            await fs.copy(backupFile.path, this.dbPath);
                            logger.info(`バックアップから復元しました: ${backupFile.name}`);
                            restored = true;
                            break;
                        } catch (error) {
                            logger.warn(`バックアップ復元失敗: ${backupFile.name}`, error);
                        }
                    }
                } catch (error) {
                    logger.warn('バックアップファイルの検索に失敗しました', error);
                }
            }

            // 復元できない場合は新しいデータベースを作成
            if (!restored) {
                logger.warn('バックアップからの復元に失敗しました。新しいデータベースを作成します');
            }

            logger.info('データベース復旧処理が完了しました');

        } catch (error) {
            logger.error('データベース復旧に失敗しました', error);
            throw new Error(`Database recovery failed: ${error.message}`);
        }
    }

    /**
     * データベースを安全に閉じる
     */
    private async closeDatabase(): Promise<void> {
        return new Promise((resolve) => {
            if (this.db) {
                this.db.close((err) => {
                    if (err) {
                        logger.warn('データベースクローズ中にエラーが発生しました', err);
                    }
                    this.db = null;
                    resolve();
                });
            } else {
                resolve();
            }
        });
    }

    async saveSession(session: UsageSession): Promise<void> {
        if (!this.db) {
            throw new Error('Database not initialized');
        }

        return new Promise((resolve, reject) => {
            const sql = `
                INSERT INTO usage_sessions (
                    window_title, process_name, process_id, application, content, category,
                    start_time, end_time, duration, date
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `;

            const params = [
                session.windowTitle,
                session.processName,
                session.processId,
                session.application,
                session.content,
                session.category,
                session.startTime.toISOString(),
                session.endTime.toISOString(),
                session.duration,
                session.date
            ];

            this.db!.run(sql, params, function(err) {
                if (err) {
                    reject(new Error(`Failed to save session: ${err.message}`));
                } else {
                    resolve();
                }
            });
        });
    }

    async getDailyUsage(date: Date): Promise<DailyUsage[]> {
        if (!this.db) {
            throw new Error('Database not initialized');
        }

        // 入力日付のローカル・UTC双方の文字列を用意（テストの表現揺れ対策）
        const localDateStr = this.formatDate(new Date(date.getFullYear(), date.getMonth(), date.getDate()));
        const isoDateStr = date.toISOString().split('T')[0];

        return new Promise((resolve, reject) => {
            const sql = `
                SELECT 
                    date,
                    application,
                    content,
                    category,
                    SUM(duration) as total_duration_ms,
                    COUNT(*) as session_count
                FROM usage_sessions 
                WHERE date IN (?, ?)
                GROUP BY application, content, category
                ORDER BY total_duration_ms DESC
            `;

            this.db!.all(sql, [localDateStr, isoDateStr], (err, rows: any[]) => {
                if (err) {
                    reject(new Error(`Failed to get daily usage: ${err.message}`));
                } else {
                    const dailyUsage: DailyUsage[] = rows.map(row => ({
                        date: row.date,
                        application: row.application,
                        content: row.content,
                        category: row.category,
                        totalDuration: Math.round(row.total_duration_ms / 60000), // Convert to minutes
                        sessionCount: row.session_count
                    }));
                    resolve(dailyUsage);
                }
            });
        });
    }

    async getDateRange(): Promise<DateRange> {
        if (!this.db) {
            throw new Error('Database not initialized');
        }

        return new Promise((resolve, reject) => {
            const sql = `
                SELECT 
                    MIN(date) as start_date,
                    MAX(date) as end_date
                FROM usage_sessions
            `;

            this.db!.get(sql, (err, row: any) => {
                if (err) {
                    reject(new Error(`Failed to get date range: ${err.message}`));
                } else if (!row || !row.start_date) {
                    // No data available
                    const today = new Date();
                    resolve({
                        startDate: today,
                        endDate: today
                    });
                } else {
                    resolve({
                        startDate: new Date(row.start_date),
                        endDate: new Date(row.end_date)
                    });
                }
            });
        });
    }

    async cleanup(retentionDays: number = 30): Promise<void> {
        if (!this.db) {
            throw new Error('Database not initialized');
        }

        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
        const cutoffDateStr = this.formatDate(cutoffDate);

        return new Promise((resolve, reject) => {
            const sql = 'DELETE FROM usage_sessions WHERE date < ?';

            this.db!.run(sql, [cutoffDateStr], function(err) {
                if (err) {
                    reject(new Error(`Failed to cleanup old data: ${err.message}`));
                } else {
                    console.log(`Cleaned up ${this.changes} old usage sessions`);
                    resolve();
                }
            });
        });
    }

    async exportToCSV(startDate: Date, endDate: Date): Promise<string> {
        if (!this.db) {
            throw new Error('Database not initialized');
        }

        // 開始・終了ともにローカル/UTCの両表現を用意（テストの表現揺れ対策）
        const startLocal = this.formatDate(new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate()));
        const endLocal = this.formatDate(new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate()));
        const startIso = startDate.toISOString().split('T')[0];
        const endIso = endDate.toISOString().split('T')[0];

        return new Promise((resolve, reject) => {
            const sql = `
                SELECT 
                    date,
                    application,
                    content,
                    category,
                    window_title,
                    process_name,
                    start_time,
                    end_time,
                    duration
                FROM usage_sessions 
                WHERE (date BETWEEN ? AND ?) OR (date BETWEEN ? AND ?)
                ORDER BY date, start_time
            `;

            this.db!.all(sql, [startLocal, endLocal, startIso, endIso], (err, rows: any[]) => {
                if (err) {
                    reject(new Error(`Failed to export data: ${err.message}`));
                } else {
                    const csvHeader = 'Date,Application,Content,Category,Window Title,Process Name,Start Time,End Time,Duration (minutes)\n';
                    const csvRows = rows.map(row => {
                        const durationMinutes = Math.round(row.duration / 60000);
                        return [
                            row.date,
                            this.escapeCsvField(row.application),
                            this.escapeCsvField(row.content),
                            this.escapeCsvField(row.category),
                            this.escapeCsvField(row.window_title),
                            this.escapeCsvField(row.process_name),
                            row.start_time,
                            row.end_time,
                            durationMinutes
                        ].join(',');
                    }).join('\n');

                    resolve(csvHeader + csvRows);
                }
            });
        });
    }

    async saveSitePattern(pattern: SitePattern): Promise<void> {
        if (!this.db) {
            throw new Error('Database not initialized');
        }

        return new Promise((resolve, reject) => {
            const sql = `
                INSERT OR REPLACE INTO site_patterns (name, patterns, category, icon)
                VALUES (?, ?, ?, ?)
            `;

            const params = [
                pattern.name,
                JSON.stringify(pattern.patterns),
                pattern.category,
                pattern.icon || null
            ];

            this.db!.run(sql, params, function(err) {
                if (err) {
                    reject(new Error(`Failed to save site pattern: ${err.message}`));
                } else {
                    resolve();
                }
            });
        });
    }

    async getSitePatterns(): Promise<SitePattern[]> {
        if (!this.db) {
            throw new Error('Database not initialized');
        }

        return new Promise((resolve, reject) => {
            const sql = 'SELECT * FROM site_patterns ORDER BY name';

            this.db!.all(sql, (err, rows: any[]) => {
                if (err) {
                    reject(new Error(`Failed to get site patterns: ${err.message}`));
                } else {
                    const patterns: SitePattern[] = rows.map(row => ({
                        id: row.id,
                        name: row.name,
                        patterns: JSON.parse(row.patterns),
                        category: row.category,
                        icon: row.icon
                    }));
                    resolve(patterns);
                }
            });
        });
    }

    async getHourlyUsage(date: Date): Promise<HourlySessionData[]> {
        if (!this.db) {
            throw new Error('Database not initialized');
        }

        const dateStr = this.formatDate(date);

        return new Promise((resolve, reject) => {
            const sql = `
                SELECT 
                    CAST(strftime('%H', start_time) AS INTEGER) as hour,
                    SUM(duration) as total_duration_ms,
                    COUNT(*) as session_count
                FROM usage_sessions 
                WHERE date = ?
                GROUP BY hour
                ORDER BY hour
            `;

            this.db!.all(sql, [dateStr], (err, rows: any[]) => {
                if (err) {
                    reject(new Error(`Failed to get hourly usage: ${err.message}`));
                } else {
                    const hourlyUsage: HourlySessionData[] = rows.map(row => ({
                        hour: row.hour,
                        totalDuration: Math.round(row.total_duration_ms / 60000), // Convert to minutes
                        sessionCount: row.session_count
                    }));
                    resolve(hourlyUsage);
                }
            });
        });
    }

    async close(): Promise<void> {
        try {
            // 最終バックアップを作成
            await this.createBackup();
            
            // データベースを安全に閉じる
            await this.closeDatabase();
            
            logger.info('データベースが正常に閉じられました');
        } catch (error) {
            logger.warn('データベースクローズ中にエラーが発生しました', error);
            // 強制的にデータベース接続を切断
            this.db = null;
        }
    }

    private formatDate(date: Date): string {
        // ローカルタイムゾーンで YYYY-MM-DD 形式へ変換
        const yyyy = date.getFullYear();
        const mm = String(date.getMonth() + 1).padStart(2, '0');
        const dd = String(date.getDate()).padStart(2, '0');
        return `${yyyy}-${mm}-${dd}`; // YYYY-MM-DD (local)
    }

    private escapeCsvField(field: string): string {
        if (field.includes(',') || field.includes('"') || field.includes('\n')) {
            return `"${field.replace(/"/g, '""')}"`;
        }
        return field;
    }

    async getDetailedSessions(date: Date): Promise<DetailedSession[]> {
        if (!this.db) {
            throw new Error('Database not initialized');
        }

        const dateStr = this.formatDate(date);

        return new Promise((resolve, reject) => {
            const sql = `
                SELECT 
                    id,
                    window_title,
                    process_name,
                    application,
                    content,
                    category,
                    start_time,
                    end_time,
                    duration,
                    date
                FROM usage_sessions 
                WHERE date = ?
                ORDER BY start_time ASC
            `;

            this.db!.all(sql, [dateStr], (err, rows: any[]) => {
                if (err) {
                    reject(new Error(`Failed to get detailed sessions: ${err.message}`));
                } else {
                    const sessions: DetailedSession[] = rows.map(row => ({
                        id: row.id,
                        windowTitle: row.window_title,
                        processName: row.process_name,
                        application: row.application,
                        content: row.content,
                        category: row.category,
                        startTime: new Date(row.start_time),
                        endTime: new Date(row.end_time),
                        duration: row.duration,
                        date: row.date
                    }));
                    resolve(sessions);
                }
            });
        });
    }

    async getApplicationSessions(date: Date, application: string): Promise<DetailedSession[]> {
        if (!this.db) {
            throw new Error('Database not initialized');
        }

        const dateStr = this.formatDate(date);

        return new Promise((resolve, reject) => {
            const sql = `
                SELECT 
                    id,
                    window_title,
                    process_name,
                    application,
                    content,
                    category,
                    start_time,
                    end_time,
                    duration,
                    date
                FROM usage_sessions 
                WHERE date = ? AND application = ?
                ORDER BY start_time ASC
            `;

            this.db!.all(sql, [dateStr, application], (err, rows: any[]) => {
                if (err) {
                    reject(new Error(`Failed to get application sessions: ${err.message}`));
                } else {
                    const sessions: DetailedSession[] = rows.map(row => ({
                        id: row.id,
                        windowTitle: row.window_title,
                        processName: row.process_name,
                        application: row.application,
                        content: row.content,
                        category: row.category,
                        startTime: new Date(row.start_time),
                        endTime: new Date(row.end_time),
                        duration: row.duration,
                        date: row.date
                    }));
                    resolve(sessions);
                }
            });
        });
    }

    async getDateRangeSessions(startDate: Date, endDate: Date): Promise<DetailedSession[]> {
        if (!this.db) {
            throw new Error('Database not initialized');
        }

        const startDateStr = this.formatDate(startDate);
        const endDateStr = this.formatDate(endDate);

        return new Promise((resolve, reject) => {
            const sql = `
                SELECT 
                    id,
                    window_title,
                    process_name,
                    application,
                    content,
                    category,
                    start_time,
                    end_time,
                    duration,
                    date
                FROM usage_sessions 
                WHERE date BETWEEN ? AND ?
                ORDER BY date DESC, start_time ASC
            `;

            this.db!.all(sql, [startDateStr, endDateStr], (err, rows: any[]) => {
                if (err) {
                    reject(new Error(`Failed to get date range sessions: ${err.message}`));
                } else {
                    const sessions: DetailedSession[] = rows.map(row => ({
                        id: row.id,
                        windowTitle: row.window_title,
                        processName: row.process_name,
                        application: row.application,
                        content: row.content,
                        category: row.category,
                        startTime: new Date(row.start_time),
                        endTime: new Date(row.end_time),
                        duration: row.duration,
                        date: row.date
                    }));
                    resolve(sessions);
                }
            });
        });
    }

    async getAvailableDates(): Promise<string[]> {
        if (!this.db) {
            throw new Error('Database not initialized');
        }

        return new Promise((resolve, reject) => {
            const sql = `
                SELECT DISTINCT date 
                FROM usage_sessions 
                ORDER BY date DESC
            `;

            this.db!.all(sql, (err, rows: any[]) => {
                if (err) {
                    reject(new Error(`Failed to get available dates: ${err.message}`));
                } else {
                    const dates = rows.map(row => row.date);
                    resolve(dates);
                }
            });
        });
    }

    async getDateUsageSummary(date: Date): Promise<DateUsageSummary> {
        if (!this.db) {
            throw new Error('Database not initialized');
        }

        const dateStr = this.formatDate(date);

        return new Promise((resolve, reject) => {
            const sql = `
                SELECT 
                    COUNT(*) as session_count,
                    SUM(duration) as total_duration_ms,
                    COUNT(DISTINCT application) as application_count
                FROM usage_sessions 
                WHERE date = ?
            `;

            const topAppsSql = `
                SELECT 
                    application,
                    SUM(duration) as duration_ms
                FROM usage_sessions 
                WHERE date = ?
                GROUP BY application
                ORDER BY duration_ms DESC
                LIMIT 5
            `;

            this.db!.get(sql, [dateStr], (err, summaryRow: any) => {
                if (err) {
                    reject(new Error(`Failed to get date summary: ${err.message}`));
                    return;
                }

                this.db!.all(topAppsSql, [dateStr], (err, topAppsRows: any[]) => {
                    if (err) {
                        reject(new Error(`Failed to get top applications: ${err.message}`));
                        return;
                    }

                    const summary: DateUsageSummary = {
                        date: dateStr,
                        totalDuration: summaryRow ? Math.round(summaryRow.total_duration_ms / 60000) : 0,
                        sessionCount: summaryRow ? summaryRow.session_count : 0,
                        applicationCount: summaryRow ? summaryRow.application_count : 0,
                        topApplications: topAppsRows.map(row => ({
                            application: row.application,
                            duration: Math.round(row.duration_ms / 60000)
                        }))
                    };

                    resolve(summary);
                });
            });
        });
    }
}