#Requires -Version 5.1
<#
.SYNOPSIS
    Helpers for permanent local LetsChat data management.
#>

$script:InstallDir = Join-Path $env:LOCALAPPDATA "LetsChat"
$script:MarkerFile = Join-Path $script:InstallDir "installation.json"
$script:BackupRoot = Join-Path $script:InstallDir "backups"

$script:ExpectedVolumes = [ordered]@{
    Postgres = "letschat-postgres-data"
    Minio    = "letschat-minio-data"
    Redis    = "letschat-redis-data"
    Mailpit  = "letschat-mailpit-data"
}

function Get-LetsChatInstallMarkerPath { return $script:MarkerFile }
function Get-LetsChatBackupRoot { return $script:BackupRoot }
function Get-LetsChatExpectedVolumes { return $script:ExpectedVolumes }

function Test-DockerVolumeExists($Name) {
    $volumes = docker volume ls -q 2>$null
    return $volumes -contains $Name
}

function Get-LatestBackup {
    param([string]$Root = $script:BackupRoot)
    if (-not (Test-Path $Root)) { return $null }
    $latest = Get-ChildItem -Directory -Path $Root -Filter "letschat-local-*" |
        Where-Object { Test-Path (Join-Path $_.FullName "manifest.json") } |
        Sort-Object CreationTime -Descending |
        Select-Object -First 1
    return $latest
}

function Read-InstallMarker {
    if (-not (Test-Path $script:MarkerFile)) { return $null }
    try {
        return Get-Content $script:MarkerFile -Raw | ConvertFrom-Json
    }
    catch {
        return $null
    }
}

function Write-InstallMarker {
    param(
        [string]$InstallId = [guid]::NewGuid().ToString(),
        [string]$DatabaseName = "letschat_local"
    )
    if (-not (Test-Path $script:InstallDir)) {
        New-Item -ItemType Directory -Path $script:InstallDir -Force | Out-Null
    }
    $marker = [ordered]@{
        installId          = $InstallId
        postgresVolume     = $script:ExpectedVolumes.Postgres
        minioVolume        = $script:ExpectedVolumes.Minio
        redisVolume        = $script:ExpectedVolumes.Redis
        mailpitVolume      = $script:ExpectedVolumes.Mailpit
        databaseName       = $DatabaseName
        createdAt          = (Get-Date -Format "o")
        createdBy          = "start-local-dev.ps1"
        dataDirectory      = $script:InstallDir
    }
    $marker | ConvertTo-Json -Depth 3 | Out-File -FilePath $script:MarkerFile -Encoding utf8
    return $marker
}

enum MarkerStatus {
    Missing
    Valid
    VolumeMissing
    DatabaseEmpty
    MarkerCorrupt
}

function Test-InstallMarker {
    $marker = Read-InstallMarker
    if (-not $marker) {
        return [MarkerStatus]::Missing
    }
    if (-not $marker.postgresVolume -or -not $marker.minioVolume -or -not $marker.databaseName) {
        return [MarkerStatus]::MarkerCorrupt
    }

    $pgExists = Test-DockerVolumeExists $marker.postgresVolume
    $minioExists = Test-DockerVolumeExists $marker.minioVolume
    if (-not $pgExists -or -not $minioExists) {
        return [MarkerStatus]::VolumeMissing
    }

    # Try to read user count from the database.
    try {
        $tempSql = Join-Path $env:TEMP "letschat-marker-check-$(Get-Date -Format 'yyyyMMdd-HHmmss-fff').sql"
        'SELECT count(*)::text FROM "User";' | Out-File -FilePath $tempSql -Encoding utf8 -Force
        $containerSql = "/tmp/letschat-marker-check.sql"
        docker cp $tempSql "letschat-postgres:${containerSql}" | Out-Null
        $result = docker exec letschat-postgres psql -U letschat -d $marker.databaseName -t -A -f $containerSql 2>$null
        Remove-Item -LiteralPath $tempSql -Force -ErrorAction SilentlyContinue
        $count = [int]($result.Trim())
        if ($count -eq 0) {
            return [MarkerStatus]::DatabaseEmpty
        }
    }
    catch {
        return [MarkerStatus]::DatabaseEmpty
    }

    return [MarkerStatus]::Valid
}

function Get-DatabaseCounts {
    try {
        $tempSql = Join-Path $env:TEMP "letschat-counts-$(Get-Date -Format 'yyyyMMdd-HHmmss-fff').sql"
        @"
SELECT 'users',count(*)::text FROM "User"
UNION ALL SELECT 'messages',count(*)::text FROM "Message"
UNION ALL SELECT 'attachments',count(*)::text FROM "Attachment"
UNION ALL SELECT 'workspaces',count(*)::text FROM "Workspace";
"@ | Out-File -FilePath $tempSql -Encoding utf8 -Force

        $containerSql = "/tmp/letschat-counts.sql"
        docker cp $tempSql "letschat-postgres:${containerSql}" | Out-Null
        $result = docker exec letschat-postgres psql -U letschat -d letschat_local -t -A -F"," -f $containerSql
        Remove-Item -LiteralPath $tempSql -Force -ErrorAction SilentlyContinue

        $counts = @{}
        foreach ($line in $result -split "`r?`n") {
            $line = $line.Trim()
            if ($line -match "^(\w+),(\d+)$") {
                $counts[$matches[1]] = [int]$matches[2]
            }
        }
        return $counts
    }
    catch {
        return $null
    }
}

function Backup-LetsChatDataIfPopulated {
    param([string]$Reason = "pre-migration")
    $counts = Get-DatabaseCounts
    if (-not $counts -or $counts.users -eq 0) {
        return $null
    }
    Write-Host "Database appears populated (users=$($counts.users)). Creating a backup before proceeding ($Reason)..." -ForegroundColor Cyan
    $backupScript = Join-Path $PSScriptRoot "..\backup-letschat-local-data.ps1"
    & $backupScript
    if ($global:LASTEXITCODE -ne 0) {
        throw "Pre-migration backup failed. Aborting to avoid data loss."
    }
    return Get-LatestBackup
}

Export-ModuleMember -Function @(
    "Get-LetsChatInstallMarkerPath"
    "Get-LetsChatBackupRoot"
    "Get-LetsChatExpectedVolumes"
    "Test-DockerVolumeExists"
    "Get-LatestBackup"
    "Read-InstallMarker"
    "Write-InstallMarker"
    "Test-InstallMarker"
    "Get-DatabaseCounts"
    "Backup-LetsChatDataIfPopulated"
)
