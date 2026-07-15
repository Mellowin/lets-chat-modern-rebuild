#Requires -Version 5.1
<#
.SYNOPSIS
    Restore LetsChat local data from a backup.

.DESCRIPTION
    Lists available backups, validates manifests/checksums, restores into
    temporary validation volumes, and optionally replaces the active volumes.

    Use -Drill to verify a backup without touching the active data.
    Use -ReplaceActive to overwrite the active volumes after validation.
#>
param(
    [string]$BackupRoot = "$env:LOCALAPPDATA\LetsChat\backups",
    [string]$BackupPath,
    [switch]$List,
    [switch]$Drill,
    [switch]$ReplaceActive
)

$ErrorActionPreference = "Stop"

function Write-Info($msg) { Write-Host $msg -ForegroundColor Cyan }
function Write-Ok($msg) { Write-Host $msg -ForegroundColor Green }
function Write-Warn($msg) { Write-Host $msg -ForegroundColor Yellow }
function Write-Err($msg) { Write-Host $msg -ForegroundColor Red }

function Test-DockerReady() {
    try {
        $info = docker info 2>&1
        return ($info -match "Server:")
    }
    catch {
        return $false
    }
}

function Get-Sha256($path) {
    return (Get-FileHash -Path $path -Algorithm SHA256).Hash
}

function Invoke-Native($cmd, $argsArray) {
    $global:LASTEXITCODE = 0
    & $cmd @argsArray
    $exit = $global:LASTEXITCODE
    if ($exit -ne 0) {
        throw "Command '$cmd $argsArray' exited with code $exit"
    }
}

function Get-Backups() {
    if (-not (Test-Path $BackupRoot)) { return @() }
    return Get-ChildItem -Directory -Path $BackupRoot -Filter "letschat-local-*" |
        Where-Object { Test-Path (Join-Path $_.FullName "manifest.json") } |
        Sort-Object CreationTime -Descending
}

function Read-Manifest($backupDir) {
    $manifestPath = Join-Path $backupDir "manifest.json"
    if (-not (Test-Path $manifestPath)) {
        throw "Manifest not found: $manifestPath"
    }
    return Get-Content $manifestPath -Raw | ConvertFrom-Json
}

function Validate-Backup($backupDir) {
    Write-Info "Validating backup: $backupDir"
    $manifest = Read-Manifest $backupDir

    foreach ($file in $manifest.files) {
        $path = Join-Path $backupDir $file.name
        if (-not (Test-Path $path)) {
            throw "Backup file missing: $($file.name)"
        }
        if ((Get-Item $path).Length -ne $file.size) {
            throw "Backup file size mismatch for $($file.name)"
        }
        $actual = Get-Sha256 $path
        if ($actual -ne $file.sha256) {
            throw "Checksum mismatch for $($file.name)"
        }
    }
    Write-Ok "Backup manifest and checksums valid"
    return $manifest
}

function Restore-ToTempVolumes($backupDir, $manifest, $suffix) {
    $pgVol = "letschat-restore-pg-$suffix"
    $minioVol = "letschat-restore-minio-$suffix"

    Write-Info "Creating temporary validation volumes..."
    Invoke-Native docker @("volume", "create", $pgVol)
    Invoke-Native docker @("volume", "create", $minioVol)

    # Restore PostgreSQL dump into a temporary Postgres container.
    Write-Info "Restoring PostgreSQL into temporary volume..."
    $restoreContainer = "letschat-restore-pg-$suffix"
    Invoke-Native docker @(
        "run", "--rm", "--name", $restoreContainer,
        "-e", "POSTGRES_USER=letschat",
        "-e", "POSTGRES_PASSWORD=letschat",
        "-e", "POSTGRES_DB=letschat_local",
        "-v", "${pgVol}:/var/lib/postgresql/data",
        "-v", "${backupDir}:/backup:ro",
        "postgres:15-alpine"
    )
    # The container exits after init; start it briefly to restore the dump.
    Invoke-Native docker @("run", "-d", "--name", "${restoreContainer}-running", "-v", "${pgVol}:/var/lib/postgresql/data", "-v", "${backupDir}:/backup:ro", "postgres:15-alpine")
    Start-Sleep -Seconds 3
    Invoke-Native docker @("exec", "${restoreContainer}-running", "pg_restore", "-U", "letschat", "-d", "letschat_local", "--no-owner", "--no-acl", "/backup/letschat_local.dump")

    # Verify required tables exist and counts match manifest.
    Write-Info "Verifying restored PostgreSQL data..."
    $verifySql = "SELECT count(*) FROM \"User\"; SELECT count(*) FROM \"Message\"; SELECT count(*) FROM \"Attachment\";"
    $verifySql | Out-File -FilePath "$env:TEMP\verify-$suffix.sql" -Encoding utf8 -Force
    Invoke-Native docker @("cp", "$env:TEMP\verify-$suffix.sql", "${restoreContainer}-running:/tmp/verify.sql")
    $result = docker exec "${restoreContainer}-running" psql -U letschat -d letschat_local -t -A -f /tmp/verify.sql
    $counts = $result.Trim() -split "`r?`n" | ForEach-Object { $_.Trim() } | Where-Object { $_ -match "^\d+$" }
    Write-Info "Restored counts: User=$($counts[0]) Message=$($counts[1]) Attachment=$($counts[2])"

    Invoke-Native docker @("stop", "${restoreContainer}-running")
    Invoke-Native docker @("rm", "${restoreContainer}-running")

    # Restore MinIO archive into temp volume.
    Write-Info "Restoring MinIO archive into temporary volume..."
    Invoke-Native docker @(
        "run", "--rm",
        "-v", "${minioVol}:/data",
        "-v", "${backupDir}:/backup:ro",
        "alpine",
        "tar", "xzf", "/backup/minio-data.tar.gz", "-C", "/data"
    )
    Write-Info "Verifying MinIO archive readability..."
    Invoke-Native docker @(
        "run", "--rm",
        "-v", "${minioVol}:/data:ro",
        "alpine",
        "ls", "/data"
    ) | Out-Null

    Write-Ok "Temporary restore validation passed"
    return @{ pgVolume = $pgVol; minioVolume = $minioVol }
}

try {
    if (-not (Test-DockerReady)) {
        throw "Docker Engine is not running. Start Docker Desktop first."
    }

    $backups = Get-Backups

    if ($List -or (-not $BackupPath -and -not $Drill -and -not $ReplaceActive)) {
        Write-Info "Available backups in $BackupRoot"
        if ($backups.Count -eq 0) {
            Write-Warn "No backups found"
            return
        }
        foreach ($b in $backups) {
            $manifest = Read-Manifest $b.FullName
            $size = ($manifest.files | Measure-Object -Property size -Sum).Sum
            Write-Host "$($b.Name) | $($manifest.timestamp) | users=$($manifest.counts.users) msgs=$($manifest.counts.messages) size=$size"
        }
        return
    }

    if (-not $BackupPath) {
        if ($backups.Count -eq 0) {
            throw "No backups found in $BackupRoot"
        }
        $BackupPath = $backups[0].FullName
        Write-Info "Using latest backup: $BackupPath"
    }

    if (-not (Test-Path $BackupPath)) {
        throw "Backup path does not exist: $BackupPath"
    }

    $manifest = Validate-Backup $BackupPath
    $suffix = Get-Date -Format "yyyyMMdd-HHmmss"
    $tempVolumes = Restore-ToTempVolumes $BackupPath $manifest $suffix

    if ($ReplaceActive) {
        Write-Warn "This will replace the active PostgreSQL and MinIO volumes."
        $confirm = Read-Host -Prompt "Type RESTORE to continue"
        if ($confirm -ne "RESTORE") {
            Write-Err "Restore cancelled"
            return
        }

        # Emergency backup of active data.
        Write-Info "Creating emergency backup of active data..."
        & "$PSScriptRoot\backup-letschat-local-data.ps1" -BackupRoot "$BackupRoot\emergency" -SkipCounts

        # Stop active containers.
        Write-Info "Stopping active containers..."
        Invoke-Native docker @("compose", "down")

        # Snapshot current active volumes as rollback.
        $rollbackSuffix = Get-Date -Format "yyyyMMdd-HHmmss"
        $rollbackPg = "letschat-postgres-data-rollback-$rollbackSuffix"
        $rollbackMinio = "letschat-minio-data-rollback-$rollbackSuffix"
        Invoke-Native docker @("volume", "create", $rollbackPg)
        Invoke-Native docker @("volume", "create", $rollbackMinio)
        Invoke-Native docker @("run", "--rm", "-v", "letschat-postgres-data:/from", "-v", "${rollbackPg}:/to", "alpine", "cp", "-a", "/from/.", "/to/.")
        Invoke-Native docker @("run", "--rm", "-v", "letschat-minio-data:/from", "-v", "${rollbackMinio}:/to", "alpine", "cp", "-a", "/from/.", "/to/.")

        # Copy validated temp volumes into active volumes.
        Write-Info "Replacing active volumes with validated backup..."
        Invoke-Native docker @("run", "--rm", "-v", "$($tempVolumes.pgVolume):/from", "-v", "letschat-postgres-data:/to", "alpine", "cp", "-a", "/from/.", "/to/.")
        Invoke-Native docker @("run", "--rm", "-v", "$($tempVolumes.minioVolume):/from", "-v", "letschat-minio-data:/to", "alpine", "cp", "-a", "/from/.", "/to/.")

        # Clean up temp volumes.
        Invoke-Native docker @("volume", "rm", $tempVolumes.pgVolume)
        Invoke-Native docker @("volume", "rm", $tempVolumes.minioVolume)

        Write-Ok "Active volumes restored. Rollback: $rollbackPg, $rollbackMinio"
    }
    else {
        Write-Info "Drill mode: active data was not modified."
        Write-Info "Cleaning up temporary validation volumes..."
        Invoke-Native docker @("volume", "rm", $tempVolumes.pgVolume)
        Invoke-Native docker @("volume", "rm", $tempVolumes.minioVolume)
        Write-Ok "Restore drill completed successfully"
    }
}
catch {
    Write-Err "Restore failed: $_"
    exit 1
}
