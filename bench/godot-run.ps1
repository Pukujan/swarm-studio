# Runs Godot on the Windows PC for bench/starter-strategy.mjs: import, bench, or export to Web.
#   powershell -File godot-run.ps1 -Project D:\managed\starter-bench\strategy -Mode import|bench|web [-Units 500] [-Window]
param([string]$Project, [string]$Mode = 'import', [int]$Units = 500, [switch]$Window)
$g = $env:SWARM_GODOT
if (-not $g) { $g = (Get-ChildItem "$env:LOCALAPPDATA\Microsoft\WinGet\Packages" -Recurse -Filter 'Godot*_console.exe' | Select-Object -First 1).FullName }
if ($Mode -eq 'import') { & $g --headless --path $Project --import 2>&1 | Out-String }
elseif ($Mode -eq 'bench') {
  if ($Window) { & $g --path $Project --resolution 1280x720 -- --bench $Units 2>&1 | Out-String }
  else { & $g --headless --path $Project -- --bench $Units 2>&1 | Out-String }
}
elseif ($Mode -eq 'web') { New-Item -ItemType Directory -Force "$Project\build\web" | Out-Null; & $g --headless --path $Project --export-release Web build/web/index.html 2>&1 | Out-String }
