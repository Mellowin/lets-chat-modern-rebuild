#Requires -Version 5.1
<#
.SYNOPSIS
    Backup the local LetsChat PostgreSQL and MinIO data.

.DESCRIPTION
    Creates a timestamped backup under %LOCALAPPDATA%\LetsChat\backups\.
    Includes a manifest with counts, volume names and SHA-256 checksums.
    Retains the latest 14 successful backups.

    Works whether the normal PostgreSQL container is running or stopped. When
    stopped, a uniquely named temporary PostgreSQL 15 container is launched
    against the stable Postgres volume, then removed after the backup.

    MinIO is quiesced before the consistency window (PostgreSQL dump + MinIO
    archive) so the archive cannot capture a non-atomic mix of object and
    metadata state. MinIO is restarted only when it was running before backup.
#>
param(
    [string]$BackupRoot = "$env:LOCALAPPDATA\LetsChat\backups",
    [string]$PostgresVolume = "letschat-postgres-data",
    [string]$MinioVolume = "letschat-minio-data",
    [string]$RedisVolume = "letschat-redis-data",
    [string]$MailpitVolume = "letschat-mailpit-data",
    [string]$DatabaseName = "letschat_local",
    [string]$PostgresContainer,
    [switch]$SkipCounts
)

$ErrorActionPreference = "Stop"

Import-Module "$PSScriptRoot\lib\local-data-utils.psm1" -Force

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

function Stop-WriterContainers($names) {
    foreach ($name in $names) {
        Write-Info "Stopping writer container '$name'..."
        Invoke-Native docker @("stop", $name)
    }
}

function Start-WriterContainers($names) {
    foreach ($name in $names) {
        Write-Info "Restarting writer container '$name'..."
        Invoke-Native docker @("start", $name)
    }
}

function Get-ApiWriterContainers() {
    # The local API may run as a container named letschat-api or as a service in
    # the same compose project. Stop only clearly named API containers; never
    # stop unrelated project containers.
    $candidates = @("letschat-api")
    $found = @()
    foreach ($name in $candidates) {
        if (Test-DockerContainerRunning -Name $name) {
            $found += $name
        }
    }
    return $found
}

$backupDir = $null
$usingTempPg = $false
$pgContainer = $null
$minioContainers = @()
$apiContainers = @()
$minioWasRunning = $false
$consistencyStartedAt = $null
$consistencyCompletedAt = $null
$minioQuiesced = $false

try {
    if (-not (Test-DockerReady)) {
        throw "Docker Engine is not running. Start Docker Desktop first."
    }

    $timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
    $folderName = "letschat-local-$timestamp"
    $backupDir = Join-Path $BackupRoot $folderName
    New-Item -ItemType Directory -Path $backupDir -Force | Out-Null

    Write-Info "Backup destination: $backupDir"

    # Determine PostgreSQL container to use.
    $normalContainer = "letschat-postgres"
    if ($PostgresContainer) {
        if (-not (Test-DockerContainerRunning -Name $PostgresContainer)) {
            throw "Specified PostgreSQL container '$PostgresContainer' is not running."
        }
        Write-Info "Using caller-provided PostgreSQL container '$PostgresContainer'."
        $pgContainer = $PostgresContainer
    }
    elseif (Test-DockerContainerRunning -Name $normalContainer) {
        Write-Info "Using running PostgreSQL container '$normalContainer'."
        $pgContainer = $normalContainer
    }
    else {
        Write-Warn "Normal PostgreSQL container is not running. Starting a temporary backup container..."
        $pgContainer = "letschat-backup-pg-$timestamp"
        Start-BackupPostgres -ContainerName $pgContainer -SourceVolume $PostgresVolume | Out-Null
        $usingTempPg = $true
        Write-Ok "Temporary backup container '$pgContainer' is ready."
    }

    # Quiesce attachment writers before the consistency window.
    $minioContainers = @(Get-LetsChatRunningMinioContainersForVolume -Volume $MinioVolume)
    $minioWasRunning = $minioContainers.Count -gt 0
    $apiContainers = @(Get-ApiWriterContainers)

    if ($minioWasRunning -or $apiContainers.Count -gt 0) {
        $consistencyStartedAt = Get-Date -Format "o"
        Write-Info "Quiescing attachment writers before consistency window..."
        if ($minioContainers.Count -gt 0) {
            Stop-WriterContainers -names $minioContainers
        }
        if ($apiContainers.Count -gt 0) {
            Stop-WriterContainers -names $apiContainers
        }
        $minioQuiesced = $true
        Write-Ok "Attachment writers quiesced."
    }
    else {
        Write-Info "No running MinIO/API writer containers found for volume '$MinioVolume'; archive will be created from stopped volume."
    }

    # PostgreSQL dump
    Write-Info "Dumping PostgreSQL database $DatabaseName from '$pgContainer'..."
    $pgDumpPath = "/tmp/letschat-local-$timestamp.dump"
    Invoke-Native docker @("exec", $pgContainer, "pg_dump", "-U", "letschat", "-d", $DatabaseName, "-Fc", "-f", $pgDumpPath)
    $pgLocal = Join-Path $backupDir "letschat_local.dump"
    Invoke-Native docker @("cp", "${pgContainer}:${pgDumpPath}", $pgLocal)

    # MinIO
    Write-Info "Archiving MinIO data..."
    $minioTar = Join-Path $backupDir "minio-data.tar.gz"
    Invoke-Native docker @(
        "run", "--rm",
        "-v", "${MinioVolume}:/data:ro",
        "-v", "${backupDir}:/backup",
        "alpine",
        "tar", "czf", "/backup/minio-data.tar.gz", "-C", "/data", "."
    )

    $minioFileCount = Test-MinioArchiveSafe -ArchivePath $minioTar
    Write-Ok "MinIO archive validated: $minioFileCount file(s), no absolute paths."

    # Redis
    Write-Info "Archiving Redis data..."
    $redisTar = Join-Path $backupDir "redis-data.tar.gz"
    Invoke-Native docker @(
        "run", "--rm",
        "-v", "${RedisVolume}:/data:ro",
        "-v", "${backupDir}:/backup",
        "alpine",
        "tar", "czf", "/backup/redis-data.tar.gz", "-C", "/data", "."
    )

    # Mailpit
    Write-Info "Archiving Mailpit data..."
    $mailpitTar = Join-Path $backupDir "mailpit-data.tar.gz"
    Invoke-Native docker @(
        "run", "--rm",
        "-v", "${MailpitVolume}:/data:ro",
        "-v", "${backupDir}:/backup",
        "alpine",
        "tar", "czf", "/backup/mailpit-data.tar.gz", "-C", "/data", "."
    )

    if ($minioQuiesced) {
        $consistencyCompletedAt = Get-Date -Format "o"
    }

    $counts = [ordered]@{
        users = 0
        messages = 0
        attachments = 0
        workspaces = 0
    }
    $countsCollected = $false
    if (-not $SkipCounts) {
        Write-Info "Collecting database counts from '$pgContainer'..."
        $dbCounts = Get-DatabaseCountsFromContainer -Container $pgContainer -DatabaseName $DatabaseName
        if (-not $dbCounts) {
            throw "Could not collect database counts from '$pgContainer'."
        }
        foreach ($key in @($counts.Keys)) {
            if ($dbCounts.ContainsKey($key)) {
                $counts[$key] = $dbCounts[$key]
            }
        }
        $countsCollected = $true
    }

    # Checksums
    $files = @(
        @{ name = "letschat_local.dump"; path = $pgLocal },
        @{ name = "minio-data.tar.gz"; path = $minioTar },
        @{ name = "redis-data.tar.gz"; path = $redisTar },
        @{ name = "mailpit-data.tar.gz"; path = $mailpitTar }
    )

    $manifestFiles = foreach ($f in $files) {
        $item = Get-Item -LiteralPath $f.path
        [ordered]@{
            name = $f.name
            size = $item.Length
            sha256 = Get-Sha256 $f.path
        }
    }

    $manifest = [ordered]@{
        timestamp = (Get-Date -Format "o")
        database = $DatabaseName
        postgresVolume = $PostgresVolume
        minioVolume = $MinioVolume
        redisVolume = $RedisVolume
        mailpitVolume = $MailpitVolume
        countsCollected = $countsCollected
        counts = $counts
        minioQuiesced = $minioQuiesced
        minioWasRunning = $minioWasRunning
        minioFileCount = $minioFileCount
        minioArchiveSha256 = ($manifestFiles | Where-Object { $_.name -eq "minio-data.tar.gz" }).sha256
        consistencyStartedAt = $consistencyStartedAt
        consistencyCompletedAt = $consistencyCompletedAt
        files = $manifestFiles
    }

    $manifestPath = Join-Path $backupDir "manifest.json"
    $manifest | ConvertTo-Json -Depth 5 | Out-File -FilePath $manifestPath -Encoding utf8

    Write-Info "Wrote manifest: $manifestPath"

    # Validate checksums
    Write-Info "Validating checksums..."
    foreach ($f in $files) {
        $expected = ($manifestFiles | Where-Object { $_.name -eq (Split-Path $f.path -Leaf) }).sha256
        $actual = Get-Sha256 $f.path
        if ($expected -ne $actual) {
            throw "Checksum mismatch for $($f.name)"
        }
    }
    Write-Ok "All checksums valid"

    # Retention: keep latest 14
    $allBackups = Get-ChildItem -Directory -Path $BackupRoot -Filter "letschat-local-*" |
        Where-Object { Test-Path (Join-Path $_.FullName "manifest.json") } |
        Sort-Object CreationTime -Descending

    if ($allBackups.Count -gt 14) {
        $toRemove = $allBackups | Select-Object -Skip 14
        Write-Warn "Pruning $($toRemove.Count) old backup(s), keeping the latest 14"
        foreach ($old in $toRemove) {
            # Safety: never delete the only valid backup
            if ($allBackups.Count -le 1) { break }
            Remove-Item -LiteralPath $old.FullName -Recurse -Force
            $allBackups = $allBackups | Where-Object { $_.FullName -ne $old.FullName }
        }
    }

    Write-Ok "Backup complete: $backupDir"
    return $backupDir
}
catch {
    Write-Err "Backup failed: $_"
    if ($backupDir -and (Test-Path $backupDir)) {
        Write-Warn "Removing incomplete backup directory: $backupDir"
        Remove-Item -LiteralPath $backupDir -Recurse -Force -ErrorAction SilentlyContinue
    }
    exit 1
}
finally {
    if ($usingTempPg -and $pgContainer) {
        Stop-BackupPostgres -ContainerName $pgContainer | Out-Null
    }
    if ($minioWasRunning -and $minioContainers.Count -gt 0) {
        try {
            Start-WriterContainers -names $minioContainers
        }
        catch {
            Write-Err "CRITICAL: Backup completed but MinIO containers could not be restarted: $_"
        }
    }
    if ($apiContainers.Count -gt 0) {
        try {
            Start-WriterContainers -names $apiContainers
        }
        catch {
            Write-Err "CRITICAL: Backup completed but API writer containers could not be restarted: $_"
        }
    }
}
