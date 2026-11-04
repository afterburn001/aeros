# Creates (or updates) the "Weather App" shortcut on the Desktop.
# The shortcut runs Electron directly (no npm, no console window) and uses APP_ICON from src\config.js.
# Run: powershell -ExecutionPolicy Bypass -File tools\make-shortcut.ps1
$root = Split-Path -Parent $PSScriptRoot
$electron = Join-Path $root 'node_modules\electron\dist\electron.exe'
if (-not (Test-Path $electron)) { throw "Electron not found. Run 'npm install' in $root first." }

$config = Get-Content (Join-Path $root 'src\config.js') -Raw
if ($config -notmatch "APP_ICON:\s*'([^']+)'") { throw "APP_ICON not found in src\config.js" }
$icoPath = Join-Path $root $Matches[1]
if (-not (Test-Path $icoPath)) { throw "Icon not found: $icoPath (run tools\make-icons.ps1)" }

$desktop = [Environment]::GetFolderPath('Desktop')
$lnkPath = Join-Path $desktop 'Weather App.lnk'
$shell = New-Object -ComObject WScript.Shell
$lnk = $shell.CreateShortcut($lnkPath)
$lnk.TargetPath = $electron
$lnk.Arguments = '"' + $root + '"'
$lnk.WorkingDirectory = $root
$lnk.IconLocation = "$icoPath,0"
$lnk.Description = 'Weather App'
$lnk.WindowStyle = 1
$lnk.Save()

# Nudge Explorer to redraw the Desktop icon right away.
Add-Type -Namespace Win32 -Name Shell -MemberDefinition '[DllImport("shell32.dll")] public static extern void SHChangeNotify(int e, int f, IntPtr a, IntPtr b);'
[Win32.Shell]::SHChangeNotify(0x08000000, 0, [IntPtr]::Zero, [IntPtr]::Zero)

Write-Output "Shortcut: $lnkPath"
Write-Output "Icon:     $icoPath"
