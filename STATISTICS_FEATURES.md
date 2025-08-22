# 統計機能および画像最適化機能

## 概要

このアップデートでは、データ保持期間の問題を修正し、画像最適化機能を追加しました。

## 修正された問題

### 1. データが1日でクリアされる問題

**問題:** 統計データが自動的にクリーンアップされ、長期間のデータが保持されない

**修正内容:**
- `StatisticsManager`クラスを新規作成し、データ保持期間を管理
- デフォルトで90日間のデータを保持するように設定
- 24時間ごとに自動メンテナンスを実行
- 手動メンテナンス機能をトレイメニューに追加

**設定:**
```typescript
{
    dataRetentionDays: 90,        // データ保持期間
    cleanupIntervalHours: 24,     // クリーンアップ間隔
    enableImageOptimization: true, // 画像最適化有効
    webpQuality: 80               // WebP品質
}
```

## 新機能

### 1. 画像最適化機能

**機能概要:**
- スクリーンショット画像をWebP形式に変換してファイルサイズを削減
- 品質調整可能（1-100）
- バッチ処理対応
- リサイズ機能

**使用方法:**
1. トレイアイコンを右クリック
2. 「画像最適化」を選択
3. 確認ダイアログで「実行」をクリック

**技術詳細:**
- Sharp ライブラリを使用
- WebP, JPEG, PNG形式をサポート
- 最大1920x1080にリサイズ（設定可能）
- 元ファイルの保持/削除を選択可能

### 2. データメンテナンス機能

**機能概要:**
- 古い統計データの手動削除
- 統計情報の健全性チェック
- データベース最適化

**使用方法:**
1. トレイアイコンを右クリック
2. 「データメンテナンス」を選択  
3. 確認ダイアログで「実行」をクリック

## ファイル構成

### 新規追加ファイル

```
src/
├── statistics/
│   ├── StatisticsManager.ts           # 統計管理メインクラス
│   └── __tests__/
│       └── StatisticsManager.test.ts  # ユニットテスト
├── optimization/
│   ├── ImageOptimizer.ts              # 画像最適化クラス
│   └── __tests__/
│       └── ImageOptimizer.test.ts     # ユニットテスト
└── config/
    └── settings.ts                    # 統計設定を追加
```

### 修正されたファイル

```
src/
├── main.ts                           # 新機能の統合
├── config/settings.ts                # 統計設定の追加
└── ui/statisticsWindow.ts            # 統計画面の改善
```

## API仕様

### StatisticsManager

```typescript
class StatisticsManager {
    // データ保持期間設定
    updateConfig(config: Partial<StatisticsConfig>): void
    
    // メンテナンス実行
    performMaintenance(): Promise<void>
    manualCleanup(): Promise<{ deletedRecords: number }>
    
    // 健全性チェック
    performHealthCheck(): Promise<{ healthy: boolean; issues: string[] }>
    
    // データ取得
    getDailyUsage(date: Date): Promise<DailyUsage[]>
    getDetailedSessions(date: Date): Promise<DetailedSession[]>
    exportToCSV(startDate: Date, endDate: Date): Promise<string>
}
```

### ImageOptimizer

```typescript
class ImageOptimizer {
    // 単一画像最適化
    optimizeImage(inputPath: string, outputPath?: string, options?: Partial<OptimizationOptions>): Promise<OptimizationResult>
    
    // ディレクトリ最適化
    optimizeDirectory(inputDir: string, outputDir?: string, options?: Partial<OptimizationOptions>): Promise<OptimizationResult[]>
    
    // バッチ最適化
    optimizeBatch(filePaths: string[], outputDir?: string, options?: Partial<OptimizationOptions>): Promise<OptimizationResult[]>
}
```

## 設定値

### 統計設定

| 項目 | デフォルト値 | 説明 |
|------|-------------|------|
| dataRetentionDays | 90 | データ保持期間（日） |
| cleanupIntervalHours | 24 | 自動クリーンアップ間隔（時間） |
| enableImageOptimization | true | 画像最適化の有効/無効 |
| webpQuality | 80 | WebP品質（1-100） |

### 画像最適化設定

| 項目 | デフォルト値 | 説明 |
|------|-------------|------|
| quality | 80 | 画像品質（1-100） |
| format | 'webp' | 出力形式 |
| maxWidth | 1920 | 最大幅（ピクセル） |
| maxHeight | 1080 | 最大高さ（ピクセル） |
| removeOriginal | false | 元ファイル削除の有無 |

## テスト

### ユニットテスト

```bash
# 統計マネージャーのテスト
npm test -- --testPathPattern="StatisticsManager"

# 画像最適化のテスト  
npm test -- --testPathPattern="ImageOptimizer"

# 全テスト実行
npm test
```

### 動作確認

1. **統計データ保持確認:**
   - アプリケーションを数日間使用
   - 統計画面で過去のデータが表示されることを確認

2. **画像最適化確認:**
   - スクリーンショット撮影後
   - トレイメニューから「画像最適化」を実行
   - ファイルサイズが削減されることを確認

3. **メンテナンス確認:**
   - トレイメニューから「データメンテナンス」を実行
   - 古いデータが削除されることを確認

## トラブルシューティング

### よくある問題

1. **画像最適化が失敗する**
   - Sharp ライブラリの依存関係を確認
   - 対応形式（PNG, JPG, BMP, TIFF）であることを確認

2. **統計データが表示されない**
   - データベースファイルの存在を確認
   - 健全性チェックを実行してエラーを確認

3. **メンテナンスでエラーが発生する**
   - データベースファイルのアクセス権限を確認
   - 他のプロセスがファイルを使用していないか確認

### ログファイル

エラーの詳細はログファイルで確認できます：
- 場所: `%APPDATA%\Electron\logs\app.log`
- トレイメニューの「ログを表示」からアクセス可能

## 今後の改善予定

1. **画像最適化の改善**
   - 自動最適化オプション
   - より多くの形式対応
   - 並列処理による高速化

2. **統計機能の拡張**
   - 週次・月次統計
   - グラフィカルな表示
   - データエクスポート形式の追加

3. **パフォーマンス最適化**
   - データベースインデックスの最適化
   - メモリ使用量の削減
   - 大量データ処理の高速化