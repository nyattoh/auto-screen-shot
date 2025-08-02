import { exec } from 'child_process';
import * as fs from 'fs-extra';
import * as path from 'path';
import { ScreenshotData } from '../types';
import { logger } from '../utils/logger';

export class ScreenshotManager {
    private isCapturing: boolean = false;
    private captureTimer: NodeJS.Timeout | null = null;
    private screenshotHistory: ScreenshotData[] = [];

    constructor() {}

    public async captureScreenshot(savePath: string): Promise<string> {
        try {
            logger.debug(`スクリーンショット撮影開始: ${savePath}`);
            
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const fileName = `screenshot-${timestamp}.png`;
            const fullPath = path.join(savePath, fileName);

            // 保存ディレクトリが存在しない場合は作成
            await fs.ensureDir(savePath);
            logger.debug(`保存ディレクトリ確認完了: ${savePath}`);

            return new Promise((resolve, reject) => {
                // Windows用のスクリーンショット撮影コマンド
                const command = process.platform === 'win32' 
                    ? `powershell -ExecutionPolicy Bypass -Command "$OutputEncoding=[System.Text.Encoding]::UTF8; & '${path.join(__dirname, '../../capture_screenshot.ps1')}' -OutputPath '${fullPath}'"`
                    : `screencapture -x "${fullPath}"`;

                logger.debug(`実行コマンド: ${command.substring(0, 100)}...`);

                exec(command, { timeout: 30000, encoding: 'utf8' }, async (error, stdout, stderr) => {
                    if (error) {
                        const errorMsg = `スクリーンショット撮影エラー: ${error.message}`;
                        logger.error(errorMsg, error);
                        reject(errorMsg);
                    } else {
                        try {
                            // PowerShellの出力をパース
                            let windowTitle = 'Unknown';
                            let processName = 'Unknown';
                            
                            if (stdout) {
                                try {
                                    const result = JSON.parse(stdout.trim());
                                    if (result.Success) {
                                        windowTitle = result.WindowTitle || 'Unknown';
                                        processName = result.ProcessName || 'Unknown';
                                        logger.debug(`アクティブウィンドウ情報: ${processName} - ${windowTitle}`);
                                    }
                                } catch (parseError) {
                                    logger.warn(`PowerShell出力のパースに失敗: ${parseError.message}`);
                                }
                            }
                            
                            // ファイルが実際に作成されたか確認
                            const fileExists = await fs.pathExists(fullPath);
                            if (!fileExists) {
                                const errorMsg = `スクリーンショットファイルが作成されませんでした: ${fullPath}`;
                                logger.error(errorMsg);
                                reject(errorMsg);
                                return;
                            }

                            // ファイルサイズを確認
                            const stats = await fs.stat(fullPath);
                            if (stats.size === 0) {
                                const errorMsg = `スクリーンショットファイルが空です: ${fullPath}`;
                                logger.error(errorMsg);
                                reject(errorMsg);
                                return;
                            }

                            const screenshotData: ScreenshotData = {
                                filePath: fullPath,
                                timestamp: new Date(),
                                activeWindow: processName !== 'Unknown' ? `${processName} - ${windowTitle}` : windowTitle
                            };
                            this.screenshotHistory.push(screenshotData);
                            
                            logger.info(`スクリーンショット撮影完了: ${fullPath} (${stats.size} bytes) - Active: ${screenshotData.activeWindow}`);
                            resolve(fullPath);
                        } catch (checkError) {
                            const errorMsg = `スクリーンショット検証エラー: ${checkError.message}`;
                            logger.error(errorMsg, checkError);
                            reject(errorMsg);
                        }
                    }
                });
            });
        } catch (error) {
            const errorMsg = `スクリーンショット撮影準備エラー: ${error.message}`;
            logger.error(errorMsg, error);
            throw new Error(errorMsg);
        }
    }


    public startPeriodicCapture(interval: number, savePath: string): void {
        if (this.isCapturing) {
            logger.warn('既に撮影中のため、現在の撮影を停止してから再開します');
            this.stopCapture();
        }

        this.isCapturing = true;
        logger.info(`スクリーンショット自動撮影開始 - 間隔: ${interval / 1000}秒, 保存先: ${savePath}`);

        const captureLoop = async () => {
            if (!this.isCapturing) {
                logger.debug('撮影ループを停止しました');
                return;
            }

            try {
                await this.captureScreenshot(savePath);
            } catch (error) {
                logger.error('スクリーンショット撮影に失敗', error);
                
                // 連続エラーの場合は撮影を停止
                if (this.screenshotHistory.length === 0 || 
                    (new Date().getTime() - this.screenshotHistory[this.screenshotHistory.length - 1].timestamp.getTime()) > interval * 3) {
                    logger.error('連続してエラーが発生したため、自動撮影を停止します');
                    this.stopCapture();
                    return;
                }
            }

            if (this.isCapturing) {
                this.captureTimer = setTimeout(captureLoop, interval);
            }
        };

        captureLoop();
    }

    public stopCapture(): void {
        this.isCapturing = false;
        if (this.captureTimer) {
            clearTimeout(this.captureTimer);
            this.captureTimer = null;
        }
        logger.info('スクリーンショット自動撮影停止');
    }

    public getScreenshotHistory(): ScreenshotData[] {
        return this.screenshotHistory;
    }

    public isCurrentlyCapturing(): boolean {
        return this.isCapturing;
    }

    public getLastScreenshot(): ScreenshotData | null {
        return this.screenshotHistory.length > 0 
            ? this.screenshotHistory[this.screenshotHistory.length - 1] 
            : null;
    }
}

export default ScreenshotManager;