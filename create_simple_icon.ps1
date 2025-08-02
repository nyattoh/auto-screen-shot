Add-Type -AssemblyName System.Drawing

try {
    # 32x32のビットマップを作成
    $bitmap = New-Object System.Drawing.Bitmap(32, 32)
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    
    # 背景を透明に設定
    $graphics.Clear([System.Drawing.Color]::Transparent)
    
    # 背景円を描画（青色）
    $blueBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::SteelBlue)
    $graphics.FillEllipse($blueBrush, 0, 0, 32, 32)
    
    # カメラレンズを描画（白色）
    $whiteBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
    $graphics.FillEllipse($whiteBrush, 8, 8, 16, 16)
    
    # レンズの内側（黒色）
    $blackBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::Black)
    $graphics.FillEllipse($blackBrush, 12, 12, 8, 8)
    
    # フラッシュ（黄色）
    $yellowBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::Gold)
    $graphics.FillRectangle($yellowBrush, 20, 6, 6, 4)
    
    # ファイルを保存
    $bitmap.Save("assets\icon.png", [System.Drawing.Imaging.ImageFormat]::Png)
    
    Write-Host "アイコンファイルが正常に作成されました: assets\icon.png"
    
    # リソースをクリーンアップ
    $graphics.Dispose()
    $bitmap.Dispose()
    $blueBrush.Dispose()
    $whiteBrush.Dispose()
    $blackBrush.Dispose()
    $yellowBrush.Dispose()
    
} catch {
    Write-Host "エラーが発生しました: $($_.Exception.Message)"
}