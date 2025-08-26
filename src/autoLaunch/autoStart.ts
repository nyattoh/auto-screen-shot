import AutoLaunch from 'auto-launch';
import { app } from 'electron';

export class AutoStartManager {
    private autoLauncher: AutoLaunch | null = null;

    private getLauncher(): AutoLaunch {
        if (this.autoLauncher) return this.autoLauncher;

        // app.getPath('exe') は ready 前に呼ぶと環境により例外になることがあるため安全に取得
        let exePath: string;
        try {
            exePath = app.getPath('exe');
        } catch {
            // フォールバック（Electron 実行中は process.execPath でも可）
            exePath = process.execPath;
        }

        this.autoLauncher = new AutoLaunch({
            name: 'AutoScreenCapture',
            path: exePath,
            isHidden: true
        });
        return this.autoLauncher;
    }

    public async enableAutoStart(): Promise<void> {
        try {
            const isEnabled = await this.getLauncher().isEnabled();
            if (!isEnabled) {
                await this.getLauncher().enable();
                console.log('自動起動が有効になりました');
            }
        } catch (error) {
            console.error('自動起動の有効化に失敗しました:', error);
        }
    }

    public async disableAutoStart(): Promise<void> {
        try {
            const isEnabled = await this.getLauncher().isEnabled();
            if (isEnabled) {
                await this.getLauncher().disable();
                console.log('自動起動が無効になりました');
            }
        } catch (error) {
            console.error('自動起動の無効化に失敗しました:', error);
        }
    }

    public async isEnabled(): Promise<boolean> {
        try {
            return await this.getLauncher().isEnabled();
        } catch (error) {
            console.error('自動起動状態の確認に失敗しました:', error);
            return false;
        }
    }

    public async toggleAutoStart(enable: boolean): Promise<void> {
        if (enable) {
            await this.enableAutoStart();
        } else {
            await this.disableAutoStart();
        }
    }
}

export default AutoStartManager;
