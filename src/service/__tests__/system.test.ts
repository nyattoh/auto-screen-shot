import * as fs from 'fs-extra';
import * as path from 'path';
import * as os from 'os';
import { spawn, ChildProcess } from 'child_process';

describe('System Tests', () => {
    let testAppPath: string;
    let testProcess: ChildProcess | null = null;

    beforeAll(async () => {
        testAppPath = path.join(__dirname, '../../../dist/main.js');
        
        // ビルドされたファイルが存在することを確認
        if (!(await fs.pathExists(testAppPath))) {
            throw new Error('テスト実行前にアプリケーションをビルドしてください: npm run build');
        }
    });

    afterEach(async () => {
        // テストプロセスをクリーンアップ
        if (testProcess && !testProcess.killed) {
            testProcess.kill('SIGTERM');
            
            // プロセス終了を待機
            await new Promise<void>((resolve) => {
                testProcess!.on('exit', () => resolve());
                setTimeout(() => resolve(), 5000); // 5秒でタイムアウト
            });
            
            testProcess = null;
        }

        // PIDファイルをクリーンアップ
        const pidFilePath = path.join(os.tmpdir(), 'win-screenshot-app.pid');
        try {
            if (await fs.pathExists(pidFilePath)) {
                await fs.remove(pidFilePath);
            }
        } catch (error) {
            // クリーンアップエラーは無視
        }
    });

    describe('Application Startup', () => {
        test('バックグラウンドモードでアプリケーションが起動すること', (done) => {
            testProcess = spawn('node', [testAppPath, '--background'], {
                stdio: 'pipe',
                detached: false // テスト用に親プロセスに接続
            });

            let output = '';
            let errorOutput = '';

            testProcess.stdout?.on('data', (data) => {
                output += data.toString();
            });

            testProcess.stderr?.on('data', (data) => {
                errorOutput += data.toString();
            });

            // 3秒後にプロセスを確認
            setTimeout(() => {
                expect(testProcess?.killed).toBe(false);
                expect(testProcess?.pid).toBeDefined();
                
                // PIDファイルが作成されていることを確認
                const pidFilePath = path.join(os.tmpdir(), 'win-screenshot-app.pid');
                fs.pathExists(pidFilePath).then((exists) => {
                    expect(exists).toBe(true);
                    done();
                });
            }, 3000);

            testProcess.on('error', (error) => {
                done.fail(`プロセス起動エラー: ${error.message}`);
            });
        }, 10000);

        test('開発モードでアプリケーションが起動すること', (done) => {
            testProcess = spawn('node', [testAppPath, '--dev'], {
                stdio: 'pipe',
                detached: false
            });

            let output = '';

            testProcess.stdout?.on('data', (data) => {
                output += data.toString();
            });

            // 3秒後にプロセスを確認
            setTimeout(() => {
                expect(testProcess?.killed).toBe(false);
                expect(testProcess?.pid).toBeDefined();
                done();
            }, 3000);

            testProcess.on('error', (error) => {
                done.fail(`プロセス起動エラー: ${error.message}`);
            });
        }, 10000);

        test('フォアグラウンドモードでアプリケーションが起動すること', (done) => {
            testProcess = spawn('node', [testAppPath, '--foreground'], {
                stdio: 'pipe',
                detached: false
            });

            let output = '';

            testProcess.stdout?.on('data', (data) => {
                output += data.toString();
            });

            // 3秒後にプロセスを確認
            setTimeout(() => {
                expect(testProcess?.killed).toBe(false);
                expect(testProcess?.pid).toBeDefined();
                done();
            }, 3000);

            testProcess.on('error', (error) => {
                done.fail(`プロセス起動エラー: ${error.message}`);
            });
        }, 10000);
    });

    describe('Multiple Instance Prevention', () => {
        test('重複起動が防止されること', (done) => {
            // 最初のインスタンスを起動
            const firstProcess = spawn('node', [testAppPath, '--background'], {
                stdio: 'pipe',
                detached: false
            });

            // 3秒後に2番目のインスタンスを起動
            setTimeout(() => {
                const secondProcess = spawn('node', [testAppPath, '--background'], {
                    stdio: 'pipe',
                    detached: false
                });

                let secondOutput = '';
                let secondErrorOutput = '';

                secondProcess.stdout?.on('data', (data) => {
                    secondOutput += data.toString();
                });

                secondProcess.stderr?.on('data', (data) => {
                    secondErrorOutput += data.toString();
                });

                secondProcess.on('exit', (code) => {
                    // 2番目のプロセスはエラーで終了するはず
                    expect(code).not.toBe(0);
                    
                    // 最初のプロセスを終了
                    firstProcess.kill('SIGTERM');
                    firstProcess.on('exit', () => {
                        done();
                    });
                });

                secondProcess.on('error', (error) => {
                    // エラーが発生することを期待
                    firstProcess.kill('SIGTERM');
                    firstProcess.on('exit', () => {
                        done();
                    });
                });
            }, 3000);

            firstProcess.on('error', (error) => {
                done.fail(`最初のプロセス起動エラー: ${error.message}`);
            });
        }, 15000);
    });

    describe('Graceful Shutdown', () => {
        test('SIGTERMシグナルで適切にシャットダウンすること', (done) => {
            testProcess = spawn('node', [testAppPath, '--background'], {
                stdio: 'pipe',
                detached: false
            });

            // 3秒後にSIGTERMを送信
            setTimeout(() => {
                testProcess!.kill('SIGTERM');
            }, 3000);

            testProcess.on('exit', (code, signal) => {
                expect(code).toBe(0); // 正常終了
                
                // PIDファイルが削除されていることを確認
                const pidFilePath = path.join(os.tmpdir(), 'win-screenshot-app.pid');
                fs.pathExists(pidFilePath).then((exists) => {
                    expect(exists).toBe(false);
                    done();
                });
            });

            testProcess.on('error', (error) => {
                done.fail(`プロセスエラー: ${error.message}`);
            });
        }, 10000);

        test('SIGINTシグナルで適切にシャットダウンすること', (done) => {
            testProcess = spawn('node', [testAppPath, '--background'], {
                stdio: 'pipe',
                detached: false
            });

            // 3秒後にSIGINTを送信
            setTimeout(() => {
                testProcess!.kill('SIGINT');
            }, 3000);

            testProcess.on('exit', (code, signal) => {
                expect(code).toBe(0); // 正常終了
                done();
            });

            testProcess.on('error', (error) => {
                done.fail(`プロセスエラー: ${error.message}`);
            });
        }, 10000);
    });

    describe('Windows Specific Features', () => {
        test('Windows環境でのプロセス分離が動作すること', (done) => {
            if (process.platform !== 'win32') {
                done(); // Windows以外では スキップ
                return;
            }

            testProcess = spawn('node', [testAppPath, '--background'], {
                stdio: 'pipe',
                detached: true, // Windows固有のdetached起動をテスト
                windowsHide: true
            });

            // プロセスが正常に起動することを確認
            setTimeout(() => {
                expect(testProcess?.pid).toBeDefined();
                expect(testProcess?.killed).toBe(false);
                done();
            }, 3000);

            testProcess.on('error', (error) => {
                done.fail(`Windows固有機能テストエラー: ${error.message}`);
            });
        }, 10000);
    });

    describe('Help and Version', () => {
        test('--helpフラグでヘルプが表示されること', (done) => {
            const helpProcess = spawn('node', [testAppPath, '--help'], {
                stdio: 'pipe'
            });

            let output = '';
            helpProcess.stdout?.on('data', (data) => {
                output += data.toString();
            });

            helpProcess.on('exit', (code) => {
                expect(code).toBe(0);
                expect(output).toContain('Win Screenshot App');
                expect(output).toContain('使用方法');
                expect(output).toContain('オプション');
                done();
            });

            helpProcess.on('error', (error) => {
                done.fail(`ヘルプ表示エラー: ${error.message}`);
            });
        }, 5000);
    });
});