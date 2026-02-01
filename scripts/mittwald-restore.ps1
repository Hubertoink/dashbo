param(
  [Parameter(Mandatory = $false)]
  [string]$ProjectId = "p-tud9mw",

  [Parameter(Mandatory = $false)]
  [string]$BackupId = "",

  [Parameter(Mandatory = $false)]
  [switch]$Yes
)

$ErrorActionPreference = 'Stop'

function Require-Token {
  if (-not $env:MITTWALD_API_TOKEN) {
    throw "MITTWALD_API_TOKEN is not set. Set it in your terminal session (do not commit it to any file)."
  }
}

function Invoke-MwApi {
  param(
    [Parameter(Mandatory = $true)][ValidateSet('GET','POST','PATCH','PUT','DELETE')][string]$Method,
    [Parameter(Mandatory = $true)][string]$Path,
    [Parameter(Mandatory = $false)][object]$Body = $null
  )

  Require-Token

  $uri = "https://api.mittwald.de/v2$Path"
  $headers = @{ Authorization = "Bearer $env:MITTWALD_API_TOKEN" }

  if ($null -eq $Body) {
    return Invoke-RestMethod -Method $Method -Uri $uri -Headers $headers
  }

  $json = $Body | ConvertTo-Json -Depth 20
  return Invoke-RestMethod -Method $Method -Uri $uri -Headers $headers -ContentType 'application/json' -Body $json
}

function Get-Backups {
  param([string]$ProjectId)
  # Newest first, a few pages usually enough
  return Invoke-MwApi -Method GET -Path "/projects/$ProjectId/backups?limit=50&sortOrder=newestFirst"
}

function Select-BackupId {
  param([object[]]$Backups, [string]$BackupId)

  if ($BackupId) { return $BackupId }

  $candidate = $Backups | Where-Object { $_.status -eq 'Completed' -or $_.export.phase -eq 'Completed' } | Select-Object -First 1
  if (-not $candidate) { $candidate = $Backups | Select-Object -First 1 }
  if (-not $candidate) { throw "No backups found for project '$ProjectId'." }
  return $candidate.id
}

Write-Host "[mittwald] ProjectId: $ProjectId"

$backups = @(Get-Backups -ProjectId $ProjectId)
if (-not $backups -or $backups.Count -eq 0) {
  throw "No backups returned. Check ProjectId and token permissions."
}

Write-Host "[mittwald] Latest backups:" 
$backups | Select-Object -First 8 | ForEach-Object {
  $id = $_.id
  $created = $_.createdAt
  $status = $_.status
  $exp = $_.expiresAt
  $desc = $_.description
  Write-Host "  - $created  status=$status  id=$id  expires=$exp  desc=$desc"
}

$selectedBackupId = Select-BackupId -Backups $backups -BackupId $BackupId
Write-Host "[mittwald] Selected backupId: $selectedBackupId"

if (-not $Yes) {
  $confirm = Read-Host "Start restore now? This will overwrite current data. Type YES to continue"
  if ($confirm -ne 'YES') {
    Write-Host "Aborted."
    exit 1
  }
}

Write-Host "[mittwald] Triggering restore…"
# Request body is optional; calling without body lets mittwald use the backup's default restore plan.
Invoke-MwApi -Method POST -Path "/project-backups/$selectedBackupId/restore" | Out-Null

Write-Host "[mittwald] Restore triggered (204 expected)."
Write-Host "[mittwald] You can monitor progress in mStudio or by re-fetching the backup resource." 
