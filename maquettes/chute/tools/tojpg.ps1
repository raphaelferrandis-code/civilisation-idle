# PNG -> JPEG pour la planche. -Crop "x,y,w,h" (pixels source), -Scale (1 = net, <1 = aperçu réduit).
param(
  [Parameter(Mandatory = $true)][string]$In,
  [Parameter(Mandatory = $true)][string]$Out,
  [double]$Scale = 1.0,
  [int]$Quality = 88,
  [string]$Crop = ""
)
Add-Type -AssemblyName System.Drawing
$src = [System.Drawing.Image]::FromFile((Resolve-Path $In))
try {
  if ($Crop -ne "") { $c = $Crop.Split(',') | ForEach-Object { [int]$_ } } else { $c = @(0, 0, $src.Width, $src.Height) }
  $w = [int][Math]::Round($c[2] * $Scale); $h = [int][Math]::Round($c[3] * $Scale)
  $bmp = New-Object System.Drawing.Bitmap $w, $h
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  if ($Scale -ge 1) {
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::NearestNeighbor
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::Half
  } else {
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  }
  $dst = New-Object System.Drawing.Rectangle 0, 0, $w, $h
  $g.DrawImage($src, $dst, $c[0], $c[1], $c[2], $c[3], [System.Drawing.GraphicsUnit]::Pixel)
  $g.Dispose()
  $codec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' }
  $ep = New-Object System.Drawing.Imaging.EncoderParameters 1
  $ep.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter ([System.Drawing.Imaging.Encoder]::Quality), ([long]$Quality)
  $bmp.Save($Out, $codec, $ep)
  $bmp.Dispose()
} finally { $src.Dispose() }
