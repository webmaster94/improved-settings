$ErrorActionPreference = 'Stop'
$moduleRoot = Split-Path -Parent $PSScriptRoot
$manifest = Get-Content -LiteralPath (Join-Path $moduleRoot 'module.json') -Raw | ConvertFrom-Json
$packageRoot = Join-Path $moduleRoot 'dist\package\improved-settings'
New-Item -ItemType Directory -Force -Path $packageRoot | Out-Null
foreach ($name in @('module.json', 'README.md', 'scripts', 'styles', 'docs', 'tests', 'tools', 'package.json', 'package-lock.json')) {
    Copy-Item -LiteralPath (Join-Path $moduleRoot $name) -Destination $packageRoot -Recurse -Force
}
$archivePath = Join-Path $moduleRoot "dist\improved-settings-$($manifest.version).zip"
Compress-Archive -LiteralPath $packageRoot -DestinationPath $archivePath -Force
Get-Item -LiteralPath $archivePath | Select-Object FullName, Length
