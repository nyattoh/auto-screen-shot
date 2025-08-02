import AutoLaunch from 'auto-launch';
import { app } from 'electron';

export class AutoStartManager {
    private autoLauncher: AutoLaunch;

    constructor() {
        this.autoLauncher = new AutoLaunch({
            name: 'AutoScreenCapture',
            path: app.getPath('exe'),
            isHidden: true
        });
    }

    public async enableAutoStart(): Promise<void> {
        try {
            const isEnabled = await this.autoLauncher.isEnabled();
            if (!isEnabled) {
                await this.autoLauncher.enable();
                console.log('自動起動が有効になりました');
            }
        } catch (error) {
            console.error('自動起動の有効化に失敗しました:', error);
        }
    }

    public async disableAutoStart(): Promise<void> {
        try {
            const isEnabled = await this.autoLauncher.isEnabled();
            if (isEnabled) {
                await this.autoLauncher.disable();
                console.log('自動起動が無効になりました');
            }
        } catch (error) {
            console.error('自動起動の無効化に失敗しました:', error);
        }
    }

    public async isEnabled(): Promise<boolean> {
        try {
            return await this.autoLauncher.isEnabled();
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