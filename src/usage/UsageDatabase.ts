import * as sqlite3 from 'sqlite3';
import * as path from 'path';
import * as fs from 'fs-extra';

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
}

export interface HourlySessionData {
    hour: number;
    totalDuration: number; // minutes
    sessionCount: number;
}

export class UsageDatabase implements IUsageDatabase {
    private db: sqlite3.Database | null = null;
    private dbPath: string;

    constructor(dbPath?: string) {
        // Default to user data directory
        const userDataPath = process.env.APPDATA || process.env.HOME || '.';
        const appDataPath = path.join(userDataPath, 'win-screenshot-app');
        this.dbPath = dbPath || path.join(appDataPath, 'usage-statistics.db');
    }

    async initialize(): Promise<void> {
        return new Promise((resolve, reject) => {
            // Ensure directory exists
            const dbDir = path.dirname(this.dbPath);
            fs.ensureDirSync(dbDir);

            this.db = new sqlite3.Database(this.dbPath, (err) => {
                if (err) {
                    reject(new Error(`Failed to open database: ${err.message}`));
                    return;
                }

                this.createTables()
                    .then(() => resolve())
                    .catch(reject);
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

        const dateStr = this.formatDate(date);

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
                WHERE date = ?
                GROUP BY application, content, category
                ORDER BY total_duration_ms DESC
            `;

            this.db!.all(sql, [dateStr], (err, rows: any[]) => {
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

        const startDateStr = this.formatDate(startDate);
        const endDateStr = this.formatDate(endDate);

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
                WHERE date BETWEEN ? AND ?
                ORDER BY date, start_time
            `;

            this.db!.all(sql, [startDateStr, endDateStr], (err, rows: any[]) => {
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
        if (!this.db) {
            return;
        }

        return new Promise((resolve, reject) => {
            this.db!.close((err) => {
                if (err) {
                    reject(new Error(`Failed to close database: ${err.message}`));
                } else {
                    this.db = null;
                    resolve();
                }
            });
        });
    }

    private formatDate(date: Date): string {
        return date.toISOString().split('T')[0]; // YYYY-MM-DD
    }

    private escapeCsvField(field: string): string {
        if (field.includes(',') || field.includes('"') || field.includes('\n')) {
            return `"${field.replace(/"/g, '""')}"`;
        }
        return field;
    }
}