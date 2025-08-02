import * as fs from 'fs-extra';
import * as path from 'path';
import * as os from 'os';
import { logger } from '../utils/logger';

/**
 * プロセス情報インターフェース
 */
export interface ProcessInfo {
    pid: number;                 // プロセスID
    startTime: Date;             // 開始時刻
    mode: string;                // 起動モード
    parentPid?: number;          // 親プロセスID（オプション）
}

/**
 * プロセス管理インターフェース
 */
export interface IProcessManager {
    detachFromParent(): void;                          // 親プロセスから分離
    createPidFile(): Promise<void>;                    // PIDファイル作成
    removePidFile(): Promise<void>;                    // PIDファイル削除
    isAlreadyRunning(): Promise<boolean>;              // 実行中チェック
    killExistingProcess(): Promise<void>;              // 既存プロセス終了
}

/**
 * プロセス管理クラス
 */
export class ProcessManager implements IProcessManager {
    private pidFilePath: string;
    private currentProcessInfo: ProcessInfo;

    constructor(pidFilePath?: string) {
        this.pidFilePath = pidFilePath || this.getDefaultPidFilePath();
        this.currentProcessInfo = {
            pid: process.pid,
            startTime: new Date(),
            mode: 'unknown',
            parentPid: process.ppid
        };
    }

    /**
     * デフォルトPIDファイルパスを取得
     */
    private getDefaultPidFilePath(): string {
        return path.join(os.tmpdir(), 'win-screenshot-app.pid');
    }

    /**
     * 親プロセスから分離
     */
    detachFromParent(): void {
        try {
            logger.info('親プロセスからの分離を開始');

            // プロセスを新しいセッションリーダーにする
            if (process.platform === 'win32') {
                // Windowsでは直接的なdetachは制限されているため、
                // 代わりにstdioの分離を行う
                if (process.stdin) {
                    process.stdin.pause();
                }
                
                // 親プロセスとの関連を切断
                process.stdout.write = () => true;
                process.stderr.write = () => true;
            }

            logger.info('親プロセスからの分離完了', {
                pid: process.pid,
                ppid: process.ppid
            });

        } catch (error) {
            logger.error('親プロセス分離エラー', error);
            throw error;
        }
    }

    /**
     * PIDファイルを作成
     */
    async createPidFile(): Promise<void> {
        try {
            logger.info('PIDファイル作成開始', { pidFilePath: this.pidFilePath });

            // 既存のPIDファイルを直接チェック（無限ループ回避のため）
            if (await fs.pathExists(this.pidFilePath)) {
                try {
                    const existingPid = await this.readPidFile();
                    if (existingPid && this.isProcessRunning(existingPid)) {
                        throw new Error(`アプリケーションは既に実行中です (PID: ${existingPid})`);
                    } else {
                        // 古いPIDファイルを削除
                        logger.info('古いPIDファイルを削除します');
                        await fs.remove(this.pidFilePath);
                    }
                } catch (readError) {
                    logger.warn('PIDファイル読み取りエラー、新しく作成します', readError);
                    await fs.remove(this.pidFilePath);
                }
            }

            // プロセス情報を更新
            this.currentProcessInfo = {
                pid: process.pid,
                startTime: new Date(),
                mode: process.env.STARTUP_MODE || 'background',
                parentPid: process.ppid
            };

            // PIDファイルに書き込み
            const pidData = {
                ...this.currentProcessInfo,
                startTime: this.currentProcessInfo.startTime.toISOString()
            };

            await fs.writeFile(this.pidFilePath, JSON.stringify(pidData, null, 2), 'utf8');

            logger.info('PIDファイル作成完了', {
                pidFilePath: this.pidFilePath,
                processInfo: this.currentProcessInfo
            });

            // プロセス終了時にPIDファイルを削除するハンドラーを設定
            this.setupCleanupHandlers();

        } catch (error) {
            logger.error('PIDファイル作成エラー', error);
            throw error;
        }
    }

    /**
     * PIDファイルを削除
     */
    async removePidFile(): Promise<void> {
        try {
            logger.info('PIDファイル削除開始', { pidFilePath: this.pidFilePath });

            if (await fs.pathExists(this.pidFilePath)) {
                await fs.remove(this.pidFilePath);
                logger.info('PIDファイル削除完了');
            } else {
                logger.warn('PIDファイルが存在しません');
            }

        } catch (error) {
            logger.error('PIDファイル削除エラー', error);
            throw error;
        }
    }

    /**
     * 既に実行中かチェック
     */
    async isAlreadyRunning(): Promise<boolean> {
        try {
            if (!(await fs.pathExists(this.pidFilePath))) {
                return false;
            }

            const existingPid = await this.readPidFile();
            if (!existingPid) {
                return false;
            }

            // プロセスが実際に実行中かチェック
            return this.isProcessRunning(existingPid);

        } catch (error) {
            logger.warn('実行中チェックエラー', error);
            return false;
        }
    }

    /**
     * PIDファイルを読み取り
     */
    private async readPidFile(): Promise<number | null> {
        try {
            const pidContent = await fs.readFile(this.pidFilePath, 'utf8');
            const pidData = JSON.parse(pidContent);
            return pidData.pid || null;
        } catch (error) {
            logger.warn('PIDファイル読み取りエラー', error);
            return null;
        }
    }

    /**
     * プロセスが実行中かチェック
     */
    private isProcessRunning(pid: number): boolean {
        try {
            // プロセスにシグナル0を送信してプロセスの存在を確認
            process.kill(pid, 0);
            return true;
        } catch (error) {
            // プロセスが存在しない場合はエラーが発生
            return false;
        }
    }

    /**
     * 既存プロセスを終了
     */
    async killExistingProcess(): Promise<void> {
        try {
            logger.info('既存プロセス終了開始');

            const existingPid = await this.readPidFile();
            if (!existingPid) {
                logger.warn('既存のPIDが見つかりません');
                return;
            }

            if (!this.isProcessRunning(existingPid)) {
                logger.info('既存プロセスは既に終了しています', { pid: existingPid });
                await this.removePidFile();
                return;
            }

            // プロセスを終了
            logger.info('既存プロセスを終了します', { pid: existingPid });
            process.kill(existingPid, 'SIGTERM');

            // 少し待ってから強制終了
            await new Promise(resolve => setTimeout(resolve, 3000));

            if (this.isProcessRunning(existingPid)) {
                logger.warn('プロセスが応答しないため強制終了します', { pid: existingPid });
                process.kill(existingPid, 'SIGKILL');
            }

            // PIDファイルを削除
            await this.removePidFile();

            logger.info('既存プロセス終了完了', { pid: existingPid });

        } catch (error) {
            logger.error('既存プロセス終了エラー', error);
            throw error;
        }
    }

    /**
     * クリーンアップハンドラーを設定
     */
    private setupCleanupHandlers(): void {
        const cleanup = async () => {
            try {
                await this.removePidFile();
            } catch (error) {
                logger.error('クリーンアップエラー', error);
            }
        };

        // 各種終了シグナルでクリーンアップを実行
        process.on('exit', cleanup);
        process.on('SIGINT', cleanup);
        process.on('SIGTERM', cleanup);
        process.on('SIGHUP', cleanup);

        // Windows固有のシグナル
        if (process.platform === 'win32') {
            process.on('SIGBREAK', cleanup);
        }

        // 未処理の例外でもクリーンアップ
        process.on('uncaughtException', async (error) => {
            logger.error('未処理の例外', error);
            await cleanup();
            process.exit(1);
        });

        process.on('unhandledRejection', async (reason) => {
            logger.error('未処理のPromise拒否', reason);
            await cleanup();
            process.exit(1);
        });
    }

    /**
     * 現在のプロセス情報を取得
     */
    getCurrentProcessInfo(): ProcessInfo {
        return { ...this.currentProcessInfo };
    }

    /**
     * PIDファイルパスを取得
     */
    getPidFilePath(): string {
        return this.pidFilePath;
    }
}