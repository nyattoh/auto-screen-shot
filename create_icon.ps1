# Load source image
$sourcePath = 'assets/source_error.png'
$sourceBitmap = [System.Drawing.Image]::FromFile($sourcePath)

# Determine trim dimensions for square
$size = [Math]::Min($sourceBitmap.Width, $sourceBitmap.Height)
$bitmap = New-Object System.Drawing.Bitmap($size, $size)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.DrawImage($sourceBitmap, 0, 0, $size, $size)

# Resize to 32x32
$iconBitmap = New-Object System.Drawing.Bitmap(32, 32)
$iconGraphics = [System.Drawing.Graphics]::FromImage($iconBitmap)
$iconGraphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$iconGraphics.DrawImage($bitmap, 0, 0, 32, 32)

# Save
$iconBitmap.Save('assets/icon.png', [System.Drawing.Imaging.ImageFormat]::Png)

# Cleanup
$graphics.Dispose()
$bitmap.Dispose()
$iconGraphics.Dispose()
$iconBitmap.Dispose()
$sourceBitmap.Dispose()

Write-Host 'Custom icon created from error screenshot.'