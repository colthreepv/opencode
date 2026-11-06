param(
  [string]$Repo = 'C:\Users\valerio\projects\public\opencode'
)

$ErrorActionPreference = 'Stop'
$installed = Join-Path $env:LOCALAPPDATA 'Programs\ai.opencode.desktop\resources\opencode-cli.exe'
$version = (& $installed --version).Trim() -replace '^.* v', ''
if ($LASTEXITCODE -ne 0 -or $version -notmatch '^\d+\.\d+\.\d+$') {
  throw "Cannot determine installed CLI version: $version"
}

$saved = @{}
@('OPENCODE_CHANNEL', 'OPENCODE_VERSION', 'OPENCODE_TARGET', 'OPENCODE_DESKTOP_APP', 'CSC_IDENTITY_AUTO_DISCOVERY') | ForEach-Object {
  $saved[$_] = [Environment]::GetEnvironmentVariable($_, 'Process')
}

Push-Location (Join-Path $Repo 'packages\desktop')
try {
  $env:OPENCODE_CHANNEL = 'dev'
  $env:OPENCODE_VERSION = "$version-sidebar"
  $env:OPENCODE_TARGET = 'windows-x64'
  $env:CSC_IDENTITY_AUTO_DISCOVERY = 'false'
  Remove-Item Env:OPENCODE_DESKTOP_APP -ErrorAction SilentlyContinue
  $cli = Join-Path $Repo 'packages\cli\dist\cli-windows-x64-baseline'
  New-Item -ItemType Directory -Force (Join-Path $cli 'bin') | Out-Null
  Copy-Item $installed (Join-Path $cli 'bin\opencode.exe') -Force
  @{version = $version} | ConvertTo-Json -Compress | Set-Content (Join-Path $cli 'package.json')
  bun run build
  if ($LASTEXITCODE -ne 0) { throw 'Desktop build failed' }
  bun run pack
  if ($LASTEXITCODE -ne 0) { throw 'Desktop packaging failed' }
  Write-Output (Join-Path $Repo 'dist\desktop\app\OpenCode Dev.exe')
} finally {
  Pop-Location
  foreach ($key in $saved.Keys) {
    [Environment]::SetEnvironmentVariable($key, $saved[$key], 'Process')
  }
}
