# Headless daily sync entrypoint (called by Task Scheduler). Runs a full
# incremental sync, then a rotating backup. Logs land in server/data/sync-log/.
$ErrorActionPreference = 'Stop'
$serverDir = Split-Path -Parent $PSScriptRoot   # ...\finance-dashboard\server
Set-Location $serverDir

$logDir = Join-Path $serverDir 'data\sync-log'
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$stamp = Get-Date -Format 'yyyy-MM-dd_HH-mm-ss'
$log = Join-Path $logDir "task-$stamp.log"

"[$(Get-Date -Format o)] iniciando sync agendado" | Out-File -FilePath $log -Encoding utf8
try {
  node scripts/sync-all.js *>> $log
  node scripts/backup.js  *>> $log
  "[$(Get-Date -Format o)] concluido" | Out-File -FilePath $log -Append -Encoding utf8
} catch {
  "[$(Get-Date -Format o)] ERRO: $($_.Exception.Message)" | Out-File -FilePath $log -Append -Encoding utf8
  exit 1
}
