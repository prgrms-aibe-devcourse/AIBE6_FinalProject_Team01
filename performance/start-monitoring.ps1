$ErrorActionPreference = 'Stop'

$repositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$composeFile = Join-Path $repositoryRoot 'backend\compose.yml'

function Wait-HttpReady {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Name,
        [Parameter(Mandatory = $true)]
        [string]$Url
    )

    for ($attempt = 0; $attempt -lt 60; $attempt++) {
        Start-Sleep -Seconds 1
        try {
            $response = Invoke-WebRequest -UseBasicParsing $Url -TimeoutSec 2
            if ($response.StatusCode -eq 200) {
                return
            }
        } catch {
            # Retry until the service is ready.
        }
    }

    throw "$Name was not ready within 60 seconds. Check Docker logs."
}

$performanceLogDirectory = Join-Path $repositoryRoot 'backend\build\performance-logs'
New-Item -ItemType Directory -Force -Path $performanceLogDirectory | Out-Null

docker compose -f $composeFile up -d mysql redis prometheus loki alloy grafana

$grafanaEndpoint = docker compose -f $composeFile port grafana 3000 | Select-Object -First 1
if ($grafanaEndpoint -notmatch ':(\d+)$') {
    throw 'Could not determine the Grafana port.'
}
$grafanaPort = $Matches[1]

$lokiEndpoint = docker compose -f $composeFile port loki 3100 | Select-Object -First 1
if ($lokiEndpoint -notmatch ':(\d+)$') {
    throw 'Could not determine the Loki port.'
}
$lokiPort = $Matches[1]

$alloyEndpoint = docker compose -f $composeFile port alloy 12345 | Select-Object -First 1
if ($alloyEndpoint -notmatch ':(\d+)$') {
    throw 'Could not determine the Alloy port.'
}
$alloyPort = $Matches[1]

Wait-HttpReady -Name 'Prometheus' -Url 'http://localhost:9090/-/ready'
Wait-HttpReady -Name 'Loki' -Url "http://localhost:$lokiPort/ready"
Wait-HttpReady -Name 'Alloy' -Url "http://localhost:$alloyPort/-/ready"
Wait-HttpReady -Name 'Grafana' -Url "http://localhost:$grafanaPort/api/health"

Write-Host 'Prometheus ready: http://localhost:9090'
Write-Host "Loki ready: http://localhost:$lokiPort"
Write-Host "Alloy UI: http://localhost:$alloyPort"
Write-Host "Grafana ready: http://localhost:$grafanaPort"
Write-Host 'Start Spring with the local,performance profiles to collect metrics and logs.'
