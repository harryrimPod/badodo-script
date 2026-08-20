$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$version = (Get-Content -Raw (Join-Path $root 'package.json') | ConvertFrom-Json).version
$outDir = Join-Path $root 'dist-bin'
$stage = Join-Path $outDir "badodo-script-$version-dist"
$zip = Join-Path $outDir "badodo-script-$version-dist.zip"

Push-Location $root
try {
  npm run build
  if (Test-Path $stage) { Remove-Item -LiteralPath $stage -Recurse -Force }
  New-Item -ItemType Directory -Path $stage | Out-Null
  Copy-Item -LiteralPath (Join-Path $root 'dist') -Destination $stage -Recurse
  Copy-Item -LiteralPath (Join-Path $root 'examples') -Destination $stage -Recurse
  Copy-Item -LiteralPath (Join-Path $root 'node_modules/wabt') -Destination (Join-Path $stage 'node_modules') -Recurse
  foreach ($file in @('package.json', 'package-lock.json', 'README.md', 'CHANGELOG.md', 'LICENSE')) {
    Copy-Item -LiteralPath (Join-Path $root $file) -Destination $stage
  }
  $sha256 = [System.Security.Cryptography.SHA256]::Create()
  $hash = -join ($sha256.ComputeHash([System.IO.File]::ReadAllBytes((Join-Path $stage 'dist/cli.js'))) | ForEach-Object { $_.ToString('x2') })
  $sha256.Dispose()
  "$hash  dist/cli.js" | Set-Content -LiteralPath (Join-Path $stage 'SHA256SUMS.txt') -Encoding ASCII
  if (Test-Path $zip) { Remove-Item -LiteralPath $zip -Force }
  Compress-Archive -Path (Join-Path $stage '*') -DestinationPath $zip -CompressionLevel Optimal
  Write-Host "Node distribution archive written: $zip"
} finally {
  Pop-Location
}
