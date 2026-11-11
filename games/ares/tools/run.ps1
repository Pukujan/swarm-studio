# Render or play ARES. Examples:
#   powershell -File tools/run.ps1 -Args "--auto --skip-title"                         (watch the pilot)
#   powershell -File tools/run.ps1 -Movie out\sov.avi -Frames 1800 -Args "--auto --skip-title"
param([string]$Movie = '', [int]$Frames = 0, [string]$Args = '', [string]$Res = '1920x1080', [string]$Godot = $env:SWARM_GODOT)
$proj = Split-Path $PSScriptRoot -Parent
if (-not $Godot) { $Godot = (Get-Command godot -ErrorAction SilentlyContinue).Source }
if (-not (Test-Path "$proj\.godot")) { & $Godot --headless --path $proj --import 2>&1 | Out-Null }
$a = @('--path', $proj, '--resolution', $Res)
if ($Movie) { $a += @('--write-movie', $Movie, '--fixed-fps', '30') }
if ($Frames -gt 0) { $a += @('--quit-after', "$Frames") }
$a += '--'
$a += ($Args -split ' ' | Where-Object { $_ })
& $Godot @a
