import { TimeTracker } from '../TimeTracker';
import { WindowInfo, WindowBounds } from '../../types';

describe('TimeTracker', () => {
    let timeTracker: TimeTracker;
    let mockWindowInfo: WindowInfo;

    beforeEach(() => {
        timeTracker = new TimeTracker();
        mockWindowInfo = {
            title: 'Test Window',
            processName: 'test.exe',
            processId: 1234,
            bounds: { x: 0, y: 0, width: 800, height: 600 } as WindowBounds,
            timestamp: new Date()
        };
        
        // モックタイマーを使用
        jest.useFakeTimers();
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    describe('セッション開始機能', () => {
        test('新しいセッションを正常に開始できること', () => {
            timeTracker.startSession(mockWindowInfo);
            
            const currentSession = timeTracker.getCurrentSession();
            expect(currentSession).not.toBeNull();
            expect(currentSession?.windowInfo).toEqual(mockWindowInfo);
            expect(currentSession?.startTime).toBeInstanceOf(Date);
        });

        test('既存のセッションがある場合、前のセッションを終了して新しいセッションを開始すること', () => {
            // 最初のセッションを開始
            timeTracker.startSession(mockWindowInfo);
            const firstSession = timeTracker.getCurrentSession();
            
            // 時間を進める
            jest.advanceTimersByTime(2000);
            
            // 新しいウィンドウ情報で2番目のセッションを開始
            const newWindowInfo = { ...mockWindowInfo, title: 'New Window' };
            timeTracker.startSession(newWindowInfo);
            
            const currentSession = timeTracker.getCurrentSession();
            expect(currentSession?.windowInfo.title).toBe('New Window');
            expect(currentSession?.startTime).not.toEqual(firstSession?.startTime);
        });

        test('アイドル状態の場合、セッションを開始しないこと', () => {
            // アイドル状態にする（5分以上経過）
            jest.advanceTimersByTime(6 * 60 * 1000);
            
            timeTracker.startSession(mockWindowInfo);
            
            const currentSession = timeTracker.getCurrentSession();
            expect(currentSession).toBeNull();
        });
    });

    describe('セッション終了機能', () => {
        test('セッションを正常に終了できること', () => {
            timeTracker.startSession(mockWindowInfo);
            
            // 2分経過
            jest.advanceTimersByTime(2 * 60 * 1000);
            
            const session = timeTracker.endSession();
            
            expect(session).not.toBeNull();
            expect(session?.windowInfo).toEqual(mockWindowInfo);
            expect(session?.duration).toBe(2 * 60 * 1000);
            expect(session?.isValid).toBe(true);
            expect(timeTracker.getCurrentSession()).toBeNull();
        });

        test('セッションがない場合、nullを返すこと', () => {
            const session = timeTracker.endSession();
            expect(session).toBeNull();
        });

        test('1分未満のセッションは無効とマークされること', () => {
            timeTracker.startSession(mockWindowInfo);
            
            // 30秒経過
            jest.advanceTimersByTime(30 * 1000);
            
            const session = timeTracker.endSession();
            
            expect(session).not.toBeNull();
            expect(session?.duration).toBe(30 * 1000);
            expect(session?.isValid).toBe(false);
        });

        test('1分以上のセッションは有効とマークされること', () => {
            timeTracker.startSession(mockWindowInfo);
            
            // 90秒経過
            jest.advanceTimersByTime(90 * 1000);
            
            const session = timeTracker.endSession();
            
            expect(session).not.toBeNull();
            expect(session?.duration).toBe(90 * 1000);
            expect(session?.isValid).toBe(true);
        });
    });

    describe('追跡一時停止・再開機能', () => {
        test('追跡を一時停止できること', () => {
            timeTracker.pauseTracking();
            expect(timeTracker.isIdle()).toBe(true);
        });

        test('追跡を再開できること', () => {
            timeTracker.pauseTracking();
            expect(timeTracker.isIdle()).toBe(true);
            
            timeTracker.resumeTracking();
            expect(timeTracker.isIdle()).toBe(false);
        });

        test('一時停止中にセッションがある場合、セッションを終了すること', () => {
            timeTracker.startSession(mockWindowInfo);
            
            // 2分経過
            jest.advanceTimersByTime(2 * 60 * 1000);
            
            const pausedSession = timeTracker.pauseTracking();
            
            expect(pausedSession).not.toBeNull();
            expect(pausedSession?.isValid).toBe(true);
            expect(timeTracker.getCurrentSession()).toBeNull();
        });
    });

    describe('アイドル状態検出機能', () => {
        test('通常状態ではアイドルでないこと', () => {
            expect(timeTracker.isIdle()).toBe(false);
        });

        test('5分以上経過するとアイドル状態になること', () => {
            // 6分経過
            jest.advanceTimersByTime(6 * 60 * 1000);
            
            expect(timeTracker.isIdle()).toBe(true);
        });

        test('一時停止中はアイドル状態であること', () => {
            timeTracker.pauseTracking();
            expect(timeTracker.isIdle()).toBe(true);
        });

        test('セッション開始時にアクティビティが更新されること', () => {
            // 4分経過（まだアイドルではない）
            jest.advanceTimersByTime(4 * 60 * 1000);
            expect(timeTracker.isIdle()).toBe(false);
            
            // セッション開始
            timeTracker.startSession(mockWindowInfo);
            
            // さらに4分経過（セッション開始でアクティビティが更新されたので、まだアイドルではない）
            jest.advanceTimersByTime(4 * 60 * 1000);
            expect(timeTracker.isIdle()).toBe(false);
        });
    });

    describe('コンテンツ識別機能', () => {
        test('ブラウザプロセスを正しく識別すること', () => {
            const chromeWindow: WindowInfo = {
                ...mockWindowInfo,
                processName: 'chrome.exe',
                title: 'YouTube - Google Chrome'
            };
            
            timeTracker.startSession(chromeWindow);
            const session = timeTracker.getCurrentSession();
            
            expect(session?.contentInfo.category).toBe('Browser');
            expect(session?.contentInfo.application).toBe('Chrome');
            expect(session?.contentInfo.content).toBe('YouTube');
        });

        test('開発ツールを正しく識別すること', () => {
            const codeWindow: WindowInfo = {
                ...mockWindowInfo,
                processName: 'code.exe',
                title: 'main.ts - Visual Studio Code'
            };
            
            timeTracker.startSession(codeWindow);
            const session = timeTracker.getCurrentSession();
            
            expect(session?.contentInfo.category).toBe('Development');
            expect(session?.contentInfo.application).toBe('Code');
            expect(session?.contentInfo.content).toBe('main.ts - Visual Studio Code');
        });

        test('一般的なアプリケーションを正しく識別すること', () => {
            const notepadWindow: WindowInfo = {
                ...mockWindowInfo,
                processName: 'notepad.exe',
                title: 'Untitled - Notepad'
            };
            
            timeTracker.startSession(notepadWindow);
            const session = timeTracker.getCurrentSession();
            
            expect(session?.contentInfo.category).toBe('Application');
            expect(session?.contentInfo.application).toBe('Notepad');
            expect(session?.contentInfo.content).toBe('Untitled - Notepad');
        });

        test('既知のサイトを正しく抽出すること', () => {
            const testCases = [
                { title: 'ChatGPT - OpenAI', expected: 'ChatGPT' },
                { title: 'GitHub - Microsoft', expected: 'GitHub' },
                { title: 'X (formerly Twitter)', expected: 'X (Twitter)' },
                { title: 'Unknown Site', expected: 'Unknown Site' }
            ];

            testCases.forEach(({ title, expected }) => {
                const browserWindow: WindowInfo = {
                    ...mockWindowInfo,
                    processName: 'chrome.exe',
                    title
                };
                
                timeTracker.startSession(browserWindow);
                const session = timeTracker.getCurrentSession();
                
                expect(session?.contentInfo.content).toBe(expected);
            });
        });
    });

    describe('時間計算ロジック', () => {
        test('正確な使用時間を計算すること', () => {
            const startTime = new Date('2024-01-01T10:00:00Z');
            jest.setSystemTime(startTime);
            
            timeTracker.startSession(mockWindowInfo);
            
            // 3分30秒経過
            const duration = 3 * 60 * 1000 + 30 * 1000;
            jest.advanceTimersByTime(duration);
            
            const session = timeTracker.endSession();
            
            expect(session?.duration).toBe(duration);
            expect(session?.startTime).toEqual(startTime);
            expect(session?.endTime).toEqual(new Date(startTime.getTime() + duration));
        });

        test('複数のセッションで独立した時間計算を行うこと', () => {
            // 最初のセッション
            timeTracker.startSession(mockWindowInfo);
            jest.advanceTimersByTime(2 * 60 * 1000); // 2分
            const firstSession = timeTracker.endSession();
            
            // 少し間隔を空ける
            jest.advanceTimersByTime(1000);
            
            // 2番目のセッション
            const newWindowInfo = { ...mockWindowInfo, title: 'New Window' };
            timeTracker.startSession(newWindowInfo);
            jest.advanceTimersByTime(3 * 60 * 1000); // 3分
            const secondSession = timeTracker.endSession();
            
            expect(firstSession?.duration).toBe(2 * 60 * 1000);
            expect(secondSession?.duration).toBe(3 * 60 * 1000);
            expect(firstSession?.windowInfo.title).toBe('Test Window');
            expect(secondSession?.windowInfo.title).toBe('New Window');
        });
    });

    describe('セッション有効性判定', () => {
        test('カスタム最小セッション時間を設定できること', () => {
            const customTracker = new TimeTracker(30 * 1000); // 30秒
            
            customTracker.startSession(mockWindowInfo);
            jest.advanceTimersByTime(45 * 1000); // 45秒
            const session = customTracker.endSession();
            
            expect(session?.isValid).toBe(true);
        });

        test('カスタムアイドル閾値を設定できること', () => {
            const customTracker = new TimeTracker(60 * 1000, 2 * 60 * 1000); // 2分でアイドル
            
            jest.advanceTimersByTime(3 * 60 * 1000); // 3分経過
            
            expect(customTracker.isIdle()).toBe(true);
        });

        test('設定値を正しく取得できること', () => {
            const config = timeTracker.getConfig();
            
            expect(config.minSessionDuration).toBe(60 * 1000);
            expect(config.idleThreshold).toBe(5 * 60 * 1000);
        });
    });

    describe('エッジケース', () => {
        test('同じウィンドウで複数回セッションを開始しても正常に動作すること', () => {
            timeTracker.startSession(mockWindowInfo);
            const firstStartTime = timeTracker.getCurrentSession()?.startTime;
            
            jest.advanceTimersByTime(1000);
            
            // 同じウィンドウで再度セッション開始
            timeTracker.startSession(mockWindowInfo);
            const secondStartTime = timeTracker.getCurrentSession()?.startTime;
            
            expect(secondStartTime).not.toEqual(firstStartTime);
        });

        test('セッション中に一時停止・再開しても正常に動作すること', () => {
            timeTracker.startSession(mockWindowInfo);
            jest.advanceTimersByTime(1 * 60 * 1000); // 1分
            
            const pausedSession = timeTracker.pauseTracking();
            expect(pausedSession?.isValid).toBe(true);
            
            timeTracker.resumeTracking();
            
            // 新しいセッションを開始
            timeTracker.startSession(mockWindowInfo);
            jest.advanceTimersByTime(2 * 60 * 1000); // 2分
            
            const newSession = timeTracker.endSession();
            expect(newSession?.isValid).toBe(true);
            expect(newSession?.duration).toBe(2 * 60 * 1000);
        });
    });
});