Add-Type -AssemblyName System.Drawing
$root = "C:\Users\Raphi\civilisation-idle"
$FARM = Join-Path $root "public\iso-assets\farm"
$NAT  = Join-Path $root "public\iso-assets\nature"
function FF($n){ Join-Path $FARM $n }
function NF($n){ Join-Path $NAT  $n }

# Canvas + point au sol (centre tuile d'herbe)
$W=900; $H=700; $GX=450; $GY=470

# Calques : ordre = profondeur. dx,dy = offset vs (GX,GY). s = echelle.
# Ancrage bas-centre : x = GX+dx-(w*s)/2 ; y = GY+dy-(h*s)
$layers = @(
  @{ id='ground'; f=(NF 'naturePack_001_0.png');     dx=0;    dy=40;   s=2.10 },
  @{ id='tree';   f=(NF 'naturePack_130_0.png');     dx=-45;  dy=-12;  s=1.20 },
  @{ id='wallN';  f=(FF 'planksHigh_N.png');          dx=0;    dy=-30;  s=0.60 },
  @{ id='wallW';  f=(FF 'planksHigh_W.png');          dx=0;    dy=-30;  s=0.60 },
  @{ id='wallE';  f=(FF 'planksHigh_E.png');          dx=0;    dy=-30;  s=0.60 },
  @{ id='wallS';  f=(FF 'planksHigh_S.png');          dx=0;    dy=-30;  s=0.60 },
  @{ id='roofS';  f=(FF 'roofSingle_S.png');          dx=0;    dy=-160; s=0.60 },
  @{ id='roofE';  f=(FF 'roofSingle_E.png');          dx=0;    dy=-160; s=0.60 },
  @{ id='tuft';   f=(NF 'naturePack_040_0.png');     dx=-35;  dy=40;   s=1.80 },
  @{ id='flower'; f=(NF 'naturePack_flat_008_0.png'); dx=15;  dy=48;   s=2.40 },
  @{ id='mush1';  f=(NF 'naturePack_111_0.png');     dx=55;   dy=34;   s=2.20 },
  @{ id='mush2';  f=(NF 'naturePack_113_0.png');     dx=92;   dy=46;   s=2.00 }
)

$bmp = New-Object System.Drawing.Bitmap($W,$H)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.Clear([System.Drawing.Color]::FromArgb(255,13,16,24))
$g.InterpolationMode='HighQualityBicubic'
$g.PixelOffsetMode='HighQuality'
foreach($L in $layers){
  if(-not (Test-Path $L.f)){ Write-Host "MISS $($L.id) $($L.f)"; continue }
  $im=[System.Drawing.Image]::FromFile($L.f)
  $w=$im.Width*$L.s; $h=$im.Height*$L.s
  $x=$GX+$L.dx-$w/2; $y=$GY+$L.dy-$h
  $g.DrawImage($im,$x,$y,$w,$h)
  $im.Dispose()
}
$g.Dispose()
$out = Join-Path $root ".iso-scratch\cueilleurs.png"
$bmp.Save($out,[System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()
"saved $out"
