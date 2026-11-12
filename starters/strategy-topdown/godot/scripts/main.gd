## The strategy starter's game: a map, your ants at the nest, rival ants coming in waves. Built from the
## swarm_rts add-on (res://addons/swarm_rts); the crew adds this game's own scenes and scripts on top
## (kinds of units, food, buildings, upgrades, the HUD) and does not rewrite the add-on.
## Run with -- --bench 500 (or ?bench=500 on the Web) to measure 500 units and quit.
extends Node2D

const PLAYER := 0
const ENEMY := 1
var map: StarterMap
var swarm: Swarm
var select: BoxSelect
var camera: RtsCamera
var fog: FogOfWar
var hud: Label
var wave := 0
var _wave_t := 8.0
var bench: StarterBench

func _ready() -> void:
	map = StarterMap.new()
	map.build()
	add_child(map)
	swarm = Swarm.new()
	swarm.flow = map.flow
	add_child(swarm)
	swarm.set_bounds(map.rect())
	select = BoxSelect.new()
	select.swarm = swarm
	select.team = PLAYER
	add_child(select)
	fog = FogOfWar.new()
	add_child(fog)
	fog.setup(swarm, PLAYER, map.rect())
	camera = RtsCamera.new()
	camera.bounds = map.rect()
	camera.position = map.nest + Vector2(300, -200)
	add_child(camera)
	var ui := CanvasLayer.new()
	add_child(ui)
	hud = Label.new()
	hud.position = Vector2(16, 12)
	hud.add_theme_font_size_override("font_size", 18)
	ui.add_child(hud)
	var n := StarterBench.requested()
	if n > 0:
		bench = StarterBench.new()
		add_child(bench)
		bench.start(self, n)
		return
	for k in 40:
		swarm.spawn(PLAYER, map.nest + Vector2(randf_range(-60, 60), randf_range(-60, 60)))

func _process(dt: float) -> void:
	hud.text = "Ants %d · Rivals %d · Wave %d · %d fps" % [swarm.count(PLAYER), swarm.count(ENEMY), wave, Engine.get_frames_per_second()]
	if bench:
		return
	_wave_t -= dt
	if _wave_t <= 0.0:
		_wave_t = 25.0
		_send_wave()

# endless waves: rivals come in from the far corner and march on the nest
func _send_wave() -> void:
	wave += 1
	var from := map.rect().end - Vector2(120, 120)
	var ids := PackedInt32Array()
	for k in 6 + wave * 4:
		var id := swarm.spawn(ENEMY, from + Vector2(randf_range(-90, 90), randf_range(-90, 90)))
		if id >= 0:
			ids.append(id)
	swarm.move(ids, map.nest)
