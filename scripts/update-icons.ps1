param([Parameter(Mandatory = $true)][string]$Source)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$projectDir = Split-Path $PSScriptRoot -Parent
$master = Join-Path $projectDir 'assets/icon-master.png'
if ([System.IO.Path]::GetFullPath($Source) -ne $master) {
    Copy-Item -LiteralPath $Source -Destination $master -Force
}
$image = [System.Drawing.Image]::FromFile($master)
try {
    $variants = @{
        'assets/icon.png' = 1024
        'client/public/images/icon-512X512.png' = 512
        'client/public/images/icon-192x192.png' = 192
        'client/public/images/icon-144x144.png' = 144
        'client/public/images/icon-96x96.png' = 96
        'client/public/images/icon-72x72.png' = 72
        'client/public/images/icon-48x48.png' = 48
        'client/public/images/apple-touch-icon.png' = 180
        'client/public/images/favicon-32x32.png' = 32
        'client/public/images/favicon-16x16.png' = 16
    }
    foreach ($variant in $variants.GetEnumerator()) {
        $size = [int]$variant.Value
        $bitmap = [System.Drawing.Bitmap]::new($size, $size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
        $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
        try {
            $graphics.Clear([System.Drawing.Color]::Transparent)
            $graphics.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceCopy
            $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
            $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
            $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
            $graphics.DrawImage($image, 0, 0, $size, $size)
            $bitmap.Save((Join-Path $projectDir $variant.Key), [System.Drawing.Imaging.ImageFormat]::Png)
        } finally { $graphics.Dispose(); $bitmap.Dispose() }
    }
} finally { $image.Dispose() }
# ICO supports PNG frames; include taskbar, title bar, and high-DPI sizes.
$image = [System.Drawing.Image]::FromFile($master)
$frames = @()
try {
    foreach ($size in @(16, 24, 32, 48, 64, 128, 256)) {
        $bitmap = [System.Drawing.Bitmap]::new($size, $size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
        $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
        $stream = [System.IO.MemoryStream]::new()
        try {
            $graphics.Clear([System.Drawing.Color]::Transparent)
            $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
            $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
            $graphics.DrawImage($image, 0, 0, $size, $size)
            $bitmap.Save($stream, [System.Drawing.Imaging.ImageFormat]::Png)
            $frames += @{ Size = $size; Bytes = $stream.ToArray() }
        } finally { $stream.Dispose(); $graphics.Dispose(); $bitmap.Dispose() }
    }
} finally { $image.Dispose() }
$output = [System.IO.MemoryStream]::new()
$writer = [System.IO.BinaryWriter]::new($output)
try {
    $writer.Write([uint16]0); $writer.Write([uint16]1); $writer.Write([uint16]$frames.Count)
    $offset = 6 + 16 * $frames.Count
    foreach ($frame in $frames) {
        $dimension = if ($frame.Size -eq 256) { 0 } else { $frame.Size }
        $writer.Write([byte]$dimension); $writer.Write([byte]$dimension)
        $writer.Write([byte]0); $writer.Write([byte]0)
        $writer.Write([uint16]1); $writer.Write([uint16]32)
        $writer.Write([uint32]$frame.Bytes.Length); $writer.Write([uint32]$offset)
        $offset += $frame.Bytes.Length
    }
    foreach ($frame in $frames) { $writer.Write([byte[]]$frame.Bytes) }
    $writer.Flush()
    $bytes = $output.ToArray()
    [System.IO.File]::WriteAllBytes((Join-Path $projectDir 'assets/icon.ico'), $bytes)
    [System.IO.File]::WriteAllBytes((Join-Path $projectDir 'client/public/images/favicon.ico'), $bytes)
} finally { $writer.Dispose(); $output.Dispose() }
