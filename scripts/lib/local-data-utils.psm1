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
    param([string]$MarkerPath = $script:MarkerFile)
    if (-not (Test-Path $MarkerPath)) { return $null }
    try {
        return Get-Content $MarkerPath -Raw | ConvertFrom-Json
    }
    catch {
        throw "Installation marker at '$MarkerPath' is not valid JSON: $_"
    }
}

function Write-InstallMarker {
    param(
        [string]$InstallId = [guid]::NewGuid().ToString(),
        [string]$DatabaseName = "letschat_local",
        [string]$MarkerPath = $script:MarkerFile
    )
    $dir = Split-Path -Parent $MarkerPath
    if (-not (Test-Path $dir)) {
        New-Item -ItemType Directory -Path $dir -Force | Out-Null
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
    $marker | ConvertTo-Json -Depth 3 | Out-File -FilePath $MarkerPath -Encoding utf8
    return $marker
}

enum MarkerStatus {
    Missing
    Valid
    VolumeMissing
    VolumeMismatch
    MarkerCorrupt
    DatabaseEmpty
}

function Test-InstallMarkerStructure {
    param([string]$MarkerPath = $script:MarkerFile)
    $marker = $null
    try {
        $marker = Read-InstallMarker -MarkerPath $MarkerPath
    }
    catch {
        return [MarkerStatus]::MarkerCorrupt
    }
    if (-not $marker) {
        return [MarkerStatus]::Missing
    }
    $requiredFields = @('postgresVolume', 'minioVolume', 'redisVolume', 'mailpitVolume', 'databaseName')
    foreach ($field in $requiredFields) {
        if (-not $marker.$field) {
            return [MarkerStatus]::MarkerCorrupt
        }
    }

    $pgExists = Test-DockerVolumeExists $marker.postgresVolume
    $minioExists = Test-DockerVolumeExists $marker.minioVolume
    $redisExists = Test-DockerVolumeExists $marker.redisVolume
    $mailpitExists = Test-DockerVolumeExists $marker.mailpitVolume
    if (-not $pgExists -or -not $minioExists -or -not $redisExists -or -not $mailpitExists) {
        return [MarkerStatus]::VolumeMissing
    }

    return [MarkerStatus]::Valid
}

function Test-ExpectedVolumes {
    param(
        [Parameter(Mandatory)] [object]$Marker,
        [hashtable]$ExpectedVolumes = (Get-LetsChatExpectedVolumes)
    )
    if (
        $Marker.postgresVolume -ne $ExpectedVolumes.Postgres -or
        $Marker.minioVolume -ne $ExpectedVolumes.Minio -or
        $Marker.redisVolume -ne $ExpectedVolumes.Redis -or
        $Marker.mailpitVolume -ne $ExpectedVolumes.Mailpit
    ) {
        return $false
    }
    return $true
}

function Confirm-RunningDatabaseState {
    param(
        [string]$Container = "letschat-postgres",
        [string]$DatabaseName = "letschat_local",
        [int]$TimeoutSeconds = 90
    )
    if (-not (Wait-PostgresReady -Container $Container -TimeoutSeconds $TimeoutSeconds)) {
        $logs = docker logs $Container 2>&1
        throw "PostgreSQL container '$Container' did not become ready within ${TimeoutSeconds}s.`nContainer logs:`n$logs"
    }

    $dbs = Get-DatabasesOnContainer -Container $Container
    if (-not $dbs -or $dbs -notcontains $DatabaseName) {
        throw "Database '$DatabaseName' not found on running container '$Container'. Available databases: $($dbs -join ', ')"
    }

    if (-not (Test-HasRequiredTables -Container $Container -DatabaseName $DatabaseName)) {
        throw "Required tables are missing in database '$DatabaseName' on container '$Container'."
    }

    $counts = Get-DatabaseCountsFromContainer -Container $Container -DatabaseName $DatabaseName
    if (-not $counts) {
        throw "Could not read database counts from running container '$Container'."
    }
    return $counts
}

function Test-DockerContainerRunning($Name) {
    $result = Invoke-DockerSilently -Arguments @("ps", "-q", "-f", "name=^${Name}$")
    return ($result.ExitCode -eq 0 -and -not [string]::IsNullOrWhiteSpace($result.StdOut))
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

function Start-BackupPostgres {
    param(
        [Parameter(Mandatory)] [string]$ContainerName,
        [string]$SourceVolume = "letschat-postgres-data",
        [string]$Image = "postgres:15-alpine",
        [int]$TimeoutSeconds = 90
    )
    if (-not (Test-DockerVolumeExists $SourceVolume)) {
        throw "PostgreSQL volume '$SourceVolume' does not exist. Cannot start backup container."
    }
    Invoke-Native docker @(
        "run", "-d", "--name", $ContainerName,
        "-e", "POSTGRES_USER=letschat",
        "-e", "POSTGRES_PASSWORD=letschat",
        "-v", "${SourceVolume}:/var/lib/postgresql/data",
        $Image
    ) | Out-Null
    if (-not (Wait-PostgresReady -Container $ContainerName -TimeoutSeconds $TimeoutSeconds)) {
        $logs = docker logs $ContainerName 2>&1
        Stop-BackupPostgres -ContainerName $ContainerName
        throw "Backup PostgreSQL container '$ContainerName' did not become ready.`nLogs:`n$logs"
    }
    return $ContainerName
}

function Stop-BackupPostgres($ContainerName) {
    Remove-DockerContainer $ContainerName
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
    "Test-InstallMarkerStructure"
    "Test-ExpectedVolumes"
    "Confirm-RunningDatabaseState"
    "Test-DockerContainerRunning"
    "Start-BackupPostgres"
    "Stop-BackupPostgres"
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
