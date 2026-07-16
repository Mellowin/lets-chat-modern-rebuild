#Requires -Version 5.1
<#
.SYNOPSIS
    One-button start for the full LetsChat local dev stack.

.DESCRIPTION
    - Kills anything still holding ports 3000/3001 (old web/api dev servers).
    - Makes sure Docker is running and starts postgres/redis/minio (and mailpit only when requested).
    - Ensures .env exists, loads it, and fills missing local-only defaults.
    - Runs pnpm install, Prisma generate and migrations.
    - Starts API and Web in separate hidden PowerShell windows (API only in -VercelBackend mode).
    - Prints local URLs; does not open browser unless requested.

.USAGE
    Right-click scripts/start-local-dev.ps1 -> "Run with PowerShell"
    Or double-click:  start-local-dev.bat
    Or for local Mailpit inbox:  start-local-dev-mailpit.bat
    Or with browser:   start-local-dev-and-open.bat
    Or for Vercel backend only: start-vercel-local-backend.bat
#>

param(
    [switch]$Mailpit,
    [switch]$OpenBrowser,
    [switch]$VercelBackend
)

$ErrorActionPreference = "Continue"

# Resolve repo root (script is in /scripts)
$RepoRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $RepoRoot

Import-Module "$PSScriptRoot\lib\local-data-utils.psm1" -Force

function Write-Info($msg) { Write-Host $msg -ForegroundColor Cyan }
function Write-Ok($msg) { Write-Host $msg -ForegroundColor Green }
function Write-Warn($msg) { Write-Host $msg -ForegroundColor Yellow }
function Write-Err($msg) { Write-Host $msg -ForegroundColor Red }

$script:FreshInstall = $false

function Install-LocalDataGuardrails() {
    $expected = Get-LetsChatExpectedVolumes
    $markerStatus = Test-InstallMarkerStructure
    $legacyCandidates = Find-LegacyLetsChatVolumes

    switch ($markerStatus) {
        "Valid" {
            $marker = Read-InstallMarker
            if (-not (Test-ExpectedVolumes -Marker $marker)) {
                Write-Err "CRITICAL: Installation marker volume names do not match expected stable volumes."
                throw "Aborting startup due to marker/volume mismatch."
            }
            if ($legacyCandidates.Count -gt 0) {
                Write-Warn "Installation marker is valid; ignoring $($legacyCandidates.Count) legacy installation(s)."
            }
            Write-Ok "Installation marker is valid and stable volumes exist."
            return
        }
        "VolumeMissing" {
            $latest = Get-LatestBackup
            Write-Err "CRITICAL: Installation marker exists but expected volume is missing."
            Write-Err "Possible data loss. Do not start a fresh empty database."
            if ($legacyCandidates.Count -gt 0) {
                Write-Info "Legacy installations detected: $($legacyCandidates.Project -join ', ')"
                Write-Info "You may recover by migrating a legacy installation manually."
            }
            if ($latest) {
                Write-Info "Newest backup: $($latest.FullName)"
                Write-Info "Run: .\restore-letschat-local-data.bat -BackupPath `"$($latest.FullName)`" -ReplaceActive"
            }
            throw "Aborting startup due to missing expected volume."
        }
        "VolumeMismatch" {
            Write-Err "CRITICAL: Installation marker volume names do not match expected stable volumes."
            throw "Aborting startup due to marker/volume mismatch."
        }
        "MarkerCorrupt" {
            Write-Err "Installation marker is corrupt: $(Get-LetsChatInstallMarkerPath)"
            throw "Aborting startup. Please inspect or remove the marker file."
        }
    }

    # Marker is missing.
    $stablePgExists = Test-DockerVolumeExists $expected.Postgres
    $stableMinioExists = Test-DockerVolumeExists $expected.Minio
    $stableRedisExists = Test-DockerVolumeExists $expected.Redis
    $stableMailpitExists = Test-DockerVolumeExists $expected.Mailpit

    if ($legacyCandidates.Count -gt 1) {
        Write-Err "Multiple verified legacy LetsChat installations found. Cannot guess which to migrate:"
        foreach ($c in $legacyCandidates) {
            Write-Err "  - Project $($c.Project): PG volume $($c.Volumes.Postgres), users=$($c.Counts.users), messages=$($c.Counts.messages)"
        }
        throw "Aborting startup. Please remove unwanted legacy volumes or migrate manually."
    }

    if ($legacyCandidates.Count -eq 1) {
        $legacy = $legacyCandidates[0]
        Write-Warn "Legacy installation found ($($legacy.Project)). Migrating to stable volumes..."
        foreach ($key in $expected.Keys) {
            $stable = $expected[$key]
            $legacyVol = $legacy.Volumes[$key]
            if (-not (Test-DockerVolumeExists $stable)) {
                Invoke-Native docker @("volume", "create", $stable)
            }
            if ($legacyVol -and (Test-DockerVolumeExists $legacyVol)) {
                Copy-DockerVolume -From $legacyVol -To $stable
            }
        }
        Write-Ok "Migration copy complete. Marker will be created after DB is reachable."
        return
    }

    # No stable data and no verified legacy data. Check for backup before treating as first install.
    $latest = Get-LatestBackup
    if ($latest) {
        Write-Warn "No local data found, but a backup exists: $($latest.FullName)"
        Write-Warn "A fresh install will create empty volumes. To restore from backup, cancel and run:"
        Write-Warn "  .\restore-letschat-local-data.bat -BackupPath `"$($latest.FullName)`" -ReplaceActive"
    }

    $anyStable = $stablePgExists -or $stableMinioExists -or $stableRedisExists -or $stableMailpitExists
    Write-Info "No existing data found. Initializing a new local installation."
    foreach ($key in $expected.Keys) {
        if (-not (Test-DockerVolumeExists $expected[$key])) {
            Invoke-Native docker @("volume", "create", $expected[$key])
        }
    }
    $script:FreshInstall = -not $anyStable
    Write-Ok "New installation volumes created."
}

function Confirm-LocalDatabaseState() {
    $expected = Get-LetsChatExpectedVolumes
    $markerStatus = Test-InstallMarkerStructure

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
        Write-Warn "Database is empty or not yet initialized: $_"
    }

    switch ($markerStatus) {
        "Valid" {
            if (-not $counts -or $counts.users -eq 0) {
                $latest = Get-LatestBackup
                Write-Err "CRITICAL: Installation marker exists but the database is unexpectedly empty."
                Write-Err "Do not seed a replacement database silently."
                if ($latest) {
                    Write-Info "Newest backup: $($latest.FullName)"
                    Write-Info "Run: .\restore-letschat-local-data.bat -BackupPath `"$($latest.FullName)`" -ReplaceActive"
                }
                throw "Aborting startup due to empty database."
            }
            Write-Ok "Existing database confirmed: $($counts.users) user(s), $($counts.messages) message(s)."
            return
        }
        "VolumeMissing" {
            Write-Err "CRITICAL: Installation marker exists but expected volume is missing."
            throw "Aborting startup due to missing expected volume."
        }
        "VolumeMismatch" {
            Write-Err "CRITICAL: Installation marker volume names do not match expected stable volumes."
            throw "Aborting startup due to marker/volume mismatch."
        }
        "MarkerCorrupt" {
            Write-Err "Installation marker is corrupt: $(Get-LetsChatInstallMarkerPath)"
            throw "Aborting startup. Please inspect or remove the marker file."
        }
    }

    # Marker missing
    $stablePgExists = Test-DockerVolumeExists $expected.Postgres
    $stableMinioExists = Test-DockerVolumeExists $expected.Minio

    if ($stablePgExists -and $stableMinioExists) {
        if (-not $counts -or $counts.users -eq 0) {
            Write-Warn "Stable volumes exist but database is empty. Treating as first install."
            $script:FreshInstall = $true
        }
        else {
            Write-Warn "Stable volumes exist but installation marker is missing. Recreating marker."
            Write-InstallMarker | Out-Null
            Write-Ok "Installation marker recreated."
        }
        return
    }

    throw "Unable to confirm local database state. Please inspect Docker volumes and installation marker."
}

function Assert-Command($Name) {
    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
        throw "$Name is not installed or not in PATH"
    }
}

function Invoke-Native($Cmd, $ArgsArray) {
    $global:LASTEXITCODE = 0
    & $Cmd @ArgsArray
    $exit = $global:LASTEXITCODE
    if ($exit -ne 0) {
        throw "Command '$Cmd $ArgsArray' exited with code $exit"
    }
}

function Test-TcpPort($Port, $TimeoutSeconds = 60) {
    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    while ($sw.Elapsed.TotalSeconds -lt $TimeoutSeconds) {
        $client = $null
        try {
            $client = New-Object System.Net.Sockets.TcpClient
            $client.Connect("localhost", $Port)
            if ($client.Connected) {
                return $true
            }
        }
        catch {}
        finally {
            if ($client) { $client.Dispose() }
        }
        Start-Sleep -Seconds 1
    }
    return $false
}

function Test-ApiHealth($TimeoutSeconds = 60) {
    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    while ($sw.Elapsed.TotalSeconds -lt $TimeoutSeconds) {
        try {
            $code = curl.exe -s -o nul -w "%{http_code}" http://localhost:3001/api/v1/health
            if ($code -eq "200") {
                return $true
            }
        }
        catch {}
        Start-Sleep -Seconds 1
    }
    return $false
}

function Stop-ProcessOnPort($Port) {
    $killed = $false

    # Method 1: PowerShell NetTCPConnection (preferred)
    try {
        $conns = Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue |
            Where-Object { $_.OwningProcess -and $_.OwningProcess -ne 0 -and $_.OwningProcess -ne 4 }
        if ($conns) {
            $procIds = $conns | Select-Object -ExpandProperty OwningProcess -Unique
            foreach ($procId in $procIds) {
                try {
                    $proc = Get-Process -Id $procId -ErrorAction SilentlyContinue
                    if ($proc) {
                        Write-Warn "Stopping $($proc.ProcessName) (PID $procId) on port $Port"
                        Stop-Process -Id $procId -Force -ErrorAction Stop
                        $killed = $true
                    }
                }
                catch {
                    Write-Err "Could not kill process PID $procId on port $Port`: $_"
                }
            }
        }
    }
    catch {
        Write-Warn "Get-NetTCPConnection failed for port $Port`: $_"
    }

    # Method 2: netstat + taskkill fallback
    if (-not $killed) {
        try {
            $lines = netstat -ano | Select-String ":$Port\s"
            foreach ($line in $lines) {
                $parts = $line.Line -split "\s+"
                $procId = $parts[-1]
                if ($procId -and $procId -match "^\d+$") {
                    Write-Warn "Killing PID $procId on port $Port via taskkill"
                    taskkill /PID $procId /F 2>&1 | Out-Null
                    $killed = $true
                }
            }
        }
        catch {
            Write-Err "taskkill fallback failed for port $Port`: $_"
        }
    }

    if (-not $killed) {
        Write-Info "Port $Port is free"
    }
}

function Stop-DevServerProcesses([switch]$IncludeWeb = $true) {
    $patterns = @(
        "pnpm.*--filter api start:dev",
        "nest start --watch"
    )
    if ($IncludeWeb) {
        $patterns += @(
            "pnpm.*--filter web dev",
            "next dev"
        )
    }
    $procs = Get-CimInstance Win32_Process -Filter "Name='node.exe'" -ErrorAction SilentlyContinue |
        Where-Object {
            $cmd = $_.CommandLine
            if (-not $cmd) { return $false }
            foreach ($pat in $patterns) {
                if ($cmd -match $pat) { return $true }
            }
            return $false
        }
    foreach ($proc in $procs) {
        try {
            $summary = if ($proc.CommandLine.Length -gt 80) { $proc.CommandLine.Substring(0, 80) + "..." } else { $proc.CommandLine }
            Write-Warn "Stopping stale dev server (PID $($proc.ProcessId)): $summary"
            Stop-Process -Id $proc.ProcessId -Force -ErrorAction SilentlyContinue
        }
        catch {
            Write-Err "Could not stop stale dev server PID $($proc.ProcessId): $_"
        }
    }
}

function Find-DockerDesktop() {
    $candidates = @(
        "C:\Program Files\Docker\Docker\Docker Desktop.exe"
        "$env:LOCALAPPDATA\Programs\Docker\Docker\Docker Desktop.exe"
    )
    foreach ($c in $candidates) {
        if (Test-Path $c) { return $c }
    }

    try {
        $regPaths = @(
            "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*"
            "HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*"
        )
        foreach ($rp in $regPaths) {
            $item = Get-ItemProperty $rp -ErrorAction SilentlyContinue |
                Where-Object { $_.DisplayName -like "*Docker Desktop*" -and $_.InstallLocation } |
                Select-Object -First 1
            if ($item) {
                $exe = Join-Path $item.InstallLocation "Docker Desktop.exe"
                if (Test-Path $exe) { return $exe }
            }
        }
    }
    catch {}

    try {
        $where = (Get-Command "Docker Desktop.exe" -ErrorAction SilentlyContinue).Source
        if ($where -and (Test-Path $where)) { return $where }
    }
    catch {}

    return $null
}

function Test-DockerReady() {
    try {
        $info = docker info 2>&1
        return ($info -match "Server:")
    }
    catch {
        return $false
    }
}

function Stop-DockerDesktop() {
    $names = @("Docker Desktop", "Docker.Service", "com.docker.backend", "com.docker.proxy")
    foreach ($n in $names) {
        Get-Process $n -ErrorAction SilentlyContinue | ForEach-Object {
            Write-Warn "Killing Docker process: $($_.Name) (PID $($_.Id))"
            Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue
        }
    }
    Start-Sleep -Seconds 3
}

function Start-DockerDesktop($ExePath, [switch]$AsAdmin) {
    if (-not $ExePath) { return }
    Write-Warn "Starting Docker Desktop from $ExePath ..."
    try {
        if ($AsAdmin) {
            Start-Process $ExePath -Verb runas -ErrorAction Stop
        }
        else {
            Start-Process $ExePath -ErrorAction Stop
        }
    }
    catch {
        Write-Warn "Direct launch failed ($($_.Exception.Message)); trying explorer.exe..."
        try {
            Start-Process explorer.exe -ArgumentList "`"$ExePath`"" -ErrorAction Stop
        }
        catch {
            throw "Could not start Docker Desktop: $_"
        }
    }
}

function Ensure-Docker() {
    # Already running?
    for ($i = 0; $i -lt 10; $i++) {
        if (Test-DockerReady) { return }
        Start-Sleep -Seconds 1
    }

    $exe = Find-DockerDesktop
    if (-not $exe) {
        throw "Docker Desktop executable not found. Please install Docker Desktop or add it to PATH."
    }

    # Try starting the background service (works only when running as admin)
    try {
        $svc = Get-Service "com.docker.service" -ErrorAction SilentlyContinue
        if ($svc -and $svc.Status -ne "Running") {
            Write-Warn "Starting Docker background service..."
            Start-Service "com.docker.service" -ErrorAction SilentlyContinue
        }
    }
    catch {}

    # Attempt 1: normal launch
    Start-DockerDesktop $exe
    $maxWait = 180
    Write-Info "Waiting up to $maxWait seconds for Docker Engine..."
    for ($i = 0; $i -lt $maxWait; $i++) {
        if (Test-DockerReady) {
            Write-Ok "Docker Engine is ready"
            return
        }
        Start-Sleep -Seconds 1
    }

    # Attempt 2: kill all Docker processes and restart
    Write-Warn "Docker did not become ready. Restarting Docker Desktop..."
    Stop-DockerDesktop
    Start-DockerDesktop $exe
    Write-Info "Waiting up to $maxWait seconds for Docker Engine (restart attempt)..."
    for ($i = 0; $i -lt $maxWait; $i++) {
        if (Test-DockerReady) {
            Write-Ok "Docker Engine is ready"
            return
        }
        Start-Sleep -Seconds 1
    }

    # Attempt 3: try with admin rights (UAC prompt will appear)
    Write-Warn "Docker still not ready. Trying to start with administrator rights..."
    Stop-DockerDesktop
    Start-DockerDesktop $exe -AsAdmin
    Write-Info "Waiting up to $maxWait seconds for Docker Engine (admin attempt)..."
    for ($i = 0; $i -lt $maxWait; $i++) {
        if (Test-DockerReady) {
            Write-Ok "Docker Engine is ready"
            return
        }
        Start-Sleep -Seconds 1
    }

    throw @"
Docker Engine did not become ready after multiple attempts.
Please start Docker Desktop manually from the Start menu, wait until it shows "Engine running",
then run start-local-dev.bat again.
"@
}

function Load-DotEnv($Path) {
    if (-not (Test-Path $Path)) { return }
    Get-Content $Path | ForEach-Object {
        $line = $_.Trim()
        if ($line -eq "" -or $line.StartsWith("#")) { return }
        $idx = $line.IndexOf("=")
        if ($idx -gt 0) {
            $key = $line.Substring(0, $idx).Trim()
            $value = $line.Substring($idx + 1).Trim()
            # Strip surrounding quotes
            if (($value.StartsWith('"') -and $value.EndsWith('"')) -or
                ($value.StartsWith("'") -and $value.EndsWith("'"))) {
                $value = $value.Substring(1, $value.Length - 2)
            }
            [Environment]::SetEnvironmentVariable($key, $value, "Process")
        }
    }
}

function Ensure-LocalEnv() {
    # If .env is missing, copy the example so the user can edit it later.
    if (-not (Test-Path "$RepoRoot\.env") -and (Test-Path "$RepoRoot\.env.example")) {
        Write-Warn ".env not found. Copying from .env.example..."
        Copy-Item "$RepoRoot\.env.example" "$RepoRoot\.env"
    }

    # Load .env and .env.local (process env wins, so existing vars are preserved)
    Load-DotEnv "$RepoRoot\.env"
    Load-DotEnv "$RepoRoot\.env.local"

    # Fill any missing required local-dev defaults
    $defaults = [ordered]@{
        BCRYPT_SALT_ROUNDS = "12"
        JWT_ACCESS_SECRET = "local-dev-access-secret-at-least-32-characters-long"
        JWT_REFRESH_SECRET = "local-dev-refresh-secret-at-least-32-characters-long"
        JWT_ACCESS_EXPIRES_IN = "15m"
        JWT_REFRESH_EXPIRES_IN = "7d"
        NODE_ENV = "development"
    }
    foreach ($kv in $defaults.GetEnumerator()) {
        if ([string]::IsNullOrWhiteSpace([Environment]::GetEnvironmentVariable($kv.Key, "Process"))) {
            [Environment]::SetEnvironmentVariable($kv.Key, $kv.Value, "Process")
            Write-Warn "Environment variable $($kv.Key) was missing; using local dev default."
        }
    }

    # These values must match the local Docker Compose services started by this script.
    # They are intentionally forced so an outdated .env cannot break migrations.
    $localOverrides = [ordered]@{
        DATABASE_URL = "postgresql://letschat:letschat@localhost:5432/letschat_local?schema=public"
        REDIS_URL = "redis://localhost:6379"
        S3_ENDPOINT = "http://localhost:9000"
        S3_REGION = "us-east-1"
        S3_ACCESS_KEY = "minioadmin"
        S3_SECRET_KEY = "minioadmin"
        S3_BUCKET = "letschat-uploads"
        S3_FORCE_PATH_STYLE = "true"
        CORS_ORIGIN = "http://localhost:3000,http://127.0.0.1:3000,https://lets-chat-web.vercel.app"
        APP_WEB_URL = "http://localhost:3000"
        NEXT_PUBLIC_API_URL = "http://localhost:3001/api/v1"
        NEXT_PUBLIC_WS_URL = "http://localhost:3001"
    }
    foreach ($kv in $localOverrides.GetEnumerator()) {
        $existing = [Environment]::GetEnvironmentVariable($kv.Key, "Process")
        if ($existing -and $existing -ne $kv.Value) {
            Write-Warn "Overriding $($kv.Key) with local Docker value."
        }
        [Environment]::SetEnvironmentVariable($kv.Key, $kv.Value, "Process")
    }

    Write-Info "DATABASE_URL = $env:DATABASE_URL"

    if ($VercelBackend) {
        [Environment]::SetEnvironmentVariable("APP_WEB_URL", "https://lets-chat-web.vercel.app", "Process")
    }
}

function Apply-MailpitOverrides() {
    $mailpitOverrides = [ordered]@{
        MAIL_PROVIDER = "smtp"
        SMTP_HOST = "localhost"
        SMTP_PORT = "1025"
        SMTP_SECURE = "false"
        SMTP_USER = "mailpit"
        SMTP_PASS = "mailpit"
        SMTP_FROM = "noreply@example.com"
    }
    foreach ($kv in $mailpitOverrides.GetEnumerator()) {
        [Environment]::SetEnvironmentVariable($kv.Key, $kv.Value, "Process")
    }
}

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
Write-Info "=== LetsChat local dev starter ==="
Write-Info "Repo root: $RepoRoot"

# 1. Validate tools
Assert-Command node
Assert-Command pnpm
Assert-Command docker

# 2. Load/fill environment
Ensure-LocalEnv

# 3. Choose mail mode
if ($Mailpit -or $env:USE_MAILPIT -eq "true") {
    Apply-MailpitOverrides
    Write-Info "Mail mode: Mailpit local inbox http://localhost:8025"
}
else {
    Write-Info "Mail mode: real provider from .env"
}

# 4. Kill any leftover dev server processes from previous runs
Stop-DevServerProcesses -IncludeWeb:(-not $VercelBackend)

# 5. Free dev-server ports
$devPorts = if ($VercelBackend) { @(3001) } else { @(3000, 3001) }
foreach ($p in $devPorts) {
    Stop-ProcessOnPort $p
}

# 6. Ensure Docker and start infrastructure
Ensure-Docker

# 6a. Guardrails for permanent local data (container-independent)
Install-LocalDataGuardrails

Write-Info "Stopping any previous LetsChat containers..."
docker compose down --remove-orphans --timeout 10 2>$null | Out-Null
if ($LASTEXITCODE -ne 0) {
    Write-Warn "docker compose down exited with code $LASTEXITCODE (continuing anyway)"
}

$containers = @("postgres", "redis", "minio")
$infra = @(
    @{ Port = 5432; Name = "Postgres" },
    @{ Port = 6379; Name = "Redis" },
    @{ Port = 9000; Name = "MinIO" }
)
if ($Mailpit) {
    $containers += "mailpit"
    $infra += @{ Port = 8025; Name = "Mailpit" }
}

$containerList = $containers -join ", "
Write-Info "Starting $containerList containers..."
Invoke-Native docker (@("compose", "up", "-d") + $containers)
foreach ($svc in $infra) {
    Write-Info "Waiting for $($svc.Name) on port $($svc.Port)..."
    if (-not (Test-TcpPort -Port $svc.Port -TimeoutSeconds 90)) {
        throw "$($svc.Name) did not become ready on port $($svc.Port)"
    }
    Write-Ok "$($svc.Name) is ready"
}

# 6b. Confirm database state now that the container is running
Confirm-LocalDatabaseState

# 7. Dependencies
Write-Info "Installing dependencies (pnpm install)..."
Invoke-Native pnpm @("install")

# 8. Database
Write-Info "Generating Prisma client..."
Invoke-Native pnpm @("db:generate")

# Safety backup before applying migrations when data already exists.
if (-not $script:FreshInstall) {
    $preMigrationBackup = Backup-LetsChatDataIfPopulated -Reason "pre-migration"
    if ($preMigrationBackup) {
        Write-Info "Pre-migration backup: $($preMigrationBackup.FullName)"
    }
}
else {
    Write-Info "Fresh install: skipping pre-migration backup."
}

Write-Info "Running local migrations..."
Invoke-Native pnpm @("db:migrate:local")

Write-Info "Seeding local data..."
Invoke-Native pnpm @("db:seed:local")

if ($script:FreshInstall -and -not (Read-InstallMarker)) {
    Write-InstallMarker | Out-Null
    Write-Ok "Installation marker created for new installation."
}

# 9. Start API
$ApiOut = "$RepoRoot\logs\dev-api.out.log"
$ApiErr = "$RepoRoot\logs\dev-api.err.log"
$WebOut = "$RepoRoot\logs\dev-web.out.log"
$WebErr = "$RepoRoot\logs\dev-web.err.log"
New-Item -ItemType Directory -Path "$RepoRoot\logs" -Force | Out-Null

Write-Info "Starting API (port 3001)..."
Start-Process powershell -WindowStyle Hidden -ArgumentList @(
    "-NoExit",
    "-Command",
    "Set-Location -LiteralPath '$RepoRoot'; `$env:PORT = '3001'; pnpm dev:api"
) -RedirectStandardOutput $ApiOut -RedirectStandardError $ApiErr
if (-not (Test-TcpPort -Port 3001 -TimeoutSeconds 120)) {
    throw "API did not start on port 3001. See $ApiErr"
}
Write-Ok "API is running on http://localhost:3001"

if (-not $VercelBackend) {
    # 10. Start Web
    Write-Info "Starting Web (port 3000)..."
    Start-Process powershell -WindowStyle Hidden -ArgumentList @(
        "-NoExit",
        "-Command",
        "Set-Location -LiteralPath '$RepoRoot'; `$env:PORT = '3000'; pnpm dev:web"
    ) -RedirectStandardOutput $WebOut -RedirectStandardError $WebErr
    if (-not (Test-TcpPort -Port 3000 -TimeoutSeconds 180)) {
        throw "Web did not start on port 3000. See $WebErr"
    }
    Write-Ok "Web is running on http://localhost:3000"

    # 11. Optionally open browser
    if ($OpenBrowser) {
        try {
            Start-Process "http://localhost:3000" | Out-Null
        }
        catch {
            Write-Warn "Could not open browser automatically: $_"
        }
    }
}

# 12. Verify API health
Write-Info "Waiting for API health endpoint..."
if (-not (Test-ApiHealth -TimeoutSeconds 60)) {
    throw "API health check did not return 200. See $ApiErr"
}
Write-Ok "API health is 200"

Write-Ok ""
if ($VercelBackend) {
    $volumes = Get-LetsChatExpectedVolumes
    $counts = Get-DatabaseCounts
    $latestBackup = Get-LatestBackup
    $marker = Read-InstallMarker
    $installKind = if ($marker) { "existing" } else { "first-install" }

    Write-Ok "=== Vercel + local backend is ready ==="
    Write-Info "Vercel frontend is connected to LOCAL API."
    Write-Info "Render is not used."
    Write-Info "Database:     letschat_local"
    Write-Info "PG volume:    $($volumes.Postgres)"
    Write-Info "MinIO volume: $($volumes.Minio)"
    if ($counts) {
        Write-Info "Users:        $($counts.users), Messages: $($counts.messages), Attachments: $($counts.attachments), Workspaces: $($counts.workspaces)"
    }
    Write-Info "Installation: $installKind"
    Write-Info "Marker:       $(Get-LetsChatInstallMarkerPath)"
    if ($latestBackup) {
        Write-Info "Latest backup: $($latestBackup.Name)"
    }
    else {
        Write-Warn "No successful backup found yet."
    }
    Write-Info "Vercel Web:   https://lets-chat-web.vercel.app"
    Write-Info "Local API:    http://localhost:3001/api/v1"
    Write-Info "API health:   http://localhost:3001/api/v1/health"
    if ($Mailpit) {
        Write-Info "Mailpit:      http://localhost:8025"
    }
    else {
        Write-Info "Mail mode:    real provider from .env"
    }
    Write-Info "Override URL: https://lets-chat-web.vercel.app/login?apiUrl=http://localhost:3001/api/v1&wsUrl=ws://localhost:3001"
    Write-Warn "Run stop-vercel-local-backend.bat to stop."
}
else {
    Write-Ok "=== All set ==="
    Write-Info "Web:     http://localhost:3000"
    Write-Info "API:     http://localhost:3001/api/v1/health"
    if ($Mailpit) {
        Write-Info "Mailpit: http://localhost:8025"
    }
    else {
        Write-Info "Mail mode: real provider from .env"
    }
    Write-Warn "Close the API and Web PowerShell windows to stop the dev servers."
    Write-Warn "Run 'docker compose down' to stop infrastructure."
}
