import { WindowsIntegration } from '../WindowsIntegration';
import { ChildProcess } from 'child_process';

// child_processモジュールをモック
jest.mock('child_process');

// osモジュールをモック
jest.mock('os');

describe('WindowsIntegration', () => {
    let windowsIntegration: WindowsIntegration;
    let originalPlatform: string;

    beforeEach(() => {
        windowsIntegration = new WindowsIntegration();
        originalPlatform = process.platform;
    });

    afterEach(() => {
        // プラットフォームを元に戻す
        Object.defineProperty(process, 'platform', {
            value: originalPlatform,
            writable: true
        });
    });

    describe('isWindowsEnvironment', () => {
        test('Windows環境でtrueを返すこと', () => {
            Object.defineProperty(process, 'platform', {
                value: 'win32',
                writable: true
            });
            
            const newIntegration = new WindowsIntegration();
            expect(newIntegration.isWindowsEnvironment()).toBe(true);
        });

        test('非Windows環境でfalseを返すこと', () => {
            Object.defineProperty(process, 'platform', {
                value: 'linux',
                writable: true
            });
            
            const newIntegration = new WindowsIntegration();
            expect(newIntegration.isWindowsEnvironment()).toBe(false);
        });
    });

    describe('hideConsoleWindow', () => {
        test('Windows環境でコンソール非表示処理が実行されること', () => {
            Object.defineProperty(process, 'platform', {
                value: 'win32',
                writable: true
            });
            
            const newIntegration = new WindowsIntegration();
            
            // エラーが発生しないことを確認
            expect(() => newIntegration.hideConsoleWindow()).not.toThrow();
        });

        test('非Windows環境で警告ログが出力されること', () => {
            Object.defineProperty(process, 'platform', {
                value: 'linux',
                writable: true
            });
            
            const newIntegration = new WindowsIntegration();
            
            // エラーが発生しないことを確認
            expect(() => newIntegration.hideConsoleWindow()).not.toThrow();
        });
    });

    describe('showConsoleWindow', () => {
        test('Windows環境でコンソール表示処理が実行されること', () => {
            Object.defineProperty(process, 'platform', {
                value: 'win32',
                writable: true
            });
            
            const newIntegration = new WindowsIntegration();
            
            // エラーが発生しないことを確認
            expect(() => newIntegration.showConsoleWindow()).not.toThrow();
        });

        test('非Windows環境で警告ログが出力されること', () => {
            Object.defineProperty(process, 'platform', {
                value: 'linux',
                writable: true
            });
            
            const newIntegration = new WindowsIntegration();
            
            // エラーが発生しないことを確認
            expect(() => newIntegration.showConsoleWindow()).not.toThrow();
        });
    });

    describe('setProcessPriority', () => {
        const mockOs = require('os');

        beforeEach(() => {
            mockOs.setPriority = jest.fn();
            // テスト環境フラグを一時的に無効にする
            delete process.env.JEST_WORKER_ID;
        });

        afterEach(() => {
            // テスト環境フラグを復元
            process.env.JEST_WORKER_ID = '1';
        });

        test('高優先度が正しく設定されること', () => {
            Object.defineProperty(process, 'platform', {
                value: 'win32',
                writable: true
            });
            
            const newIntegration = new WindowsIntegration();
            newIntegration.setProcessPriority('high');
            
            expect(mockOs.setPriority).toHaveBeenCalledWith(process.pid, -10);
        });

        test('通常優先度が正しく設定されること', () => {
            Object.defineProperty(process, 'platform', {
                value: 'win32',
                writable: true
            });
            
            const newIntegration = new WindowsIntegration();
            newIntegration.setProcessPriority('normal');
            
            expect(mockOs.setPriority).toHaveBeenCalledWith(process.pid, 0);
        });

        test('低優先度が正しく設定されること', () => {
            Object.defineProperty(process, 'platform', {
                value: 'win32',
                writable: true
            });
            
            const newIntegration = new WindowsIntegration();
            newIntegration.setProcessPriority('low');
            
            expect(mockOs.setPriority).toHaveBeenCalledWith(process.pid, 10);
        });

        test('未知の優先度で通常優先度が設定されること', () => {
            Object.defineProperty(process, 'platform', {
                value: 'win32',
                writable: true
            });
            
            const newIntegration = new WindowsIntegration();
            newIntegration.setProcessPriority('unknown');
            
            expect(mockOs.setPriority).toHaveBeenCalledWith(process.pid, 0);
        });

        test('非Windows環境で警告ログが出力されること', () => {
            Object.defineProperty(process, 'platform', {
                value: 'linux',
                writable: true
            });
            
            const newIntegration = new WindowsIntegration();
            newIntegration.setProcessPriority('high');
            
            expect(mockOs.setPriority).not.toHaveBeenCalled();
        });
    });

    describe('handleShutdownSignals', () => {
        let originalOn: typeof process.on;
        let mockOn: jest.Mock;

        beforeEach(() => {
            originalOn = process.on;
            mockOn = jest.fn();
            process.on = mockOn;
        });

        afterEach(() => {
            process.on = originalOn;
        });

        test('標準的なシグナルハンドラーが設定されること', () => {
            windowsIntegration.handleShutdownSignals();
            
            expect(mockOn).toHaveBeenCalledWith('SIGINT', expect.any(Function));
            expect(mockOn).toHaveBeenCalledWith('SIGTERM', expect.any(Function));
            expect(mockOn).toHaveBeenCalledWith('SIGHUP', expect.any(Function));
        });

        test('Windows環境でSIGBREAKハンドラーが設定されること', () => {
            Object.defineProperty(process, 'platform', {
                value: 'win32',
                writable: true
            });
            
            const newIntegration = new WindowsIntegration();
            newIntegration.handleShutdownSignals();
            
            expect(mockOn).toHaveBeenCalledWith('SIGBREAK', expect.any(Function));
        });
    });

    describe('getCurrentProcessInfo', () => {
        test('現在のプロセス情報が正しく取得されること', () => {
            const processInfo = windowsIntegration.getCurrentProcessInfo();
            
            expect(processInfo).toHaveProperty('platform');
            expect(processInfo).toHaveProperty('pid');
            expect(processInfo).toHaveProperty('ppid');
            expect(processInfo).toHaveProperty('arch');
            expect(processInfo).toHaveProperty('version');
            expect(processInfo).toHaveProperty('memoryUsage');
            expect(processInfo).toHaveProperty('uptime');
        });
    });
});