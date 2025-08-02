import * as fs from 'fs-extra';
import * as path from 'path';
import * as os from 'os';
import { ProcessManager } from '../ProcessManager';

describe('ProcessManager', () => {
    let processManager: ProcessManager;
    let testPidFilePath: string;

    beforeEach(() => {
        // テスト用の一時PIDファイルパスを作成
        testPidFilePath = path.join(os.tmpdir(), `test-win-screenshot-app-${Date.now()}.pid`);
        processManager = new ProcessManager(testPidFilePath);
    });

    afterEach(async () => {
        // テスト後にPIDファイルをクリーンアップ
        try {
            if (await fs.pathExists(testPidFilePath)) {
                await fs.remove(testPidFilePath);
            }
        } catch (error) {
            // クリーンアップエラーは無視
        }
    });

    describe('createPidFile', () => {
        test('PIDファイルを正常に作成できること', async () => {
            await processManager.createPidFile();

            // ファイルが存在することを確認
            expect(await fs.pathExists(testPidFilePath)).toBe(true);

            // ファイル内容を確認
            const pidContent = await fs.readFile(testPidFilePath, 'utf8');
            const pidData = JSON.parse(pidContent);

            expect(pidData.pid).toBe(process.pid);
            expect(pidData.mode).toBeDefined();
            expect(pidData.startTime).toBeDefined();
        });

        test('既にPIDファイルが存在する場合はエラーを投げること', async () => {
            // 最初のPIDファイルを作成
            await processManager.createPidFile();

            // 2回目の作成でエラーが発生することを確認
            const secondProcessManager = new ProcessManager(testPidFilePath);
            await expect(secondProcessManager.createPidFile()).rejects.toThrow('既に実行中です');
        });
    });

    describe('removePidFile', () => {
        test('PIDファイルを正常に削除できること', async () => {
            // PIDファイルを作成
            await processManager.createPidFile();
            expect(await fs.pathExists(testPidFilePath)).toBe(true);

            // PIDファイルを削除
            await processManager.removePidFile();
            expect(await fs.pathExists(testPidFilePath)).toBe(false);
        });

        test('PIDファイルが存在しない場合でもエラーにならないこと', async () => {
            // PIDファイルが存在しない状態で削除を実行
            await expect(processManager.removePidFile()).resolves.not.toThrow();
        });
    });

    describe('isAlreadyRunning', () => {
        test('PIDファイルが存在しない場合はfalseを返すこと', async () => {
            const result = await processManager.isAlreadyRunning();
            expect(result).toBe(false);
        });

        test('PIDファイルが存在し、プロセスが実行中の場合はtrueを返すこと', async () => {
            await processManager.createPidFile();
            const result = await processManager.isAlreadyRunning();
            expect(result).toBe(true);
        });

        test('PIDファイルが存在するが、プロセスが実行中でない場合はfalseを返すこと', async () => {
            // 存在しないPIDでPIDファイルを作成
            const fakePidData = {
                pid: 99999,
                startTime: new Date().toISOString(),
                mode: 'test'
            };
            await fs.writeFile(testPidFilePath, JSON.stringify(fakePidData), 'utf8');

            const result = await processManager.isAlreadyRunning();
            expect(result).toBe(false);
        });
    });

    describe('getCurrentProcessInfo', () => {
        test('現在のプロセス情報を正常に取得できること', () => {
            const processInfo = processManager.getCurrentProcessInfo();

            expect(processInfo.pid).toBe(process.pid);
            expect(processInfo.startTime).toBeInstanceOf(Date);
            expect(processInfo.mode).toBeDefined();
            expect(processInfo.parentPid).toBe(process.ppid);
        });
    });

    describe('getPidFilePath', () => {
        test('PIDファイルパスを正常に取得できること', () => {
            const pidFilePath = processManager.getPidFilePath();
            expect(pidFilePath).toBe(testPidFilePath);
        });
    });

    describe('detachFromParent', () => {
        test('親プロセスからの分離処理が正常に実行されること', () => {
            // detachFromParentは例外を投げないことを確認
            expect(() => processManager.detachFromParent()).not.toThrow();
        });
    });
});