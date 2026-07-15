#Requires -Version 5.1
<#
.SYNOPSIS
    Backup the local LetsChat PostgreSQL and MinIO data.

.DESCRIPTION
    Creates a timestamped backup under %LOCALAPPDATA%\LetsChat\backups\.
    Includes a manifest with counts, volume names and SHA-256 checksums.
    Retains the latest 14 successful backups.
#>
param(
    [string]$BackupRoot = "$env:LOCALAPPDATA\LetsChat\backups",
    [string]$PostgresVolume = "letschat-postgres-data",
    [string]$MinioVolume = "letschat-minio-data",
    [string]$RedisVolume = "letschat-redis-data",
    [string]$MailpitVolume = "letschat-mailpit-data",
    [string]$DatabaseName = "letschat_local",
    [switch]$SkipCounts
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

try {
    if (-not (Test-DockerReady)) {
        throw "Docker Engine is not running. Start Docker Desktop first."
    }

    $timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
    $folderName = "letschat-local-$timestamp"
    $backupDir = Join-Path $BackupRoot $folderName
    New-Item -ItemType Directory -Path $backupDir -Force | Out-Null

    Write-Info "Backup destination: $backupDir"

    # PostgreSQL
    Write-Info "Dumping PostgreSQL database $DatabaseName..."
    $pgDumpPath = "/tmp/letschat-local-$timestamp.dump"
    Invoke-Native docker @("exec", "letschat-postgres", "pg_dump", "-U", "letschat", "-d", $DatabaseName, "-Fc", "-f", $pgDumpPath)
    $pgLocal = Join-Path $backupDir "letschat_local.dump"
    Invoke-Native docker @("cp", "letschat-postgres:${pgDumpPath}", $pgLocal)

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

    # Counts
    $counts = [ordered]@{
        users = 0
        messages = 0
        attachments = 0
        workspaces = 0
    }
    if (-not $SkipCounts) {
        Write-Info "Collecting database counts..."
        $countSql = @"
SELECT 'users' AS k, count(*)::text AS v FROM "User"
UNION ALL
SELECT 'messages', count(*)::text FROM "Message"
UNION ALL
SELECT 'attachments', count(*)::text FROM "Attachment"
UNION ALL
SELECT 'workspaces', count(*)::text FROM "Workspace";
"@
        $tempSqlFile = Join-Path $env:TEMP "letschat-counts-$timestamp.sql"
        $countSql | Out-File -FilePath $tempSqlFile -Encoding utf8 -Force
        $containerSql = "/tmp/counts-$timestamp.sql"
        Invoke-Native docker @("cp", $tempSqlFile, "letschat-postgres:${containerSql}")
        $countResult = docker exec letschat-postgres psql -U letschat -d $DatabaseName -t -A -F"," -f $containerSql
        foreach ($line in $countResult -split "`r?`n") {
            $line = $line.Trim()
            if ($line -match "^(\w+),(\d+)$") {
                $counts[$matches[1]] = [int]$matches[2]
            }
        }
        Remove-Item -LiteralPath $tempSqlFile -Force -ErrorAction SilentlyContinue
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
        counts = $counts
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
