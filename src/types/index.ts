export interface ScreenshotSettings {
    saveDirectory: string;
    captureInterval: number; // in milliseconds
}

export interface ScreenshotData {
    filePath: string;
    timestamp: Date;
    activeWindow?: string;  // アクティブウィンドウのタイトル
}

// Usage tracking types
export interface WindowInfo {
    title: string;           // ウィンドウタイトル
    processName: string;     // プロセス名
    processId: number;       // プロセスID
    bounds: WindowBounds;    // ウィンドウ位置・サイズ
    timestamp: Date;         // 取得時刻
}

export interface WindowBounds {
    x: number;
    y: number;
    width: number;
    height: number;
}

export interface ContentInfo {
    category: string;        // カテゴリ（Browser, IDE, Game等）
    application: string;     // アプリケーション名
    content: string;         // 具体的なコンテンツ（サイト名等）
    url?: string;           // URL（取得可能な場合）
    icon?: string;          // アイコンパス
}

export interface UsageSession {
    windowInfo: WindowInfo;     // ウィンドウ情報
    contentInfo: ContentInfo;   // コンテンツ情報
    startTime: Date;           // 開始時刻
    endTime: Date;             // 終了時刻
    duration: number;          // 使用時間（ミリ秒）
    isValid: boolean;          // 有効セッション（1分以上）
}

export interface ITimeTracker {
    startSession(windowInfo: WindowInfo): void;        // セッション開始
    endSession(): UsageSession | null;                 // セッション終了
    pauseTracking(): UsageSession | null;              // 追跡一時停止
    resumeTracking(): void;                            // 追跡再開
    isIdle(): boolean;                                 // アイドル状態チェック
}