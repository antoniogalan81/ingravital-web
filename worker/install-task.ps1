# worker/install-task.ps1 — Registra el worker en el Programador de tareas de Windows:
# arranca oculto al iniciar sesión el usuario actual y se reinicia si se cae.
# Solo conexiones salientes (Supabase y Google); no abre puertos.
#
#   powershell -ExecutionPolicy Bypass -File worker\install-task.ps1          # instalar / actualizar
#   powershell -ExecutionPolicy Bypass -File worker\install-task.ps1 -Remove  # quitar

param([switch]$Remove)

$name = "Invergravital - Actualizar con IA (worker)"
if ($Remove) {
  Unregister-ScheduledTask -TaskName $name -Confirm:$false -ErrorAction SilentlyContinue
  Write-Output "Tarea eliminada."
  exit 0
}

$web = Split-Path -Parent $PSScriptRoot
$logDir = Join-Path $env:LOCALAPPDATA "Invergravital"
New-Item -ItemType Directory -Force $logDir | Out-Null
$log = Join-Path $logDir "worker.log"
$cmd = "Set-Location -LiteralPath '$web'; if ((Test-Path '$log') -and (Get-Item '$log').Length -gt 5MB) { Move-Item -Force '$log' '$log.1' }; npm run worker *>> '$log'"

$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -Command `"$cmd`""
$trigger = New-ScheduledTaskTrigger -AtLogOn -User "$env:USERDOMAIN\$env:USERNAME"
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable `
  -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 5) -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew
Register-ScheduledTask -TaskName $name -Action $action -Trigger $trigger -Settings $settings -Description "Procesa los documentos de Drive de Invergravital en este PC." -Force | Out-Null
Start-ScheduledTask -TaskName $name
Write-Output "Tarea registrada e iniciada: $name (registro: $log)"
