# Turns square PNGs into multi-size Windows .ico files in the Weather App folder.
# Run: powershell -ExecutionPolicy Bypass -File tools\make-icons.ps1
# Add more pairs to $icons to make more candidates.
Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $PSScriptRoot
$icons = @(
  @{ Source = 'Graphics\aeros_A_beveled.png'; Output = 'icon_beveled.ico' },
  @{ Source = 'Graphics\aeros_A_glassy.png';  Output = 'icon_glassy.ico' }
)
$sizes = 16, 20, 24, 32, 40, 48, 64, 128, 256

function Resize-Png([System.Drawing.Image]$src, [int]$size) {
  $bmp = New-Object System.Drawing.Bitmap $size, $size, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.InterpolationMode = 'HighQualityBicubic'
  $g.SmoothingMode = 'HighQuality'
  $g.PixelOffsetMode = 'HighQuality'
  $g.CompositingQuality = 'HighQuality'
  $attrs = New-Object System.Drawing.Imaging.ImageAttributes
  $attrs.SetWrapMode([System.Drawing.Drawing2D.WrapMode]::TileFlipXY) # no dark fringe at the edges
  $g.DrawImage($src, (New-Object System.Drawing.Rectangle 0, 0, $size, $size), 0, 0, $src.Width, $src.Height, 'Pixel', $attrs)
  $g.Dispose()
  $ms = New-Object System.IO.MemoryStream
  $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
  return ,$ms.ToArray()
}

foreach ($icon in $icons) {
  $srcPath = Join-Path $root $icon.Source
  $outPath = Join-Path $root $icon.Output
  $src = [System.Drawing.Image]::FromFile($srcPath)
  if ($src.Width -ne $src.Height) { Write-Warning "$($icon.Source) is not square ($($src.Width)x$($src.Height)); it will be stretched." }
  $pngs = foreach ($sz in $sizes) { ,(Resize-Png $src $sz) }
  $src.Dispose()

  # ICO container with PNG-compressed entries.
  $out = New-Object System.IO.MemoryStream
  $bw = New-Object System.IO.BinaryWriter $out
  $bw.Write([UInt16]0); $bw.Write([UInt16]1); $bw.Write([UInt16]$sizes.Count)
  $offset = 6 + 16 * $sizes.Count
  for ($i = 0; $i -lt $sizes.Count; $i++) {
    $dim = if ($sizes[$i] -ge 256) { 0 } else { $sizes[$i] }
    $bw.Write([byte]$dim); $bw.Write([byte]$dim); $bw.Write([byte]0); $bw.Write([byte]0)
    $bw.Write([UInt16]1); $bw.Write([UInt16]32)
    $bw.Write([UInt32]$pngs[$i].Length); $bw.Write([UInt32]$offset)
    $offset += $pngs[$i].Length
  }
  foreach ($p in $pngs) { $bw.Write($p) }
  $bw.Flush()
  [System.IO.File]::WriteAllBytes($outPath, $out.ToArray())
  Write-Output "$($icon.Output): $($sizes -join ', ') px"
}
