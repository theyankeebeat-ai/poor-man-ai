# ai.ps1 — talk to local agent from the repo folder you are in
# Usage:
#   .\ai.ps1 build a voice recorder
#   .\ai.ps1 "build a voice recorder with Vite"
#   & "C:\path\to\Grok Cli Ai Build\cli\ai.ps1" build a voice recorder
param(
  [string]$Uri = "http://127.0.0.1:8000/chat",
  [ValidateSet("code", "research")]
  [string]$Mode = "code",
  [int]$MaxSteps = 16,
  [Parameter(Mandatory = $false, Position = 0, ValueFromRemainingArguments = $true)]
  [string[]]$Prompt
)

$ErrorActionPreference = "Stop"
$root = (Get-Location).Path
$text = (($Prompt | ForEach-Object { "$_" }) -join " ").Trim()
if (-not $text) {
  Write-Error "Usage: ai.ps1 <prompt...>   e.g.  ai.ps1 build a voice recorder"
  exit 1
}

# Health check with a clear message when the API is down
$health = $Uri -replace "/chat/?$", "/health"
try {
  $null = Invoke-WebRequest -Uri $health -Method GET -UseBasicParsing -TimeoutSec 5
} catch {
  Write-Error @"
API not reachable at $health
Start it from the Grok Cli Ai Build folder:
  yarn dev
  # or: yarn dev:api
Then re-run this command from your project folder.
"@
  exit 1
}

$bodyObj = [ordered]@{
  message   = $text
  workspace = $root
  mode      = $Mode
  max_steps = $MaxSteps
}
$body = $bodyObj | ConvertTo-Json -Compress -Depth 5

Write-Host "[cli] workspace=$root mode=$Mode" -ForegroundColor DarkCyan
Write-Host "[cli] prompt=$text" -ForegroundColor DarkCyan

# Keep the agent log OUTSIDE the workspace so create-vite / scaffolders can
# overwrite an "empty" project folder (Tee into the cwd locks _agent_run.log).
$logDir = Join-Path $env:TEMP "grok-ai-cli"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$safeName = ($root -replace '[^a-zA-Z0-9_-]', '_').Trim('_')
if ($safeName.Length -gt 40) { $safeName = $safeName.Substring($safeName.Length - 40) }
$logPath = Join-Path $logDir "$safeName-$stamp.log"
Write-Host "[cli] log=$logPath" -ForegroundColor DarkCyan

try {
  # -UseBasicParsing avoids IE engine; stream-friendly enough for NDJSON bodies.
  $resp = Invoke-WebRequest -Uri $Uri -Method POST -Body $body -ContentType "application/json; charset=utf-8" -TimeoutSec 600 -UseBasicParsing
} catch {
  Write-Error "chat failed: $($_.Exception.Message)"
  if ($_.ErrorDetails -and $_.ErrorDetails.Message) {
    Write-Host $_.ErrorDetails.Message -ForegroundColor Red
  }
  exit 1
}

# Response may be a string or a byte[] depending on PS version / content-type.
$raw = $resp.Content
if ($raw -is [byte[]]) {
  $raw = [System.Text.Encoding]::UTF8.GetString($raw)
}
$raw = [string]$raw
Set-Content -Path $logPath -Value $raw -Encoding UTF8

$raw -split "`n" | ForEach-Object {
  $line = $_.Trim()
  if (-not $line) { return }
  try {
    $ev = $line | ConvertFrom-Json
  } catch {
    Write-Host $line
    return
  }
  switch ($ev.type) {
    "plan" { Write-Host "[plan] $($ev.text)" -ForegroundColor Cyan }
    "tool" {
      $argsPreview = ""
      if ($null -ne $ev.args) {
        try { $argsPreview = ($ev.args | ConvertTo-Json -Compress) } catch { $argsPreview = "$($ev.args)" }
        if ($argsPreview.Length -gt 160) { $argsPreview = $argsPreview.Substring(0, 160) + "…" }
      }
      Write-Host "[tool] $($ev.name) $argsPreview" -ForegroundColor Yellow
    }
    "observation" {
      $ot = [string]$ev.text
      if ($ot.Length -gt 400) { $ot = $ot.Substring(0, 400) + "…" }
      Write-Host "[obs] $($ev.name): $ot" -ForegroundColor DarkGray
    }
    "token" { Write-Host -NoNewline $ev.text }
    "done" { Write-Host "`n---- done ----" -ForegroundColor Green }
    "error" { Write-Host "[error] $($ev.text)" -ForegroundColor Red }
    default { Write-Host $line }
  }
}

Write-Host "[cli] full log: $logPath" -ForegroundColor DarkCyan
