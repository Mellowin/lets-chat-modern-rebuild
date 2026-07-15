#Requires -Version 5.1
<#
.SYNOPSIS
    Wait until the local API health endpoint returns HTTP 200.
#>
param(
    [string]$HealthUrl = "http://localhost:3001/api/v1/health",
    [int]$TimeoutSeconds = 60
)

$sw = [System.Diagnostics.Stopwatch]::StartNew()
while ($sw.Elapsed.TotalSeconds -lt $TimeoutSeconds) {
    try {
        $code = curl.exe -s -o nul -w "%{http_code}" $HealthUrl
        if ($code -eq "200") {
            Write-Host "API health: 200 OK" -ForegroundColor Green
            exit 0
        }
    }
    catch {}
    Start-Sleep -Seconds 1
}

Write-Host "ERROR: Local API did not become healthy within $TimeoutSeconds seconds." -ForegroundColor Red
exit 1
