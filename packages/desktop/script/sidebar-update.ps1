#Requires -Version 7.0
[CmdletBinding()]
param(
  [string]$Tag,
  # Accept the extracted Actions artifact as well as published release assets.
  [string]$PackageDirectory,
  [switch]$PrepareOnly
)

$ErrorActionPreference = 'Stop'
$repo = 'colthreepv/opencode'
$destination = Join-Path $env:LOCALAPPDATA 'Programs/ai.opencode.desktop.sidebar'
$exeName = 'OpenCode Dev.exe'
$cache = Join-Path $env:LOCALAPPDATA 'opencode-sidebar/downloads'
New-Item -ItemType Directory -Force $cache | Out-Null

if ($PackageDirectory) {
  $source = (Resolve-Path $PackageDirectory).Path
} else {
  $arguments = @('release', 'view', '--repo', $repo, '--json', 'tagName,isDraft')
  if ($Tag) { $arguments += $Tag }
  $release = (& gh @arguments | Out-String) | ConvertFrom-Json
  if ($LASTEXITCODE -ne 0 -or $release.isDraft -or $release.tagName -notmatch '^v2\.\d+\.\d+-sidebar\.\d+$') {
    throw 'No matching published sidebar release. Use -PackageDirectory for a downloaded Actions artifact.'
  }
  $Tag = $release.tagName
  $source = Join-Path $cache $Tag
  New-Item -ItemType Directory -Force $source | Out-Null
  & gh release download $Tag --repo $repo --dir $source --clobber --pattern '*.zip' --pattern 'SHA256SUMS' --pattern 'build-manifest.json'
  if ($LASTEXITCODE -ne 0) { throw 'Release download failed; installed app unchanged.' }
}

$manifestPath = Join-Path $source 'build-manifest.json'
$manifest = Get-Content $manifestPath -Raw | ConvertFrom-Json
if ($manifest.schemaVersion -ne 1 -or $manifest.forkCommit -notmatch '^[0-9a-f]{40}$' -or
    $manifest.artifact.name -notmatch '^opencode-sidebar-windows-x64-[0-9a-f]{12}\.zip$' -or
    $manifest.artifact.sha256 -notmatch '^[0-9a-f]{64}$') { throw 'Invalid build manifest.' }
$zip = Join-Path $source $manifest.artifact.name
$hash = (Get-FileHash $zip -Algorithm SHA256).Hash.ToLowerInvariant()
$checksums = Get-Content (Join-Path $source 'SHA256SUMS')
if ($hash -ne $manifest.artifact.sha256 -or "$hash  $($manifest.artifact.name)" -notin $checksums) {
  throw 'Package checksum mismatch; installed app unchanged.'
}

# Stage beside the destination so promotion uses same-volume directory renames.
$parent = Split-Path $destination
New-Item -ItemType Directory -Force $parent | Out-Null
$staged = "$destination.pending-$([guid]::NewGuid().ToString('N'))"
Expand-Archive $zip -DestinationPath $staged
$exe = Join-Path $staged $exeName
if (-not (Test-Path $exe) -or -not (Test-Path (Join-Path $staged 'resources/app.asar'))) {
  throw "Incomplete application package; inspect $staged"
}
Copy-Item $manifestPath (Join-Path $staged 'sidebar-build-manifest.json')
Write-Output "Verified build $($manifest.buildVersion), source $($manifest.forkCommit)."
if ($PrepareOnly) {
  Write-Output "Prepared: $staged (no application closed or installed)."
  return
}

$answer = Read-Host 'Install this build and gracefully close/reopen only OpenCode Dev? [y/N]'
if ($answer -notin @('y', 'yes')) { Write-Output "Cancelled. Prepared files: $staged"; return }

# An exact path allowlist prevents touching the official client or the background CLI/service.
$checkoutExe = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../../dist/desktop/app/OpenCode Dev.exe'))
$allowed = @((Join-Path $destination $exeName), $checkoutExe)
$processes = @(Get-CimInstance Win32_Process | Where-Object {
  $_.Name -eq $exeName -and $_.ExecutablePath -in $allowed -and $_.CommandLine -notmatch '--type='
})
$serviceFile = Join-Path $env:USERPROFILE '.local/state/opencode/service.json'
$before = if (Test-Path $serviceFile) { Get-Content $serviceFile -Raw }
foreach ($entry in $processes) {
  $process = Get-Process -Id $entry.ProcessId -ErrorAction SilentlyContinue
  if (-not $process) { continue }
  if (-not $process.CloseMainWindow()) { throw 'Cannot request normal close. Close OpenCode Dev manually and rerun.' }
  if (-not $process.WaitForExit(30000)) { throw 'OpenCode Dev is still open. Nothing installed; no forced termination.' }
}
# Wait for renderer/GPU processes to release the binaries too; never force-kill them.
$deadline = [DateTime]::UtcNow.AddSeconds(15)
do {
  $remaining = @(Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath -in $allowed })
  if ($remaining.Count -eq 0) { break }
  if ([DateTime]::UtcNow -ge $deadline) { throw 'Fork processes remain; close the fork manually and rerun.' }
  Start-Sleep -Milliseconds 250
} while ($true)

$backup = "$destination.previous-$([DateTime]::UtcNow.ToString('yyyyMMddHHmmss'))-$([guid]::NewGuid().ToString('N').Substring(0,8))"
$hadPrevious = Test-Path $destination
if ($hadPrevious) { Move-Item $destination $backup }
try {
  Move-Item $staged $destination
} catch {
  if ($hadPrevious -and -not (Test-Path $destination)) { Move-Item $backup $destination }
  throw
}
$installedExe = Join-Path $destination $exeName
$shortcutPath = Join-Path ([Environment]::GetFolderPath('Programs')) 'OpenCode Sidebar.lnk'
$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = $installedExe
$shortcut.WorkingDirectory = $destination
$shortcut.Save()
Start-Process -FilePath $installedExe
if ($before -and (Get-Content $serviceFile -Raw) -ne $before) {
  Write-Warning 'The service registration changed during installation; inspect it. This script performs no service operations.'
}
Write-Output "Installed: $installedExe"
if ($hadPrevious) { Write-Output "Previous installation retained: $backup" }
