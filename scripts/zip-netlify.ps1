# EMBALLAGE DU BUILD POUR NETLIFY DROP (dépôt à la main du zip).
# ---------------------------------------------------------------------------
# Usage :  npm run build ; npm run zip:netlify
# Sortie : ..\civilisation-netlify.zip (HORS du dépôt : rien à ignorer, rien à
#          committer par mégarde).
#
# ⛔⛔ POURQUOI CE SCRIPT EXISTE, ET POURQUOI PAS `Compress-Archive`.
# `Compress-Archive` de Windows PowerShell 5.1 écrit les chemins internes avec
# des ANTISLASH (`assets\index-xxxx.js`). La spécification ZIP impose la barre
# oblique (APPNOTE 4.4.17.1). Vérifié le 2026-07-31 : les 2 074 entrées sortaient
# en antislash. Les décompresseurs POSIX y voient alors des fichiers dont le NOM
# contient un antislash, tous posés à la racine : le site se déploie sans erreur
# et rend un écran blanc, avec des 404 sur tous les scripts. Panne silencieuse,
# donc panne chère.
# On écrit donc les entrées une par une, avec des noms normalisés.
#
# ⚠ `tar -a -c -f sortie.zip` (bsdtar de Windows) NE MARCHE PAS NON PLUS : il
# ignore l'extension et produit un TAR nommé .zip, que le décompresseur refuse
# (« End of Central Directory introuvable »). Essayé, écarté.
#
# ⚠ Le zip contient le CONTENU de dist/, pas le dossier : Netlify attend
# index.html à la racine de l'archive.

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem

$racine = Split-Path -Parent $PSScriptRoot
$src = Join-Path $racine 'dist'
$out = Join-Path (Split-Path -Parent $racine) 'civilisation-netlify.zip'

if (-not (Test-Path $src)) { throw "dist/ absent — lance d'abord : npm run build" }

if (Test-Path $out) { Remove-Item $out -Force }
$zip = [System.IO.Compression.ZipFile]::Open($out, 'Create')
try {
  $n = 0
  Get-ChildItem $src -Recurse -File | ForEach-Object {
    $rel = $_.FullName.Substring($src.Length + 1).Replace('\', '/')
    [void][System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
      $zip, $_.FullName, $rel, [System.IO.Compression.CompressionLevel]::Optimal)
    $n++
  }
} finally {
  $zip.Dispose()
}

# GARDE : on relit ce qu'on vient d'écrire. Un zip cassé ne se voit qu'une fois
# en ligne, et « ça marchait chez moi » ne s'applique pas à une archive.
$z = [System.IO.Compression.ZipFile]::OpenRead($out)
try {
  $noms = $z.Entries | Select-Object -ExpandProperty FullName
  $antislash = @($noms | Where-Object { $_ -match '\\' }).Count
  if ($antislash -gt 0) { throw "$antislash entrees en antislash — archive inutilisable" }
  if ($noms -notcontains 'index.html') { throw "index.html absent de la racine de l'archive" }
} finally {
  $z.Dispose()
}

$mo = [math]::Round((Get-Item $out).Length / 1MB, 1)
Write-Host "$out - $mo Mo, $n fichiers, index.html a la racine, 0 antislash"
