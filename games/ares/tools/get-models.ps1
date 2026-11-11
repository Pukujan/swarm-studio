# Copies the CC0 KayKit models ARES uses into assets/models.
# Get the packs (free, CC0) from https://kaylousberg.itch.io: Adventurers 1.0, Skeletons 1.0, Dungeon Remastered 1.0,
# unzip them into one folder, then: powershell -File tools/get-models.ps1 -From <that folder>
param([string]$From = "$env:USERPROFILE\assets3d")
$dst = Join-Path $PSScriptRoot '..\assets\models'
New-Item -ItemType Directory -Force $dst | Out-Null
$want = 'Knight.glb','Barbarian.glb','Mage.glb','Rogue.glb','Rogue_Hooded.glb','Skeleton_Minion.glb','Skeleton_Warrior.glb','Skeleton_Mage.glb','column.gltf.glb','banner_patternA_red.gltf.glb','banner_patternB_red.gltf.glb'
foreach ($w in $want) {
  $f = Get-ChildItem $From -Recurse -Filter $w | Select-Object -First 1
  if (-not $f) { Write-Error "missing $w under $From"; continue }
  Copy-Item $f.FullName (Join-Path $dst ($w -replace '\.gltf\.glb$', '.glb')) -Force
  "copied $w"
}
