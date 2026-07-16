#Requires -Version 5.1
<#
.SYNOPSIS
    Regression tests for local data guardrails.

.DESCRIPTION
    Exercises dynamic legacy-volume discovery, restore drill, ReplaceActive
    against disposable volumes, and rollback-on-failure behavior.

    Docker must be running. Some tests require the local stack (or at least
    postgres) to be running so a backup can be created.
#>
param(
    [switch]$SkipDiscovery,
    [switch]$SkipDrill,
    [switch]$SkipReplace,
    [switch]$SkipRollback,
    [switch]$SkipEmergency
)

$ErrorActionPreference = "Continue"

$RepoRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $RepoRoot

Import-Module "$PSScriptRoot\lib\local-data-utils.psm1" -Force

function Write-Info($msg) { Write-Host $msg -ForegroundColor Cyan }
function Write-Ok($msg) { Write-Host $msg -ForegroundColor Green }
function Write-Warn($msg) { Write-Host $msg -ForegroundColor Yellow }
function Write-Err($msg) { Write-Host $msg -ForegroundColor Red }

function Invoke-SafeCleanup($volumesToClean, $rollbackVolumes) {
    try {
        docker compose down 2>$null | Out-Null
        foreach ($v in $volumesToClean) { docker volume rm $v 2>$null | Out-Null }
        foreach ($v in $rollbackVolumes) { docker volume rm $v 2>$null | Out-Null }
    }
    catch {
        Write-Warn "Cleanup warning: $_"
    }
}

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

function Ensure-BackupAvailable() {
    $backup = Get-LatestBackup
    if ($backup) {
        $manifest = Get-Content (Join-Path $backup.FullName "manifest.json") -Raw | ConvertFrom-Json
        if ($manifest.countsCollected -eq $true) {
            return $backup
        }
    }
    $backupScript = Join-Path $PSScriptRoot "backup-letschat-local-data.ps1"
    & $backupScript
    if ($global:LASTEXITCODE -ne 0) { throw "Could not create a backup for tests" }
    return Get-LatestBackup
}

function Ensure-StackRunning() {
    $running = docker ps -q -f "name=^letschat-postgres$" 2>$null
    if ($running) { return }
    Write-Warn "Starting Docker Compose infrastructure for tests..."
    Invoke-Native docker @("compose", "up", "-d", "postgres", "redis", "minio")
    if (-not (Wait-PostgresReady -Container "letschat-postgres" -User "letschat" -Database "letschat_local")) {
        throw "Stack postgres did not become ready"
    }
}


function Seed-LetsChatDatabase($container) {
    if (-not (Wait-PostgresReady -Container $container)) { throw "Seed container $container not ready" }
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

function New-LegacyVolumeSet($project, $kinds) {
    foreach ($kind in $kinds) {
        $vol = "${project}_${kind}"
        Invoke-Native docker @("volume", "create", "--label", "com.docker.compose.volume=$kind", "--label", "com.docker.compose.project=$project", $vol)
    }
}

# ---------------------------------------------------------------------------
# Test 1: Dynamic legacy-volume discovery
# ---------------------------------------------------------------------------
if (-not $SkipDiscovery) {
    Run-Test "Dynamic legacy-volume discovery" {
        $suffix = Get-Date -Format "yyyyMMdd-HHmmss-fff"
        $project1 = "test-legacy-$suffix"
        $project2 = "test-legacy2-$suffix"
        $unrelated = "test-unrelated-$suffix"
        $kinds = @("postgres-data", "minio-data", "redis-data", "mailpit-data")

        $volumesToClean = @()
        $containersToClean = @()

        try {
            New-LegacyVolumeSet -project $project1 -kinds $kinds
            $volumesToClean += $kinds | ForEach-Object { "${project1}_$_" }

            $seed1 = "test-legacy-seed-$suffix"
            $containersToClean += $seed1
            Invoke-Native docker @("run", "-d", "--name", $seed1,
                "-e", "POSTGRES_USER=letschat",
                "-e", "POSTGRES_PASSWORD=letschat",
                "-v", "${project1}_postgres-data:/var/lib/postgresql/data",
                "postgres:15-alpine")
            Seed-LetsChatDatabase $seed1
            Remove-DockerContainer $seed1
            $containersToClean = $containersToClean | Where-Object { $_ -ne $seed1 }

            $unrelKinds = @("postgres-data")
            New-LegacyVolumeSet -project $unrelated -kinds $unrelKinds
            $volumesToClean += $unrelKinds | ForEach-Object { "${unrelated}_$_" }
            $seedU = "test-unrelated-seed-$suffix"
            $containersToClean += $seedU
            Invoke-Native docker @("run", "-d", "--name", $seedU,
                "-e", "POSTGRES_USER=letschat",
                "-e", "POSTGRES_PASSWORD=letschat",
                "-v", "${unrelated}_postgres-data:/var/lib/postgresql/data",
                "postgres:15-alpine")
            if (-not (Wait-PostgresReady -Container $seedU)) { throw "Unrelated seed not ready" }
            Invoke-Native docker @("exec", $seedU, "psql", "-U", "letschat", "-d", "postgres", "-c", "CREATE DATABASE other_db;")
            Invoke-Native docker @("exec", $seedU, "psql", "-U", "letschat", "-d", "other_db", "-c", "CREATE TABLE other_table (id serial primary key);")
            Remove-DockerContainer $seedU
            $containersToClean = $containersToClean | Where-Object { $_ -ne $seedU }

            $legacy = Find-LegacyLetsChatVolumes -StableVolumes (Get-LetsChatExpectedVolumes).Values
            $found1 = $legacy | Where-Object { $_.Project -eq $project1 }
            Assert ($found1) "Expected to find legacy project $project1"
            Assert ($found1.Volumes.Postgres -eq "${project1}_postgres-data") "Wrong Postgres volume for project1"
            Assert ($found1.Counts.users -eq 1) "Expected 1 user in legacy project1"

            $foundU = $legacy | Where-Object { $_.Project -eq $unrelated }
            Assert (-not $foundU) "Unrelated project should be rejected"

            New-LegacyVolumeSet -project $project2 -kinds $kinds
            $volumesToClean += $kinds | ForEach-Object { "${project2}_$_" }
            $seed2 = "test-legacy2-seed-$suffix"
            $containersToClean += $seed2
            Invoke-Native docker @("run", "-d", "--name", $seed2,
                "-e", "POSTGRES_USER=letschat",
                "-e", "POSTGRES_PASSWORD=letschat",
                "-v", "${project2}_postgres-data:/var/lib/postgresql/data",
                "postgres:15-alpine")
            Seed-LetsChatDatabase $seed2
            $seed2Sql = "INSERT INTO `"User`" (email) VALUES ('second@example.com');"
            $tempSeed2 = Join-Path $env:TEMP "seed2-$suffix.sql"
            try {
                $seed2Sql | Out-File -FilePath $tempSeed2 -Encoding utf8 -Force
                $containerSeed2 = "/tmp/seed2.sql"
                Invoke-Native docker @("cp", $tempSeed2, "${seed2}:${containerSeed2}")
                Invoke-Native docker @("exec", $seed2, "psql", "-U", "letschat", "-d", "letschat_local", "-f", $containerSeed2)
            }
            finally {
                Remove-Item -LiteralPath $tempSeed2 -Force -ErrorAction SilentlyContinue
            }
            Remove-DockerContainer $seed2
            $containersToClean = $containersToClean | Where-Object { $_ -ne $seed2 }

            $legacy2 = Find-LegacyLetsChatVolumes -StableVolumes (Get-LetsChatExpectedVolumes).Values
            $found1b = $legacy2 | Where-Object { $_.Project -eq $project1 }
            $found2b = $legacy2 | Where-Object { $_.Project -eq $project2 }
            Assert ($found1b -and $found2b) "Expected both legacy projects to be detected"
            Assert ($legacy2.Count -ge 2) "Expected at least 2 verified legacy installations, got $($legacy2.Count)"
        }
        finally {
            foreach ($c in $containersToClean) { Remove-DockerContainer $c }
            foreach ($v in $volumesToClean) { docker volume rm $v 2>$null | Out-Null }
        }
    }
}

# ---------------------------------------------------------------------------
# Test 1b: Legacy migration uses logical dump/restore
# ---------------------------------------------------------------------------
if (-not $SkipDiscovery) {
    Run-Test "Legacy migration uses logical dump/restore and preserves source" {
        $suffix = Get-Date -Format "yyyyMMdd-HHmmss-fff"
        $project = "test-migrate-$suffix"
        $kinds = @("postgres-data", "minio-data", "redis-data", "mailpit-data")
        $volumesToClean = @()
        $containersToClean = @()

        try {
            New-LegacyVolumeSet -project $project -kinds $kinds
            $volumesToClean += $kinds | ForEach-Object { "${project}_$_" }

            $seed = "test-migrate-seed-$suffix"
            $containersToClean += $seed
            Invoke-Native docker @("run", "-d", "--name", $seed,
                "-e", "POSTGRES_USER=letschat",
                "-e", "POSTGRES_PASSWORD=letschat",
                "-v", "${project}_postgres-data:/var/lib/postgresql/data",
                "postgres:15-alpine")
            Seed-LetsChatDatabase $seed

            # Add a MinIO marker so the destination validation can confirm non-empty state.
            Invoke-Native docker @("run", "--rm", "-v", "${project}_minio-data:/data", "alpine", "sh", "-c", "echo migrated > /data/marker.txt")

            Remove-DockerContainer $seed
            $containersToClean = $containersToClean | Where-Object { $_ -ne $seed }

            $legacy = Find-LegacyLetsChatVolumes -StableVolumes (Get-LetsChatExpectedVolumes).Values
            $found = $legacy | Where-Object { $_.Project -eq $project }
            Assert ($found) "Expected to find legacy project $project"

            $testStableVolumes = @{
                Postgres = "test-stable-postgres-$suffix"
                Minio    = "test-stable-minio-$suffix"
                Redis    = "test-stable-redis-$suffix"
                Mailpit  = "test-stable-mailpit-$suffix"
            }
            $volumesToClean += $testStableVolumes.Values

            $result = Migrate-LegacyToStable -Legacy $found -StableVolumes $testStableVolumes
            Assert ($result.SourceCounts.users -eq 1) "Source user count should be 1"
            Assert ($result.DestCounts.users -eq 1) "Destination user count should match source"
            Assert ($result.SourceCounts.messages -eq 0) "Source messages should be 0"
            Assert ($result.DestCounts.messages -eq 0) "Destination messages should match source"

            # Verify destination PostgreSQL content.
            $verifyContainer = "test-verify-migrate-$suffix"
            $containersToClean += $verifyContainer
            Invoke-Native docker @("run", "-d", "--name", $verifyContainer,
                "-e", "POSTGRES_USER=letschat",
                "-e", "POSTGRES_PASSWORD=letschat",
                "-v", "$($testStableVolumes.Postgres):/var/lib/postgresql/data",
                "postgres:15-alpine")
            if (-not (Wait-PostgresReady -Container $verifyContainer)) { throw "Verify container not ready" }
            $counts = Get-DatabaseCountsFromContainer -Container $verifyContainer -DatabaseName "letschat_local"
            Assert ($counts.users -eq 1) "Verify user count mismatch"

            # Verify MinIO was copied.
            $minioLs = docker run --rm -v "$($testStableVolumes.Minio):/data:ro" alpine ls /data 2>$null
            Assert ($minioLs -contains "marker.txt") "MinIO marker not copied to stable volume"

            # Verify the legacy source volume is unchanged.
            $sourceVerifyContainer = "test-source-verify-$suffix"
            $containersToClean += $sourceVerifyContainer
            Invoke-Native docker @("run", "-d", "--name", $sourceVerifyContainer,
                "-e", "POSTGRES_USER=letschat",
                "-e", "POSTGRES_PASSWORD=letschat",
                "-v", "${project}_postgres-data:/var/lib/postgresql/data",
                "postgres:15-alpine")
            if (-not (Wait-PostgresReady -Container $sourceVerifyContainer)) { throw "Source verify container not ready" }
            $sourceCounts = Get-DatabaseCountsFromContainer -Container $sourceVerifyContainer -DatabaseName "letschat_local"
            Assert ($sourceCounts.users -eq 1) "Source user count changed after migration"
        }
        finally {
            foreach ($c in $containersToClean) { Remove-DockerContainer $c }
            foreach ($v in $volumesToClean) { docker volume rm $v 2>$null | Out-Null }
        }
    }

    Run-Test "Running legacy PostgreSQL container is reused, no dual PGDATA mount" {
        $suffix = Get-Date -Format "yyyyMMdd-HHmmss-fff"
        $project = "test-running-$suffix"
        $kinds = @("postgres-data", "minio-data", "redis-data", "mailpit-data")
        $volumesToClean = @()
        $containersToClean = @()

        try {
            New-LegacyVolumeSet -project $project -kinds $kinds
            $volumesToClean += $kinds | ForEach-Object { "${project}_$_" }

            $seed = "test-running-seed-$suffix"
            $containersToClean += $seed
            Invoke-Native docker @("run", "-d", "--name", $seed,
                "-e", "POSTGRES_USER=letschat",
                "-e", "POSTGRES_PASSWORD=letschat",
                "-v", "${project}_postgres-data:/var/lib/postgresql/data",
                "postgres:15-alpine")
            Seed-LetsChatDatabase $seed

            $runningSource = Get-LetsChatRunningPostgresContainerForVolume -Volume "${project}_postgres-data"
            Assert ($runningSource -eq $seed) "Expected running seed container to be selected as source"

            $testStableVolumes = @{
                Postgres = "test-stable-running-postgres-$suffix"
                Minio    = "test-stable-running-minio-$suffix"
                Redis    = "test-stable-running-redis-$suffix"
                Mailpit  = "test-stable-running-mailpit-$suffix"
            }
            $volumesToClean += $testStableVolumes.Values

            $legacy = Find-LegacyLetsChatVolumes -StableVolumes (Get-LetsChatExpectedVolumes).Values
            $found = $legacy | Where-Object { $_.Project -eq $project }
            Assert ($found) "Expected to find running legacy project $project"

            Migrate-LegacyToStable -Legacy $found -StableVolumes $testStableVolumes

            $seedStillRunning = docker ps -q -f "name=^$seed$" -f "status=running"
            Assert ($seedStillRunning) "Seed container should still be running after migration"

            $mounting = docker ps -q --filter "volume=${project}_postgres-data" 2>$null
            $ids = @($mounting -split "`r?`n" | ForEach-Object { $_.Trim() } | Where-Object { $_ })
            Assert ($ids.Count -le 1) "Multiple containers found mounting the same PGDATA volume: $($ids -join ', ')"
        }
        finally {
            foreach ($c in $containersToClean) { Remove-DockerContainer $c }
            foreach ($v in $volumesToClean) { docker volume rm $v 2>$null | Out-Null }
        }
    }

    Run-Test "Temporary migration containers are removed after success" {
        $suffix = Get-Date -Format "yyyyMMdd-HHmmss-fff"
        $project = "test-migrate-cleanup-$suffix"
        $kinds = @("postgres-data", "minio-data", "redis-data", "mailpit-data")
        $volumesToClean = @()
        $containersToClean = @()

        try {
            New-LegacyVolumeSet -project $project -kinds $kinds
            $volumesToClean += $kinds | ForEach-Object { "${project}_$_" }

            $seed = "test-cleanup-seed-$suffix"
            $containersToClean += $seed
            Invoke-Native docker @("run", "-d", "--name", $seed,
                "-e", "POSTGRES_USER=letschat",
                "-e", "POSTGRES_PASSWORD=letschat",
                "-v", "${project}_postgres-data:/var/lib/postgresql/data",
                "postgres:15-alpine")
            Seed-LetsChatDatabase $seed
            Remove-DockerContainer $seed
            $containersToClean = $containersToClean | Where-Object { $_ -ne $seed }

            $legacy = Find-LegacyLetsChatVolumes -StableVolumes (Get-LetsChatExpectedVolumes).Values
            $found = $legacy | Where-Object { $_.Project -eq $project }
            Assert ($found) "Expected to find legacy project $project"

            $testStableVolumes = @{
                Postgres = "test-stable-cleanup-postgres-$suffix"
                Minio    = "test-stable-cleanup-minio-$suffix"
                Redis    = "test-stable-cleanup-redis-$suffix"
                Mailpit  = "test-stable-cleanup-mailpit-$suffix"
            }
            $volumesToClean += $testStableVolumes.Values

            Migrate-LegacyToStable -Legacy $found -StableVolumes $testStableVolumes

            $remaining = docker ps -a --format "{{.Names}}" | Where-Object { $_ -like "letschat-legacy-*" -or $_ -like "letschat-diag-*" -or $_ -like "letschat-migrate-*" }
            Assert (-not $remaining) "Temporary containers remain after migration: $($remaining -join ', ')"
        }
        finally {
            foreach ($c in $containersToClean) { Remove-DockerContainer $c }
            foreach ($v in $volumesToClean) { docker volume rm $v 2>$null | Out-Null }
        }
    }
}

# ---------------------------------------------------------------------------
# Test 2: Restore drill
# ---------------------------------------------------------------------------
if (-not $SkipDrill) {
    Run-Test "Restore drill" {
        Ensure-StackRunning
        $backup = Ensure-BackupAvailable

        $restoreScript = Join-Path $PSScriptRoot "restore-letschat-local-data.ps1"

        $tempContainersBefore = @(docker ps -a --format "{{.Names}}" 2>$null)
        $tempVolumesBefore = @(docker volume ls -q 2>$null)

        & $restoreScript -BackupPath $backup.FullName -Drill
        if ($global:LASTEXITCODE -ne 0) { throw "Restore drill exited with code $($global:LASTEXITCODE)" }

        $tempContainersAfter = @(docker ps -a --format "{{.Names}}" 2>$null)
        $restoreContainers = $tempContainersAfter | Where-Object { $_ -like "letschat-restore-*" }
        Assert (-not $restoreContainers) "Restore containers remain: $($restoreContainers -join ', ')"

        $tempVolumesAfter = @(docker volume ls -q 2>$null)
        $restoreVolumes = $tempVolumesAfter | Where-Object { $_ -like "letschat-restore-*" }
        Assert (-not $restoreVolumes) "Restore volumes remain: $($restoreVolumes -join ', ')"
    }
}

# ---------------------------------------------------------------------------
# Test 3: ReplaceActive against disposable cloned volumes
# ---------------------------------------------------------------------------
if (-not $SkipReplace) {
    Run-Test "ReplaceActive against disposable volumes" {
        Ensure-StackRunning
        $backup = Ensure-BackupAvailable
        $manifest = Get-Content (Join-Path $backup.FullName "manifest.json") -Raw | ConvertFrom-Json

        $suffix = Get-Date -Format "yyyyMMdd-HHmmss-fff"
        $manifest = Get-Content (Join-Path $backup.FullName "manifest.json") -Raw | ConvertFrom-Json
        $activePg = "test-active-postgres-$suffix"
        $activeMinio = "test-active-minio-$suffix"
        $activeRedis = "test-active-redis-$suffix"
        $activeMailpit = "test-active-mailpit-$suffix"
        $volumesToClean = @($activePg, $activeMinio, $activeRedis, $activeMailpit)

        try {
            $expected = Get-LetsChatExpectedVolumes
            Copy-DockerVolume -From $expected.Postgres -To $activePg
            Copy-DockerVolume -From $expected.Minio -To $activeMinio
            Copy-DockerVolume -From $expected.Redis -To $activeRedis
            Copy-DockerVolume -From $expected.Mailpit -To $activeMailpit

            Invoke-Native docker @("run", "--rm", "-v", "$($activeMinio):/data", "alpine", "sh", "-c", "echo stale > /data/stale-marker.txt")

            $restoreScript = Join-Path $PSScriptRoot "restore-letschat-local-data.ps1"
            & $restoreScript `
                -BackupPath $backup.FullName `
                -ReplaceActive `
                -ActivePostgresVolume $activePg `
                -ActiveMinioVolume $activeMinio `
                -ActiveRedisVolume $activeRedis `
                -ActiveMailpitVolume $activeMailpit `
                -Force
            if ($global:LASTEXITCODE -ne 0) { throw "ReplaceActive exited with code $($global:LASTEXITCODE)" }

            $minioLs = docker run --rm -v "$($activeMinio):/data:ro" alpine ls /data 2>$null
            Assert (-not ($minioLs -contains "stale-marker.txt")) "Stale marker file still present after replace"

            $verifyContainer = "test-verify-pg-$suffix"
            Invoke-Native docker @("run", "-d", "--name", $verifyContainer,
                "-e", "POSTGRES_USER=letschat",
                "-e", "POSTGRES_PASSWORD=letschat",
                "-v", "${activePg}:/var/lib/postgresql/data",
                "postgres:15-alpine")
            if (-not (Wait-PostgresReady -Container $verifyContainer)) { throw "Verify container not ready" }
            try {
                $counts = Get-DatabaseCountsFromContainer -Container $verifyContainer -DatabaseName "letschat_local"
                Assert ($counts.users -eq $manifest.counts.users) "User count mismatch after replace"
                Assert ($counts.messages -eq $manifest.counts.messages) "Message count mismatch after replace"
            }
            finally {
                Remove-DockerContainer $verifyContainer
            }

            $allVolumes = @(docker volume ls -q 2>$null)
            $rollbackVolumes = $allVolumes | Where-Object {
                $_ -like "${activePg}-rollback-*" -or
                $_ -like "$($activeMinio)-rollback-*" -or
                $_ -like "${activeRedis}-rollback-*" -or
                $_ -like "${activeMailpit}-rollback-*"
            }
            Assert ($rollbackVolumes.Count -ge 4) "Rollback volumes not created (found $($rollbackVolumes.Count))"
        }
        finally {
            docker compose down 2>$null | Out-Null
            foreach ($v in $volumesToClean) { docker volume rm $v 2>$null | Out-Null }
            $allVolumes = @(docker volume ls -q 2>$null)
            $rollbackVolumes = $allVolumes | Where-Object { $_ -like "test-active-*-rollback-*" }
            foreach ($v in $rollbackVolumes) { docker volume rm $v 2>$null | Out-Null }
        }
    }
}

# ---------------------------------------------------------------------------
# Test 4: Rollback-on-failure
# ---------------------------------------------------------------------------
if (-not $SkipRollback) {
    Run-Test "Rollback-on-failure" {
        Ensure-StackRunning
        $backup = Ensure-BackupAvailable

        $suffix = Get-Date -Format "yyyyMMdd-HHmmss-fff"
        $manifest = Get-Content (Join-Path $backup.FullName "manifest.json") -Raw | ConvertFrom-Json
        $activePg = "test-active-postgres-$suffix"
        $activeMinio = "test-active-minio-$suffix"
        $activeRedis = "test-active-redis-$suffix"
        $activeMailpit = "test-active-mailpit-$suffix"
        $volumesToClean = @($activePg, $activeMinio, $activeRedis, $activeMailpit)

        try {
            $expected = Get-LetsChatExpectedVolumes
            Copy-DockerVolume -From $expected.Postgres -To $activePg
            Copy-DockerVolume -From $expected.Minio -To $activeMinio
            Copy-DockerVolume -From $expected.Redis -To $activeRedis
            Copy-DockerVolume -From $expected.Mailpit -To $activeMailpit

            Invoke-Native docker @("run", "--rm", "-v", "$($activeMinio):/data", "alpine", "sh", "-c", "echo stale > /data/stale-rollback.txt")

            $originalCounts = $null
            $countContainer = "test-count-pg-$suffix"
            try {
                Invoke-Native docker @("run", "-d", "--name", $countContainer,
                    "-e", "POSTGRES_USER=letschat",
                    "-e", "POSTGRES_PASSWORD=letschat",
                    "-v", "${activePg}:/var/lib/postgresql/data",
                    "postgres:15-alpine") | Out-Null
                if (-not (Wait-PostgresReady -Container $countContainer)) { throw "Count container not ready" }
                $originalCounts = Get-DatabaseCountsFromContainer -Container $countContainer -DatabaseName "letschat_local"
            }
            finally {
                Remove-DockerContainer $countContainer
            }

            $restoreScript = Join-Path $PSScriptRoot "restore-letschat-local-data.ps1"
            $restoreOutput = & $restoreScript `
                -BackupPath $backup.FullName `
                -ReplaceActive `
                -ActivePostgresVolume $activePg `
                -ActiveMinioVolume $activeMinio `
                -ActiveRedisVolume $activeRedis `
                -ActiveMailpitVolume $activeMailpit `
                -Force `
                -ForceValidationFailureAfterCopy 6>&1
            $restoreExit = $global:LASTEXITCODE
            $combined = $restoreOutput -join "`n"
            Assert ($restoreExit -ne 0) "Expected restore to exit non-zero due to forced validation failure. Output: $combined"
            Assert ($combined -match "rollback") "Expected rollback message in restore output, got: $combined"

            $minioLs = docker run --rm -v "$($activeMinio):/data:ro" alpine ls /data 2>$null
            Assert ($minioLs -contains "stale-rollback.txt") "Stale file not restored from rollback"

            $verifyContainer = "test-verify-pg-$suffix"
            Invoke-Native docker @("run", "-d", "--name", $verifyContainer,
                "-e", "POSTGRES_USER=letschat",
                "-e", "POSTGRES_PASSWORD=letschat",
                "-v", "${activePg}:/var/lib/postgresql/data",
                "postgres:15-alpine")
            if (-not (Wait-PostgresReady -Container $verifyContainer)) { throw "Verify container not ready" }
            try {
                $counts = Get-DatabaseCountsFromContainer -Container $verifyContainer -DatabaseName "letschat_local"
                Assert ($counts.users -eq $originalCounts.users) "User count mismatch after rollback"
            }
            finally {
                Remove-DockerContainer $verifyContainer
            }
        }
        finally {
            docker compose down 2>$null | Out-Null
            foreach ($v in $volumesToClean) { docker volume rm $v 2>$null | Out-Null }
            $allVolumes = @(docker volume ls -q 2>$null)
            $rollbackVolumes = $allVolumes | Where-Object { $_ -like "test-active-*-rollback-*" }
            foreach ($v in $rollbackVolumes) { docker volume rm $v 2>$null | Out-Null }
        }
    }
}

# ---------------------------------------------------------------------------
# Test 5: Emergency backup counts and validation
# ---------------------------------------------------------------------------
if (-not $SkipEmergency) {
    function Read-TestManifest($backupDir) {
        $path = Join-Path $backupDir "manifest.json"
        return Get-Content $path -Raw | ConvertFrom-Json
    }

    function Write-TestManifest($backupDir, $manifest) {
        $path = Join-Path $backupDir "manifest.json"
        $manifest | ConvertTo-Json -Depth 5 | Out-File -FilePath $path -Encoding utf8 -Force
    }

    function Get-EmergencyBackupRoot() {
        return Join-Path $env:LOCALAPPDATA "LetsChat\backups\emergency"
    }

    function Get-LatestEmergencyBackup() {
        $root = Get-EmergencyBackupRoot
        if (-not (Test-Path $root)) { return $null }
        return Get-ChildItem -Directory -Path $root -Filter "letschat-local-*" |
            Where-Object { Test-Path (Join-Path $_.FullName "manifest.json") } |
            Sort-Object CreationTime -Descending |
            Select-Object -First 1
    }


    function Get-DisposableActiveVolumes($suffix) {
        return @{
            Postgres = "test-emergency-active-postgres-$suffix"
            Minio    = "test-emergency-active-minio-$suffix"
            Redis    = "test-emergency-active-redis-$suffix"
            Mailpit  = "test-emergency-active-mailpit-$suffix"
        }
    }

    function Clone-ExpectedVolumesTo($target) {
        $expected = Get-LetsChatExpectedVolumes
        Copy-DockerVolume -From $expected.Postgres -To $target.Postgres
        Copy-DockerVolume -From $expected.Minio -To $target.Minio
        Copy-DockerVolume -From $expected.Redis -To $target.Redis
        Copy-DockerVolume -From $expected.Mailpit -To $target.Mailpit
    }

    Run-Test "Populated emergency backup records non-zero real counts" {
        Ensure-StackRunning
        $backup = Ensure-BackupAvailable
        $manifest = Read-TestManifest $backup.FullName

        $suffix = Get-Date -Format "yyyyMMdd-HHmmss-fff"
        $activePg = "test-emergency-active-postgres-$suffix"
        $activeMinio = "test-emergency-active-minio-$suffix"
        $activeRedis = "test-emergency-active-redis-$suffix"
        $activeMailpit = "test-emergency-active-mailpit-$suffix"
        $volumesToClean = @($activePg, $activeMinio, $activeRedis, $activeMailpit)

        try {
            $expected = Get-LetsChatExpectedVolumes
            Copy-DockerVolume -From $expected.Postgres -To $activePg
            Copy-DockerVolume -From $expected.Minio -To $activeMinio
            Copy-DockerVolume -From $expected.Redis -To $activeRedis
            Copy-DockerVolume -From $expected.Mailpit -To $activeMailpit

            $restoreScript = Join-Path $PSScriptRoot "restore-letschat-local-data.ps1"
            & $restoreScript `
                -BackupPath $backup.FullName `
                -ReplaceActive `
                -ActivePostgresVolume $activePg `
                -ActiveMinioVolume $activeMinio `
                -ActiveRedisVolume $activeRedis `
                -ActiveMailpitVolume $activeMailpit `
                -Force
            if ($global:LASTEXITCODE -ne 0) { throw "ReplaceActive exited with code $($global:LASTEXITCODE)" }

            $emergencyRoot = Get-EmergencyBackupRoot
            $emergencyBackup = Get-ChildItem -Directory -Path $emergencyRoot -Filter "letschat-local-*" |
                Sort-Object CreationTime -Descending |
                Select-Object -First 1
            Assert ($emergencyBackup) "Emergency backup was not created in $emergencyRoot"
            $emergencyManifest = Read-TestManifest $emergencyBackup.FullName
            Assert ($emergencyManifest.countsCollected -eq $true) "Emergency backup countsCollected should be true, got $($emergencyManifest.countsCollected)"
            Assert ($emergencyManifest.counts.users -gt 0) "Emergency backup of populated DB should have non-zero users, got $($emergencyManifest.counts.users)"
        }
        finally {
            Invoke-SafeCleanup $volumesToClean
        }
    }

    Run-Test "Emergency backup passes isolated Drill restore" {
        Ensure-StackRunning
        $backup = Ensure-BackupAvailable
        $manifest = Read-TestManifest $backup.FullName

        $suffix = Get-Date -Format "yyyyMMdd-HHmmss-fff"
        $activePg = "test-emergency-drill-postgres-$suffix"
        $activeMinio = "test-emergency-drill-minio-$suffix"
        $activeRedis = "test-emergency-drill-redis-$suffix"
        $activeMailpit = "test-emergency-drill-mailpit-$suffix"
        $volumesToClean = @($activePg, $activeMinio, $activeRedis, $activeMailpit)

        try {
            $expected = Get-LetsChatExpectedVolumes
            Copy-DockerVolume -From $expected.Postgres -To $activePg
            Copy-DockerVolume -From $expected.Minio -To $activeMinio
            Copy-DockerVolume -From $expected.Redis -To $activeRedis
            Copy-DockerVolume -From $expected.Mailpit -To $activeMailpit

            $restoreScript = Join-Path $PSScriptRoot "restore-letschat-local-data.ps1"
            & $restoreScript `
                -BackupPath $backup.FullName `
                -ReplaceActive `
                -ActivePostgresVolume $activePg `
                -ActiveMinioVolume $activeMinio `
                -ActiveRedisVolume $activeRedis `
                -ActiveMailpitVolume $activeMailpit `
                -Force
            if ($global:LASTEXITCODE -ne 0) { throw "ReplaceActive exited with code $($global:LASTEXITCODE)" }

            $emergencyRoot = Get-EmergencyBackupRoot
            $emergencyBackup = Get-ChildItem -Directory -Path $emergencyRoot -Filter "letschat-local-*" |
                Sort-Object CreationTime -Descending |
                Select-Object -First 1
            Assert ($emergencyBackup) "Emergency backup was not created"

            & $restoreScript -BackupPath $emergencyBackup.FullName -Drill
            if ($global:LASTEXITCODE -ne 0) { throw "Emergency backup Drill restore failed with code $($global:LASTEXITCODE)" }
        }
        finally {
            Invoke-SafeCleanup $volumesToClean
        }
    }

    Run-Test "Count mismatch fails restore" {
        Ensure-StackRunning
        $backup = Ensure-BackupAvailable

        $backupRoot = Join-Path $env:TEMP "mismatch-test-$(Get-Date -Format 'yyyyMMdd-HHmmss-fff')"
        Copy-Item -LiteralPath $backup.FullName -Destination $backupRoot -Recurse -Force
        try {
            $manifest = Read-TestManifest $backupRoot
            $manifest.counts.users = 999999
            $manifest.counts.messages = 999999
            Write-TestManifest $backupRoot $manifest

            $restoreScript = Join-Path $PSScriptRoot "restore-letschat-local-data.ps1"
            & $restoreScript -BackupPath $backupRoot -Drill
            Assert ($global:LASTEXITCODE -ne 0) "Expected restore to fail due to count mismatch"
        }
        finally {
            if (Test-Path $backupRoot) { Remove-Item -LiteralPath $backupRoot -Recurse -Force -ErrorAction SilentlyContinue }
        }
    }

    Run-Test "countsCollected=false skips count comparison only" {
        Ensure-StackRunning
        $backup = Ensure-BackupAvailable

        $backupRoot = Join-Path $env:TEMP "skip-counts-test-$(Get-Date -Format 'yyyyMMdd-HHmmss-fff')"
        Copy-Item -LiteralPath $backup.FullName -Destination $backupRoot -Recurse -Force
        try {
            $manifest = Read-TestManifest $backupRoot
            $manifest.countsCollected = $false
            $manifest.counts.users = 999999
            $manifest.counts.messages = 999999
            Write-TestManifest $backupRoot $manifest

            $restoreScript = Join-Path $PSScriptRoot "restore-letschat-local-data.ps1"
            & $restoreScript -BackupPath $backupRoot -Drill
            Assert ($global:LASTEXITCODE -eq 0) "Expected restore to succeed when countsCollected=false, got $($global:LASTEXITCODE)"
        }
        finally {
            if (Test-Path $backupRoot) { Remove-Item -LiteralPath $backupRoot -Recurse -Force -ErrorAction SilentlyContinue }
        }
    }

    Run-Test "Missing or invalid countsCollected metadata skips count comparison safely" {
        Ensure-StackRunning
        $backup = Ensure-BackupAvailable

        $backupRoot = Join-Path $env:TEMP "missing-counts-test-$(Get-Date -Format 'yyyyMMdd-HHmmss-fff')"
        Copy-Item -LiteralPath $backup.FullName -Destination $backupRoot -Recurse -Force
        try {
            $manifest = Read-TestManifest $backupRoot
            $manifest.PSObject.Properties.Remove('countsCollected')
            $manifest.counts.users = 999999
            Write-TestManifest $backupRoot $manifest

            $restoreScript = Join-Path $PSScriptRoot "restore-letschat-local-data.ps1"
            & $restoreScript -BackupPath $backupRoot -Drill
            Assert ($global:LASTEXITCODE -eq 0) "Expected restore to skip count comparison safely for missing countsCollected"
        }
        finally {
            if (Test-Path $backupRoot) { Remove-Item -LiteralPath $backupRoot -Recurse -Force -ErrorAction SilentlyContinue }
        }
    }

    Run-Test "Zero counts with countsCollected=true does not pass for populated DB" {
        Ensure-StackRunning
        $backup = Ensure-BackupAvailable

        $backupRoot = Join-Path $env:TEMP "zero-counts-test-$(Get-Date -Format 'yyyyMMdd-HHmmss-fff')"
        Copy-Item -LiteralPath $backup.FullName -Destination $backupRoot -Recurse -Force
        try {
            $manifest = Read-TestManifest $backupRoot
            $manifest.countsCollected = $true
            $manifest.counts.users = 0
            $manifest.counts.messages = 0
            $manifest.counts.attachments = 0
            $manifest.counts.workspaces = 0
            Write-TestManifest $backupRoot $manifest

            $restoreScript = Join-Path $PSScriptRoot "restore-letschat-local-data.ps1"
            & $restoreScript -BackupPath $backupRoot -Drill
            Assert ($global:LASTEXITCODE -ne 0) "Expected restore to fail for populated DB with zero manifest counts"
        }
        finally {
            if (Test-Path $backupRoot) { Remove-Item -LiteralPath $backupRoot -Recurse -Force -ErrorAction SilentlyContinue }
        }
    }

    Run-Test "Failed emergency validation leaves active volumes unchanged" {
        Ensure-StackRunning
        $backup = Ensure-BackupAvailable

        $suffix = Get-Date -Format "yyyyMMdd-HHmmss-fff"
        $activePg = "test-emergency-fail-postgres-$suffix"
        $activeMinio = "test-emergency-fail-minio-$suffix"
        $activeRedis = "test-emergency-fail-redis-$suffix"
        $activeMailpit = "test-emergency-fail-mailpit-$suffix"
        $volumesToClean = @($activePg, $activeMinio, $activeRedis, $activeMailpit)

        try {
            $expected = Get-LetsChatExpectedVolumes
            Copy-DockerVolume -From $expected.Postgres -To $activePg
            Copy-DockerVolume -From $expected.Minio -To $activeMinio
            Copy-DockerVolume -From $expected.Redis -To $activeRedis
            Copy-DockerVolume -From $expected.Mailpit -To $activeMailpit

            Invoke-Native docker @("run", "--rm", "-v", "$($activeMinio):/data", "alpine", "sh", "-c", "echo stale > /data/stale-emergency.txt")

            $restoreScript = Join-Path $PSScriptRoot "restore-letschat-local-data.ps1"
            $restoreOutput = & $restoreScript `
                -BackupPath $backup.FullName `
                -ReplaceActive `
                -ActivePostgresVolume $activePg `
                -ActiveMinioVolume $activeMinio `
                -ActiveRedisVolume $activeRedis `
                -ActiveMailpitVolume $activeMailpit `
                -Force `
                -ForceEmergencyValidationFailure 6>&1
            $restoreExit = $global:LASTEXITCODE
            $combined = $restoreOutput -join "`n"
            Assert ($restoreExit -ne 0) "Expected restore to fail due to forced emergency validation failure"
            Assert ($combined -match "emergency") "Expected emergency failure message in output, got: $combined"

            $minioLs = docker run --rm -v "$($activeMinio):/data:ro" alpine ls /data 2>$null
            Assert ($minioLs -contains "stale-emergency.txt") "Active MinIO volume was modified before emergency validation passed"
        }
        finally {
            Invoke-SafeCleanup $volumesToClean
        }
    }
}

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
Write-Info "`n=== Test Summary ==="
Write-Ok "Passed: $($script:TestsPassed)"
if ($script:TestsFailed -gt 0) {
    Write-Err "Failed: $($script:TestsFailed)"
    exit 1
}
else {
    Write-Ok "All tests passed."
}
