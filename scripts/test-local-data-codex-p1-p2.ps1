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
    [switch]$SkipReplaceMismatch,
    [switch]$SkipReplaceRollback,
    [switch]$SkipStableRecovery
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
        Invoke-DockerSilently -Arguments @("volume", "rm", $v) | Out-Null
    }
}

function Seed-TestDatabase($container, $databaseName, $attachmentKey, $email = "test@example.com") {
    if (-not (Wait-PostgresReady -Container $container)) { throw "Seed container $container not ready" }
    Invoke-Native docker @("exec", $container, "psql", "-U", "letschat", "-d", "postgres", "-c", "CREATE DATABASE `"$databaseName`";")
    $sql = @"
CREATE TABLE "User" (id serial primary key, email text);
CREATE TABLE "Message" (id serial primary key, body text);
CREATE TABLE "Attachment" (id serial primary key, key text, originalName text);
CREATE TABLE "Workspace" (id serial primary key, name text);
INSERT INTO "User" (email) VALUES ('$email');
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
    Invoke-DockerSilently -Arguments @("stop", $container) | Out-Null
    Invoke-DockerSilently -Arguments @("rm", "-f", $container) | Out-Null
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

function New-LegacyVolumeSet($project, $suffix) {
    $volumes = @{
        Postgres = "${project}_postgres-data"
        Minio    = "${project}_minio-data"
        Redis    = "${project}_redis-data"
        Mailpit  = "${project}_mailpit-data"
    }
    foreach ($k in $volumes.Keys) {
        $composeVolume = if ($k -eq 'Postgres') { 'postgres-data' } elseif ($k -eq 'Minio') { 'minio-data' } elseif ($k -eq 'Redis') { 'redis-data' } else { 'mailpit-data' }
        Invoke-Native docker @("volume", "create", "--label", "com.docker.compose.volume=$composeVolume", "--label", "com.docker.compose.project=$project", $volumes[$k]) | Out-Null
    }
    return $volumes
}

function Remove-LegacyVolumes($volumes) {
    foreach ($v in $volumes.Values) {
        docker volume rm $v 2>$null | Out-Null
    }
}

function Test-ReplaceActiveRollbackAtStep {
    param(
        [Parameter(Mandatory)] [string]$Name,
        [Parameter(Mandatory)] [string]$FailureFlag
    )
    Run-Test $Name {
        $suffix = Get-Date -Format "yyyyMMdd-HHmmss-fff"
        $activeVolumes = New-TestVolumeSet "active-$suffix"
        $sourceVolumes = New-TestVolumeSet "source-$suffix"
        $activePgContainer = "test-codex-active-pg-$suffix"
        $activeMinioContainer = "test-codex-active-minio-$suffix"
        $sourcePgContainer = "test-codex-source-pg-$suffix"
        $sourceMinioContainer = "test-codex-source-minio-$suffix"
        $activeAttachmentKey = "attachments/active-$suffix.txt"
        $sourceAttachmentKey = "attachments/source-$suffix.txt"
        $activeBytes = [System.Text.Encoding]::UTF8.GetBytes("active-attachment-$suffix")
        $sourceBytes = [System.Text.Encoding]::UTF8.GetBytes("source-attachment-$suffix")

        try {
            Start-TestPostgres -container $activePgContainer -volume $activeVolumes.Postgres
            Start-TestMinio -container $activeMinioContainer -volume $activeVolumes.Minio
            Seed-TestDatabase -container $activePgContainer -databaseName "letschat_local" -attachmentKey $activeAttachmentKey -email "active-$suffix@example.com"
            Add-MinioTestObject -volume $activeVolumes.Minio -key $activeAttachmentKey -bytes $activeBytes

            Start-TestPostgres -container $sourcePgContainer -volume $sourceVolumes.Postgres
            Start-TestMinio -container $sourceMinioContainer -volume $sourceVolumes.Minio
            Seed-TestDatabase -container $sourcePgContainer -databaseName "letschat_local" -attachmentKey $sourceAttachmentKey -email "source-$suffix@example.com"
            Add-MinioTestObject -volume $sourceVolumes.Minio -key $sourceAttachmentKey -bytes $sourceBytes

            $backupRoot = Join-Path $env:TEMP "codex-replace-backup-$suffix"
            $backupScript = Join-Path $PSScriptRoot "backup-letschat-local-data.ps1"
            & $backupScript `
                -BackupRoot $backupRoot `
                -PostgresContainer $sourcePgContainer `
                -PostgresVolume $sourceVolumes.Postgres `
                -MinioVolume $sourceVolumes.Minio `
                -RedisVolume $sourceVolumes.Redis `
                -MailpitVolume $sourceVolumes.Mailpit
            if ($global:LASTEXITCODE -ne 0) { throw "Source backup failed with code $($global:LASTEXITCODE)" }

            $latest = Get-ChildItem -Directory -Path $backupRoot -Filter "letschat-local-*" |
                Sort-Object CreationTime -Descending | Select-Object -First 1

            $restoreScript = Join-Path $PSScriptRoot "restore-letschat-local-data.ps1"
            $restoreArgs = @{
                BackupPath           = $latest.FullName
                ReplaceActive        = $true
                Force                = $true
                ActivePostgresVolume = $activeVolumes.Postgres
                ActiveMinioVolume    = $activeVolumes.Minio
                ActiveRedisVolume    = $activeVolumes.Redis
                ActiveMailpitVolume  = $activeVolumes.Mailpit
            }
            switch ($FailureFlag) {
                "-ForceFailureAfterReset"        { $restoreArgs['ForceFailureAfterReset'] = $true }
                "-ForceFailureAfterPgCopy"       { $restoreArgs['ForceFailureAfterPgCopy'] = $true }
                "-ForceFailureAfterMinioCopy"    { $restoreArgs['ForceFailureAfterMinioCopy'] = $true }
                "-ForceFailureAfterRedisCopy"    { $restoreArgs['ForceFailureAfterRedisCopy'] = $true }
                "-ForceFailureAfterMailpitCopy"  { $restoreArgs['ForceFailureAfterMailpitCopy'] = $true }
                "-ForceFailureAfterStackStart"   { $restoreArgs['ForceFailureAfterStackStart'] = $true }
                "-ForceValidationFailureAfterCopy" { $restoreArgs['ForceValidationFailureAfterCopy'] = $true }
            }
            $restoreOutput = & $restoreScript @restoreArgs *>&1
            $restoreExit = $global:LASTEXITCODE
            Assert ($restoreExit -ne 0) "Expected ReplaceActive to fail with $FailureFlag"
            Assert (($restoreOutput | Out-String) -match "rolled back") "Expected rollback message in output"

            # The rollback routine leaves the replacement validation container running; query it directly.
            $counts = Get-DatabaseCountsFromContainer -Container "letschat-validate-pg" -DatabaseName "letschat_local"
            Assert ($counts.users -eq 1) "Expected 1 user after rollback, got $($counts.users)"
            Assert ($counts.attachments -eq 1) "Expected 1 attachment after rollback, got $($counts.attachments)"

            $restoredBytes = Get-MinioObjectBytes -volume $activeVolumes.Minio -key $activeAttachmentKey
            Assert (([System.Text.Encoding]::UTF8.GetString($restoredBytes)) -eq ([System.Text.Encoding]::UTF8.GetString($activeBytes))) "Active attachment bytes were not restored after rollback"
        }
        finally {
            Stop-TestContainer $activePgContainer
            Stop-TestContainer $activeMinioContainer
            Stop-TestContainer $sourcePgContainer
            Stop-TestContainer $sourceMinioContainer
            Stop-ContainersUsingVolume $activeVolumes.Postgres
            Stop-ContainersUsingVolume $activeVolumes.Minio
            Stop-ContainersUsingVolume $activeVolumes.Redis
            Stop-ContainersUsingVolume $activeVolumes.Mailpit
            Stop-ContainersUsingVolume $sourceVolumes.Postgres
            Stop-ContainersUsingVolume $sourceVolumes.Minio
            Stop-ContainersUsingVolume $sourceVolumes.Redis
            Stop-ContainersUsingVolume $sourceVolumes.Mailpit
            Remove-TestVolumes $activeVolumes
            Remove-TestVolumes $sourceVolumes
            docker ps -a -q --filter "name=letschat-restore-*" | ForEach-Object { docker rm -f $_ 2>$null | Out-Null }
            docker volume ls -q | Where-Object { $_ -like "letschat-restore-*" } | ForEach-Object { docker volume rm $_ 2>$null | Out-Null }
            docker volume ls -q | Where-Object { $_ -like "letschat-emergency-*" } | ForEach-Object { docker volume rm $_ 2>$null | Out-Null }
        }
    }
}

function Test-ReplaceActiveRollbackFailure {
    Run-Test "Rollback failure is reported clearly and rollback volumes are preserved" {
        $suffix = Get-Date -Format "yyyyMMdd-HHmmss-fff"
        $activeVolumes = New-TestVolumeSet "active-$suffix"
        $sourceVolumes = New-TestVolumeSet "source-$suffix"
        $activePgContainer = "test-codex-rf-active-pg-$suffix"
        $activeMinioContainer = "test-codex-rf-active-minio-$suffix"
        $sourcePgContainer = "test-codex-rf-source-pg-$suffix"
        $sourceMinioContainer = "test-codex-rf-source-minio-$suffix"
        $activeAttachmentKey = "attachments/rf-active-$suffix.txt"
        $sourceAttachmentKey = "attachments/rf-source-$suffix.txt"
        $activeBytes = [System.Text.Encoding]::UTF8.GetBytes("rf-active-attachment-$suffix")
        $sourceBytes = [System.Text.Encoding]::UTF8.GetBytes("rf-source-attachment-$suffix")

        try {
            Start-TestPostgres -container $activePgContainer -volume $activeVolumes.Postgres
            Start-TestMinio -container $activeMinioContainer -volume $activeVolumes.Minio
            Seed-TestDatabase -container $activePgContainer -databaseName "letschat_local" -attachmentKey $activeAttachmentKey -email "rf-active-$suffix@example.com"
            Add-MinioTestObject -volume $activeVolumes.Minio -key $activeAttachmentKey -bytes $activeBytes

            Start-TestPostgres -container $sourcePgContainer -volume $sourceVolumes.Postgres
            Start-TestMinio -container $sourceMinioContainer -volume $sourceVolumes.Minio
            Seed-TestDatabase -container $sourcePgContainer -databaseName "letschat_local" -attachmentKey $sourceAttachmentKey -email "rf-source-$suffix@example.com"
            Add-MinioTestObject -volume $sourceVolumes.Minio -key $sourceAttachmentKey -bytes $sourceBytes

            $backupRoot = Join-Path $env:TEMP "codex-rf-backup-$suffix"
            $backupScript = Join-Path $PSScriptRoot "backup-letschat-local-data.ps1"
            & $backupScript `
                -BackupRoot $backupRoot `
                -PostgresContainer $sourcePgContainer `
                -PostgresVolume $sourceVolumes.Postgres `
                -MinioVolume $sourceVolumes.Minio `
                -RedisVolume $sourceVolumes.Redis `
                -MailpitVolume $sourceVolumes.Mailpit
            if ($global:LASTEXITCODE -ne 0) { throw "Source backup failed with code $($global:LASTEXITCODE)" }

            $latest = Get-ChildItem -Directory -Path $backupRoot -Filter "letschat-local-*" |
                Sort-Object CreationTime -Descending | Select-Object -First 1

            $restoreScript = Join-Path $PSScriptRoot "restore-letschat-local-data.ps1"
            $restoreOutput = & $restoreScript `
                -BackupPath $latest.FullName `
                -ReplaceActive `
                -Force `
                -ActivePostgresVolume $activeVolumes.Postgres `
                -ActiveMinioVolume $activeVolumes.Minio `
                -ActiveRedisVolume $activeVolumes.Redis `
                -ActiveMailpitVolume $activeVolumes.Mailpit `
                -ForceFailureAfterReset `
                -ForceRollbackFailure *>&1
            $restoreExit = $global:LASTEXITCODE
            Assert ($restoreExit -ne 0) "Expected ReplaceActive to fail"
            Assert ($restoreOutput -match "rollback also failed") "Expected rollback failure message"
            Assert ($restoreOutput -match "Manual intervention") "Expected manual intervention message"

            # Rollback volumes should still exist.
            $rollbackVolumes = @()
            docker volume ls -q | Where-Object { $_ -like "test-codex-*-active-*-rollback-*" } | ForEach-Object { $rollbackVolumes += $_ }
            Assert ($rollbackVolumes.Count -gt 0) "Expected rollback volumes to be preserved"
        }
        finally {
            Stop-TestContainer $activePgContainer
            Stop-TestContainer $activeMinioContainer
            Stop-TestContainer $sourcePgContainer
            Stop-TestContainer $sourceMinioContainer
            Stop-ContainersUsingVolume $activeVolumes.Postgres
            Stop-ContainersUsingVolume $activeVolumes.Minio
            Stop-ContainersUsingVolume $activeVolumes.Redis
            Stop-ContainersUsingVolume $activeVolumes.Mailpit
            Stop-ContainersUsingVolume $sourceVolumes.Postgres
            Stop-ContainersUsingVolume $sourceVolumes.Minio
            Stop-ContainersUsingVolume $sourceVolumes.Redis
            Stop-ContainersUsingVolume $sourceVolumes.Mailpit
            Remove-TestVolumes $activeVolumes
            Remove-TestVolumes $sourceVolumes
            docker ps -a -q --filter "name=letschat-restore-*" | ForEach-Object { docker rm -f $_ 2>$null | Out-Null }
            docker volume ls -q | Where-Object { $_ -like "letschat-restore-*" } | ForEach-Object { docker volume rm $_ 2>$null | Out-Null }
            docker volume ls -q | Where-Object { $_ -like "test-codex-*-rf-active-*-rollback-*" } | ForEach-Object { docker volume rm $_ 2>$null | Out-Null }
            docker volume ls -q | Where-Object { $_ -like "letschat-emergency-*" } | ForEach-Object { docker volume rm $_ 2>$null | Out-Null }
        }
    }
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

    Run-Test "Drill succeeds with an empty MinIO volume" {
        $suffix = Get-Date -Format "yyyyMMdd-HHmmss-fff"
        $volumes = New-TestVolumeSet $suffix
        $pgContainer = "test-codex-empty-minio-pg-$suffix"
        $minioContainer = "test-codex-empty-minio-$suffix"

        try {
            Start-TestPostgres -container $pgContainer -volume $volumes.Postgres
            Start-TestMinio -container $minioContainer -volume $volumes.Minio
            Seed-TestDatabase -container $pgContainer -databaseName "letschat_local" -attachmentKey "attachments/empty-minio-$suffix.txt"
            # Intentionally do NOT add any objects to MinIO.

            $backupRoot = Join-Path $env:TEMP "codex-empty-minio-backup-$suffix"
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
            Assert ($manifest.minioFileCount -ge 0) "Expected minioFileCount to be present and non-negative, got $($manifest.minioFileCount)"

            $restoreScript = Join-Path $PSScriptRoot "restore-letschat-local-data.ps1"
            & $restoreScript -BackupPath $latest.FullName -Drill
            if ($global:LASTEXITCODE -ne 0) { throw "Restore drill with empty MinIO failed with code $($global:LASTEXITCODE)" }
        }
        finally {
            Stop-TestContainer $pgContainer
            Stop-TestContainer $minioContainer
            docker ps -a -q --filter "name=letschat-restore-*" | ForEach-Object { docker rm -f $_ 2>$null | Out-Null }
            docker volume ls -q | Where-Object { $_ -like "letschat-restore-*" } | ForEach-Object { docker volume rm $_ 2>$null | Out-Null }
            Remove-TestVolumes $volumes
        }
    }

    Run-Test "ReplaceActive succeeds with empty MinIO volumes" {
        $suffix = Get-Date -Format "yyyyMMdd-HHmmss-fff"
        $activeVolumes = New-TestVolumeSet "active-empty-$suffix"
        $sourceVolumes = New-TestVolumeSet "source-empty-$suffix"
        $activePgContainer = "test-codex-empty-replace-active-pg-$suffix"
        $activeMinioContainer = "test-codex-empty-replace-active-minio-$suffix"
        $sourcePgContainer = "test-codex-empty-replace-source-pg-$suffix"
        $sourceMinioContainer = "test-codex-empty-replace-source-minio-$suffix"

        try {
            Start-TestPostgres -container $activePgContainer -volume $activeVolumes.Postgres
            Start-TestMinio -container $activeMinioContainer -volume $activeVolumes.Minio
            Seed-TestDatabase -container $activePgContainer -databaseName "letschat_local" -attachmentKey "attachments/active-empty-$suffix.txt" -email "active-empty-$suffix@example.com"

            Start-TestPostgres -container $sourcePgContainer -volume $sourceVolumes.Postgres
            Start-TestMinio -container $sourceMinioContainer -volume $sourceVolumes.Minio
            Seed-TestDatabase -container $sourcePgContainer -databaseName "letschat_local" -attachmentKey "attachments/source-empty-$suffix.txt" -email "source-empty-$suffix@example.com"

            $backupRoot = Join-Path $env:TEMP "codex-empty-replace-backup-$suffix"
            $backupScript = Join-Path $PSScriptRoot "backup-letschat-local-data.ps1"
            & $backupScript `
                -BackupRoot $backupRoot `
                -PostgresContainer $sourcePgContainer `
                -PostgresVolume $sourceVolumes.Postgres `
                -MinioVolume $sourceVolumes.Minio `
                -RedisVolume $sourceVolumes.Redis `
                -MailpitVolume $sourceVolumes.Mailpit
            if ($global:LASTEXITCODE -ne 0) { throw "Source backup failed with code $($global:LASTEXITCODE)" }

            $latest = Get-ChildItem -Directory -Path $backupRoot -Filter "letschat-local-*" |
                Sort-Object CreationTime -Descending | Select-Object -First 1

            $restoreScript = Join-Path $PSScriptRoot "restore-letschat-local-data.ps1"
            & $restoreScript `
                -BackupPath $latest.FullName `
                -ReplaceActive `
                -Force `
                -ActivePostgresVolume $activeVolumes.Postgres `
                -ActiveMinioVolume $activeVolumes.Minio `
                -ActiveRedisVolume $activeVolumes.Redis `
                -ActiveMailpitVolume $activeVolumes.Mailpit
            if ($global:LASTEXITCODE -ne 0) { throw "ReplaceActive with empty MinIO failed with code $($global:LASTEXITCODE)" }

            # Verify replacement state: the active Postgres now has the source user, MinIO is empty but readable.
            $counts = Get-DatabaseCountsFromContainer -Container "letschat-validate-pg" -DatabaseName "letschat_local"
            Assert ($counts.users -eq 1) "Expected 1 user after replacement, got $($counts.users)"
            Assert ($counts.attachments -eq 1) "Expected 1 attachment record after replacement, got $($counts.attachments)"
            Assert (Test-DockerVolumeExists $activeVolumes.Minio) "Active MinIO volume should exist"
            Assert (Test-VolumeReadable $activeVolumes.Minio) "Active MinIO volume should be readable"
        }
        finally {
            Stop-TestContainer $activePgContainer
            Stop-TestContainer $activeMinioContainer
            Stop-TestContainer $sourcePgContainer
            Stop-TestContainer $sourceMinioContainer
            Stop-ContainersUsingVolume $activeVolumes.Postgres
            Stop-ContainersUsingVolume $activeVolumes.Minio
            Stop-ContainersUsingVolume $activeVolumes.Redis
            Stop-ContainersUsingVolume $activeVolumes.Mailpit
            Stop-ContainersUsingVolume $sourceVolumes.Postgres
            Stop-ContainersUsingVolume $sourceVolumes.Minio
            Stop-ContainersUsingVolume $sourceVolumes.Redis
            Stop-ContainersUsingVolume $sourceVolumes.Mailpit
            Remove-TestVolumes $activeVolumes
            Remove-TestVolumes $sourceVolumes
            docker ps -a -q --filter "name=letschat-restore-*" | ForEach-Object { docker rm -f $_ 2>$null | Out-Null }
            docker ps -a -q --filter "name=letschat-validate-*" | ForEach-Object { docker rm -f $_ 2>$null | Out-Null }
            docker volume ls -q | Where-Object { $_ -like "letschat-restore-*" } | ForEach-Object { docker volume rm $_ 2>$null | Out-Null }
            docker volume ls -q | Where-Object { $_ -like "letschat-emergency-*" } | ForEach-Object { docker volume rm $_ 2>$null | Out-Null }
            docker volume ls -q | Where-Object { $_ -like "test-codex-*-active-empty-*-rollback-*" } | ForEach-Object { docker volume rm $_ 2>$null | Out-Null }
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
# P1 transactional ReplaceActive rollback tests
# ---------------------------------------------------------------------------
if (-not $SkipReplaceRollback) {
    Test-ReplaceActiveRollbackAtStep -Name "Rollback after active volume reset" -FailureFlag "-ForceFailureAfterReset"
    Test-ReplaceActiveRollbackAtStep -Name "Rollback after PostgreSQL copy" -FailureFlag "-ForceFailureAfterPgCopy"
    Test-ReplaceActiveRollbackAtStep -Name "Rollback after MinIO copy" -FailureFlag "-ForceFailureAfterMinioCopy"
    Test-ReplaceActiveRollbackAtStep -Name "Rollback after Redis copy" -FailureFlag "-ForceFailureAfterRedisCopy"
    Test-ReplaceActiveRollbackAtStep -Name "Rollback after Mailpit copy" -FailureFlag "-ForceFailureAfterMailpitCopy"
    Test-ReplaceActiveRollbackAtStep -Name "Rollback after replacement stack start" -FailureFlag "-ForceFailureAfterStackStart"
    Test-ReplaceActiveRollbackAtStep -Name "Rollback after replacement validation failure" -FailureFlag "-ForceValidationFailureAfterCopy"
    Test-ReplaceActiveRollbackFailure
}

# ---------------------------------------------------------------------------
# P1 stable volume preservation tests
# ---------------------------------------------------------------------------
if (-not $SkipStableRecovery) {
    Run-Test "Populated stable + missing marker + one legacy: marker recreated, no migration, legacy preserved" {
        $suffix = Get-Date -Format "yyyyMMdd-HHmmss-fff"
        $tempMarker = Join-Path $env:TEMP "test-marker-recovery-$suffix.json"
        $project = "test-marker-legacy-$suffix"
        $legacyVolumes = New-LegacyVolumeSet -project $project -suffix $suffix
        $legacyPgContainer = "test-marker-legacy-pg-$suffix"
        if (Test-Path $tempMarker) { Remove-Item $tempMarker -Force }
        try {
            Start-TestPostgres -container $legacyPgContainer -volume $legacyVolumes.Postgres
            Seed-TestDatabase -container $legacyPgContainer -databaseName "letschat_local" -attachmentKey "attachments/marker-legacy-$suffix.txt" -email "marker-legacy-$suffix@example.com"
            Stop-TestContainer $legacyPgContainer

            Install-LocalDataGuardrails -MarkerPath $tempMarker
            Assert (Test-Path $tempMarker) "Marker should have been recreated at temp path"
            $marker = Get-Content $tempMarker -Raw | ConvertFrom-Json
            Assert ($marker.databaseName -eq "letschat_local") "Marker databaseName should be letschat_local"
            Assert ($marker.postgresVolume -eq "letschat-postgres-data") "Marker postgresVolume should match production stable volume"
            Assert (Test-DockerVolumeExists $legacyVolumes.Postgres) "Legacy Postgres volume should be preserved"
        }
        finally {
            if (Test-Path $tempMarker) { Remove-Item $tempMarker -Force }
            Stop-TestContainer $legacyPgContainer
            Remove-LegacyVolumes $legacyVolumes
        }
    }

    Run-Test "Partial stable set aborts without modifying volumes" {
        $suffix = Get-Date -Format "yyyyMMdd-HHmmss-fff"
        $tempStableVolumes = [ordered]@{
            Postgres = "test-stable-pg-$suffix"
            Minio    = "test-stable-minio-$suffix"
            Redis    = "test-stable-redis-$suffix"
            Mailpit  = "test-stable-mailpit-$suffix"
        }
        Invoke-Native docker @("volume", "create", $tempStableVolumes.Minio) | Out-Null
        $tempMarker = Join-Path $env:TEMP "test-marker-partial-$suffix.json"
        if (Test-Path $tempMarker) { Remove-Item $tempMarker -Force }
        $failed = $false
        try {
            Install-LocalDataGuardrails -MarkerPath $tempMarker -StableVolumes $tempStableVolumes
        }
        catch {
            $failed = $true
        }
        finally {
            docker volume rm $tempStableVolumes.Minio 2>$null | Out-Null
            if (Test-Path $tempMarker) { Remove-Item $tempMarker -Force }
        }
        Assert $failed "Expected partial stable installation to abort"
        Assert (-not (Test-DockerVolumeExists $tempStableVolumes.Postgres)) "Postgres volume should not have been created"
    }

    Run-Test "No stable volumes + exactly one legacy: migration succeeds" {
        $suffix = Get-Date -Format "yyyyMMdd-HHmmss-fff"
        $project = "test-legacy-migration-$suffix"
        $legacyVolumes = New-LegacyVolumeSet -project $project -suffix $suffix
        $stableVolumes = [ordered]@{
            Postgres = "test-migrate-pg-$suffix"
            Minio    = "test-migrate-minio-$suffix"
            Redis    = "test-migrate-redis-$suffix"
            Mailpit  = "test-migrate-mailpit-$suffix"
        }
        $legacyPgContainer = "test-legacy-migrate-pg-$suffix"
        $legacyMinioContainer = "test-legacy-migrate-minio-$suffix"
        $attachmentKey = "attachments/legacy-migrate-$suffix.txt"
        $attachmentBytes = [System.Text.Encoding]::UTF8.GetBytes("legacy-migrate-$suffix")

        try {
            Start-TestPostgres -container $legacyPgContainer -volume $legacyVolumes.Postgres
            Start-TestMinio -container $legacyMinioContainer -volume $legacyVolumes.Minio
            Seed-TestDatabase -container $legacyPgContainer -databaseName "letschat_local" -attachmentKey $attachmentKey -email "legacy-migrate-$suffix@example.com"
            Add-MinioTestObject -volume $legacyVolumes.Minio -key $attachmentKey -bytes $attachmentBytes

            $legacy = Find-LegacyLetsChatVolumes -StableVolumes $stableVolumes.Values | Select-Object -First 1
            Assert ($legacy) "Expected one legacy candidate to be found"

            $migration = Migrate-LegacyToStable -Legacy $legacy -StableVolumes $stableVolumes
            Assert ($migration.SourceCounts.users -eq 1) "Expected source user count 1"
            Assert ($migration.DestCounts.users -eq 1) "Expected destination user count 1"
            Assert (Test-DockerVolumeExists $stableVolumes.Postgres) "Stable Postgres volume should exist after migration"
            Assert (Test-DockerVolumeExists $stableVolumes.Minio) "Stable MinIO volume should exist after migration"
        }
        finally {
            Stop-TestContainer $legacyPgContainer
            Stop-TestContainer $legacyMinioContainer
            Remove-LegacyVolumes $legacyVolumes
            foreach ($v in $stableVolumes.Values) { docker volume rm $v 2>$null | Out-Null }
        }
    }

    Run-Test "Migrate-LegacyToStable refuses to overlay existing destination volumes" {
        $suffix = Get-Date -Format "yyyyMMdd-HHmmss-fff"
        $project = "test-legacy-refuse-$suffix"
        $legacyVolumes = New-LegacyVolumeSet -project $project -suffix $suffix
        $stableVolumes = [ordered]@{
            Postgres = "test-refuse-pg-$suffix"
            Minio    = "test-refuse-minio-$suffix"
            Redis    = "test-refuse-redis-$suffix"
            Mailpit  = "test-refuse-mailpit-$suffix"
        }
        foreach ($v in $stableVolumes.Values) { Invoke-Native docker @("volume", "create", $v) | Out-Null }
        $legacyPgContainer = "test-legacy-refuse-pg-$suffix"

        try {
            Start-TestPostgres -container $legacyPgContainer -volume $legacyVolumes.Postgres
            Seed-TestDatabase -container $legacyPgContainer -databaseName "letschat_local" -attachmentKey "attachments/legacy-refuse-$suffix.txt" -email "legacy-refuse-$suffix@example.com"

            $legacy = Find-LegacyLetsChatVolumes -StableVolumes $stableVolumes.Values | Select-Object -First 1
            Assert ($legacy) "Expected one legacy candidate to be found"
            $failed = $false
            try {
                Migrate-LegacyToStable -Legacy $legacy -StableVolumes $stableVolumes
            }
            catch {
                $failed = $true
            }
            Assert $failed "Expected migration to refuse existing destination volumes"
        }
        finally {
            Stop-TestContainer $legacyPgContainer
            Remove-LegacyVolumes $legacyVolumes
            foreach ($v in $stableVolumes.Values) { docker volume rm $v 2>$null | Out-Null }
        }
    }

    Run-Test "No stable volumes + multiple legacy installations: startup aborts" {
        $suffix = Get-Date -Format "yyyyMMdd-HHmmss-fff"
        $project1 = "test-legacy-multi1-$suffix"
        $project2 = "test-legacy-multi2-$suffix"
        $legacyVolumes1 = New-LegacyVolumeSet -project $project1 -suffix $suffix
        $legacyVolumes2 = New-LegacyVolumeSet -project $project2 -suffix $suffix
        $stableVolumes = [ordered]@{
            Postgres = "test-multi-pg-$suffix"
            Minio    = "test-multi-minio-$suffix"
            Redis    = "test-multi-redis-$suffix"
            Mailpit  = "test-multi-mailpit-$suffix"
        }
        $legacyPgContainer1 = "test-legacy-multi1-pg-$suffix"
        $legacyPgContainer2 = "test-legacy-multi2-pg-$suffix"
        $tempMarker = Join-Path $env:TEMP "test-marker-multi-$suffix.json"
        if (Test-Path $tempMarker) { Remove-Item $tempMarker -Force }

        try {
            Start-TestPostgres -container $legacyPgContainer1 -volume $legacyVolumes1.Postgres
            Seed-TestDatabase -container $legacyPgContainer1 -databaseName "letschat_local" -attachmentKey "attachments/legacy-multi1-$suffix.txt" -email "legacy-multi1-$suffix@example.com"
            Start-TestPostgres -container $legacyPgContainer2 -volume $legacyVolumes2.Postgres
            Seed-TestDatabase -container $legacyPgContainer2 -databaseName "letschat_local" -attachmentKey "attachments/legacy-multi2-$suffix.txt" -email "legacy-multi2-$suffix@example.com"

            $failed = $false
            Install-LocalDataGuardrails -MarkerPath $tempMarker -StableVolumes $stableVolumes
        }
        catch {
            $failed = $true
        }
        finally {
            Stop-TestContainer $legacyPgContainer1
            Stop-TestContainer $legacyPgContainer2
            Remove-LegacyVolumes $legacyVolumes1
            Remove-LegacyVolumes $legacyVolumes2
            if (Test-Path $tempMarker) { Remove-Item $tempMarker -Force }
        }
        Assert $failed "Expected startup to abort when multiple legacy installations are found"
        Assert (-not (Test-DockerVolumeExists $stableVolumes.Postgres)) "Stable Postgres volume should not be created"
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
