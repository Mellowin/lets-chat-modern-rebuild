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

function Test-VolumeReadable($Volume) {
    <#
    .SYNOPSIS
        Verifies that a Docker volume is readable. An empty volume is considered
        readable; only access failures return $false. A missing volume returns $false.
    #>
    if (-not (Test-DockerVolumeExists $Volume)) { return $false }
    $result = Invoke-DockerSilently -Arguments @("run", "--rm", "-v", "${Volume}:/vol:ro", "alpine", "sh", "-c", "ls /vol >/dev/null 2>&1")
    return ($result.ExitCode -eq 0)
}

function Test-VolumeNonEmpty($Volume) {
    <#
    .SYNOPSIS
        Verifies that a Docker volume contains at least one entry. Use this only
        when emptiness is genuinely an error. A missing volume returns $false.
    #>
    if (-not (Test-DockerVolumeExists $Volume)) { return $false }
    $result = Invoke-DockerSilently -Arguments @("run", "--rm", "-v", "${Volume}:/vol:ro", "alpine", "sh", "-c", "find /vol -mindepth 1 -print -quit")
    return ($result.ExitCode -eq 0 -and $result.StdOut)
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

function Stop-ContainersUsingVolume($Name) {
    <#
    .SYNOPSIS
        Stops and removes any running container that mounts the given Docker volume.
    #>
    $result = Invoke-DockerSilently -Arguments @("ps", "-q", "--filter", "volume=${Name}")
    if ($result.ExitCode -eq 0 -and $result.StdOut) {
        $ids = @($result.StdOut -split "`r?`n" | ForEach-Object { $_.Trim() } | Where-Object { $_ })
        foreach ($id in $ids) {
            Invoke-DockerSilently -Arguments @("rm", "-f", $id) | Out-Null
        }
    }
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

function Get-LetsChatRunningPostgresContainerForVolume {
    <#
    .SYNOPSIS
        Returns the name of a running container whose image matches postgres* and mounts the given volume.
        Returns $null if no healthy running container is found.
    #>
    param(
        [Parameter(Mandatory)] [string]$Volume
    )
    $result = Invoke-DockerSilently -Arguments @("ps", "-q", "--filter", "volume=${Volume}")
    if ($result.ExitCode -eq 0 -and $result.StdOut) {
        $ids = @($result.StdOut -split "`r?`n" | ForEach-Object { $_.Trim() } | Where-Object { $_ })
        foreach ($id in $ids) {
            $status = Invoke-DockerSilently -Arguments @("inspect", "--format", "{{.State.Status}}", $id)
            if ($status.ExitCode -eq 0 -and $status.StdOut -eq "running") {
                $image = Invoke-DockerSilently -Arguments @("inspect", "--format", "{{.Config.Image}}", $id)
                if ($image.ExitCode -eq 0 -and $image.StdOut -like "postgres*") {
                    $name = Invoke-DockerSilently -Arguments @("inspect", "--format", "{{.Name}}", $id)
                    if ($name.ExitCode -eq 0 -and $name.StdOut) {
                        return $name.StdOut.Trim().TrimStart('/')
                    }
                    return $id
                }
            }
        }
    }
    return $null
}

function Start-TemporaryPostgresContainer {
    <#
    .SYNOPSIS
        Starts a uniquely named temporary PostgreSQL container on the supplied volume,
        waits for pg_isready, and returns the container name. No host port is exposed.
    #>
    param(
        [Parameter(Mandatory)] [string]$ContainerName,
        [Parameter(Mandatory)] [string]$Volume,
        [string]$Image = "postgres:15-alpine",
        [int]$TimeoutSeconds = 90
    )
    if (-not (Test-DockerVolumeExists $Volume)) {
        throw "PostgreSQL volume '$Volume' does not exist. Cannot start temporary container."
    }
    Invoke-Native docker @(
        "run", "-d", "--name", $ContainerName,
        "-e", "POSTGRES_USER=letschat",
        "-e", "POSTGRES_PASSWORD=letschat",
        "-v", "${Volume}:/var/lib/postgresql/data",
        $Image
    ) | Out-Null
    if (-not (Wait-PostgresReady -Container $ContainerName -TimeoutSeconds $TimeoutSeconds)) {
        $logs = docker logs $ContainerName 2>&1
        Remove-DockerContainer $ContainerName
        throw "Temporary PostgreSQL container '$ContainerName' did not become ready.`nLogs:`n$logs"
    }
    return $ContainerName
}

function New-PostgresLogicalDump {
    <#
    .SYNOPSIS
        Creates a custom-format pg_dump of the specified database from a running container
        and copies it to a local file path.
    #>
    param(
        [Parameter(Mandatory)] [string]$Container,
        [Parameter(Mandatory)] [string]$DatabaseName,
        [Parameter(Mandatory)] [string]$DumpPath,
        [string]$User = "letschat"
    )
    $containerDump = "/tmp/letschat-dump-$(Get-Date -Format 'yyyyMMdd-HHmmss-fff').dump"
    try {
        Invoke-Native docker @("exec", $Container, "pg_dump", "-U", $User, "-d", $DatabaseName, "-Fc", "-f", $containerDump)
        Invoke-Native docker @("cp", "${Container}:${containerDump}", $DumpPath)
    }
    finally {
        Invoke-DockerSilently -Arguments @("exec", $Container, "rm", "-f", $containerDump) | Out-Null
    }
}

function Restore-PostgresLogicalDump {
    <#
    .SYNOPSIS
        Creates the target database on the container and restores a custom-format pg_dump
        with --no-owner --no-acl. Warnings (exit code 1) are tolerated if validation passes.
    #>
    param(
        [Parameter(Mandatory)] [string]$Container,
        [Parameter(Mandatory)] [string]$DatabaseName,
        [Parameter(Mandatory)] [string]$DumpPath,
        [string]$User = "letschat"
    )
    $containerDump = "/tmp/letschat-restore-$(Get-Date -Format 'yyyyMMdd-HHmmss-fff').dump"
    Invoke-Native docker @("cp", $DumpPath, "${Container}:${containerDump}")
    try {
        Invoke-DockerSilently -Arguments @("exec", $Container, "psql", "-U", $User, "-d", "postgres", "-c", "CREATE DATABASE `"$DatabaseName`";") | Out-Null
        $restore = Invoke-DockerSilently -Arguments @("exec", $Container, "pg_restore", "-U", $User, "-d", $DatabaseName, "--no-owner", "--no-acl", $containerDump)
        if ($restore.ExitCode -ne 0 -and $restore.ExitCode -ne 1) {
            throw "pg_restore failed with exit code $($restore.ExitCode): $($restore.StdErr)"
        }
    }
    finally {
        Invoke-DockerSilently -Arguments @("exec", $Container, "rm", "-f", $containerDump) | Out-Null
    }
}

function Test-DatabaseOpenable {
    <#
    .SYNOPSIS
        Returns $true if a simple psql SELECT succeeds against the database.
    #>
    param(
        [Parameter(Mandatory)] [string]$Container,
        [Parameter(Mandatory)] [string]$DatabaseName,
        [string]$User = "letschat"
    )
    $result = Invoke-DockerSilently -Arguments @("exec", $Container, "psql", "-U", $User, "-d", $DatabaseName, "-t", "-A", "-c", "SELECT 1;")
    return ($result.ExitCode -eq 0 -and $result.StdOut -match "1")
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
    <#
    .SYNOPSIS
        Discovers legacy LetsChat Docker volume sets and verifies the PostgreSQL database
        content via a logical dump/restore cycle, never a raw PGDATA copy.

    .OUTPUTS
        Array of [pscustomobject] with Project, DatabaseName, Counts, Volumes.
    #>
    param(
        [string[]]$StableVolumes = ((Get-LetsChatExpectedVolumes).Values),
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

        $timestamp = Get-Date -Format 'yyyyMMdd-HHmmss-fff'
        $randomSuffix = Get-Random -Minimum 1000 -Maximum 9999
        $suffix = "${timestamp}-${randomSuffix}"
        $dumpPath = Join-Path $env:TEMP "letschat-legacy-dump-$suffix.dump"
        $sourceContainer = $null
        $sourceWasTemporary = $false
        $diagVol = "letschat-diag-$suffix"
        $diagContainer = "letschat-diag-$suffix"

        try {
            # 1. Discover or start a temporary source container for the legacy postgres volume.
            $sourceContainer = Get-LetsChatRunningPostgresContainerForVolume -Volume $pg.Name
            if (-not $sourceContainer) {
                $sourceContainer = "letschat-legacy-src-$suffix"
                Start-TemporaryPostgresContainer -ContainerName $sourceContainer -Volume $pg.Name -Image $PostgresImage | Out-Null
                $sourceWasTemporary = $true
            }

            # 2. Verify the legacy database exists and is populated.
            $dbs = Get-DatabasesOnContainer -Container $sourceContainer
            if (-not $dbs -or $dbs -notcontains 'letschat_local') { continue }

            if (-not (Test-HasRequiredTables -Container $sourceContainer -DatabaseName 'letschat_local')) { continue }

            $counts = Get-DatabaseCountsFromContainer -Container $sourceContainer -DatabaseName 'letschat_local'
            if (-not $counts -or $counts.users -eq 0) { continue }

            # 3. Create a custom-format logical dump from the source container.
            New-PostgresLogicalDump -Container $sourceContainer -DatabaseName 'letschat_local' -DumpPath $dumpPath

            # 4. Create a fresh diagnostic volume and restore the dump into it.
            Invoke-Native docker @("volume", "create", $diagVol) | Out-Null
            Start-TemporaryPostgresContainer -ContainerName $diagContainer -Volume $diagVol -Image $PostgresImage | Out-Null
            Restore-PostgresLogicalDump -Container $diagContainer -DatabaseName 'letschat_local' -DumpPath $dumpPath

            # 5. Validate the diagnostic database: exists, has required tables, and counts match.
            $diagDbs = Get-DatabasesOnContainer -Container $diagContainer
            if (-not $diagDbs -or $diagDbs -notcontains 'letschat_local') {
                throw "Diagnostic database 'letschat_local' missing after restore"
            }
            if (-not (Test-HasRequiredTables -Container $diagContainer -DatabaseName 'letschat_local')) {
                throw "Diagnostic required tables missing after restore"
            }
            $diagCounts = Get-DatabaseCountsFromContainer -Container $diagContainer -DatabaseName 'letschat_local'
            if (-not $diagCounts) {
                throw "Could not read diagnostic database counts after restore"
            }
            foreach ($key in $counts.Keys) {
                if ($diagCounts[$key] -ne $counts[$key]) {
                    throw "Diagnostic count mismatch for $key`: source $($counts[$key]), diagnostic $($diagCounts[$key])"
                }
            }

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
        catch {
            Write-Warning "Legacy candidate $($g.Name) verification failed: $_"
            continue
        }
        finally {
            # 6. Remove any temporary source container and the diagnostic container/volume.
            if ($sourceContainer -and $sourceWasTemporary) {
                Remove-DockerContainer $sourceContainer
            }
            if ($diagContainer) { Remove-DockerContainer $diagContainer }
            if ($diagVol) { Remove-DockerVolume $diagVol }
            if ($dumpPath -and (Test-Path $dumpPath)) { Remove-Item -LiteralPath $dumpPath -Force -ErrorAction SilentlyContinue }
        }
    }
    return @($verified)
}

function Migrate-LegacyToStable {
    <#
    .SYNOPSIS
        Migrates a verified legacy LetsChat installation into the stable volume set
        using a logical dump/restore for PostgreSQL and Copy-DockerVolume for the other
        file-backed volumes. Never copies raw PostgreSQL PGDATA.

    .PARAMETER Legacy
        PSCustomObject returned by Find-LegacyLetsChatVolumes.

    .OUTPUTS
        Hashtable @{ SourceCounts = @{}; DestCounts = @{} }
    #>
    param(
        [Parameter(Mandatory)] [object]$Legacy,
        [hashtable]$StableVolumes = (Get-LetsChatExpectedVolumes),
        [string]$PostgresImage = "postgres:15-alpine",
        [int]$TimeoutSeconds = 90,
        [switch]$AllowExistingStableVolumes
    )
    $timestamp = Get-Date -Format 'yyyyMMdd-HHmmss-fff'
    $randomSuffix = Get-Random -Minimum 1000 -Maximum 9999
    $suffix = "${timestamp}-${randomSuffix}"
    $dumpPath = Join-Path $env:TEMP "letschat-migrate-dump-$suffix.dump"
    $sourceContainer = $null
    $sourceWasTemporary = $false
    $stableContainer = "letschat-migrate-stable-$suffix"
    $stablePgVolume = $StableVolumes.Postgres
    $stablePgExisted = Test-DockerVolumeExists $stablePgVolume
    $migrationSuccess = $false

    # Defense in depth: refuse to migrate when any destination stable volume already exists unless explicitly allowed.
    $existingStable = @()
    foreach ($key in $StableVolumes.Keys) {
        if (Test-DockerVolumeExists $StableVolumes[$key]) { $existingStable += $StableVolumes[$key] }
    }
    if ($existingStable.Count -gt 0 -and -not $AllowExistingStableVolumes) {
        throw "Migration refused because destination stable volume(s) already exist: $($existingStable -join ', '). Migrate-LegacyToStable will not overlay existing data. Remove the volumes or pass -AllowExistingStableVolumes explicitly for a disposable test."
    }

    try {
        # Ensure all stable destination volumes exist.
        foreach ($key in $StableVolumes.Keys) {
            $vol = $StableVolumes[$key]
            if (-not (Test-DockerVolumeExists $vol)) {
                Invoke-Native docker @("volume", "create", $vol) | Out-Null
            }
        }

        # 1. Discover or start a temporary source container on the legacy postgres volume.
        $sourceContainer = Get-LetsChatRunningPostgresContainerForVolume -Volume $Legacy.Volumes.Postgres
        if (-not $sourceContainer) {
            $sourceContainer = "letschat-migrate-src-$suffix"
            Start-TemporaryPostgresContainer -ContainerName $sourceContainer -Volume $Legacy.Volumes.Postgres -Image $PostgresImage -TimeoutSeconds $TimeoutSeconds | Out-Null
            $sourceWasTemporary = $true
        }

        # 2. Verify the source database and collect counts.
        $dbs = Get-DatabasesOnContainer -Container $sourceContainer
        if (-not $dbs -or $dbs -notcontains 'letschat_local') {
            throw "Source database 'letschat_local' not found on legacy volume $($Legacy.Volumes.Postgres)"
        }
        if (-not (Test-HasRequiredTables -Container $sourceContainer -DatabaseName 'letschat_local')) {
            throw "Required tables missing in source database 'letschat_local'"
        }
        $sourceCounts = Get-DatabaseCountsFromContainer -Container $sourceContainer -DatabaseName 'letschat_local'
        if (-not $sourceCounts) {
            throw "Could not read source database counts"
        }

        # 3. Create a custom-format logical dump.
        New-PostgresLogicalDump -Container $sourceContainer -DatabaseName 'letschat_local' -DumpPath $dumpPath

        # 4. Remove any temporary source container before starting the destination server.
        if ($sourceWasTemporary) {
            Remove-DockerContainer $sourceContainer
            $sourceContainer = $null
        }

        # 5. Start a fresh stable PostgreSQL container and restore the dump.
        Start-TemporaryPostgresContainer -ContainerName $stableContainer -Volume $stablePgVolume -Image $PostgresImage -TimeoutSeconds $TimeoutSeconds | Out-Null
        Restore-PostgresLogicalDump -Container $stableContainer -DatabaseName 'letschat_local' -DumpPath $dumpPath

        # 6. Validate the destination database.
        $stableDbs = Get-DatabasesOnContainer -Container $stableContainer
        if (-not $stableDbs -or $stableDbs -notcontains 'letschat_local') {
            throw "Stable database 'letschat_local' not found after restore"
        }
        if (-not (Test-HasRequiredTables -Container $stableContainer -DatabaseName 'letschat_local')) {
            throw "Required tables missing in stable database after restore"
        }
        $destCounts = Get-DatabaseCountsFromContainer -Container $stableContainer -DatabaseName 'letschat_local'
        if (-not $destCounts) {
            throw "Could not read destination database counts after restore"
        }
        foreach ($key in $sourceCounts.Keys) {
            if ($destCounts[$key] -ne $sourceCounts[$key]) {
                throw "Destination count mismatch for $key`: source $($sourceCounts[$key]), destination $($destCounts[$key])"
            }
        }
        if (-not (Test-DatabaseOpenable -Container $stableContainer -DatabaseName 'letschat_local')) {
            throw "Destination database 'letschat_local' is not openable"
        }

        Remove-DockerContainer $stableContainer
        $stableContainer = $null

        # 7. Copy MinIO / Redis / Mailpit volumes, stopping only containers that mount the legacy volume.
        foreach ($kind in @("Minio", "Redis", "Mailpit")) {
            $legacyVol = $Legacy.Volumes[$kind]
            $stableVol = $StableVolumes[$kind]
            if (-not $legacyVol -or -not (Test-DockerVolumeExists $legacyVol)) { continue }

            $mounting = Invoke-DockerSilently -Arguments @("ps", "-q", "--filter", "volume=${legacyVol}")
            if ($mounting.ExitCode -eq 0 -and $mounting.StdOut) {
                $ids = @($mounting.StdOut -split "`r?`n" | ForEach-Object { $_.Trim() } | Where-Object { $_ })
                foreach ($id in $ids) {
                    Invoke-DockerSilently -Arguments @("stop", $id) | Out-Null
                    Invoke-DockerSilently -Arguments @("rm", $id) | Out-Null
                }
            }

            if (-not (Test-DockerVolumeExists $stableVol)) {
                Invoke-Native docker @("volume", "create", $stableVol) | Out-Null
            }
            Copy-DockerVolume -From $legacyVol -To $stableVol
        }

        # 8. Validate destination MinIO volume is readable (empty is acceptable for a legacy install with no attachments).
        $minioCheck = Invoke-DockerSilently -Arguments @("run", "--rm", "-v", "$($StableVolumes.Minio):/data:ro", "alpine", "ls", "/data")
        if ($minioCheck.ExitCode -ne 0) {
            throw "MinIO destination volume is not readable after migration"
        }

        $migrationSuccess = $true
        return @{ SourceCounts = $sourceCounts; DestCounts = $destCounts }
    }
    catch {
        throw "Migration from legacy installation $($Legacy.Project) failed. Recovery: inspect the legacy volume '$($Legacy.Volumes.Postgres)' and stable volume '$stablePgVolume'; no legacy data was deleted. Details: $_"
    }
    finally {
        if ($dumpPath -and (Test-Path $dumpPath)) { Remove-Item -LiteralPath $dumpPath -Force -ErrorAction SilentlyContinue }
        if ($sourceContainer -and $sourceWasTemporary) { Remove-DockerContainer $sourceContainer }
        if ($stableContainer) { Remove-DockerContainer $stableContainer }
        # Roll back the stable postgres volume only if this migration created it and failed.
        if (-not $migrationSuccess -and -not $stablePgExisted -and (Test-DockerVolumeExists $stablePgVolume)) {
            Remove-DockerVolume $stablePgVolume
        }
    }
}

function Test-SafeDatabaseName {
    <#
    .SYNOPSIS
        Validates that a database identifier is safe to use in SQL. Allows only
        unquoted PostgreSQL identifiers: [A-Za-z_][A-Za-z0-9_]*. Rejects reserved
        system databases such as template0, template1 and postgres.
    #>
    param(
        [Parameter(Mandatory)] [AllowEmptyString()] [string]$Name
    )
    if ([string]::IsNullOrWhiteSpace($Name)) { return $false }
    $reserved = @("template0", "template1", "postgres")
    if ($reserved -contains $Name) { return $false }
    return $Name -cmatch '^[A-Za-z_][A-Za-z0-9_]*$'
}

function Get-LetsChatRunningMinioContainersForVolume {
    <#
    .SYNOPSIS
        Returns the names of running containers whose image matches minio* and mount
        the given volume. Only returns verified LetsChat MinIO containers.
    #>
    param(
        [Parameter(Mandatory)] [string]$Volume
    )
    $result = Invoke-DockerSilently -Arguments @("ps", "-q", "--filter", "volume=${Volume}")
    $containers = @()
    if ($result.ExitCode -eq 0 -and $result.StdOut) {
        $ids = @($result.StdOut -split "`r?`n" | ForEach-Object { $_.Trim() } | Where-Object { $_ })
        foreach ($id in $ids) {
            $status = Invoke-DockerSilently -Arguments @("inspect", "--format", "{{.State.Status}}", $id)
            if ($status.ExitCode -ne 0 -or $status.StdOut -ne "running") { continue }
            $image = Invoke-DockerSilently -Arguments @("inspect", "--format", "{{.Config.Image}}", $id)
            if ($image.ExitCode -ne 0 -or $image.StdOut -notlike "minio*") { continue }
            $name = Invoke-DockerSilently -Arguments @("inspect", "--format", "{{.Name}}", $id)
            if ($name.ExitCode -eq 0 -and $name.StdOut) {
                $containers += $name.StdOut.Trim().TrimStart('/')
            }
            else {
                $containers += $id
            }
        }
    }
    return $containers
}

function Get-MinioVolumeFileCount {
    <#
    .SYNOPSIS
        Counts user files in a MinIO Docker volume (recursive), excluding MinIO
        internal metadata under .minio.sys/. Returns -1 on error.
    #>
    param(
        [Parameter(Mandatory)] [string]$Volume
    )
    $result = Invoke-DockerSilently -Arguments @("run", "--rm", "-v", "${Volume}:/data:ro", "alpine", "sh", "-c", "find /data -type f | grep -vF '.minio.sys' | wc -l")
    if ($result.ExitCode -ne 0) { return -1 }
    $count = 0
    if ([int]::TryParse($result.StdOut.Trim(), [ref]$count)) { return $count }
    return -1
}

function Get-ValidMinioFileCount {
    <#
    .SYNOPSIS
        Validates a manifest minioFileCount value as a non-negative integer.
        Throws a clear compatibility error for missing, invalid or negative values.
    #>
    param(
        [Parameter(Mandatory)] [object]$ManifestValue
    )
    if ($null -eq $ManifestValue) {
        throw "Manifest is missing required 'minioFileCount'. This backup was created before MinIO file-count tracking and cannot be restored safely. Create a new backup with the current backup script."
    }
    $parsed = 0
    if (-not ([int]::TryParse([string]$ManifestValue, [ref]$parsed))) {
        throw "Manifest minioFileCount '$ManifestValue' is not a valid integer. Refusing to restore."
    }
    if ($parsed -lt 0) {
        throw "Manifest minioFileCount '$parsed' is negative. Refusing to restore."
    }
    return $parsed
}

function Test-MinioArchiveSafe {
    <#
    .SYNOPSIS
        Validates a tar.gz MinIO archive: readable, no absolute paths. Returns the
        number of user files (excluding MinIO internal .minio.sys/ metadata) on
        success, throws otherwise.
    #>
    param(
        [Parameter(Mandatory)] [string]$ArchivePath
    )
    if (-not (Test-Path $ArchivePath)) { throw "MinIO archive not found: $ArchivePath" }
    $list = Invoke-DockerSilently -Arguments @("run", "--rm", "-v", "${ArchivePath}:/archive.tar.gz:ro", "alpine", "tar", "tzf", "/archive.tar.gz")
    if ($list.ExitCode -ne 0) { throw "MinIO archive is not readable: $($list.StdErr)" }
    $entries = @($list.StdOut -split "`r?`n" | Where-Object { $_.Trim() })
    if ($entries.Count -eq 0) { throw "MinIO archive is empty" }
    foreach ($entry in $entries) {
        if ($entry -match '^/') { throw "MinIO archive contains absolute path: $entry" }
    }
    $files = $entries | Where-Object { -not $_.EndsWith('/') -and $_ -notmatch '\.minio\.sys' }
    return $files.Count
}

function Get-MinioArchiveFileCount {
    <#
    .SYNOPSIS
        Returns the number of user files in a MinIO tar.gz archive without
        extracting it, excluding MinIO internal .minio.sys/ metadata.
        Returns -1 on error.
    #>
    param(
        [Parameter(Mandatory)] [string]$ArchivePath
    )
    if (-not (Test-Path $ArchivePath)) { return -1 }
    $list = Invoke-DockerSilently -Arguments @("run", "--rm", "-v", "${ArchivePath}:/archive.tar.gz:ro", "alpine", "tar", "tzf", "/archive.tar.gz")
    if ($list.ExitCode -ne 0) { return -1 }
    $entries = @($list.StdOut -split "`r?`n" | Where-Object { $_.Trim() })
    $files = $entries | Where-Object { -not $_.EndsWith('/') -and $_ -notmatch '\.minio\.sys' }
    return $files.Count
}

function Confirm-ReplaceActiveDatabaseAllowed {
    <#
    .SYNOPSIS
        Verifies that a ReplaceActive operation is safe for the requested database name.
        The manifest database name must match the installation marker database name, so
        the local API configuration stays consistent with the restored data.
    #>
    param(
        [Parameter(Mandatory)] [string]$TargetDatabase
    )
    $marker = Read-InstallMarker
    $expected = if ($marker -and $marker.databaseName) { $marker.databaseName } else { "letschat_local" }
    if ($TargetDatabase -ne $expected) {
        throw "ReplaceActive database mismatch: manifest database is '$TargetDatabase' but the local installation marker expects '$expected'. Refusing to replace active volumes with a database name the application configuration cannot use. Either update the marker/.env/database configuration to match or perform a Drill-only restore."
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

function Install-LocalDataGuardrails {
    <#
    .SYNOPSIS
        Decides how to proceed when the installation marker is missing or invalid.
        Populated stable volumes win over legacy candidates. Migration is only allowed
        when no stable volumes exist and exactly one verified legacy installation is found.
    #>
    param(
        [string]$MarkerPath = (Get-LetsChatInstallMarkerPath),
        [hashtable]$StableVolumes = (Get-LetsChatExpectedVolumes)
    )
    $expected = $StableVolumes
    $markerStatus = Test-InstallMarkerStructure -MarkerPath $MarkerPath
    $legacyCandidates = Find-LegacyLetsChatVolumes -StableVolumes $StableVolumes.Values

    switch ($markerStatus) {
        "Valid" {
            $marker = Read-InstallMarker -MarkerPath $MarkerPath
            if (-not (Test-ExpectedVolumes -Marker $marker)) {
                Write-Host "CRITICAL: Installation marker volume names do not match expected stable volumes." -ForegroundColor Red
                throw "Aborting startup due to marker/volume mismatch."
            }
            if ($legacyCandidates.Count -gt 0) {
                Write-Host "Installation marker is valid; ignoring $($legacyCandidates.Count) legacy installation(s)." -ForegroundColor Yellow
            }
            Write-Host "Installation marker is valid and stable volumes exist." -ForegroundColor Green
            return $false
        }
        "VolumeMissing" {
            $latest = Get-LatestBackup
            Write-Host "CRITICAL: Installation marker exists but expected volume is missing." -ForegroundColor Red
            Write-Host "Possible data loss. Do not start a fresh empty database." -ForegroundColor Red
            if ($legacyCandidates.Count -gt 0) {
                Write-Host "Legacy installations detected: $($legacyCandidates.Project -join ', ')" -ForegroundColor Cyan
                Write-Host "You may recover by migrating a legacy installation manually." -ForegroundColor Cyan
            }
            if ($latest) {
                Write-Host "Newest backup: $($latest.FullName)" -ForegroundColor Cyan
                Write-Host "Run: .\restore-letschat-local-data.bat -BackupPath `"$($latest.FullName)`" -ReplaceActive" -ForegroundColor Cyan
            }
            throw "Aborting startup due to missing expected volume."
        }
        "VolumeMismatch" {
            Write-Host "CRITICAL: Installation marker volume names do not match expected stable volumes." -ForegroundColor Red
            throw "Aborting startup due to marker/volume mismatch."
        }
        "MarkerCorrupt" {
            Write-Host "Installation marker is corrupt: $MarkerPath" -ForegroundColor Red
            throw "Aborting startup. Please inspect or remove the marker file."
        }
    }

    # Marker is missing. Inspect stable volumes first.
    $stablePgExists = Test-DockerVolumeExists $expected.Postgres
    $stableMinioExists = Test-DockerVolumeExists $expected.Minio
    $stableRedisExists = Test-DockerVolumeExists $expected.Redis
    $stableMailpitExists = Test-DockerVolumeExists $expected.Mailpit

    if ($stablePgExists) {
        # Inspect the stable PostgreSQL volume before deciding anything.
        $pgContainer = Get-LetsChatRunningPostgresContainerForVolume -Volume $expected.Postgres
        $startedTemp = $false
        if (-not $pgContainer) {
            $pgContainer = "letschat-stable-diag-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
            Start-TemporaryPostgresContainer -ContainerName $pgContainer -Volume $expected.Postgres | Out-Null
            $startedTemp = $true
        }

        $hasDb = $false
        $tablesOk = $false
        $counts = $null
        try {
            $dbs = Get-DatabasesOnContainer -Container $pgContainer
            $hasDb = ($dbs -contains 'letschat_local')
            if ($hasDb) {
                $tablesOk = Test-HasRequiredTables -Container $pgContainer -DatabaseName 'letschat_local'
                if ($tablesOk) {
                    $counts = Get-DatabaseCountsFromContainer -Container $pgContainer -DatabaseName 'letschat_local'
                }
            }
        }
        finally {
            if ($startedTemp) { Remove-DockerContainer $pgContainer }
        }

        if ($hasDb -and $tablesOk -and $counts -and $counts.users -gt 0) {
            # Case A: populated, valid stable installation wins. Do not migrate legacy.
            if ($legacyCandidates.Count -gt 0) {
                Write-Host "Populated stable installation found. Ignoring $($legacyCandidates.Count) legacy installation(s) without migrating." -ForegroundColor Yellow
            }
            Write-InstallMarker -DatabaseName 'letschat_local' -MarkerPath $MarkerPath | Out-Null
            Write-Host "Installation marker recreated for existing populated stable installation." -ForegroundColor Green
            return $false
        }

        # Case B: partial or ambiguous stable installation.
        Write-Host "CRITICAL: Stable volume(s) exist but the installation is not a valid, populated LetsChat database." -ForegroundColor Red
        Write-Host "Diagnostics: stablePostgresExists=$stablePgExists, stableMinioExists=$stableMinioExists, stableRedisExists=$stableRedisExists, stableMailpitExists=$stableMailpitExists, databaseFound=$hasDb, tablesOk=$tablesOk, users=$($counts.users)" -ForegroundColor Red
        Write-Host "Do not migrate, do not initialize, and do not delete anything." -ForegroundColor Red
        if ($legacyCandidates.Count -gt 0) {
            Write-Host "Legacy candidate(s) preserved: $($legacyCandidates.Project -join ', ')" -ForegroundColor Cyan
        }
        throw "Aborting startup due to partial or ambiguous stable installation."
    }

    if ($stableMinioExists -or $stableRedisExists -or $stableMailpitExists) {
        # PostgreSQL volume is missing but other stable volumes are present.
        Write-Host "CRITICAL: Stable data exists without the PostgreSQL volume. Cannot safely continue." -ForegroundColor Red
        throw "Aborting startup due to partial stable installation."
    }

    # Case C: no stable volumes at all. Legacy migration is allowed only with exactly one verified candidate.
    if ($legacyCandidates.Count -gt 1) {
        Write-Host "Multiple verified legacy LetsChat installations found. Cannot guess which to migrate:" -ForegroundColor Red
        foreach ($c in $legacyCandidates) {
            Write-Host "  - Project $($c.Project): PG volume $($c.Volumes.Postgres), users=$($c.Counts.users), messages=$($c.Counts.messages)" -ForegroundColor Red
        }
        throw "Aborting startup. Please remove unwanted legacy volumes or migrate manually."
    }

    if ($legacyCandidates.Count -eq 1) {
        $legacy = $legacyCandidates[0]
        Write-Host "No stable installation found. Legacy installation found ($($legacy.Project)). Migrating to stable volumes with logical PostgreSQL dump/restore..." -ForegroundColor Yellow
        $migration = Migrate-LegacyToStable -Legacy $legacy -StableVolumes $StableVolumes
        Write-Host "Migration complete. Source: users=$($migration.SourceCounts.users), messages=$($migration.SourceCounts.messages), attachments=$($migration.SourceCounts.attachments), workspaces=$($migration.SourceCounts.workspaces)" -ForegroundColor Green
        Write-Host "Migration complete. Destination: users=$($migration.DestCounts.users), messages=$($migration.DestCounts.messages), attachments=$($migration.DestCounts.attachments), workspaces=$($migration.DestCounts.workspaces)" -ForegroundColor Green
        return $false
    }

    # No stable data and no verified legacy data. Check for backup before treating as first install.
    $latest = Get-LatestBackup
    if ($latest) {
        Write-Host "No local data found, but a backup exists: $($latest.FullName)" -ForegroundColor Yellow
        Write-Host "A fresh install will create empty volumes. To restore from backup, cancel and run:" -ForegroundColor Yellow
        Write-Host "  .\restore-letschat-local-data.bat -BackupPath `"$($latest.FullName)`" -ReplaceActive" -ForegroundColor Yellow
    }

    $anyStable = $stablePgExists -or $stableMinioExists -or $stableRedisExists -or $stableMailpitExists
    Write-Host "No existing data found. Initializing a new local installation." -ForegroundColor Cyan
    foreach ($key in $expected.Keys) {
        if (-not (Test-DockerVolumeExists $expected[$key])) {
            Invoke-Native docker @("volume", "create", $expected[$key])
        }
    }
    return -not $anyStable
}

function Confirm-LocalDatabaseState {
    <#
    .SYNOPSIS
        Validates the running database after infrastructure containers are started.
    #>
    param([string]$MarkerPath = (Get-LetsChatInstallMarkerPath))
    $expected = Get-LetsChatExpectedVolumes
    $markerStatus = Test-InstallMarkerStructure -MarkerPath $MarkerPath

    # Wait for PostgreSQL to be reachable before validating content.
    if (-not (Wait-PostgresReady -Container "letschat-postgres" -TimeoutSeconds 90)) {
        $logs = docker logs letschat-postgres 2>&1
        throw "PostgreSQL did not become ready within timeout. Container logs:`n$logs"
    }

    $counts = $null
    try {
        $counts = Confirm-RunningDatabaseState -Container "letschat-postgres" -DatabaseName "letschat_local"
    }
    catch {
        if ($markerStatus -eq "Valid") {
            throw "Installation marker is valid but database validation failed: $_"
        }
        # For a missing marker, an empty/uninitialized database is a normal first-install state.
        Write-Host "Database is empty or not yet initialized: $_" -ForegroundColor Yellow
    }

    switch ($markerStatus) {
        "Valid" {
            if (-not $counts -or $counts.users -eq 0) {
                $latest = Get-LatestBackup
                Write-Host "CRITICAL: Installation marker exists but the database is unexpectedly empty." -ForegroundColor Red
                Write-Host "Do not seed a replacement database silently." -ForegroundColor Red
                if ($latest) {
                    Write-Host "Newest backup: $($latest.FullName)" -ForegroundColor Cyan
                    Write-Host "Run: .\restore-letschat-local-data.bat -BackupPath `"$($latest.FullName)`" -ReplaceActive" -ForegroundColor Cyan
                }
                throw "Aborting startup due to empty database."
            }
            Write-Host "Existing database confirmed: $($counts.users) user(s), $($counts.messages) message(s)." -ForegroundColor Green
            return
        }
        "VolumeMissing" {
            Write-Host "CRITICAL: Installation marker exists but expected volume is missing." -ForegroundColor Red
            throw "Aborting startup due to missing expected volume."
        }
        "VolumeMismatch" {
            Write-Host "CRITICAL: Installation marker volume names do not match expected stable volumes." -ForegroundColor Red
            throw "Aborting startup due to marker/volume mismatch."
        }
        "MarkerCorrupt" {
            Write-Host "Installation marker is corrupt: $MarkerPath" -ForegroundColor Red
            throw "Aborting startup. Please inspect or remove the marker file."
        }
    }

    # Marker missing
    $stablePgExists = Test-DockerVolumeExists $expected.Postgres
    $stableMinioExists = Test-DockerVolumeExists $expected.Minio

    if ($stablePgExists -and $stableMinioExists) {
        if (-not $counts -or $counts.users -eq 0) {
            Write-Host "Stable volumes exist but database is empty. Treating as first install." -ForegroundColor Yellow
            return $false
        }
        else {
            Write-Host "Stable volumes exist but installation marker is missing. Recreating marker." -ForegroundColor Yellow
            Write-InstallMarker -MarkerPath $MarkerPath | Out-Null
            Write-Host "Installation marker recreated." -ForegroundColor Green
        }
        return $false
    }

    throw "Unable to confirm local database state. Please inspect Docker volumes and installation marker."
}

Export-ModuleMember -Function @(
    "Get-LetsChatInstallMarkerPath"
    "Get-LetsChatBackupRoot"
    "Get-LetsChatExpectedVolumes"
    "Test-DockerVolumeExists"
    "Test-VolumeReadable"
    "Test-VolumeNonEmpty"
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
    "Stop-ContainersUsingVolume"
    "Copy-DockerVolume"
    "Wait-PostgresReady"
    "Get-DatabasesOnContainer"
    "Test-HasRequiredTables"
    "Get-DatabaseCountsFromContainer"
    "Get-DatabaseCounts"
    "Get-LetsChatRunningPostgresContainerForVolume"
    "Start-TemporaryPostgresContainer"
    "New-PostgresLogicalDump"
    "Restore-PostgresLogicalDump"
    "Test-DatabaseOpenable"
    "Start-DiagnosticPostgres"
    "Stop-DiagnosticPostgres"
    "Find-LegacyLetsChatVolumes"
    "Migrate-LegacyToStable"
    "Test-SafeDatabaseName"
    "Get-LetsChatRunningMinioContainersForVolume"
    "Get-MinioVolumeFileCount"
    "Get-ValidMinioFileCount"
    "Test-MinioArchiveSafe"
    "Get-MinioArchiveFileCount"
    "Confirm-ReplaceActiveDatabaseAllowed"
    "Backup-LetsChatDataIfPopulated"
    "Install-LocalDataGuardrails"
    "Confirm-LocalDatabaseState"
)
