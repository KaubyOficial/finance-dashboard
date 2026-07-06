# Registers (or removes) the daily headless-sync Task Scheduler job (S6.1).
#   Install:   npm run register-task
#   Uninstall: npm run unregister-task
param(
  [ValidateSet('install', 'uninstall')]
  [string]$Action = 'install',
  [string]$At = '05:00'
)

$taskName = 'FinanceDashboard_Sync'
$starter = Join-Path $PSScriptRoot 'start-sync.ps1'

if ($Action -eq 'uninstall') {
  try {
    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction Stop
    Write-Host "Tarefa '$taskName' removida."
  } catch {
    Write-Host "Nenhuma tarefa '$taskName' encontrada."
  }
  return
}

$action = New-ScheduledTaskAction -Execute 'powershell.exe' `
  -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$starter`""
$trigger = New-ScheduledTaskTrigger -Daily -At $At
$settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable `
  -ExecutionTimeLimit (New-TimeSpan -Hours 2)
$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Limited

Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger `
  -Settings $settings -Principal $principal -Force | Out-Null

Write-Host "Tarefa '$taskName' registrada (roda todo dia as $At)."
Write-Host "Rodar agora:  Start-ScheduledTask -TaskName $taskName"
