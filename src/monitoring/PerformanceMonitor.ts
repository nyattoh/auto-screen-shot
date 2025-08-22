import { logger } from '../utils/logger';

export interface PerformanceMetrics {
    memoryUsage: NodeJS.MemoryUsage;
    cpuUsage: NodeJS.CpuUsage;
    uptime: number;
    timestamp: Date;
    heapUsedMB: number;
    heapTotalMB: number;
    externalMB: number;
    rssMemoryMB: number;
}

export interface PerformanceThresholds {
    maxHeapUsedMB: number;
    maxRSSMemoryMB: number;
    gcIntervalMs: number;
    alertThresholdMB: number;
}

export class PerformanceMonitor {
    private monitoringInterval: NodeJS.Timeout | null = null;
    private thresholds: PerformanceThresholds;
    private isMonitoring = false;
    private lastMetrics: PerformanceMetrics | null = null;
    private gcTimer: NodeJS.Timeout | null = null;
    private alertCallback: ((metrics: PerformanceMetrics) => void) | null = null;

    constructor(thresholds?: Partial<PerformanceThresholds>) {
        this.thresholds = {
            maxHeapUsedMB: 500, // 500MB
            maxRSSMemoryMB: 1000, // 1GB
            gcIntervalMs: 300000, // 5分間隔
            alertThresholdMB: 300, // 300MB
            ...thresholds
        };
    }

    /**
     * パフォーマンス監視を開始
     */
    public startMonitoring(intervalMs = 30000): void { // 30秒間隔
        if (this.isMonitoring) {
            logger.warn('パフォーマンス監視は既に開始されています');
            return;
        }

        this.isMonitoring = true;
        logger.info('パフォーマンス監視を開始します', {
            intervalMs,
            thresholds: this.thresholds
        });

        // 初回メトリクス取得
        this.collectMetrics();

        // 定期監視を開始
        this.monitoringInterval = setInterval(() => {
            this.collectMetrics();
        }, intervalMs);

        // 定期的なガベージコレクション
        this.schedulePeriodicGC();
    }

    /**
     * パフォーマンス監視を停止
     */
    public stopMonitoring(): void {
        if (!this.isMonitoring) {
            return;
        }

        this.isMonitoring = false;
        
        if (this.monitoringInterval) {
            clearInterval(this.monitoringInterval);
            this.monitoringInterval = null;
        }

        if (this.gcTimer) {
            clearTimeout(this.gcTimer);
            this.gcTimer = null;
        }

        logger.info('パフォーマンス監視を停止しました');
    }

    /**
     * メトリクスを収集
     */
    private collectMetrics(): void {
        try {
            const memoryUsage = process.memoryUsage();
            const cpuUsage = process.cpuUsage();
            const uptime = process.uptime();

            const metrics: PerformanceMetrics = {
                memoryUsage,
                cpuUsage,
                uptime,
                timestamp: new Date(),
                heapUsedMB: Math.round(memoryUsage.heapUsed / 1024 / 1024),
                heapTotalMB: Math.round(memoryUsage.heapTotal / 1024 / 1024),
                externalMB: Math.round(memoryUsage.external / 1024 / 1024),
                rssMemoryMB: Math.round(memoryUsage.rss / 1024 / 1024)
            };

            this.lastMetrics = metrics;

            // 閾値チェック
            this.checkThresholds(metrics);

            // 詳細ログ（DEBUG レベル）
            logger.debug('パフォーマンスメトリクス', {
                heapUsed: `${metrics.heapUsedMB}MB`,
                heapTotal: `${metrics.heapTotalMB}MB`,
                rss: `${metrics.rssMemoryMB}MB`,
                external: `${metrics.externalMB}MB`,
                uptime: `${Math.floor(uptime / 60)}分`
            });

        } catch (error) {
            logger.error('メトリクス収集エラー', error);
        }
    }

    /**
     * パフォーマンス閾値チェック
     */
    private checkThresholds(metrics: PerformanceMetrics): void {
        const warnings: string[] = [];

        // ヒープ使用量チェック
        if (metrics.heapUsedMB > this.thresholds.maxHeapUsedMB) {
            warnings.push(`ヒープ使用量が閾値を超えています: ${metrics.heapUsedMB}MB > ${this.thresholds.maxHeapUsedMB}MB`);
        }

        // RSS メモリチェック
        if (metrics.rssMemoryMB > this.thresholds.maxRSSMemoryMB) {
            warnings.push(`RSS メモリ使用量が閾値を超えています: ${metrics.rssMemoryMB}MB > ${this.thresholds.maxRSSMemoryMB}MB`);
        }

        // アラート閾値チェック
        if (metrics.heapUsedMB > this.thresholds.alertThresholdMB) {
            if (this.alertCallback) {
                this.alertCallback(metrics);
            }
            
            // 自動ガベージコレクション実行
            this.forceGarbageCollection();
        }

        // 警告がある場合はログ出力
        if (warnings.length > 0) {
            logger.warn('パフォーマンス閾値警告', {
                warnings,
                metrics: {
                    heapUsed: `${metrics.heapUsedMB}MB`,
                    rss: `${metrics.rssMemoryMB}MB`,
                    uptime: `${Math.floor(metrics.uptime / 60)}分`
                }
            });
        }
    }

    /**
     * 定期的なガベージコレクションをスケジュール
     */
    private schedulePeriodicGC(): void {
        if (this.gcTimer) {
            clearTimeout(this.gcTimer);
        }

        this.gcTimer = setTimeout(() => {
            this.forceGarbageCollection();
            
            // 次回のガベージコレクションをスケジュール
            if (this.isMonitoring) {
                this.schedulePeriodicGC();
            }
        }, this.thresholds.gcIntervalMs);
    }

    /**
     * 強制ガベージコレクション実行
     */
    private forceGarbageCollection(): void {
        try {
            if (global.gc) {
                const beforeMemory = process.memoryUsage();
                global.gc();
                const afterMemory = process.memoryUsage();
                
                const freedMB = Math.round((beforeMemory.heapUsed - afterMemory.heapUsed) / 1024 / 1024);
                
                logger.info('ガベージコレクションを実行しました', {
                    freedMemory: `${freedMB}MB`,
                    before: `${Math.round(beforeMemory.heapUsed / 1024 / 1024)}MB`,
                    after: `${Math.round(afterMemory.heapUsed / 1024 / 1024)}MB`
                });
            } else {
                logger.debug('global.gc が利用できません（--expose-gc フラグが必要）');
            }
        } catch (error) {
            logger.warn('ガベージコレクション実行エラー', error);
        }
    }

    /**
     * 現在のメトリクスを取得
     */
    public getCurrentMetrics(): PerformanceMetrics | null {
        return this.lastMetrics;
    }

    /**
     * メモリ使用量を最適化
     */
    public optimizeMemoryUsage(): void {
        try {
            logger.info('メモリ使用量最適化を開始します');

            // 強制ガベージコレクション
            this.forceGarbageCollection();

            // Node.js V8 ヒント（可能であれば）
            if (process.memoryUsage && global.gc) {
                // ヒープの最適化を促進
                process.nextTick(() => {
                    if (global.gc) {
                        global.gc();
                    }
                });
            }

            logger.info('メモリ使用量最適化が完了しました');
        } catch (error) {
            logger.error('メモリ最適化エラー', error);
        }
    }

    /**
     * パフォーマンス統計を取得
     */
    public getPerformanceStats(): { isHealthy: boolean; stats: any } {
        if (!this.lastMetrics) {
            return {
                isHealthy: false,
                stats: { message: 'メトリクスが収集されていません' }
            };
        }

        const metrics = this.lastMetrics;
        const isHealthy = 
            metrics.heapUsedMB < this.thresholds.maxHeapUsedMB &&
            metrics.rssMemoryMB < this.thresholds.maxRSSMemoryMB;

        return {
            isHealthy,
            stats: {
                memoryUsage: {
                    heapUsed: `${metrics.heapUsedMB}MB`,
                    heapTotal: `${metrics.heapTotalMB}MB`,
                    rss: `${metrics.rssMemoryMB}MB`,
                    external: `${metrics.externalMB}MB`
                },
                uptime: `${Math.floor(metrics.uptime / 60)}分`,
                thresholds: this.thresholds,
                monitoring: this.isMonitoring
            }
        };
    }

    /**
     * アラートコールバックを設定
     */
    public setAlertCallback(callback: (metrics: PerformanceMetrics) => void): void {
        this.alertCallback = callback;
    }

    /**
     * 閾値を更新
     */
    public updateThresholds(thresholds: Partial<PerformanceThresholds>): void {
        this.thresholds = { ...this.thresholds, ...thresholds };
        logger.info('パフォーマンス閾値を更新しました', this.thresholds);
    }
}