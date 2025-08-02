import { BrowserWindow, ipcMain, dialog, Menu } from 'electron';
import * as path from 'path';
import Settings from '../config/settings';

let settingsWindow: BrowserWindow | null = null;

export function createSettingsWindow(settings: Settings): void {
    if (settingsWindow) {
        settingsWindow.focus();
        return;
    }

    settingsWindow = new BrowserWindow({
        width: 600,
        height: 500,
        resizable: false,
        title: '自動スクリーンキャプチャ - 設定',
        autoHideMenuBar: true, // メニューバーを自動非表示
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
        },
    });

    // メニューバーを完全に削除
    settingsWindow.setMenu(null);

    settingsWindow.loadFile(path.join(__dirname, '../../assets/settings.html'));

    settingsWindow.on('closed', () => {
        settingsWindow = null;
    });

    // 設定データを送信
    settingsWindow.webContents.once('did-finish-load', () => {
        settingsWindow?.webContents.send('load-settings', {
            saveDirectory: settings.getSaveDirectory(),
            captureInterval: settings.getCaptureInterval(),
            autoStart: settings.getAutoStart()
        });
    });

    // IPCハンドラーの設定
    setupIpcHandlers(settings);
}

function setupIpcHandlers(settings: Settings): void {
    // フォルダ選択ダイアログ
    ipcMain.handle('select-folder', async () => {
        const result = await dialog.showOpenDialog(settingsWindow!, {
            properties: ['openDirectory'],
            title: 'スクリーンショット保存フォルダを選択'
        });
        
        return result.canceled ? null : result.filePaths[0];
    });

    // 設定保存
    ipcMain.handle('save-settings', async (event, newSettings) => {
        settings.setSaveDirectory(newSettings.saveDirectory);
        settings.setCaptureInterval(newSettings.captureInterval);
        settings.setAutoStart(newSettings.autoStart);
        
        // 直接 ipcMain で settings-updated イベントを発行
        ipcMain.emit('settings-updated', event, newSettings);
        
        return { success: true };
    });

    // 設定取得
    ipcMain.handle('get-settings', async () => {
        return {
            saveDirectory: settings.getSaveDirectory(),
            captureInterval: settings.getCaptureInterval(),
            autoStart: settings.getAutoStart()
        };
    });
}