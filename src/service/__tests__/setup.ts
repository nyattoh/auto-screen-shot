// Jest セットアップファイル

// テスト環境の設定
beforeAll(() => {
  // ログレベルを設定（テスト中は警告以上のみ）
  process.env.LOG_LEVEL = 'warn';
  
  // テスト用の環境変数を設定
  process.env.NODE_ENV = 'test';
  
  // タイムアウトを延長（Windows環境での処理時間を考慮）
  jest.setTimeout(30000);
});

// 各テスト後のクリーンアップ
afterEach(() => {
  // 環境変数をクリーンアップ
  delete process.env.STARTUP_MODE;
  
  // プロセスリスナーをクリーンアップ（メモリリーク防止）
  process.removeAllListeners('SIGINT');
  process.removeAllListeners('SIGTERM');
  process.removeAllListeners('SIGHUP');
  process.removeAllListeners('SIGBREAK');
  process.removeAllListeners('uncaughtException');
  process.removeAllListeners('unhandledRejection');
  process.removeAllListeners('warning');
  process.removeAllListeners('beforeExit');
  process.removeAllListeners('exit');
});

// グローバルエラーハンドラー（テスト中の未処理エラーをキャッチ）
process.on('unhandledRejection', (reason, promise) => {
  console.error('テスト中に未処理のPromise拒否が発生しました:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('テスト中に未処理の例外が発生しました:', error);
});

// Windows固有のテスト設定
if (process.platform === 'win32') {
  // Windows環境でのテスト用設定
  console.log('Windows環境でのテストを実行します');
} else {
  console.log(`${process.platform}環境でのテストを実行します（一部のWindows固有機能はスキップされます）`);
}

// テスト用のヘルパー関数
global.testHelpers = {
  // テスト用の一時ファイルパスを生成
  getTempFilePath: (filename: string) => {
    const os = require('os');
    const path = require('path');
    return path.join(os.tmpdir(), `test-${Date.now()}-${filename}`);
  },
  
  // プロセス終了を待機
  waitForProcessExit: (process: any, timeout = 5000) => {
    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error('プロセス終了のタイムアウト'));
      }, timeout);
      
      process.on('exit', () => {
        clearTimeout(timer);
        resolve();
      });
    });
  },
  
  // ファイルの存在を待機
  waitForFile: async (filePath: string, timeout = 5000) => {
    const fs = require('fs-extra');
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
      if (await fs.pathExists(filePath)) {
        return true;
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    return false;
  }
};

// TypeScript用の型定義
declare global {
  var testHelpers: {
    getTempFilePath: (filename: string) => string;
    waitForProcessExit: (process: any, timeout?: number) => Promise<void>;
    waitForFile: (filePath: string, timeout?: number) => Promise<boolean>;
  };
}

// モジュールとして認識させるためのexport
export {};