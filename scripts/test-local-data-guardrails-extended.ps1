#Requires -Version 5.1
<#
.SYNOPSIS
    Extended regression tests for local-data guardrails.

.DESCRIPTION
    Covers:
      - P1 structural marker validation vs. post-container database validation;
      - P2 stopped-stack backups using a temporary PostgreSQL container;
      - cold-start preflight behavior.

    Docker must be running. Some tests briefly create disposable Docker volumes
    and containers; everything is cleaned up in finally blocks.
#>
param(
    [switch]$SkipMarker,
    [switch]$SkipBackup
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
    $expected = Get-LetsChatExpectedVolumes
    $names = @{}
    foreach ($key in $expected.Keys) {
        $names[$key] = "test-guard-${key}-${suffix}".ToLower()
        Invoke-Native docker @("volume", "create", $names[$key]) | Out-Null
    }
    return $names
}

function Remove-TestVolumes($names) {
    foreach ($n in $names.Values) {
        Invoke-DockerSilently -Arguments @("volume", "rm", $n) | Out-Null
    }
}

function New-TestMarker($path, $volumeNames) {
    $marker = [ordered]@{
        installId      = [guid]::NewGuid().ToString()
        postgresVolume = $volumeNames.Postgres
        minioVolume    = $volumeNames.Minio
        redisVolume    = $volumeNames.Redis
        mailpitVolume  = $volumeNames.Mailpit
        databaseName   = "letschat_local"
        createdAt      = (Get-Date -Format "o")
        createdBy      = "test"
        dataDirectory  = $env:TEMP
    }
    $marker | ConvertTo-Json -Depth 3 | Out-File -FilePath $path -Encoding utf8
    return $marker
}

function Seed-TestDatabase($pgVolume) {
    $container = "test-seed-pg-$(Get-Date -Format 'yyyyMMdd-HHmmss-fff')"
    try {
        Invoke-Native docker @("run", "-d", "--name", $container,
            "-e", "POSTGRES_USER=letschat",
            "-e", "POSTGRES_PASSWORD=letschat",
            "-v", "${pgVolume}:/var/lib/postgresql/data",
            "postgres:15-alpine") | Out-Null
        if (-not (Wait-PostgresReady -Container $container)) { throw "Seed container not ready" }
        Invoke-Native docker @("exec", $container, "psql", "-U", "letschat", "-d", "postgres", "-c", "CREATE DATABASE letschat_local;")
        $sql = @'
CREATE TABLE "User" (id serial primary key, email text);
CREATE TABLE "Message" (id serial primary key, body text);
CREATE TABLE "Attachment" (id serial primary key, key text);
CREATE TABLE "Workspace" (id serial primary key, name text);
INSERT INTO "User" (email) VALUES ('test@example.com');
'@
        $tempSql = Join-Path $env:TEMP "seed-$container.sql"
        try {
            $sql | Out-File -FilePath $tempSql -Encoding utf8 -Force
            $containerSql = "/tmp/seed.sql"
            Invoke-Native docker @("cp", $tempSql, "${container}:${containerSql}")
            Invoke-Native docker @("exec", $container, "psql", "-U", "letschat", "-d", "letschat_local", "-f", $containerSql)
        }
        finally {
            Remove-Item -LiteralPath $tempSql -Force -ErrorAction SilentlyContinue
        }
        Invoke-Native docker @("exec", $container, "psql", "-U", "letschat", "-d", "letschat_local", "-c", "CHECKPOINT;")
    }
    finally {
        Remove-DockerContainer $container
    }
}

function Get-BackupCounts($backupDir) {
    $manifest = Get-Content (Join-Path $backupDir "manifest.json") -Raw | ConvertFrom-Json
    return $manifest.counts
}

# ---------------------------------------------------------------------------
# P1 marker / database separation
# ---------------------------------------------------------------------------
if (-not $SkipMarker) {
    Run-Test "Valid marker + volumes + absent container => preflight Valid" {
        $suffix = "$(Get-Date -Format 'yyyyMMdd-HHmmss-fff')-$([guid]::NewGuid().ToString().Substring(0,8))"
        $volumes = New-TestVolumeSet $suffix
        $markerPath = Join-Path $env:TEMP "marker-$suffix.json"
        New-TestMarker -path $markerPath -volumeNames $volumes | Out-Null
        try {
            $status = Test-InstallMarkerStructure -MarkerPath $markerPath
            Assert ($status -eq "Valid") "Expected Valid, got $status"
            $marker = Read-InstallMarker -MarkerPath $markerPath
            Assert (Test-ExpectedVolumes -Marker $marker -ExpectedVolumes $volumes) "Expected volumes to match marker"
        }
        finally {
            Remove-Item -LiteralPath $markerPath -Force -ErrorAction SilentlyContinue
            Remove-TestVolumes $volumes
        }
    }

    Run-Test "Valid marker + volumes + stopped container => preflight still Valid" {
        $suffix = "$(Get-Date -Format 'yyyyMMdd-HHmmss-fff')-$([guid]::NewGuid().ToString().Substring(0,8))"
        $volumes = New-TestVolumeSet $suffix
        $markerPath = Join-Path $env:TEMP "marker-$suffix.json"
        New-TestMarker -path $markerPath -volumeNames $volumes | Out-Null
        $container = "test-stopped-pg-$suffix"
        try {
            Invoke-Native docker @("run", "-d", "--name", $container,
                "-e", "POSTGRES_USER=letschat",
                "-e", "POSTGRES_PASSWORD=letschat",
                "-v", "$($volumes.Postgres):/var/lib/postgresql/data",
                "postgres:15-alpine") | Out-Null
            Start-Sleep -Seconds 2
            Invoke-Native docker @("stop", $container) | Out-Null
            $status = Test-InstallMarkerStructure -MarkerPath $markerPath
            Assert ($status -eq "Valid") "Expected Valid with stopped container, got $status"
        }
        finally {
            Remove-DockerContainer $container
            Remove-Item -LiteralPath $markerPath -Force -ErrorAction SilentlyContinue
            Remove-TestVolumes $volumes
        }
    }

    Run-Test "Valid marker + missing Postgres volume => VolumeMissing" {
        $suffix = "$(Get-Date -Format 'yyyyMMdd-HHmmss-fff')-$([guid]::NewGuid().ToString().Substring(0,8))"
        $volumes = New-TestVolumeSet $suffix
        $markerPath = Join-Path $env:TEMP "marker-$suffix.json"
        New-TestMarker -path $markerPath -volumeNames $volumes | Out-Null
        try {
            Invoke-DockerSilently -Arguments @("volume", "rm", $volumes.Postgres) | Out-Null
            $status = Test-InstallMarkerStructure -MarkerPath $markerPath
            Assert ($status -eq "VolumeMissing") "Expected VolumeMissing, got $status"
        }
        finally {
            Remove-Item -LiteralPath $markerPath -Force -ErrorAction SilentlyContinue
            Remove-TestVolumes $volumes
        }
    }

    Run-Test "Valid marker + missing MinIO volume => VolumeMissing" {
        $suffix = "$(Get-Date -Format 'yyyyMMdd-HHmmss-fff')-$([guid]::NewGuid().ToString().Substring(0,8))"
        $volumes = New-TestVolumeSet $suffix
        $markerPath = Join-Path $env:TEMP "marker-$suffix.json"
        New-TestMarker -path $markerPath -volumeNames $volumes | Out-Null
        try {
            Invoke-DockerSilently -Arguments @("volume", "rm", $volumes.Minio) | Out-Null
            $status = Test-InstallMarkerStructure -MarkerPath $markerPath
            Assert ($status -eq "VolumeMissing") "Expected VolumeMissing, got $status"
        }
        finally {
            Remove-Item -LiteralPath $markerPath -Force -ErrorAction SilentlyContinue
            Remove-TestVolumes $volumes
        }
    }

    Run-Test "Corrupt marker => MarkerCorrupt" {
        $suffix = "$(Get-Date -Format 'yyyyMMdd-HHmmss-fff')-$([guid]::NewGuid().ToString().Substring(0,8))"
        $markerPath = Join-Path $env:TEMP "marker-$suffix.json"
        "not valid json {" | Out-File -FilePath $markerPath -Encoding utf8 -NoNewline
        try {
            $status = Test-InstallMarkerStructure -MarkerPath $markerPath
            Assert ($status -eq "MarkerCorrupt") "Expected MarkerCorrupt, got $status"
        }
        finally {
            Remove-Item -LiteralPath $markerPath -Force -ErrorAction SilentlyContinue
        }
    }

    Run-Test "Marker volume names must match expected stable volumes" {
        $marker = [ordered]@{
            postgresVolume = "wrong-postgres-volume"
            minioVolume    = "wrong-minio-volume"
            redisVolume    = "wrong-redis-volume"
            mailpitVolume  = "wrong-mailpit-volume"
            databaseName   = "letschat_local"
        }
        Assert (-not (Test-ExpectedVolumes -Marker $marker)) "Expected volume mismatch"
        $expected = Get-LetsChatExpectedVolumes
        $goodMarker = [ordered]@{
            postgresVolume = $expected.Postgres
            minioVolume    = $expected.Minio
            redisVolume    = $expected.Redis
            mailpitVolume  = $expected.Mailpit
            databaseName   = "letschat_local"
        }
        Assert (Test-ExpectedVolumes -Marker $goodMarker) "Expected volumes to match stable names"
    }

    Run-Test "PostgreSQL readiness timeout => clear failure with logs" {
        $badContainer = "test-alpine-exit-$(Get-Date -Format 'yyyyMMdd-HHmmss-fff')"
        Invoke-Native docker @("run", "--name", $badContainer, "alpine", "echo", "no-postgres") | Out-Null
        try {
            $ready = Wait-PostgresReady -Container $badContainer -TimeoutSeconds 2
            Assert (-not $ready) "Expected readiness to fail for non-Postgres container"
            $threw = $false
            try {
                Confirm-RunningDatabaseState -Container $badContainer -TimeoutSeconds 2 | Out-Null
            }
            catch {
                $threw = $true
                Assert ($_ -match "did not become ready") "Expected readiness error, got: $_"
            }
            Assert $threw "Confirm-RunningDatabaseState should throw on readiness timeout"
        }
        finally {
            Remove-DockerContainer $badContainer
        }
    }

    Run-Test "Running populated database => counts returned" {
        $suffix = "$(Get-Date -Format 'yyyyMMdd-HHmmss-fff')-$([guid]::NewGuid().ToString().Substring(0,8))"
        $volumes = New-TestVolumeSet $suffix
        Seed-TestDatabase -pgVolume $volumes.Postgres
        $container = "test-populated-pg-$suffix"
        try {
            Invoke-Native docker @("run", "-d", "--name", $container,
                "-e", "POSTGRES_USER=letschat",
                "-e", "POSTGRES_PASSWORD=letschat",
                "-v", "$($volumes.Postgres):/var/lib/postgresql/data",
                "postgres:15-alpine") | Out-Null
            $counts = Confirm-RunningDatabaseState -Container $container -DatabaseName "letschat_local"
            Assert ($counts.users -eq 1) "Expected 1 user, got $($counts.users)"
            Assert ($counts.workspaces -eq 0) "Expected 0 workspaces from seed, got $($counts.workspaces)"
        }
        finally {
            Remove-DockerContainer $container
            Remove-TestVolumes $volumes
        }
    }

    Run-Test "Running empty database with valid marker => Confirm-RunningDatabaseState throws" {
        $suffix = "$(Get-Date -Format 'yyyyMMdd-HHmmss-fff')-$([guid]::NewGuid().ToString().Substring(0,8))"
        $volumes = New-TestVolumeSet $suffix
        $markerPath = Join-Path $env:TEMP "marker-$suffix.json"
        New-TestMarker -path $markerPath -volumeNames $volumes | Out-Null
        $container = "test-empty-pg-$suffix"
        try {
            Invoke-Native docker @("run", "-d", "--name", $container,
                "-e", "POSTGRES_USER=letschat",
                "-e", "POSTGRES_PASSWORD=letschat",
                "-v", "$($volumes.Postgres):/var/lib/postgresql/data",
                "postgres:15-alpine") | Out-Null
            $status = Test-InstallMarkerStructure -MarkerPath $markerPath
            Assert ($status -eq "Valid") "Preflight should be Valid for empty DB"
            $threw = $false
            try {
                Confirm-RunningDatabaseState -Container $container -DatabaseName "letschat_local" | Out-Null
            }
            catch {
                $threw = $true
            }
            Assert $threw "Confirm-RunningDatabaseState should throw for empty DB with valid marker"
        }
        finally {
            Remove-DockerContainer $container
            Remove-Item -LiteralPath $markerPath -Force -ErrorAction SilentlyContinue
            Remove-TestVolumes $volumes
        }
    }
}

# ---------------------------------------------------------------------------
# P2 stopped-stack backups
# ---------------------------------------------------------------------------
if (-not $SkipBackup) {
    function Ensure-StackRunningForBackup() {
        $running = docker ps -q -f "name=^letschat-postgres$" 2>$null
        if (-not $running) {
            Invoke-Native docker @("compose", "up", "-d", "postgres", "redis", "minio")
            if (-not (Wait-PostgresReady -Container "letschat-postgres" -Database "letschat_local" -TimeoutSeconds 90)) {
                throw "Stack postgres did not become ready"
            }
        }
    }

    Run-Test "Backup succeeds with running PostgreSQL container" {
        Ensure-StackRunningForBackup
        $backupRoot = Join-Path $env:TEMP "backup-test-$(Get-Date -Format 'yyyyMMdd-HHmmss-fff')"
        $backupScript = Join-Path $PSScriptRoot "backup-letschat-local-data.ps1"
        try {
            & $backupScript -BackupRoot $backupRoot
            Assert ($global:LASTEXITCODE -eq 0) "Backup script exited with code $($global:LASTEXITCODE)"
            $latest = Get-LatestBackup -Root $backupRoot
            Assert ($latest) "No backup was created"
            Assert (Test-Path (Join-Path $latest.FullName "manifest.json")) "Manifest missing"
            Assert (Test-Path (Join-Path $latest.FullName "letschat_local.dump")) "PostgreSQL dump missing"
            $manifest = Get-Content (Join-Path $latest.FullName "manifest.json") -Raw | ConvertFrom-Json
            Assert ($manifest.files.Count -eq 4) "Expected 4 archived files, got $($manifest.files.Count)"
            foreach ($f in $manifest.files) {
                $actual = Get-FileHash (Join-Path $latest.FullName $f.name) -Algorithm SHA256
                Assert ($actual.Hash -eq $f.sha256) "Checksum mismatch for $($f.name)"
            }
        }
        finally {
            if (Test-Path $backupRoot) { Remove-Item -LiteralPath $backupRoot -Recurse -Force -ErrorAction SilentlyContinue }
        }
    }

    Run-Test "Backup succeeds after docker compose down" {
        Ensure-StackRunningForBackup
        Invoke-Native docker @("compose", "down")
        $backupRoot = Join-Path $env:TEMP "backup-test-$(Get-Date -Format 'yyyyMMdd-HHmmss-fff')"
        $backupScript = Join-Path $PSScriptRoot "backup-letschat-local-data.ps1"
        try {
            & $backupScript -BackupRoot $backupRoot
            Assert ($global:LASTEXITCODE -eq 0) "Backup script exited with code $($global:LASTEXITCODE)"
            $latest = Get-LatestBackup -Root $backupRoot
            Assert ($latest) "No backup was created after compose down"
            $manifest = Get-Content (Join-Path $latest.FullName "manifest.json") -Raw | ConvertFrom-Json
            Assert ($manifest.counts.users -ge 0) "Counts missing from manifest"
        }
        finally {
            if (Test-Path $backupRoot) { Remove-Item -LiteralPath $backupRoot -Recurse -Force -ErrorAction SilentlyContinue }
        }
    }

    Run-Test "Temporary backup container is removed after success" {
        Ensure-StackRunningForBackup
        Invoke-Native docker @("compose", "down")
        $backupRoot = Join-Path $env:TEMP "backup-test-$(Get-Date -Format 'yyyyMMdd-HHmmss-fff')"
        $backupScript = Join-Path $PSScriptRoot "backup-letschat-local-data.ps1"
        try {
            & $backupScript -BackupRoot $backupRoot
            Assert ($global:LASTEXITCODE -eq 0) "Backup script exited with code $($global:LASTEXITCODE)"
            $remaining = docker ps -a --format "{{.Names}}" | Where-Object { $_ -like "letschat-backup-pg-*" }
            Assert (-not $remaining) "Temporary backup container(s) remain: $($remaining -join ', ')"
        }
        finally {
            if (Test-Path $backupRoot) { Remove-Item -LiteralPath $backupRoot -Recurse -Force -ErrorAction SilentlyContinue }
        }
    }

    Run-Test "Temporary backup container is removed after failure" {
        $backupRoot = Join-Path $env:TEMP "backup-test-$(Get-Date -Format 'yyyyMMdd-HHmmss-fff')"
        $backupScript = Join-Path $PSScriptRoot "backup-letschat-local-data.ps1"
        try {
            & $backupScript -BackupRoot $backupRoot -PostgresVolume "does-not-exist-backup-test"
            Assert ($global:LASTEXITCODE -ne 0) "Expected backup to fail for missing volume"
        }
        finally {
            if (Test-Path $backupRoot) { Remove-Item -LiteralPath $backupRoot -Recurse -Force -ErrorAction SilentlyContinue }
        }
        $remaining = docker ps -a --format "{{.Names}}" | Where-Object { $_ -like "letschat-backup-pg-*" }
        Assert (-not $remaining) "Temporary backup container(s) remain after failure: $($remaining -join ', ')"
    }

    Run-Test "Missing stable Postgres volume aborts without creating a replacement" {
        $backupRoot = Join-Path $env:TEMP "backup-test-$(Get-Date -Format 'yyyyMMdd-HHmmss-fff')"
        $backupScript = Join-Path $PSScriptRoot "backup-letschat-local-data.ps1"
        $beforeVolumes = docker volume ls -q | Where-Object { $_ -like "backup-test-*" }
        try {
            & $backupScript -BackupRoot $backupRoot -PostgresVolume "does-not-exist-backup-test"
            Assert ($global:LASTEXITCODE -ne 0) "Expected backup to abort"
            $childBackup = Get-ChildItem -Path $backupRoot -Directory -Filter "letschat-local-*" -ErrorAction SilentlyContinue
            Assert (-not $childBackup) "Incomplete backup subdirectory should not remain"
        }
        finally {
            if (Test-Path $backupRoot) { Remove-Item -LiteralPath $backupRoot -Recurse -Force -ErrorAction SilentlyContinue }
        }
        $afterVolumes = docker volume ls -q | Where-Object { $_ -like "backup-test-*" }
        Assert (($afterVolumes.Count -eq $beforeVolumes.Count)) "Backup created an unexpected replacement volume"
    }
}

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
Write-Info "`n=== Extended Test Summary ==="
Write-Ok "Passed: $($script:TestsPassed)"
if ($script:TestsFailed -gt 0) {
    Write-Err "Failed: $($script:TestsFailed)"
    exit 1
}
else {
    Write-Ok "All extended tests passed."
}
