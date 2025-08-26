import { WindowInfo, ContentInfo, UsageSession, ITimeTracker } from '../types';

export class TimeTracker implements ITimeTracker {
    private currentSession: {
        windowInfo: WindowInfo;
        contentInfo: ContentInfo;
        startTime: Date;
    } | null = null;
    
    private isPaused: boolean = false;
    private lastActivityTime: Date = new Date();
    private readonly minSessionDuration: number = 60 * 1000; // 1分（ミリ秒）
    private readonly idleThreshold: number = 5 * 60 * 1000; // 5分（ミリ秒）

    constructor(
        minSessionDuration: number = 60 * 1000,
        idleThreshold: number = 5 * 60 * 1000
    ) {
        this.minSessionDuration = minSessionDuration;
        this.idleThreshold = idleThreshold;
        this.updateLastActivity();
    }

    /**
     * セッション開始
     * 要件3.1: アプリケーションがフォーカスを得る時、開始時刻が記録される
     */
    startSession(windowInfo: WindowInfo): void {
        // 既存のセッションがある場合は終了
        if (this.currentSession) {
            this.endSession();
        }

        // 以前はアイドル時にセッションを作らなかったが、
        // 実運用では「ウィンドウが変わらない=アイドル判定」で記録されない問題が出るため、
        // ここでは開始をスキップしない（必要なら後段でカテゴリ分けで表現する）。

        // 新しいセッションを開始
        const contentInfo = this.identifyContent(windowInfo);
        this.currentSession = {
            windowInfo,
            contentInfo,
            startTime: new Date()
        };

        this.updateLastActivity();
    }

    /**
     * セッション終了
     * 要件3.2: アプリケーションがフォーカスを失う時、終了時刻が記録され使用時間が計算される
     * 要件3.4: 1分未満の短時間使用は統計から除外される
     */
    endSession(): UsageSession | null {
        if (!this.currentSession) {
            return null;
        }

        const endTime = new Date();
        const duration = endTime.getTime() - this.currentSession.startTime.getTime();
        
        // 1分未満のセッションは無効とする（要件3.4）
        const isValid = duration >= this.minSessionDuration;

        const session: UsageSession = {
            windowInfo: this.currentSession.windowInfo,
            contentInfo: this.currentSession.contentInfo,
            startTime: this.currentSession.startTime,
            endTime,
            duration,
            isValid
        };

        // セッションをクリア
        this.currentSession = null;

        return session;
    }

    /**
     * 追跡一時停止
     * 要件3.3: システムがアイドル状態になる時、時間追跡が一時停止される
     */
    pauseTracking(): UsageSession | null {
        this.isPaused = true;
        
        // 現在のセッションがある場合は一時的に終了
        if (this.currentSession) {
            // セッションの終了時刻を現在時刻に設定して保存
            const pausedSession = this.endSession();
            // 有効なセッションの場合のみ記録（実際の保存は呼び出し元で処理）
            return pausedSession;
        }
        
        return null;
    }

    /**
     * 追跡再開
     */
    resumeTracking(): void {
        this.isPaused = false;
        this.updateLastActivity();
    }

    /**
     * アイドル状態チェック
     * 要件3.3: システムがアイドル状態になる時、時間追跡が一時停止される
     */
    isIdle(): boolean {
        if (this.isPaused) {
            return true;
        }

        const now = new Date();
        const timeSinceLastActivity = now.getTime() - this.lastActivityTime.getTime();
        return timeSinceLastActivity > this.idleThreshold;
    }

    /**
     * 最後のアクティビティ時刻を更新
     */
    private updateLastActivity(): void {
        this.lastActivityTime = new Date();
    }

    /**
     * ウィンドウ情報からコンテンツ情報を識別
     * 現在は基本的な実装のみ（ContentIdentifierクラスが実装されたら置き換え）
     */
    private identifyContent(windowInfo: WindowInfo): ContentInfo {
        // 基本的なコンテンツ識別（後でContentIdentifierクラスに置き換え）
        const processName = windowInfo.processName.toLowerCase();
        
        if (processName.includes('chrome') || processName.includes('edge') || processName.includes('firefox')) {
            return {
                category: 'Browser',
                application: this.getApplicationName(processName),
                content: this.extractSiteFromTitle(windowInfo.title)
            };
        } else if (processName.includes('code') || processName.includes('devenv')) {
            return {
                category: 'Development',
                application: this.getApplicationName(processName),
                content: windowInfo.title
            };
        } else {
            return {
                category: 'Application',
                application: this.getApplicationName(processName),
                content: windowInfo.title
            };
        }
    }

    /**
     * プロセス名からアプリケーション名を取得
     */
    private getApplicationName(processName: string): string {
        const name = processName.replace('.exe', '');
        return name.charAt(0).toUpperCase() + name.slice(1);
    }

    /**
     * ウィンドウタイトルからサイト名を抽出（基本実装）
     */
    private extractSiteFromTitle(title: string): string {
        // 基本的なサイト名抽出（後で改善）
        if (title.includes('YouTube')) return 'YouTube';
        if (title.includes('Twitter') || title.includes('X.com')) return 'X (Twitter)';
        if (title.includes('ChatGPT')) return 'ChatGPT';
        if (title.includes('GitHub')) return 'GitHub';
        
        // デフォルトはタイトルをそのまま使用
        return title;
    }

    /**
     * 現在のセッション情報を取得（テスト用）
     */
    getCurrentSession(): { windowInfo: WindowInfo; contentInfo: ContentInfo; startTime: Date } | null {
        return this.currentSession;
    }

    /**
     * 設定値を取得（テスト用）
     */
    getConfig(): { minSessionDuration: number; idleThreshold: number } {
        return {
            minSessionDuration: this.minSessionDuration,
            idleThreshold: this.idleThreshold
        };
    }
}
