#Requires -Version 5.1
<#
.SYNOPSIS
    Restore LetsChat local data from a backup.

.DESCRIPTION
    Lists available backups, validates manifests/checksums, restores into
    temporary validation volumes, and optionally replaces the active volumes.

    Use -Drill to verify a backup without touching the active data.
    Use -ReplaceActive to overwrite the active volumes after validation.

.PARAMETER ActivePostgresVolume
    Override the active PostgreSQL volume name (default: letschat-postgres-data).

.PARAMETER ActiveMinioVolume
    Override the active MinIO volume name (default: letschat-minio-data).

.PARAMETER ActiveRedisVolume
    Override the active Redis volume name (default: letschat-redis-data).

.PARAMETER ActiveMailpitVolume
    Override the active Mailpit volume name (default: letschat-mailpit-data).

.PARAMETER Force
    Skip the interactive RESTORE confirmation prompt.

.PARAMETER ForceValidationFailureAfterCopy
    Test-only hook: force the post-replacement validation to fail so the
    rollback path can be exercised.
#>
param(
    [string]$BackupRoot = "$env:LOCALAPPDATA\LetsChat\backups",
    [string]$BackupPath,
    [switch]$List,
    [switch]$Drill,
    [switch]$ReplaceActive,
    [string]$ActivePostgresVolume = "letschat-postgres-data",
    [string]$ActiveMinioVolume = "letschat-minio-data",
    [string]$ActiveRedisVolume = "letschat-redis-data",
    [string]$ActiveMailpitVolume = "letschat-mailpit-data",
    [switch]$Force,
    [switch]$ForceEmergencyValidationFailure,
    [switch]$ForceValidationFailureAfterCopy
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

function Restore-TarArchive($backupDir, $archiveName, $volume) {
    $path = Join-Path $backupDir $archiveName
    if (-not (Test-Path $path)) {
        throw "Archive missing: $archiveName"
    }
    Invoke-Native docker @(
        "run", "--rm",
        "-v", "${volume}:/data",
        "-v", "${backupDir}:/backup:ro",
        "alpine",
        "tar", "xzf", "/backup/${archiveName}", "-C", "/data"
    )
}

function Test-MinioVolume($Volume) {
    $result = Invoke-DockerSilently -Arguments @("run", "--rm", "-v", "${Volume}:/data:ro", "alpine", "sh", "-c", "ls -A /data")
    if ($result.ExitCode -ne 0) { return $false }
    $items = @((($result.StdOut -split "`r?`n") | ForEach-Object { $_.Trim() } | Where-Object { $_ }))
    return ($items.Count -gt 0)
}

function Validate-RestoredPostgres($Container, $Manifest) {
    Write-Info "Verifying restored PostgreSQL data..."
    if (-not (Wait-PostgresReady -Container $Container -User "letschat" -Database "postgres")) {
        throw "Temporary PostgreSQL container $Container did not become ready"
    }
    $dbs = Get-DatabasesOnContainer -Container $Container
    if (-not $dbs -or ($dbs -notcontains $Manifest.database)) {
        throw "Expected database $($Manifest.database) not found in restored data"
    }
    if (-not (Test-HasRequiredTables -Container $Container -DatabaseName $Manifest.database)) {
        throw "Required tables missing in restored database"
    }
    $counts = Get-DatabaseCountsFromContainer -Container $Container -DatabaseName $Manifest.database
    Write-Info "Restored counts: users=$($counts.users) messages=$($counts.messages) attachments=$($counts.attachments) workspaces=$($counts.workspaces)"

    if ($Manifest.countsCollected -eq $false) {
        Write-Warn "Manifest explicitly records countsCollected=false; skipping count comparison."
        return
    }
    if ($Manifest.countsCollected -ne $true) {
        Write-Warn "Manifest does not explicitly record countsCollected=true; counts were not verified at backup time. Skipping count comparison for safety."
        return
    }

    foreach ($key in @("users", "messages", "attachments", "workspaces")) {
        if ($counts[$key] -ne $Manifest.counts.$key) {
            throw "Count mismatch for $key`: expected $($Manifest.counts.$key), got $($counts[$key])"
        }
    }
}

function Restore-ToTempVolumes($backupDir, $manifest, $suffix) {
    $pgVol = "letschat-restore-pg-$suffix"
    $minioVol = "letschat-restore-minio-$suffix"
    $redisVol = "letschat-restore-redis-$suffix"
    $mailpitVol = "letschat-restore-mailpit-$suffix"
    $container = "letschat-restore-pg-$suffix"
    $createdVolumes = @()
    $containerStarted = $false

    try {
        foreach ($v in @($pgVol, $minioVol, $redisVol, $mailpitVol)) {
            Invoke-Native docker @("volume", "create", $v) | Out-Null
            $createdVolumes += $v
        }

        Write-Info "Starting temporary PostgreSQL container $container (detached)..."
        Invoke-Native docker @(
            "run", "-d", "--name", $container,
            "-e", "POSTGRES_USER=letschat",
            "-e", "POSTGRES_PASSWORD=letschat",
            "-v", "${pgVol}:/var/lib/postgresql/data",
            "-v", "${backupDir}:/backup:ro",
            "postgres:15-alpine"
        ) | Out-Null
        $containerStarted = $true

        Write-Info "Waiting for temporary PostgreSQL to be ready (up to 60s)..."
        if (-not (Wait-PostgresReady -Container $container -User "letschat" -Database "postgres")) {
            Write-Err "Temporary PostgreSQL container failed readiness check. Container logs:"
            docker logs $container 2>&1 | ForEach-Object { Write-Err $_ }
            throw "Temporary PostgreSQL container did not become ready within timeout"
        }

        Write-Info "Creating target database and running pg_restore..."
        Invoke-Native docker @("exec", $container, "psql", "-U", "letschat", "-d", "postgres", "-c", "CREATE DATABASE letschat_local;")
        Invoke-Native docker @("exec", $container, "pg_restore", "-U", "letschat", "-d", "letschat_local", "--no-owner", "--no-acl", "/backup/letschat_local.dump")

        Validate-RestoredPostgres -Container $container -Manifest $manifest

        Invoke-Native docker @("stop", $container)
        Invoke-Native docker @("rm", $container)
        $containerStarted = $false

        Restore-TarArchive -backupDir $backupDir -archiveName "minio-data.tar.gz" -volume $minioVol
        Restore-TarArchive -backupDir $backupDir -archiveName "redis-data.tar.gz" -volume $redisVol
        Restore-TarArchive -backupDir $backupDir -archiveName "mailpit-data.tar.gz" -volume $mailpitVol

        if (-not (Test-MinioVolume $minioVol)) {
            throw "MinIO validation volume appears empty or unreadable"
        }

        Write-Ok "Temporary restore validation passed"
        return @{
            pgVolume      = $pgVol
            minioVolume   = $minioVol
            redisVolume   = $redisVol
            mailpitVolume = $mailpitVol
        }
    }
    finally {
        if ($containerStarted) {
            Remove-DockerContainer $container
        }
    }
}

function Remove-TempVolumes($volumes) {
    foreach ($v in @($volumes.pgVolume, $volumes.minioVolume, $volumes.redisVolume, $volumes.mailpitVolume)) {
        if ($v) {
            Remove-DockerVolume $v
        }
    }
}

function Test-VolumeNonEmpty($Volume) {
    $result = Invoke-DockerSilently -Arguments @("run", "--rm", "-v", "${Volume}:/vol:ro", "alpine", "sh", "-c", "find /vol -mindepth 1 -print -quit")
    return ($result.ExitCode -eq 0 -and $result.StdOut)
}

function Test-VolumeReadable($Volume) {
    $result = Invoke-DockerSilently -Arguments @("run", "--rm", "-v", "${Volume}:/vol:ro", "alpine", "sh", "-c", "ls /vol >/dev/null 2>&1")
    return ($result.ExitCode -eq 0)
}

function Reset-VolumeEmpty($Name) {
    Invoke-Native docker @("volume", "rm", $Name)
    Invoke-Native docker @("volume", "create", $Name)
}

function Invoke-EmergencyBackup($backupRoot, $pgVol, $minioVol, $redisVol, $mailpitVol) {
    $stableContainer = "letschat-postgres"
    $startedTemp = $false
    $tempContainer = $null
    $container = $null

    try {
        $runningId = (Invoke-DockerSilently -Arguments @("ps", "-q", "-f", "name=^${stableContainer}$")).StdOut
        if ($runningId) {
            $inspect = Invoke-DockerSilently -Arguments @("inspect", $stableContainer, "--format", "{{json .Mounts}}")
            $pgMount = $null
            if ($inspect.ExitCode -eq 0 -and $inspect.StdOut) {
                $mounts = $inspect.StdOut | ConvertFrom-Json
                $pgMount = $mounts | Where-Object { $_.Destination -eq "/var/lib/postgresql/data" } | Select-Object -ExpandProperty Name
            }
            if ($pgMount -eq $pgVol) {
                $container = $stableContainer
            }
            else {
                Write-Warn "Running postgres container is mounted to $pgMount, not $pgVol; using a separate temporary container for emergency backup."
            }
        }

        if (-not $container) {
            $startedTemp = $true
            $tempContainer = "letschat-emergency-pg-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
            $container = $tempContainer
            Invoke-Native docker @(
                "run", "-d", "--name", $container,
                "-e", "POSTGRES_USER=letschat",
                "-e", "POSTGRES_PASSWORD=letschat",
                "-v", "${pgVol}:/var/lib/postgresql/data",
                "postgres:15-alpine"
            )
            if (-not (Wait-PostgresReady -Container $container)) {
                throw "Emergency backup container did not become ready"
            }
        }

        & "$PSScriptRoot\backup-letschat-local-data.ps1" `
            -BackupRoot $backupRoot `
            -PostgresVolume $pgVol `
            -MinioVolume $minioVol `
            -RedisVolume $redisVol `
            -MailpitVolume $mailpitVol `
            -PostgresContainer $container
    }
    finally {
        if ($startedTemp -and $tempContainer) {
            Remove-DockerContainer $tempContainer
        }
    }
}

function Test-BackupManifestCounts {
    param(
        [Parameter(Mandatory)] [object]$Manifest,
        [switch]$RequireNonZero
    )
    if ($Manifest.countsCollected -ne $true) {
        throw "Emergency backup manifest is missing counts (countsCollected=$($Manifest.countsCollected))."
    }
    $countKeys = @("users", "messages", "attachments", "workspaces")
    foreach ($key in $countKeys) {
        if ($null -eq $Manifest.counts.$key) {
            throw "Emergency backup manifest is missing count for '$key'."
        }
    }
    if ($RequireNonZero -and ($Manifest.counts.users -le 0)) {
        throw "Emergency backup of populated installation reported zero users. Counts: $($Manifest.counts | ConvertTo-Json -Compress)"
    }
}

function Validate-EmergencyBackup {
    param(
        [Parameter(Mandatory)] [string]$BackupDir,
        [switch]$ExpectedPopulated,
        [switch]$ForceFailure
    )
    if ($ForceFailure) {
        throw "Forced emergency backup validation failure for testing."
    }
    $manifest = Validate-Backup $BackupDir
    Test-BackupManifestCounts -Manifest $manifest -RequireNonZero:$ExpectedPopulated

    Write-Info "Running isolated Drill restore of emergency backup..."
    $suffix = Get-Date -Format "yyyyMMdd-HHmmss"
    $tempVolumes = $null
    try {
        $tempVolumes = Restore-ToTempVolumes -backupDir $BackupDir -manifest $manifest -suffix "emergency-$suffix"
    }
    catch {
        throw "Emergency backup failed isolated Drill validation: $_"
    }
    finally {
        if ($tempVolumes) {
            Remove-TempVolumes $tempVolumes
        }
    }
    Write-Ok "Emergency backup validated: checksums, pg_restore readability, and counts match."
}

function Start-StackAndValidate($manifest, [switch]$RequireCountsMatch, [hashtable]$ActiveVolumes) {
    $expected = Get-LetsChatExpectedVolumes
    if (-not $ActiveVolumes) {
        $ActiveVolumes = @{}
        foreach ($key in $expected.Keys) { $ActiveVolumes[$key] = $expected[$key] }
    }

    $usingOverrides = $false
    foreach ($key in $expected.Keys) {
        if ($ActiveVolumes[$key] -ne $expected[$key]) { $usingOverrides = $true; break }
    }

    $pgContainer = "letschat-postgres"
    $minioVol = $ActiveVolumes.Minio

    if ($usingOverrides) {
        $pgContainer = "letschat-validate-pg"
        Remove-DockerContainer $pgContainer
        Invoke-Native docker @(
            "run", "-d", "--name", $pgContainer,
            "-p", "5434:5432",
            "-e", "POSTGRES_USER=letschat",
            "-e", "POSTGRES_PASSWORD=letschat",
            "-v", "$($ActiveVolumes.Postgres):/var/lib/postgresql/data",
            "postgres:15-alpine"
        ) | Out-Null
    }
    else {
        Invoke-Native docker @("compose", "up", "-d")
    }

    try {
        if (-not (Wait-PostgresReady -Container $pgContainer -User "letschat" -Database $manifest.database)) {
            return $false
        }
        $dbs = Get-DatabasesOnContainer -Container $pgContainer
        if (-not $dbs -or ($dbs -notcontains $manifest.database)) { return $false }
        if (-not (Test-HasRequiredTables -Container $pgContainer -DatabaseName $manifest.database)) { return $false }
        if ($RequireCountsMatch) {
            $counts = Get-DatabaseCountsFromContainer -Container $pgContainer -DatabaseName $manifest.database
            if (-not $counts) { return $false }
            foreach ($key in @("users", "messages", "attachments", "workspaces")) {
                if ($counts[$key] -ne $manifest.counts.$key) { return $false }
            }
        }
        $minioResult = Invoke-DockerSilently -Arguments @("run", "--rm", "-v", "${minioVol}:/data:ro", "alpine", "sh", "-c", "ls -A /data")
        if ($minioResult.ExitCode -ne 0) { return $false }
        $items = @((($minioResult.StdOut -split "`r?`n") | ForEach-Object { $_.Trim() } | Where-Object { $_ }))
        return ($items.Count -gt 0)
    }
    finally {
        if ($usingOverrides) {
            Remove-DockerContainer $pgContainer
        }
    }
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
        Write-Warn "This will replace the active volumes:"
        Write-Warn "  PostgreSQL: $ActivePostgresVolume"
        Write-Warn "  MinIO:      $ActiveMinioVolume"
        Write-Warn "  Redis:      $ActiveRedisVolume"
        Write-Warn "  Mailpit:    $ActiveMailpitVolume"

        if (-not $Force) {
            $confirm = Read-Host -Prompt "Type RESTORE to continue"
            if ($confirm -ne "RESTORE") {
                Write-Err "Restore cancelled"
                return
            }
        }

        $activeVolumes = [ordered]@{
            Postgres = $ActivePostgresVolume
            Minio    = $ActiveMinioVolume
            Redis    = $ActiveRedisVolume
            Mailpit  = $ActiveMailpitVolume
        }
        foreach ($v in $activeVolumes.Values) {
            if (-not (Test-DockerVolumeExists $v)) {
                throw "Active volume does not exist: $v"
            }
        }

        $emergencyRoot = Join-Path $BackupRoot "emergency"
        Write-Info "Creating emergency backup of active data..."
        Invoke-EmergencyBackup -backupRoot $emergencyRoot -pgVol $ActivePostgresVolume -minioVol $ActiveMinioVolume -redisVol $ActiveRedisVolume -mailpitVol $ActiveMailpitVolume

        $emergencyBackupDir = Get-ChildItem -Directory -Path $emergencyRoot -Filter "letschat-local-*" |
            Sort-Object CreationTime -Descending |
            Select-Object -First 1
        if (-not $emergencyBackupDir) {
            throw "Emergency backup was not created in $emergencyRoot"
        }
        Validate-EmergencyBackup -BackupDir $emergencyBackupDir.FullName -ExpectedPopulated -ForceFailure:$ForceEmergencyValidationFailure

        Write-Info "Stopping active containers..."
        Invoke-Native docker @("compose", "down")

        $rollbackSuffix = Get-Date -Format "yyyyMMdd-HHmmss"
        $rollbackVolumes = [ordered]@{
            Postgres = "${ActivePostgresVolume}-rollback-${rollbackSuffix}"
            Minio    = "${ActiveMinioVolume}-rollback-${rollbackSuffix}"
            Redis    = "${ActiveRedisVolume}-rollback-${rollbackSuffix}"
            Mailpit  = "${ActiveMailpitVolume}-rollback-${rollbackSuffix}"
        }

        Write-Info "Creating rollback volumes..."
        foreach ($v in $rollbackVolumes.Values) {
            Invoke-Native docker @("volume", "create", $v)
        }

        Write-Info "Cloning active volumes to rollback volumes..."
        Copy-DockerVolume -From $ActivePostgresVolume -To $rollbackVolumes.Postgres
        Copy-DockerVolume -From $ActiveMinioVolume -To $rollbackVolumes.Minio
        Copy-DockerVolume -From $ActiveRedisVolume -To $rollbackVolumes.Redis
        Copy-DockerVolume -From $ActiveMailpitVolume -To $rollbackVolumes.Mailpit

        Write-Info "Verifying rollback volumes..."
        if (-not (Test-VolumeNonEmpty $rollbackVolumes.Postgres)) {
            throw "Rollback Postgres volume appears empty"
        }
        if (-not (Test-VolumeNonEmpty $rollbackVolumes.Minio)) {
            throw "Rollback MinIO volume appears empty"
        }
        foreach ($key in @("Redis", "Mailpit")) {
            if (-not (Test-VolumeReadable $rollbackVolumes[$key])) {
                throw "Rollback $key volume is not readable"
            }
        }

        Write-Info "Recreating active volumes as empty..."
        Reset-VolumeEmpty $ActivePostgresVolume
        Reset-VolumeEmpty $ActiveMinioVolume
        Reset-VolumeEmpty $ActiveRedisVolume
        Reset-VolumeEmpty $ActiveMailpitVolume

        Write-Info "Copying validated restored state into active volumes..."
        Copy-DockerVolume -From $tempVolumes.pgVolume -To $ActivePostgresVolume
        Copy-DockerVolume -From $tempVolumes.minioVolume -To $ActiveMinioVolume
        Copy-DockerVolume -From $tempVolumes.redisVolume -To $ActiveRedisVolume
        Copy-DockerVolume -From $tempVolumes.mailpitVolume -To $ActiveMailpitVolume

        # Clean up temp volumes now that they have been copied.
        Remove-TempVolumes $tempVolumes
        $tempVolumes = $null

        Write-Info "Starting local stack and validating replacement..."
        if ($ForceValidationFailureAfterCopy) {
            Write-Warn "ForceValidationFailureAfterCopy is set; simulating validation failure."
            $validationOk = $false
        }
        else {
            $validationOk = Start-StackAndValidate -manifest $manifest -RequireCountsMatch -ActiveVolumes $activeVolumes
        }

        if (-not $validationOk) {
            Write-Err "Active volume replacement validation failed. Rolling back..."
            Invoke-Native docker @("compose", "down")

            Reset-VolumeEmpty $ActivePostgresVolume
            Reset-VolumeEmpty $ActiveMinioVolume
            Reset-VolumeEmpty $ActiveRedisVolume
            Reset-VolumeEmpty $ActiveMailpitVolume

            Copy-DockerVolume -From $rollbackVolumes.Postgres -To $ActivePostgresVolume
            Copy-DockerVolume -From $rollbackVolumes.Minio -To $ActiveMinioVolume
            Copy-DockerVolume -From $rollbackVolumes.Redis -To $ActiveRedisVolume
            Copy-DockerVolume -From $rollbackVolumes.Mailpit -To $ActiveMailpitVolume

            Write-Info "Starting stack and validating rollback..."
            if (-not (Start-StackAndValidate -manifest $manifest -ActiveVolumes $activeVolumes)) {
                throw "Rollback was applied but the stack could not be validated. Manual intervention required."
            }

            throw "Active volume replacement validation failed; rollback was applied. Rollback volumes: $($rollbackVolumes.Values -join ', ')"
        }

        Write-Ok "Active volumes replaced successfully. Rollback volumes: $($rollbackVolumes.Values -join ', ')"
    }
    else {
        Write-Info "Drill mode: active data was not modified."
        Write-Info "Cleaning up temporary validation volumes..."
        Remove-TempVolumes $tempVolumes
        $tempVolumes = $null
        Write-Ok "Restore drill completed successfully"
    }
}
catch {
    Write-Err "Restore failed: $_"
    exit 1
}
finally {
    if ($tempVolumes) {
        Remove-TempVolumes $tempVolumes
    }
}
