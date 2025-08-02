import { logger } from '../utils/logger';
import { ProcessManager } from './ProcessManager';
import { WindowsIntegration } from './WindowsIntegration';

/**
 * シャットダウン理由
 */
export enum ShutdownReason {
    SIGNAL = 'signal',                    // シグナル受信
    ERROR = 'error',                      // エラー発生
    MANUAL = 'manual',                    // 手動終了
    SYSTEM_SHUTDOWN = 'system_shutdown',  // システムシャットダウン
    CRASH = 'crash'                       // クラッシュ
}

/**
 * シャットダウン管理インターフェース
 */
export interface IShutdownManager {
    initialize(): void;                                           // 初期化
    shutdown(reason: ShutdownReason, signal?: string): Promise<void>; // シャットダウン実行
    setupSignalHandlers(): void;                                  // シグナルハンドラー設定
    setupCrashRecovery(): void;                                   // クラッシュ回復設定
}

/**
 * シャットダウン管理クラス
 */
export class ShutdownManager implements IShutdownManager {
    private processManager: ProcessManager;
    private windowsIntegration: WindowsIntegration;
    private isShuttingDown: boolean = false;
    private shutdownCallbacks: Array<() => Promise<void>> = [];
    private maxShutdownTime: number = 10000; // 10秒

    constructor(processManager: ProcessManager, windowsIntegration: WindowsIntegration) {
        this.processManager = processManager;
        this.windowsIntegration = windowsIntegration;
    }

    /**
     * 初期化
     */
    initialize(): void {
        try {
            logger.info('ShutdownManager初期化開始');

            this.setupSignalHandlers();
            this.setupCrashRecovery();

            logger.info('ShutdownManager初期化完了');

        } catch (error) {
            logger.error('ShutdownManager初期化エラー', error);
            throw error;
        }
    }

    /**
     * シグナルハンドラーを設定
     */
    setupSignalHandlers(): void {
        try {
            logger.info('シグナルハンドラー設定開始');

            // 標準的なシグナル
            process.on('SIGINT', () => this.handleSignal('SIGINT'));
            process.on('SIGTERM', () => this.handleSignal('SIGTERM'));
            process.on('SIGHUP', () => this.handleSignal('SIGHUP'));

            // Windows固有のシグナル
            if (process.platform === 'win32') {
                process.on('SIGBREAK', () => this.handleSignal('SIGBREAK'));
                
                // Windows固有のイベント
                process.on('beforeExit', () => this.handleSignal('beforeExit'));
                process.on('exit', () => this.handleSignal('exit'));
            }

            logger.info('シグナルハンドラー設定完了');

        } catch (error) {
            logger.error('シグナルハンドラー設定エラー', error);
        }
    }

    /**
     * クラッシュ回復設定
     */
    setupCrashRecovery(): void {
        try {
            logger.info('クラッシュ回復設定開始');

            // 未処理の例外
            process.on('uncaughtException', async (error) => {
                logger.error('未処理の例外が発生しました', error);
                await this.handleCrash('uncaughtException', error);
            });

            // 未処理のPromise拒否
            process.on('unhandledRejection', async (reason, promise) => {
                logger.error('未処理のPromise拒否が発生しました', { reason, promise });
                await this.handleCrash('unhandledRejection', reason);
            });

            // メモリ不足警告
            process.on('warning', (warning) => {
                logger.warn('プロセス警告', {
                    name: warning.name,
                    message: warning.message,
                    stack: warning.stack
                });

                // メモリ関連の警告の場合は特別な処理
                if (warning.name === 'MaxListenersExceededWarning' || 
                    warning.message.includes('memory')) {
                    logger.warn('メモリ関連の警告が発生しました。システムの監視を強化します。');
                }
            });

            logger.info('クラッシュ回復設定完了');

        } catch (error) {
            logger.error('クラッシュ回復設定エラー', error);
        }
    }

    /**
     * シグナルを処理
     */
    private async handleSignal(signal: string): Promise<void> {
        try {
            logger.info(`シグナルを受信しました: ${signal}`);

            // 既にシャットダウン中の場合は重複処理を避ける
            if (this.isShuttingDown) {
                logger.warn('既にシャットダウン処理中です');
                return;
            }

            await this.shutdown(ShutdownReason.SIGNAL, signal);

        } catch (error) {
            logger.error('シグナル処理エラー', error);
            process.exit(1);
        }
    }

    /**
     * クラッシュを処理
     */
    private async handleCrash(type: string, error: any): Promise<void> {
        try {
            logger.error(`クラッシュが発生しました: ${type}`, error);

            // クラッシュ情報をログに記録
            const crashInfo = {
                type,
                error: error.toString(),
                stack: error.stack,
                timestamp: new Date().toISOString(),
                pid: process.pid,
                memoryUsage: process.memoryUsage(),
                uptime: process.uptime()
            };

            logger.error('クラッシュ詳細情報', crashInfo);

            // 自動再起動を試行
            await this.attemptAutoRestart(crashInfo);

        } catch (restartError) {
            logger.error('自動再起動に失敗しました', restartError);
            await this.shutdown(ShutdownReason.CRASH);
        }
    }

    /**
     * 自動再起動を試行
     */
    private async attemptAutoRestart(crashInfo: any): Promise<void> {
        try {
            logger.info('自動再起動を試行します');

            // 再起動の条件をチェック
            if (!this.shouldAttemptRestart(crashInfo)) {
                logger.warn('再起動条件を満たしていません。通常のシャットダウンを実行します。');
                await this.shutdown(ShutdownReason.CRASH);
                return;
            }

            // 現在のプロセスをクリーンアップ
            await this.cleanupForRestart();

            // 新しいプロセスを起動
            const restartCommand = process.argv[0]; // node
            const restartArgs = process.argv.slice(1); // スクリプトと引数

            logger.info('新しいプロセスを起動します', {
                command: restartCommand,
                args: restartArgs
            });

            const newProcess = this.windowsIntegration.detachProcess(restartCommand, restartArgs);

            if (newProcess.pid) {
                logger.info('新しいプロセスが正常に起動しました', { newPid: newProcess.pid });
                
                // 少し待ってから現在のプロセスを終了
                setTimeout(() => {
                    logger.info('自動再起動完了。現在のプロセスを終了します。');
                    process.exit(0);
                }, 2000);
            } else {
                throw new Error('新しいプロセスの起動に失敗しました');
            }

        } catch (error) {
            logger.error('自動再起動エラー', error);
            throw error;
        }
    }

    /**
     * 再起動すべきかどうかを判定
     */
    private shouldAttemptRestart(crashInfo: any): boolean {
        try {
            // 起動から一定時間以内のクラッシュは再起動しない（起動ループを防ぐ）
            const minUptimeForRestart = 60; // 60秒
            if (process.uptime() < minUptimeForRestart) {
                logger.warn('起動直後のクラッシュのため再起動をスキップします', {
                    uptime: process.uptime(),
                    minUptime: minUptimeForRestart
                });
                return false;
            }

            // メモリ不足の場合は再起動しない
            const memoryUsage = process.memoryUsage();
            const maxMemoryMB = 500; // 500MB
            if (memoryUsage.heapUsed > maxMemoryMB * 1024 * 1024) {
                logger.warn('メモリ使用量が多すぎるため再起動をスキップします', {
                    heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024),
                    maxMemoryMB
                });
                return false;
            }

            // 開発モードでは再起動しない
            if (process.env.STARTUP_MODE === 'development') {
                logger.info('開発モードのため再起動をスキップします');
                return false;
            }

            return true;

        } catch (error) {
            logger.error('再起動判定エラー', error);
            return false;
        }
    }

    /**
     * 再起動用のクリーンアップ
     */
    private async cleanupForRestart(): Promise<void> {
        try {
            logger.info('再起動用クリーンアップ開始');

            // PIDファイルは削除しない（新しいプロセスが上書きする）
            // その他のリソースのクリーンアップのみ実行

            // シャットダウンコールバックを実行（PIDファイル削除以外）
            for (const callback of this.shutdownCallbacks) {
                try {
                    await callback();
                } catch (error) {
                    logger.warn('シャットダウンコールバックエラー', error);
                }
            }

            logger.info('再起動用クリーンアップ完了');

        } catch (error) {
            logger.error('再起動用クリーンアップエラー', error);
        }
    }

    /**
     * シャットダウンを実行
     */
    async shutdown(reason: ShutdownReason, signal?: string): Promise<void> {
        try {
            if (this.isShuttingDown) {
                logger.warn('既にシャットダウン処理中です');
                return;
            }

            this.isShuttingDown = true;
            logger.info('シャットダウン開始', { reason, signal });

            // タイムアウト設定
            const shutdownTimeout = setTimeout(() => {
                logger.error('シャットダウンタイムアウト。強制終了します。');
                process.exit(1);
            }, this.maxShutdownTime);

            try {
                // シャットダウンコールバックを実行
                logger.info('シャットダウンコールバック実行開始');
                for (const callback of this.shutdownCallbacks) {
                    try {
                        await callback();
                    } catch (error) {
                        logger.warn('シャットダウンコールバックエラー', error);
                    }
                }

                // PIDファイルを削除
                await this.processManager.removePidFile();

                logger.info('シャットダウン完了', { reason, signal });

            } finally {
                clearTimeout(shutdownTimeout);
            }

            // 終了コードを設定
            const exitCode = this.getExitCode(reason);
            logger.info('プロセスを終了します', { exitCode, reason });
            
            process.exit(exitCode);

        } catch (error) {
            logger.error('シャットダウンエラー', error);
            process.exit(1);
        }
    }

    /**
     * 終了コードを取得
     */
    private getExitCode(reason: ShutdownReason): number {
        switch (reason) {
            case ShutdownReason.SIGNAL:
            case ShutdownReason.MANUAL:
                return 0; // 正常終了
            case ShutdownReason.ERROR:
            case ShutdownReason.CRASH:
                return 1; // エラー終了
            case ShutdownReason.SYSTEM_SHUTDOWN:
                return 0; // システムシャットダウンは正常終了扱い
            default:
                return 1;
        }
    }

    /**
     * シャットダウンコールバックを追加
     */
    addShutdownCallback(callback: () => Promise<void>): void {
        this.shutdownCallbacks.push(callback);
        logger.debug('シャットダウンコールバックを追加しました', {
            callbackCount: this.shutdownCallbacks.length
        });
    }

    /**
     * 手動シャットダウンを実行
     */
    async manualShutdown(): Promise<void> {
        await this.shutdown(ShutdownReason.MANUAL);
    }

    /**
     * シャットダウン中かどうかを確認
     */
    isShuttingDownNow(): boolean {
        return this.isShuttingDown;
    }

    /**
     * シャットダウンタイムアウトを設定
     */
    setShutdownTimeout(timeoutMs: number): void {
        this.maxShutdownTime = timeoutMs;
        logger.info('シャットダウンタイムアウトを設定しました', { timeoutMs });
    }
}