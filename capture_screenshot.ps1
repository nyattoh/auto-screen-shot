param(
    [Parameter(Mandatory=$true)]
    [string]$OutputPath
)

# Set UTF-8 encoding for proper Japanese character handling
$OutputEncoding = [System.Text.Encoding]::UTF8
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Windows.Forms

# Get active window information
Add-Type @"
    using System;
    using System.Runtime.InteropServices;
    using System.Text;
    public class Win32 {
        [DllImport("user32.dll")]
        public static extern IntPtr GetForegroundWindow();
        
        [DllImport("user32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
        public static extern int GetWindowTextW(IntPtr hWnd, StringBuilder lpString, int nMaxCount);
        
        [DllImport("user32.dll", SetLastError = true)]
        public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);
    }
"@

try {
    # Get active window title
    $activeWindowHandle = [Win32]::GetForegroundWindow()
    $titleStringBuilder = New-Object System.Text.StringBuilder 256
    [Win32]::GetWindowTextW($activeWindowHandle, $titleStringBuilder, 256) | Out-Null
    $activeWindowTitle = $titleStringBuilder.ToString()
    
    # Get process name
    $processId = 0
    [Win32]::GetWindowThreadProcessId($activeWindowHandle, [ref]$processId) | Out-Null
    $process = Get-Process -Id $processId -ErrorAction SilentlyContinue
    $processName = if ($process) { $process.ProcessName } else { "Unknown" }
    
    $screen = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
    $bitmap = New-Object System.Drawing.Bitmap($screen.Width, $screen.Height)
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    
    $graphics.CopyFromScreen($screen.Location, [System.Drawing.Point]::Empty, $screen.Size)
    
    $bitmap.Save($OutputPath, [System.Drawing.Imaging.ImageFormat]::Png)
    
    # Output both success message and window info as JSON
    $result = @{
        Success = $true
        Message = "Screenshot saved to $OutputPath"
        WindowTitle = $activeWindowTitle
        ProcessName = $processName
    }
    Write-Output (ConvertTo-Json $result -Compress)
} catch {
    $errorResult = @{
        Success = $false
        Message = "Failed to capture screenshot: $($_.Exception.Message)"
        WindowTitle = ""
        ProcessName = ""
    }
    Write-Output (ConvertTo-Json $errorResult -Compress)
    exit 1
} finally {
    if ($graphics) { $graphics.Dispose() }
    if ($bitmap) { $bitmap.Dispose() }
}