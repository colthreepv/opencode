param(
  [string]$Repo = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
)

$ErrorActionPreference = 'Stop'
$Repo = (Resolve-Path $Repo).Path
$config = Get-Content (Join-Path $Repo '.github/sidebar/config.json') -Raw | ConvertFrom-Json
if ($config.upstream -ne 'anomalyco/opencode' -or $config.baseTag -notmatch '^v(\d+\.\d+\.\d+)$') {
  throw 'Expected the official upstream and a stable vX.Y.Z baseTag in sidebar config'
}
$version = $Matches[1]
$commit = (& git -C $Repo rev-parse HEAD).Trim()
if ($LASTEXITCODE -ne 0 -or $commit -notmatch '^[0-9a-f]{40}$') { throw 'Cannot determine fork commit' }
if ($env:GITHUB_SHA -and $commit -ne $env:GITHUB_SHA) { throw 'Checkout does not match dispatched commit' }
$buildVersion = "$version-sidebar.$($commit.Substring(0, 12))"
$assetName = 'opencode-windows-x64-baseline.zip'
$release = Invoke-RestMethod -Uri "https://api.github.com/repos/$($config.upstream)/releases/tags/$($config.baseTag)" -Headers @{ 'User-Agent' = 'sidebar-windows-build'; 'Accept' = 'application/vnd.github+json' }
$assets = @($release.assets | Where-Object { $_.name -eq $assetName })
if ($assets.Count -ne 1 -or $assets[0].digest -notmatch '^sha256:([0-9a-f]{64})$') { throw 'Expected one upstream CLI asset with a SHA256 digest' }
$expectedHash = $Matches[1]
$assetUrl = $assets[0].browser_download_url
$temp = Join-Path ([System.IO.Path]::GetTempPath()) ([System.IO.Path]::GetRandomFileName())
New-Item -ItemType Directory $temp | Out-Null
try {
  $archive = Join-Path $temp $assetName
  Invoke-WebRequest -Uri $assetUrl -OutFile $archive
  $actualHash = (Get-FileHash $archive -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($actualHash -ne $expectedHash) { throw 'Upstream CLI archive SHA256 mismatch' }
  Expand-Archive $archive -DestinationPath (Join-Path $temp 'cli')
  $executables = @(Get-ChildItem (Join-Path $temp 'cli') -Filter opencode.exe -File -Recurse)
  if ($executables.Count -ne 1) { throw 'Expected exactly one opencode.exe in the upstream archive' }
  $cliVersionOutput = (& $executables[0].FullName --version | Out-String).Trim()
  if ($LASTEXITCODE -ne 0 -or $cliVersionOutput -notmatch "(^| v)$([regex]::Escape($version))$") {
    throw "Unexpected upstream CLI version: $cliVersionOutput"
  }
  $cli = Join-Path $Repo 'packages/cli/dist/cli-windows-x64-baseline'
  New-Item -ItemType Directory -Force (Join-Path $cli 'bin') | Out-Null
  Copy-Item $executables[0].FullName (Join-Path $cli 'bin/opencode.exe') -Force
  @{ version = $version } | ConvertTo-Json -Compress | Set-Content (Join-Path $cli 'package.json') -Encoding utf8

  $env:OPENCODE_CHANNEL = 'dev'
  $env:OPENCODE_VERSION = $buildVersion
  $env:OPENCODE_TARGET = 'windows-x64'
  $env:CSC_IDENTITY_AUTO_DISCOVERY = 'false'
  Remove-Item Env:OPENCODE_DESKTOP_APP -ErrorAction SilentlyContinue
  Push-Location (Join-Path $Repo 'packages/desktop')
  try {
    & bun run build
    if ($LASTEXITCODE -ne 0) { throw 'Desktop build failed' }
    & bun run pack
    if ($LASTEXITCODE -ne 0) { throw 'Desktop packaging failed' }
  } finally { Pop-Location }

  $app = Join-Path $Repo 'dist/desktop/app'
  if (-not (Test-Path (Join-Path $app 'OpenCode Dev.exe'))) { throw 'Packaged application not found' }
  $output = Join-Path $Repo 'dist/sidebar-artifact'
  New-Item -ItemType Directory -Force $output | Out-Null
  $zipName = "opencode-sidebar-windows-x64-$($commit.Substring(0, 12)).zip"
  $zip = Join-Path $output $zipName
  Remove-Item $zip -Force -ErrorAction SilentlyContinue
  & 7z a -tzip -mx=5 $zip "$app\*"
  if ($LASTEXITCODE -ne 0) { throw 'App ZIP creation failed' }
  $zipHash = (Get-FileHash $zip -Algorithm SHA256).Hash.ToLowerInvariant()
  "$zipHash  $zipName" | Set-Content (Join-Path $output 'SHA256SUMS') -Encoding utf8NoBOM
  $manifest = [ordered]@{
    schemaVersion = 1
    forkCommit = $commit
    baseTag = $config.baseTag
    cliVersion = $version
    cliAsset = [ordered]@{ name = $assetName; url = $assetUrl; sha256 = $actualHash }
    buildTimestamp = [DateTime]::UtcNow.ToString('o')
    buildVersion = $buildVersion
    artifact = [ordered]@{ name = $zipName; sha256 = $zipHash }
  }
  $manifest | ConvertTo-Json -Depth 5 | Set-Content (Join-Path $output 'build-manifest.json') -Encoding utf8NoBOM
  if ($env:GITHUB_STEP_SUMMARY) {
    "### Sidebar Windows desktop`n`n- Commit: ``$commit```n- Base: ``$($config.baseTag)```n- Version: ``$buildVersion```n- ZIP SHA256: ``$zipHash```n- Unsigned; updater disabled by the fork." | Add-Content $env:GITHUB_STEP_SUMMARY
  }
} finally {
  Remove-Item $temp -Recurse -Force -ErrorAction SilentlyContinue
}
