import { UsageDatabase, DailyUsage, DetailedSession, DateUsageSummary } from '../usage/UsageDatabase';
import { logger } from '../utils/logger';
import Settings from '../config/settings';

export interface StatisticsConfig {
    dataRetentionDays: number;
    cleanupIntervalHours: number;
    enableImageOptimization: boolean;
    webpQuality: number;
}

export class StatisticsManager {
    private usageDatabase: UsageDatabase;
    private settings: Settings;
    private config: StatisticsConfig;
    private cleanupTimer: NodeJS.Timeout | null = null;

    constructor(usageDatabase: UsageDatabase, settings: Settings) {
        this.usageDatabase = usageDatabase;
        this.settings = settings;
        
        // デフォルト設定
        this.config = {
            dataRetentionDays: 90, // 90日間データを保持
            cleanupIntervalHours: 24, // 24時間ごとにクリーンアップ
            enableImageOptimization: true,
            webpQuality: 80
        };
        
        this.loadConfig();
        this.scheduleCleanup();
    }

    /**
     * 設定を読み込み
     */
    private loadConfig(): void {
        try {
            const savedConfig = this.settings.getStatisticsConfig();
            if (savedConfig) {
                this.config = { ...this.config, ...savedConfig };
            }
            logger.info('統計管理設定を読み込みました', this.config);
        } catch (error) {
            logger.warn('統計管理設定の読み込みに失敗しました。デフォルト設定を使用します', error);
        }
    }

    /**
     * 設定を保存
     */
    public updateConfig(newConfig: Partial<StatisticsConfig>): void {
        this.config = { ...this.config, ...newConfig };
        this.settings.setStatisticsConfig(this.config);
        logger.info('統計管理設定を更新しました', this.config);
        
        // クリーンアップスケジュールを再設定
        this.scheduleCleanup();
    }

    /**
     * 定期クリーンアップをスケジュール
     */
    private scheduleCleanup(): void {
        // 既存のタイマーをクリア
        if (this.cleanupTimer) {
            clearInterval(this.cleanupTimer);
        }

        // 新しいタイマーを設定
        const intervalMs = this.config.cleanupIntervalHours * 60 * 60 * 1000;
        this.cleanupTimer = setInterval(() => {
            this.performMaintenance().catch(error => {
                logger.error('定期メンテナンスでエラーが発生しました', error);
            });
        }, intervalMs);

        logger.info(`定期クリーンアップを${this.config.cleanupIntervalHours}時間間隔でスケジュールしました`);
    }

    /**
     * メンテナンス処理（古いデータの削除）
     */
    public async performMaintenance(): Promise<void> {
        try {
            logger.info('統計データのメンテナンスを開始します');
            
            // 古いデータを削除
            await this.usageDatabase.cleanup(this.config.dataRetentionDays);
            
            logger.info(`${this.config.dataRetentionDays}日より古いデータを削除しました`);
        } catch (error) {
            logger.error('統計データのメンテナンスに失敗しました', error);
            throw error;
        }
    }

    /**
     * 日別使用統計を取得
     */
    public async getDailyUsage(date: Date): Promise<DailyUsage[]> {
        try {
            return await this.usageDatabase.getDailyUsage(date);
        } catch (error) {
            logger.error('日別使用統計の取得に失敗しました', error);
            return [];
        }
    }

    /**
     * 詳細セッション情報を取得
     */
    public async getDetailedSessions(date: Date): Promise<DetailedSession[]> {
        try {
            return await this.usageDatabase.getDetailedSessions(date);
        } catch (error) {
            logger.error('詳細セッション情報の取得に失敗しました', error);
            return [];
        }
    }

    /**
     * アプリケーション別セッション情報を取得
     */
    public async getApplicationSessions(date: Date, application: string): Promise<DetailedSession[]> {
        try {
            return await this.usageDatabase.getApplicationSessions(date, application);
        } catch (error) {
            logger.error('アプリケーション別セッション情報の取得に失敗しました', error);
            return [];
        }
    }

    /**
     * 利用可能な日付一覧を取得
     */
    public async getAvailableDates(): Promise<string[]> {
        try {
            return await this.usageDatabase.getAvailableDates();
        } catch (error) {
            logger.error('利用可能な日付一覧の取得に失敗しました', error);
            return [];
        }
    }

    /**
     * 日付サマリーを取得
     */
    public async getDateUsageSummary(date: Date): Promise<DateUsageSummary | null> {
        try {
            return await this.usageDatabase.getDateUsageSummary(date);
        } catch (error) {
            logger.error('日付サマリーの取得に失敗しました', error);
            return null;
        }
    }

    /**
     * 統計データをCSV形式でエクスポート
     */
    public async exportToCSV(startDate: Date, endDate: Date): Promise<string> {
        try {
            return await this.usageDatabase.exportToCSV(startDate, endDate);
        } catch (error) {
            logger.error('CSV エクスポートに失敗しました', error);
            throw error;
        }
    }

    /**
     * 統計情報の健全性チェック
     */
    public async performHealthCheck(): Promise<{ healthy: boolean; issues: string[] }> {
        const issues: string[] = [];
        
        try {
            // データベース接続チェック
            const availableDates = await this.usageDatabase.getAvailableDates();
            
            // データが古すぎないかチェック
            if (availableDates.length > 0) {
                const latestDate = new Date(availableDates[0]);
                const daysSinceLatest = Math.floor((Date.now() - latestDate.getTime()) / (1000 * 60 * 60 * 24));
                
                if (daysSinceLatest > 7) {
                    issues.push(`最新データが${daysSinceLatest}日前と古すぎます`);
                }
            } else {
                issues.push('統計データが存在しません');
            }
            
            // 保持期間設定チェック
            if (this.config.dataRetentionDays < 7) {
                issues.push('データ保持期間が短すぎます（推奨: 最低7日）');
            }
            
            return {
                healthy: issues.length === 0,
                issues
            };
            
        } catch (error) {
            logger.error('統計情報の健全性チェックに失敗しました', error);
            return {
                healthy: false,
                issues: [`健全性チェック実行エラー: ${error.message}`]
            };
        }
    }

    /**
     * 現在の設定を取得
     */
    public getConfig(): StatisticsConfig {
        return { ...this.config };
    }

    /**
     * 統計マネージャーを停止
     */
    public stop(): void {
        if (this.cleanupTimer) {
            clearInterval(this.cleanupTimer);
            this.cleanupTimer = null;
        }
        logger.info('統計マネージャーを停止しました');
    }

    /**
     * 手動でクリーンアップを実行
     */
    public async manualCleanup(): Promise<{ deletedRecords: number }> {
        try {
            logger.info('手動クリーンアップを開始します');
            
            // 削除前のレコード数を取得（概算）
            const beforeDates = await this.usageDatabase.getAvailableDates();
            
            await this.usageDatabase.cleanup(this.config.dataRetentionDays);
            
            // 削除後のレコード数を取得
            const afterDates = await this.usageDatabase.getAvailableDates();
            
            const deletedRecords = Math.max(0, beforeDates.length - afterDates.length);
            
            logger.info(`手動クリーンアップ完了: ${deletedRecords}日分のデータを削除`);
            
            return { deletedRecords };
            
        } catch (error) {
            logger.error('手動クリーンアップに失敗しました', error);
            throw error;
        }
    }
}