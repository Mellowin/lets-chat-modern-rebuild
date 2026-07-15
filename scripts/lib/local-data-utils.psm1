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
    $volumes = @(docker volume ls -q 2>$null)
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
    if (-not $marker.postgresVolume -or -not $marker.minioVolume -or -not $marker.redisVolume -or -not $marker.mailpitVolume -or -not $marker.databaseName) {
        return [MarkerStatus]::MarkerCorrupt
    }

    $pgExists = Test-DockerVolumeExists $marker.postgresVolume
    $minioExists = Test-DockerVolumeExists $marker.minioVolume
    $redisExists = Test-DockerVolumeExists $marker.redisVolume
    $mailpitExists = Test-DockerVolumeExists $marker.mailpitVolume
    if (-not $pgExists -or -not $minioExists -or -not $redisExists -or -not $mailpitExists) {
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

function Invoke-Native {
    param(
        [Parameter(Mandatory)] [string]$Cmd,
        [array]$ArgsArray = @()
    )
    $global:LASTEXITCODE = 0
    & $Cmd @ArgsArray
    $exit = $global:LASTEXITCODE
    if ($exit -ne 0) {
        throw "Command '$Cmd $ArgsArray' exited with code $exit"
    }
}

# Runs a docker command and returns exit code/output without throwing, even when
# the caller has $ErrorActionPreference set to Stop. Use this for cleanup and
# optional probes where a missing container/volume is not an error.
function Invoke-DockerSilently {
    param([Parameter(Mandatory)] [array]$Arguments)
    $stdout = Join-Path $env:TEMP "docker-out-$(Get-Random).txt"
    $stderr = Join-Path $env:TEMP "docker-err-$(Get-Random).txt"
    try {
        # Start-Process -ArgumentList passes each array element as a separate argument.
        # Elements that contain spaces must include their own quoting so Docker receives
        # them as single arguments.
        $argList = foreach ($a in $Arguments) {
            $s = [string]$a
            if ($s -match '\s') { '"{0}"' -f $s } else { $s }
        }
        $p = Start-Process -FilePath "docker" -ArgumentList $argList -Wait -WindowStyle Hidden -RedirectStandardOutput $stdout -RedirectStandardError $stderr -PassThru
        $out = Get-Content -LiteralPath $stdout -Raw -ErrorAction SilentlyContinue
        if ($out) { $out = $out.Trim() }
        $err = Get-Content -LiteralPath $stderr -Raw -ErrorAction SilentlyContinue
        if ($err) { $err = $err.Trim() }
        return [pscustomobject]@{
            ExitCode = $p.ExitCode
            StdOut   = $out
            StdErr   = $err
        }
    }
    finally {
        Remove-Item -LiteralPath $stdout -Force -ErrorAction SilentlyContinue
        Remove-Item -LiteralPath $stderr -Force -ErrorAction SilentlyContinue
    }
}

function Remove-DockerContainer($Name) {
    Invoke-DockerSilently -Arguments @("rm", "-f", $Name) | Out-Null
}

function Remove-DockerVolume($Name) {
    Invoke-DockerSilently -Arguments @("volume", "rm", $Name) | Out-Null
}

function Copy-DockerVolume {
    param(
        [Parameter(Mandatory)] [string]$From,
        [Parameter(Mandatory)] [string]$To
    )
    Invoke-Native docker @("run", "--rm", "-v", "${From}:/from", "-v", "${To}:/to", "alpine", "cp", "-a", "/from/.", "/to/.")
}

function Wait-PostgresReady {
    param(
        [Parameter(Mandatory)] [string]$Container,
        [string]$User = "letschat",
        [string]$Database = "postgres",
        [int]$TimeoutSeconds = 60,
        [int]$PollSeconds = 1
    )
    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    while ($sw.Elapsed.TotalSeconds -lt $TimeoutSeconds) {
        $result = Invoke-DockerSilently -Arguments @("exec", $Container, "pg_isready", "-U", $User, "-d", $Database)
        if ($result.ExitCode -eq 0) { return $true }
        Start-Sleep -Seconds $PollSeconds
    }
    return $false
}

function Get-DatabasesOnContainer {
    param(
        [Parameter(Mandatory)] [string]$Container,
        [string]$User = "letschat"
    )
    $result = Invoke-DockerSilently -Arguments @("exec", $Container, "psql", "-U", $User, "-d", "postgres", "-t", "-A", "-c", "SELECT datname FROM pg_database WHERE datistemplate = false;")
    if ($result.ExitCode -ne 0) { return $null }
    return @((($result.StdOut -split "`r?`n") | ForEach-Object { $_.Trim() } | Where-Object { $_ }))
}

function Test-HasRequiredTables {
    param(
        [Parameter(Mandatory)] [string]$Container,
        [Parameter(Mandatory)] [string]$DatabaseName,
        [string[]]$Tables = @("User", "Message", "Attachment", "Workspace"),
        [string]$User = "letschat"
    )
    $tableList = ($Tables | ForEach-Object { "'$_'" }) -join ","
    $sql = "SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename IN ($tableList);"
    $result = Invoke-DockerSilently -Arguments @("exec", $Container, "psql", "-U", $User, "-d", $DatabaseName, "-t", "-A", "-c", $sql)
    if ($result.ExitCode -ne 0) { return $false }
    $found = @((($result.StdOut -split "`r?`n") | ForEach-Object { $_.Trim() } | Where-Object { $_ }))
    return ($found.Count -ge $Tables.Count)
}

function Get-DatabaseCountsFromContainer {
    param(
        [Parameter(Mandatory)] [string]$Container,
        [Parameter(Mandatory)] [string]$DatabaseName,
        [string]$User = "letschat"
    )
    $sql = @"
SELECT 'users',count(*)::text FROM "User"
UNION ALL SELECT 'messages',count(*)::text FROM "Message"
UNION ALL SELECT 'attachments',count(*)::text FROM "Attachment"
UNION ALL SELECT 'workspaces',count(*)::text FROM "Workspace";
"@
    $tempSql = Join-Path $env:TEMP "letschat-counts-$(Get-Date -Format 'yyyyMMdd-HHmmss-fff').sql"
    try {
        $sql | Out-File -FilePath $tempSql -Encoding utf8 -Force
        $containerSql = "/tmp/letschat-counts.sql"
        Invoke-DockerSilently -Arguments @("cp", $tempSql, "${Container}:${containerSql}") | Out-Null
        $result = Invoke-DockerSilently -Arguments @("exec", $Container, "psql", "-U", $User, "-d", $DatabaseName, "-t", "-A", "-F", ",", "-f", $containerSql)
        if ($result.ExitCode -ne 0) { return $null }
        $counts = @{}
        foreach ($line in $result.StdOut -split "`r?`n") {
            $line = $line.Trim()
            if ($line -match "^(\w+),(\d+)$") {
                $counts[$matches[1]] = [int]$matches[2]
            }
        }
        return $counts
    }
    finally {
        Remove-Item -LiteralPath $tempSql -Force -ErrorAction SilentlyContinue
    }
}

function Get-DatabaseCounts {
    return Get-DatabaseCountsFromContainer -Container "letschat-postgres" -DatabaseName "letschat_local"
}

function Start-DiagnosticPostgres {
    param(
        [Parameter(Mandatory)] [string]$SourceVolume,
        [Parameter(Mandatory)] [string]$DiagnosticVolume,
        [Parameter(Mandatory)] [string]$ContainerName,
        [int]$Port = 5433,
        [string]$Image = "postgres:15-alpine"
    )
    Invoke-Native docker @("volume", "create", $DiagnosticVolume) | Out-Null
    Invoke-Native docker @("run", "--rm", "-v", "${SourceVolume}:/from:ro", "-v", "${DiagnosticVolume}:/to", "alpine", "cp", "-a", "/from/.", "/to/.") | Out-Null
    Invoke-Native docker @(
        "run", "-d", "--name", $ContainerName,
        "-p", "${Port}:5432",
        "-e", "POSTGRES_USER=letschat",
        "-e", "POSTGRES_PASSWORD=letschat",
        "-v", "${DiagnosticVolume}:/var/lib/postgresql/data",
        $Image
    ) | Out-Null
    if (-not (Wait-PostgresReady -Container $ContainerName)) {
        $logs = docker logs $ContainerName 2>&1
        throw "Diagnostic PostgreSQL container $ContainerName did not become ready.`n$logs"
    }
}

function Stop-DiagnosticPostgres {
    param(
        [Parameter(Mandatory)] [string]$ContainerName,
        [Parameter(Mandatory)] [string]$DiagnosticVolume
    )
    Remove-DockerContainer $ContainerName
    Remove-DockerVolume $DiagnosticVolume
}

function Find-LegacyLetsChatVolumes {
    param(
        [string[]]$StableVolumes = ((Get-LetsChatExpectedVolumes).Values),
        [int]$DiagnosticPort = 5433,
        [string]$PostgresImage = "postgres:15-alpine"
    )
    $allVolumes = @(docker volume ls -q 2>$null)
    if ($allVolumes.Count -eq 0) { return @() }

    $candidates = @()
    foreach ($vol in $allVolumes) {
        if ($StableVolumes -contains $vol) { continue }
        if ($vol -notmatch '_(postgres-data|minio-data|redis-data|mailpit-data)$') { continue }

        $inspectResult = Invoke-DockerSilently -Arguments @("volume", "inspect", $vol, "--format", "{{json .Labels}}")
        if ($inspectResult.ExitCode -ne 0 -or -not $inspectResult.StdOut) { continue }
        $inspect = $inspectResult.StdOut | ConvertFrom-Json
        if (-not $inspect) { continue }
        $composeVolume = $inspect.'com.docker.compose.volume'
        $project = $inspect.'com.docker.compose.project'
        if (-not $composeVolume -or -not $project) { continue }

        $kind = $matches[1]
        $candidates += [pscustomobject]@{
            Name          = $vol
            Project       = $project
            Kind          = $kind
            ComposeVolume = $composeVolume
        }
    }

    $groups = $candidates | Group-Object -Property Project
    $verified = @()
    foreach ($g in $groups) {
        $pg = $g.Group | Where-Object { $_.Kind -eq 'postgres-data' } | Select-Object -First 1
        $minio = $g.Group | Where-Object { $_.Kind -eq 'minio-data' } | Select-Object -First 1
        if (-not $pg) { continue }

        $suffix = Get-Date -Format 'yyyyMMdd-HHmmss-fff'
        $diagVol = "letschat-diag-$($g.Name)-$suffix"
        $diagContainer = "letschat-diag-$($g.Name)-$suffix"
        try {
            Start-DiagnosticPostgres -SourceVolume $pg.Name -DiagnosticVolume $diagVol -ContainerName $diagContainer -Port $DiagnosticPort -Image $PostgresImage

            $dbs = Get-DatabasesOnContainer -Container $diagContainer
            if (-not $dbs -or $dbs -notcontains 'letschat_local') { continue }

            if (-not (Test-HasRequiredTables -Container $diagContainer -DatabaseName 'letschat_local')) { continue }

            $counts = Get-DatabaseCountsFromContainer -Container $diagContainer -DatabaseName 'letschat_local'
            if (-not $counts -or $counts.users -eq 0) { continue }

            $redis = $g.Group | Where-Object { $_.Kind -eq 'redis-data' } | Select-Object -First 1
            $mailpit = $g.Group | Where-Object { $_.Kind -eq 'mailpit-data' } | Select-Object -First 1

            $verified += [pscustomobject]@{
                Project      = $g.Name
                DatabaseName = 'letschat_local'
                Counts       = $counts
                Volumes      = [ordered]@{
                    Postgres = $pg.Name
                    Minio    = if ($minio) { $minio.Name } else { $null }
                    Redis    = if ($redis) { $redis.Name } else { $null }
                    Mailpit  = if ($mailpit) { $mailpit.Name } else { $null }
                }
            }
        }
        finally {
            Stop-DiagnosticPostgres -ContainerName $diagContainer -DiagnosticVolume $diagVol
        }
    }
    return @($verified)
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
    "Invoke-Native"
    "Invoke-DockerSilently"
    "Remove-DockerContainer"
    "Remove-DockerVolume"
    "Copy-DockerVolume"
    "Wait-PostgresReady"
    "Get-DatabasesOnContainer"
    "Test-HasRequiredTables"
    "Get-DatabaseCountsFromContainer"
    "Get-DatabaseCounts"
    "Start-DiagnosticPostgres"
    "Stop-DiagnosticPostgres"
    "Find-LegacyLetsChatVolumes"
    "Backup-LetsChatDataIfPopulated"
)
