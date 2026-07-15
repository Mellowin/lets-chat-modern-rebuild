#Requires -Version 5.1
<#
.SYNOPSIS
    Create or reset a local LetsChat account for this computer only.

.DESCRIPTION
    Prompts for account details with masked password input, then calls the
    API setup script against the local Docker Postgres database.

    Use -GeneratePassword to create a strong random password instead of
    prompting for one. The generated password is printed once at the end.
#>
param(
    [string]$Email,
    [string]$Username,
    [string]$DisplayName,
    [switch]$GeneratePassword
)

$ErrorActionPreference = "Stop"

$RepoRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $RepoRoot

function Write-Info($msg) { Write-Host $msg -ForegroundColor Cyan }
function Write-Ok($msg) { Write-Host $msg -ForegroundColor Green }
function Write-Err($msg) { Write-Host $msg -ForegroundColor Red }

# Ensure we only ever touch the local Docker database.
$env:DATABASE_URL = "postgresql://letschat:letschat@localhost:5432/letschat_local?schema=public"
$env:NODE_ENV = "development"

function Prompt-Required($label) {
    do {
        $value = Read-Host -Prompt $label
    } while ([string]::IsNullOrWhiteSpace($value))
    return $value.Trim()
}

function Generate-Password {
    $chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*-_+=."
    $bytes = [byte[]]::new(32)
    $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    $rng.GetBytes($bytes)
    $rng.Dispose()
    $password = -join ($bytes | ForEach-Object { $chars[$_ % $chars.Length] })
    return $password
}

try {
    if (-not (Get-Command pnpm -ErrorAction SilentlyContinue)) {
        throw "pnpm is not installed or not in PATH"
    }

    if ([string]::IsNullOrWhiteSpace($Email)) {
        $Email = Prompt-Required "Email address"
    }
    if ([string]::IsNullOrWhiteSpace($Username)) {
        $Username = Prompt-Required "Username"
    }
    if ([string]::IsNullOrWhiteSpace($DisplayName)) {
        $DisplayName = Read-Host -Prompt "Display name (optional)"
    }

    if ($GeneratePassword) {
        $password = Generate-Password
        Write-Info "A strong password has been generated."
    } else {
        $securePassword = Read-Host -Prompt "Password" -AsSecureString
        $password = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto(
            [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)
        )
        if ($password.Length -lt 8) {
            throw "Password must be at least 8 characters"
        }
    }

    $env:SETUP_ACCOUNT_EMAIL = $Email
    $env:SETUP_ACCOUNT_USERNAME = $Username
    $env:SETUP_ACCOUNT_DISPLAY_NAME = $DisplayName
    $env:SETUP_ACCOUNT_PASSWORD = $password

    Write-Info "Provisioning local account..."
    & pnpm --filter api setup:local-account
    if ($LASTEXITCODE -ne 0) {
        throw "Account setup script exited with code $LASTEXITCODE"
    }

    Write-Ok "Account ready."
    if ($GeneratePassword) {
        Write-Host "Temporary password (copy it now, it will not be shown again):" -ForegroundColor Yellow
        Write-Host $password -ForegroundColor Yellow
    }
}
catch {
    Write-Err "Failed: $_"
    exit 1
}
finally {
    # Ensure the password does not remain in the process environment.
    Remove-Item Env:\SETUP_ACCOUNT_PASSWORD -ErrorAction SilentlyContinue
}
