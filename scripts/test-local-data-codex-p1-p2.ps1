#Requires -Version 5.1
<#
.SYNOPSIS
    Regression tests for Codex P1 (consistent MinIO backup) and P2 (manifest database name).

.DESCRIPTION
    Uses disposable Docker volumes and containers only. Never touches the stable
    LetsChat volumes or the permanent database.
#>
param(
    [switch]$SkipMinio,
    [switch]$SkipDatabaseName,
    [switch]$SkipReplaceMismatch
)

$ErrorActionPreference = "Stop"

$RepoRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $RepoRoot

Import-Module "$PSScriptRoot\lib\local-data-utils.psm1" -Force

function Write-Info($msg) { Write-Host $msg -ForegroundColor Cyan }
function Write-Ok($msg) { Write-Host $msg -ForegroundColor Green }
function Write-Warn($msg) { Write-Host $msg -ForegroundColor Yellow }
function Write-Err($msg) { Write-Host $msg -ForegroundColor Red }

$script:TestsPassed = 0
$script:TestsFailed = 0

function Assert($condition, $message) {
    if (-not $condition) { throw "ASSERTION FAILED: $message" }
}

function Run-Test($name, $scriptBlock) {
    Write-Info "`n=== TEST: $name ==="
    try {
        & $scriptBlock
        $script:TestsPassed++
        Write-Ok "PASS: $name"
    }
    catch {
        $script:TestsFailed++
        Write-Err "FAIL: $name - $_"
    }
}

function New-TestVolumeSet($suffix) {
    $volumes = @{
        Postgres = "test-codex-pg-$suffix"
        Minio    = "test-codex-minio-$suffix"
        Redis    = "test-codex-redis-$suffix"
        Mailpit  = "test-codex-mailpit-$suffix"
    }
    foreach ($v in $volumes.Values) {
        Invoke-Native docker @("volume", "create", $v) | Out-Null
    }
    return $volumes
}

function Remove-TestVolumes($volumes) {
    foreach ($v in $volumes.Values) {
        docker volume rm $v 2>$null | Out-Null
    }
}

function Seed-TestDatabase($container, $databaseName, $attachmentKey) {
    if (-not (Wait-PostgresReady -Container $container)) { throw "Seed container $container not ready" }
    Invoke-Native docker @("exec", $container, "psql", "-U", "letschat", "-d", "postgres", "-c", "CREATE DATABASE `"$databaseName`";")
    $sql = @"
CREATE TABLE "User" (id serial primary key, email text);
CREATE TABLE "Message" (id serial primary key, body text);
CREATE TABLE "Attachment" (id serial primary key, key text, originalName text);
CREATE TABLE "Workspace" (id serial primary key, name text);
INSERT INTO "User" (email) VALUES ('test@example.com');
INSERT INTO "Attachment" (key, originalName) VALUES ('$attachmentKey', 'known.txt');
"@
    $tempSql = Join-Path $env:TEMP "seed-$container.sql"
    try {
        $sql | Out-File -FilePath $tempSql -Encoding utf8 -Force
        $containerSql = "/tmp/seed.sql"
        Invoke-Native docker @("cp", $tempSql, "${container}:${containerSql}")
        Invoke-Native docker @("exec", $container, "psql", "-U", "letschat", "-d", $databaseName, "-f", $containerSql)
    }
    finally {
        Remove-Item -LiteralPath $tempSql -Force -ErrorAction SilentlyContinue
    }
}

function Start-TestPostgres($container, $volume) {
    Invoke-Native docker @(
        "run", "-d", "--name", $container,
        "-e", "POSTGRES_USER=letschat",
        "-e", "POSTGRES_PASSWORD=letschat",
        "-v", "${volume}:/var/lib/postgresql/data",
        "postgres:15-alpine"
    ) | Out-Null
}

function Start-TestMinio($container, $volume) {
    Invoke-Native docker @(
        "run", "-d", "--name", $container,
        "-e", "MINIO_ROOT_USER=minioadmin",
        "-e", "MINIO_ROOT_PASSWORD=minioadmin",
        "-v", "${volume}:/data",
        "minio/minio:latest",
        "server", "/data", "--console-address", ":9001"
    ) | Out-Null
}

function Stop-TestContainer($container) {
    docker stop $container 2>$null | Out-Null
    docker rm $container 2>$null | Out-Null
}

function Add-MinioTestObject($volume, $key, $bytes) {
    $tempFile = Join-Path $env:TEMP "minio-test-$key"
    $dir = Split-Path -Parent $tempFile
    if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
    [System.IO.File]::WriteAllBytes($tempFile, $bytes)
    try {
        Invoke-Native docker @(
            "run", "--rm",
            "-v", "${volume}:/data",
            "-v", "${tempFile}:/object:ro",
            "alpine",
            "sh", "-c", "mkdir -p `"/data/$(Split-Path -Parent $key)`" && cp /object `"/data/$key`""
        )
    }
    finally {
        Remove-Item -LiteralPath $tempFile -Force -ErrorAction SilentlyContinue
    }
}

function Get-MinioObjectBytes($volume, $key) {
    $result = Invoke-DockerSilently -Arguments @("run", "--rm", "-v", "${volume}:/data:ro", "alpine", "cat", "/data/$key")
    if ($result.ExitCode -ne 0) { throw "Could not read MinIO object /data/$key from volume $volume" }
    return [System.Text.Encoding]::UTF8.GetBytes($result.StdOut)
}

function Get-ContainerState($container) {
    $result = Invoke-DockerSilently -Arguments @("inspect", "--format", "{{.State.Status}}", $container)
    if ($result.ExitCode -ne 0) { return $null }
    return $result.StdOut.Trim()
}

function Test-BackupWithRunningMinio($databaseName = "letschat_local") {
    $suffix = Get-Date -Format "yyyyMMdd-HHmmss-fff"
    $volumes = New-TestVolumeSet $suffix
    $pgContainer = "test-codex-pg-$suffix"
    $minioContainer = "test-codex-minio-$suffix"
    $attachmentKey = "attachments/known-$suffix.txt"
    $originalBytes = [System.Text.Encoding]::UTF8.GetBytes("known-attachment-bytes-$suffix")

    try {
        Start-TestPostgres -container $pgContainer -volume $volumes.Postgres
        Start-TestMinio -container $minioContainer -volume $volumes.Minio
        Seed-TestDatabase -container $pgContainer -databaseName $databaseName -attachmentKey $attachmentKey
        Add-MinioTestObject -volume $volumes.Minio -key $attachmentKey -bytes $originalBytes

        $backupRoot = Join-Path $env:TEMP "codex-backup-$suffix"
        $backupScript = Join-Path $PSScriptRoot "backup-letschat-local-data.ps1"
        & $backupScript `
            -BackupRoot $backupRoot `
            -PostgresContainer $pgContainer `
            -PostgresVolume $volumes.Postgres `
            -MinioVolume $volumes.Minio `
            -RedisVolume $volumes.Redis `
            -MailpitVolume $volumes.Mailpit `
            -DatabaseName $databaseName
        if ($global:LASTEXITCODE -ne 0) { throw "Backup script exited with code $($global:LASTEXITCODE)" }

        $latest = Get-ChildItem -Directory -Path $backupRoot -Filter "letschat-local-*" |
            Sort-Object CreationTime -Descending | Select-Object -First 1
        Assert ($latest) "Backup was not created"
        $manifest = Get-Content (Join-Path $latest.FullName "manifest.json") -Raw | ConvertFrom-Json
        Assert ($manifest.minioQuiesced -eq $true) "minioQuiesced should be true"
        Assert ($manifest.minioWasRunning -eq $true) "minioWasRunning should be true"
        Assert ($manifest.minioFileCount -gt 0) "minioFileCount should be > 0"
        Assert ($manifest.minioArchiveSha256) "minioArchiveSha256 should be present"
        Assert ((Get-ContainerState $minioContainer) -eq "running") "MinIO container should be running after backup"

        return @{ BackupDir = $latest.FullName; Volumes = $volumes; AttachmentKey = $attachmentKey; OriginalBytes = $originalBytes; DatabaseName = $databaseName }
    }
    finally {
        Stop-TestContainer $pgContainer
        Stop-TestContainer $minioContainer
    }
}

# ---------------------------------------------------------------------------
# P1 tests
# ---------------------------------------------------------------------------
if (-not $SkipMinio) {
    Run-Test "Running MinIO is stopped before archive and restarted after successful backup" {
        $result = Test-BackupWithRunningMinio
        Remove-TestVolumes $result.Volumes
    }

    Run-Test "Originally stopped MinIO remains stopped" {
        $suffix = Get-Date -Format "yyyyMMdd-HHmmss-fff"
        $volumes = New-TestVolumeSet $suffix
        $pgContainer = "test-codex-stopped-pg-$suffix"
        $attachmentKey = "attachments/stopped-$suffix.txt"
        $originalBytes = [System.Text.Encoding]::UTF8.GetBytes("stopped-attachment-$suffix")

        try {
            Start-TestPostgres -container $pgContainer -volume $volumes.Postgres
            Seed-TestDatabase -container $pgContainer -databaseName "letschat_local" -attachmentKey $attachmentKey
            Add-MinioTestObject -volume $volumes.Minio -key $attachmentKey -bytes $originalBytes

            $backupRoot = Join-Path $env:TEMP "codex-stopped-backup-$suffix"
            $backupScript = Join-Path $PSScriptRoot "backup-letschat-local-data.ps1"
            & $backupScript `
                -BackupRoot $backupRoot `
                -PostgresContainer $pgContainer `
                -PostgresVolume $volumes.Postgres `
                -MinioVolume $volumes.Minio `
                -RedisVolume $volumes.Redis `
                -MailpitVolume $volumes.Mailpit
            if ($global:LASTEXITCODE -ne 0) { throw "Backup script exited with code $($global:LASTEXITCODE)" }

            $latest = Get-ChildItem -Directory -Path $backupRoot -Filter "letschat-local-*" |
                Sort-Object CreationTime -Descending | Select-Object -First 1
            $manifest = Get-Content (Join-Path $latest.FullName "manifest.json") -Raw | ConvertFrom-Json
            Assert ($manifest.minioQuiesced -eq $false) "minioQuiesced should be false for stopped MinIO"
            Assert ($manifest.minioWasRunning -eq $false) "minioWasRunning should be false for stopped MinIO"
        }
        finally {
            Stop-TestContainer $pgContainer
            Remove-TestVolumes $volumes
        }
    }

    Run-Test "Originally running MinIO is restarted after backup failure" {
        $suffix = Get-Date -Format "yyyyMMdd-HHmmss-fff"
        $volumes = New-TestVolumeSet $suffix
        $pgContainer = "test-codex-fail-pg-$suffix"
        $minioContainer = "test-codex-fail-minio-$suffix"
        $attachmentKey = "attachments/fail-$suffix.txt"
        $originalBytes = [System.Text.Encoding]::UTF8.GetBytes("fail-attachment-$suffix")

        try {
            Start-TestPostgres -container $pgContainer -volume $volumes.Postgres
            Start-TestMinio -container $minioContainer -volume $volumes.Minio
            Seed-TestDatabase -container $pgContainer -databaseName "letschat_local" -attachmentKey $attachmentKey
            Add-MinioTestObject -volume $volumes.Minio -key $attachmentKey -bytes $originalBytes

            $backupRoot = Join-Path $env:TEMP "codex-fail-backup-$suffix"
            $backupScript = Join-Path $PSScriptRoot "backup-letschat-local-data.ps1"
            & $backupScript `
                -BackupRoot $backupRoot `
                -PostgresContainer "does-not-exist-$suffix" `
                -PostgresVolume $volumes.Postgres `
                -MinioVolume $volumes.Minio `
                -RedisVolume $volumes.Redis `
                -MailpitVolume $volumes.Mailpit
            # Expected to fail because the Postgres volume does not exist.
            Assert ($global:LASTEXITCODE -ne 0) "Backup was expected to fail for missing Postgres volume"
            Assert ((Get-ContainerState $minioContainer) -eq "running") "MinIO container should be restarted after backup failure"
        }
        finally {
            Stop-TestContainer $pgContainer
            Stop-TestContainer $minioContainer
            Remove-TestVolumes $volumes
        }
    }

    Run-Test "Unrelated containers remain untouched during backup" {
        $suffix = Get-Date -Format "yyyyMMdd-HHmmss-fff"
        $volumes = New-TestVolumeSet $suffix
        $pgContainer = "test-codex-unrelated-pg-$suffix"
        $unrelatedContainer = "test-codex-unrelated-$suffix"
        $unrelatedVolume = "test-codex-unrelated-vol-$suffix"

        try {
            Invoke-Native docker @("volume", "create", $unrelatedVolume) | Out-Null
            Invoke-Native docker @("run", "-d", "--name", $unrelatedContainer, "-v", "${unrelatedVolume}:/data", "alpine", "sleep", "300") | Out-Null
            Start-TestPostgres -container $pgContainer -volume $volumes.Postgres
            Seed-TestDatabase -container $pgContainer -databaseName "letschat_local" -attachmentKey "attachments/u-$suffix.txt"

            $backupRoot = Join-Path $env:TEMP "codex-unrelated-backup-$suffix"
            $backupScript = Join-Path $PSScriptRoot "backup-letschat-local-data.ps1"
            & $backupScript `
                -BackupRoot $backupRoot `
                -PostgresContainer $pgContainer `
                -PostgresVolume $volumes.Postgres `
                -MinioVolume $volumes.Minio `
                -RedisVolume $volumes.Redis `
                -MailpitVolume $volumes.Mailpit
            if ($global:LASTEXITCODE -ne 0) { throw "Backup script exited with code $($global:LASTEXITCODE)" }

            Assert ((Get-ContainerState $unrelatedContainer) -eq "running") "Unrelated container should still be running"
        }
        finally {
            Stop-TestContainer $pgContainer
            Stop-TestContainer $unrelatedContainer
            docker volume rm $unrelatedVolume 2>$null | Out-Null
            Remove-TestVolumes $volumes
        }
    }

    Run-Test "Restored attachment bytes match the source" {
        $suffix = Get-Date -Format "yyyyMMdd-HHmmss-fff"
        $volumes = New-TestVolumeSet $suffix
        $pgContainer = "test-codex-bytes-pg-$suffix"
        $minioContainer = "test-codex-bytes-minio-$suffix"
        $attachmentKey = "attachments/bytes-$suffix.txt"
        $originalBytes = [System.Text.Encoding]::UTF8.GetBytes("original-attachment-bytes-$suffix")

        try {
            Start-TestPostgres -container $pgContainer -volume $volumes.Postgres
            Start-TestMinio -container $minioContainer -volume $volumes.Minio
            Seed-TestDatabase -container $pgContainer -databaseName "letschat_local" -attachmentKey $attachmentKey
            Add-MinioTestObject -volume $volumes.Minio -key $attachmentKey -bytes $originalBytes

            $backupRoot = Join-Path $env:TEMP "codex-bytes-backup-$suffix"
            $backupScript = Join-Path $PSScriptRoot "backup-letschat-local-data.ps1"
            & $backupScript `
                -BackupRoot $backupRoot `
                -PostgresContainer $pgContainer `
                -PostgresVolume $volumes.Postgres `
                -MinioVolume $volumes.Minio `
                -RedisVolume $volumes.Redis `
                -MailpitVolume $volumes.Mailpit
            if ($global:LASTEXITCODE -ne 0) { throw "Backup script exited with code $($global:LASTEXITCODE)" }

            $latest = Get-ChildItem -Directory -Path $backupRoot -Filter "letschat-local-*" |
                Sort-Object CreationTime -Descending | Select-Object -First 1

            $archivePath = Join-Path $latest.FullName "minio-data.tar.gz"
            $restoredMinioVol = "test-restored-minio-$suffix"
            Invoke-Native docker @("volume", "create", $restoredMinioVol) | Out-Null
            Invoke-Native docker @(
                "run", "--rm",
                "-v", "${archivePath}:/archive.tar.gz:ro",
                "-v", "${restoredMinioVol}:/data",
                "alpine",
                "tar", "xzf", "/archive.tar.gz", "-C", "/data"
            ) | Out-Null

            $restoredBytes = Get-MinioObjectBytes -volume $restoredMinioVol -key $attachmentKey
            Assert (([System.Text.Encoding]::UTF8.GetString($restoredBytes)) -eq ([System.Text.Encoding]::UTF8.GetString($originalBytes))) "Restored attachment bytes do not match"

            # Also verify the database dump restores via Drill (this validates the path through the restore script).
            $restoreScript = Join-Path $PSScriptRoot "restore-letschat-local-data.ps1"
            & $restoreScript -BackupPath $latest.FullName -Drill
            if ($global:LASTEXITCODE -ne 0) { throw "Restore drill failed with code $($global:LASTEXITCODE)" }
        }
        finally {
            Stop-TestContainer $pgContainer
            Stop-TestContainer $minioContainer
            # Clean up any leftover drill containers and volumes from this test.
            docker ps -a -q --filter "name=letschat-restore-*" | ForEach-Object { docker rm -f $_ 2>$null | Out-Null }
            docker volume ls -q | Where-Object { $_ -like "letschat-restore-*" } | ForEach-Object { docker volume rm $_ 2>$null | Out-Null }
            docker volume rm $restoredMinioVol 2>$null | Out-Null
            Remove-TestVolumes $volumes
        }
    }
}

# ---------------------------------------------------------------------------
# P2 tests
# ---------------------------------------------------------------------------
if (-not $SkipDatabaseName) {
    Run-Test "Default database name letschat_local restores successfully" {
        $suffix = Get-Date -Format "yyyyMMdd-HHmmss-fff"
        $volumes = New-TestVolumeSet $suffix
        $pgContainer = "test-codex-default-pg-$suffix"

        try {
            Start-TestPostgres -container $pgContainer -volume $volumes.Postgres
            Seed-TestDatabase -container $pgContainer -databaseName "letschat_local" -attachmentKey "attachments/default-$suffix.txt"
            Add-MinioTestObject -volume $volumes.Minio -key "attachments/dummy-$suffix.txt" -bytes ([System.Text.Encoding]::UTF8.GetBytes("dummy-$suffix"))

            $backupRoot = Join-Path $env:TEMP "codex-default-backup-$suffix"
            $backupScript = Join-Path $PSScriptRoot "backup-letschat-local-data.ps1"
            & $backupScript `
                -BackupRoot $backupRoot `
                -PostgresContainer $pgContainer `
                -PostgresVolume $volumes.Postgres `
                -MinioVolume $volumes.Minio `
                -RedisVolume $volumes.Redis `
                -MailpitVolume $volumes.Mailpit
            if ($global:LASTEXITCODE -ne 0) { throw "Backup failed with code $($global:LASTEXITCODE)" }

            $latest = Get-ChildItem -Directory -Path $backupRoot -Filter "letschat-local-*" |
                Sort-Object CreationTime -Descending | Select-Object -First 1
            $restoreScript = Join-Path $PSScriptRoot "restore-letschat-local-data.ps1"
            & $restoreScript -BackupPath $latest.FullName -Drill
            if ($global:LASTEXITCODE -ne 0) { throw "Drill failed with code $($global:LASTEXITCODE)" }
            Write-Ok "Default database Drill passed"
        }
        finally {
            Stop-TestContainer $pgContainer
            Remove-TestVolumes $volumes
        }
    }

    Run-Test "Alternate safe database name restores into exactly that database" {
        $suffix = Get-Date -Format "yyyyMMdd-HHmmss-fff"
        $dbName = "letschat_restore_test"
        $volumes = New-TestVolumeSet $suffix
        $pgContainer = "test-codex-alt-pg-$suffix"

        try {
            Start-TestPostgres -container $pgContainer -volume $volumes.Postgres
            Seed-TestDatabase -container $pgContainer -databaseName $dbName -attachmentKey "attachments/alt-$suffix.txt"
            Add-MinioTestObject -volume $volumes.Minio -key "attachments/dummy-$suffix.txt" -bytes ([System.Text.Encoding]::UTF8.GetBytes("dummy-$suffix"))

            $backupRoot = Join-Path $env:TEMP "codex-alt-backup-$suffix"
            $backupScript = Join-Path $PSScriptRoot "backup-letschat-local-data.ps1"
            & $backupScript `
                -BackupRoot $backupRoot `
                -PostgresContainer $pgContainer `
                -PostgresVolume $volumes.Postgres `
                -MinioVolume $volumes.Minio `
                -RedisVolume $volumes.Redis `
                -MailpitVolume $volumes.Mailpit `
                -DatabaseName $dbName
            if ($global:LASTEXITCODE -ne 0) { throw "Backup failed with code $($global:LASTEXITCODE)" }

            $latest = Get-ChildItem -Directory -Path $backupRoot -Filter "letschat-local-*" |
                Sort-Object CreationTime -Descending | Select-Object -First 1
            $restoreScript = Join-Path $PSScriptRoot "restore-letschat-local-data.ps1"
            & $restoreScript -BackupPath $latest.FullName -Drill -KeepDrill:$true
            if ($global:LASTEXITCODE -ne 0) { throw "Alternate-name Drill failed with code $($global:LASTEXITCODE)" }

            # Verify no unexpected letschat_local database was created in the drill container.
            $drillPg = @(docker ps -a --format "{{.Names}}" | Where-Object { $_ -like "letschat-restore-pg-*" } | Sort-Object -Descending | Select-Object -First 1)
            Assert ($drillPg[0]) "Drill PostgreSQL container not found"
            $dbs = Get-DatabasesOnContainer -Container $drillPg[0]
            Assert ($dbs -contains $dbName) "Alternate database $dbName not found"
            Assert (-not ($dbs -contains "letschat_local")) "Unexpected letschat_local database was created during alternate-name Drill"
        }
        finally {
            Stop-TestContainer $pgContainer
            # Remove any kept drill containers and volumes before the next test.
            docker ps -a -q --filter "name=letschat-restore-*" | ForEach-Object { docker rm -f $_ 2>$null | Out-Null }
            docker volume ls -q | Where-Object { $_ -like "letschat-restore-*" } | ForEach-Object { docker volume rm $_ 2>$null | Out-Null }
            Remove-TestVolumes $volumes
        }
    }

    Run-Test "Invalid database identifier is rejected before SQL mutation" {
        $suffix = Get-Date -Format "yyyyMMdd-HHmmss-fff"
        $dbName = "letschat_restore_test"
        $volumes = New-TestVolumeSet $suffix
        $pgContainer = "test-codex-invalid-pg-$suffix"

        try {
            Start-TestPostgres -container $pgContainer -volume $volumes.Postgres
            Seed-TestDatabase -container $pgContainer -databaseName $dbName -attachmentKey "attachments/invalid-$suffix.txt"

            $backupRoot = Join-Path $env:TEMP "codex-invalid-backup-$suffix"
            $backupScript = Join-Path $PSScriptRoot "backup-letschat-local-data.ps1"
            & $backupScript `
                -BackupRoot $backupRoot `
                -PostgresContainer $pgContainer `
                -PostgresVolume $volumes.Postgres `
                -MinioVolume $volumes.Minio `
                -RedisVolume $volumes.Redis `
                -MailpitVolume $volumes.Mailpit `
                -DatabaseName $dbName
            if ($global:LASTEXITCODE -ne 0) { throw "Backup failed with code $($global:LASTEXITCODE)" }

            $latest = Get-ChildItem -Directory -Path $backupRoot -Filter "letschat-local-*" |
                Sort-Object CreationTime -Descending | Select-Object -First 1
            $manifestPath = Join-Path $latest.FullName "manifest.json"
            $manifest = Get-Content $manifestPath -Raw | ConvertFrom-Json
            $manifest.database = 'bad; DROP DATABASE "User"; --'
            $manifest | ConvertTo-Json -Depth 5 | Out-File -FilePath $manifestPath -Encoding utf8

            $restoreScript = Join-Path $PSScriptRoot "restore-letschat-local-data.ps1"
            $restoreOutput = & $restoreScript -BackupPath $latest.FullName -Drill 6>&1
            $restoreExit = $global:LASTEXITCODE
            Assert ($restoreExit -ne 0) "Expected restore to reject invalid database name"
            Assert ($restoreOutput -match "safe PostgreSQL identifier") "Expected safe-identifier error message"
        }
        finally {
            Stop-TestContainer $pgContainer
            Remove-TestVolumes $volumes
        }
    }
}

if (-not $SkipReplaceMismatch) {
    Run-Test "ReplaceActive aborts before active changes when database name mismatches marker" {
        $suffix = Get-Date -Format "yyyyMMdd-HHmmss-fff"
        $dbName = "letschat_restore_test"
        $volumes = New-TestVolumeSet $suffix
        $pgContainer = "test-codex-mismatch-pg-$suffix"
        $minioContainer = "test-codex-mismatch-minio-$suffix"

        try {
            Start-TestPostgres -container $pgContainer -volume $volumes.Postgres
            Start-TestMinio -container $minioContainer -volume $volumes.Minio
            Seed-TestDatabase -container $pgContainer -databaseName $dbName -attachmentKey "attachments/mismatch-$suffix.txt"

            $backupRoot = Join-Path $env:TEMP "codex-mismatch-backup-$suffix"
            $backupScript = Join-Path $PSScriptRoot "backup-letschat-local-data.ps1"
            & $backupScript `
                -BackupRoot $backupRoot `
                -PostgresContainer $pgContainer `
                -PostgresVolume $volumes.Postgres `
                -MinioVolume $volumes.Minio `
                -RedisVolume $volumes.Redis `
                -MailpitVolume $volumes.Mailpit `
                -DatabaseName $dbName
            if ($global:LASTEXITCODE -ne 0) { throw "Backup failed with code $($global:LASTEXITCODE)" }

            $latest = Get-ChildItem -Directory -Path $backupRoot -Filter "letschat-local-*" |
                Sort-Object CreationTime -Descending | Select-Object -First 1

            $restoreScript = Join-Path $PSScriptRoot "restore-letschat-local-data.ps1"
            $restoreOutput = & $restoreScript `
                -BackupPath $latest.FullName `
                -ReplaceActive `
                -ActivePostgresVolume $volumes.Postgres `
                -ActiveMinioVolume $volumes.Minio `
                -ActiveRedisVolume $volumes.Redis `
                -ActiveMailpitVolume $volumes.Mailpit `
                -Force 6>&1
            $restoreExit = $global:LASTEXITCODE
            Assert ($restoreExit -ne 0) "Expected ReplaceActive to abort for database name mismatch"
            Assert ($restoreOutput -match "database mismatch") "Expected database mismatch error message"
            # Ensure active volumes were not wiped.
            Assert (Test-DockerVolumeExists $volumes.Postgres) "Active Postgres volume was unexpectedly removed"
            Assert (Test-DockerVolumeExists $volumes.Minio) "Active MinIO volume was unexpectedly removed"
        }
        finally {
            Stop-TestContainer $pgContainer
            Stop-TestContainer $minioContainer
            Remove-TestVolumes $volumes
        }
    }
}

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
Write-Info "`n=== Codex P1/P2 Test Summary ==="
Write-Ok "Passed: $($script:TestsPassed)"
if ($script:TestsFailed -gt 0) {
    Write-Err "Failed: $($script:TestsFailed)"
    exit 1
}
else {
    Write-Ok "All Codex P1/P2 tests passed."
}
