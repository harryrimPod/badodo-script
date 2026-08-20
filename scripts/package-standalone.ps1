$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$version = (Get-Content -Raw (Join-Path $root 'package.json') | ConvertFrom-Json).version
$outDir = Join-Path $root 'dist-bin'
$stage = Join-Path $outDir "bds-$version-windows-x64"
$zip = Join-Path $outDir "badodo-script-$version-windows-x64.zip"

Push-Location $root
try {
  npm run build:standalone
  if (Test-Path $stage) { Remove-Item -LiteralPath $stage -Recurse -Force }
  New-Item -ItemType Directory -Path $stage | Out-Null
  Copy-Item -LiteralPath (Join-Path $outDir 'bds.exe') -Destination $stage
  Copy-Item -LiteralPath (Join-Path $root 'LICENSE') -Destination $stage
  Copy-Item -LiteralPath (Join-Path $root 'README.md') -Destination $stage
  Copy-Item -LiteralPath (Join-Path $root 'CHANGELOG.md') -Destination $stage
  Copy-Item -LiteralPath (Join-Path $root 'examples') -Destination $stage -Recurse
  $sha256 = [System.Security.Cryptography.SHA256]::Create()
  $hash = -join ($sha256.ComputeHash([System.IO.File]::ReadAllBytes((Join-Path $stage 'bds.exe'))) | ForEach-Object { $_.ToString('x2') })
  $sha256.Dispose()
  "$hash  bds.exe" | Set-Content -LiteralPath (Join-Path $stage 'SHA256SUMS.txt') -Encoding ASCII
  if (Test-Path $zip) { Remove-Item -LiteralPath $zip -Force }
  Compress-Archive -Path (Join-Path $stage '*') -DestinationPath $zip -CompressionLevel Optimal
  Write-Host "Standalone archive written: $zip"
} finally {
  Pop-Location
}
