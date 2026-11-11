extends Node3D
## ARES: the war god's colosseum, the boss ladder and the run's flow.

const ARENA_R := 30.0
const GATES := [Vector3(0, 0, -26), Vector3(26, 0, 0), Vector3(0, 0, 26), Vector3(-26, 0, 0)]

var bosses: Array = []
var credit_line := "Bosses: the Nous Hermes hackathon Discord"
var index := 0
var state := "title"
var state_t := 0.0
var fight_t := 0.0
var ladder := false
var player: Player
var hud
var pilot
var bridge
var card_cam: Camera3D
var world_env: WorldEnvironment
var spawn_t := 2.0
var hazard_t := 6.0
var hazards: Array = []
var clears := {}
var tour := false
var tour_i := 0

func _ready() -> void:
	Game.main = self
	_setup_input()
	_load_bosses()
	_build_world()
	_build_arena()
	player = Player.new()
	add_child(player)
	player.global_position = Vector3(0, 0.2, 16)
	Game.player = player
	player.died.connect(_on_player_died)
	hud = preload("res://scripts/hud.gd").new()
	var layer = CanvasLayer.new()
	layer.process_mode = Node.PROCESS_MODE_ALWAYS
	add_child(layer)
	layer.add_child(hud)
	hud.set_anchors_preset(Control.PRESET_FULL_RECT)
	card_cam = Camera3D.new()
	card_cam.fov = 50.0
	card_cam.process_mode = Node.PROCESS_MODE_ALWAYS
	add_child(card_cam)
	if Game.arg("auto", false) or Game.arg("jev", false):
		pilot = preload("res://scripts/pilot.gd").new()
		player.pilot = pilot
		add_child(pilot)
	else:
		Input.mouse_mode = Input.MOUSE_MODE_CAPTURED
	if Game.arg("jev", false):
		bridge = preload("res://scripts/bridge.gd").new()
		add_child(bridge)
	ladder = bool(Game.arg("ladder", false))
	var want = String(Game.arg("boss", "sovthpaw" if not ladder else bosses[0].get("handle")))
	for i in bosses.size():
		if String(bosses[i].get("handle")).to_lower() == want.to_lower():
			index = i
	if Game.arg("cards", false):
		tour = true
		_set_state("tour")
	elif Game.arg("credits", false):
		_set_state("credits")
	elif Game.arg("skip-title", false):
		_start_boss(index)
	else:
		_set_state("title")

func _setup_input() -> void:
	var keys = {"forward": [KEY_W], "back": [KEY_S], "left": [KEY_A], "right": [KEY_D], "jump": [KEY_SPACE], "dash": [KEY_SHIFT],
		"finish": [KEY_F], "rip": [KEY_Q], "burn": [KEY_R], "punch": [KEY_V], "weapon1": [KEY_1], "weapon2": [KEY_2], "weapon3": [KEY_3], "start": [KEY_ENTER, KEY_SPACE]}
	for a in keys:
		if not InputMap.has_action(a):
			InputMap.add_action(a)
		for k in keys[a]:
			var e = InputEventKey.new()
			e.physical_keycode = k
			InputMap.action_add_event(a, e)
	if not InputMap.has_action("fire"):
		InputMap.add_action("fire")
		var m = InputEventMouseButton.new()
		m.button_index = MOUSE_BUTTON_LEFT
		InputMap.action_add_event("fire", m)

func _load_bosses() -> void:
	var f = FileAccess.open("res://data/bosses.json", FileAccess.READ)
	var d = JSON.parse_string(f.get_as_text())
	bosses = d.get("bosses", [])
	credit_line = String(d.get("credit", credit_line))

# ------------------------------------------------------------- world -----

func _build_world() -> void:
	world_env = WorldEnvironment.new()
	var env = Environment.new()
	var sky = Sky.new()
	var sm = ShaderMaterial.new()
	sm.shader = preload("res://shaders/sky.gdshader")
	sky.sky_material = sm
	env.background_mode = Environment.BG_SKY
	env.sky = sky
	env.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	env.ambient_light_color = Color(0.5, 0.4, 0.36)
	env.ambient_light_energy = 0.7
	env.tonemap_mode = Environment.TONE_MAPPER_FILMIC
	env.tonemap_exposure = 0.92
	env.glow_enabled = true
	env.glow_intensity = 0.6
	env.glow_bloom = 0.12
	env.glow_hdr_threshold = 1.2
	env.fog_enabled = true
	env.fog_light_color = Color(0.3, 0.12, 0.07)
	env.fog_density = 0.0035
	env.fog_sky_affect = 0.3
	env.ssao_enabled = true
	env.ssao_intensity = 1.2
	env.adjustment_enabled = true
	env.adjustment_saturation = 0.98
	env.adjustment_contrast = 1.12
	world_env.environment = env
	add_child(world_env)
	var sun = DirectionalLight3D.new()
	sun.light_color = Color(1.0, 0.86, 0.72)
	sun.light_energy = 1.25
	sun.rotation = Vector3(deg_to_rad(-38), deg_to_rad(28), 0)
	sun.shadow_enabled = true
	sun.directional_shadow_max_distance = 90.0
	add_child(sun)

func _static_box(size: Vector3, pos: Vector3, color: Color, emit := 0.0, ow := 0.03) -> MeshInstance3D:
	var body = StaticBody3D.new()
	body.collision_layer = 1
	var cs = CollisionShape3D.new()
	var bs = BoxShape3D.new()
	bs.size = size
	cs.shape = bs
	body.add_child(cs)
	var mi = Look.box(size, color, emit, ow)
	body.add_child(mi)
	add_child(body)
	body.position = pos
	return mi

func _build_arena() -> void:
	var sand = Color(0.62, 0.48, 0.38)
	var stone = Color(0.3, 0.2, 0.17)
	var bronze = Color(0.7, 0.38, 0.16)
	var gold = Color(1.0, 0.7, 0.25)
	# floor
	var floor_body = StaticBody3D.new()
	var fcs = CollisionShape3D.new()
	var fcyl = CylinderShape3D.new()
	fcyl.radius = ARENA_R + 6.0
	fcyl.height = 2.0
	fcs.shape = fcyl
	fcs.position.y = -1.0
	floor_body.add_child(fcs)
	add_child(floor_body)
	var fl = Look.cyl(ARENA_R + 6.0, 2.0, sand, 0.0, 0.0, -1.0, 72)
	fl.position.y = -1.0
	add_child(fl)
	# inlaid rings and spokes
	for r in [6.0, 12.5, 19.0]:
		var ring = Look.cyl(r, 0.04, stone, 0.0, 0.0, -1.0, 72)
		ring.position.y = 0.01
		add_child(ring)
		var inner = Look.cyl(r - 0.35, 0.05, sand.darkened(0.05), 0.0, 0.0, -1.0, 72)
		inner.position.y = 0.012
		add_child(inner)
	var seal = Look.cyl(3.2, 0.06, gold, 0.5, 0.0, -1.0, 6)
	seal.position.y = 0.02
	add_child(seal)
	var seal2 = Look.cyl(2.4, 0.07, Color(0.55, 0.12, 0.06), 0.0, 0.0, -1.0, 6)
	seal2.position.y = 0.025
	seal2.rotation.y = PI / 6
	add_child(seal2)
	for k in 12:
		var spoke = Look.box(Vector3(0.25, 0.03, 13.0), stone, 0.0, 0.0)
		var a = k * TAU / 12.0
		spoke.position = Vector3(sin(a) * 12.5, 0.015, cos(a) * 12.5)
		spoke.rotation.y = a
		add_child(spoke)
	# molten channel
	var lava = Look.cyl(25.6, 0.05, Color(1.0, 0.45, 0.1), 1.4, 0.0, -1.0, 72)
	lava.position.y = 0.02
	add_child(lava)
	var lip = Look.cyl(24.4, 0.07, sand, 0.0, 0.0, -1.0, 72)
	lip.position.y = 0.03
	add_child(lip)
	# colosseum wall, columns, stands and banners
	var n = 28
	for k in n:
		var a2 = k * TAU / n
		var dir = Vector3(sin(a2), 0, cos(a2))
		var wall = _static_box(Vector3(7.2, 7.0, 1.6), dir * (ARENA_R + 1.0) + Vector3(0, 3.5, 0), stone, 0.0, 0.04)
		wall.get_parent().rotation.y = a2
		var col = Look.model("column")
		col.scale = Vector3(2.2, 2.6, 2.2)
		col.position = dir * (ARENA_R - 0.4)
		add_child(col)
		Look.apply(col, 0.02, Color(1.0, 0.8, 0.65))
		for tier in 3:
			var step = Look.box(Vector3(7.4, 1.2, 2.4), stone.darkened(0.15 * tier), 0.0, 0.03)
			step.position = dir * (ARENA_R + 2.8 + tier * 2.4) + Vector3(0, 7.6 + tier * 1.6, 0)
			step.rotation.y = a2
			add_child(step)
		if k % 2 == 0:
			var ban = Look.model("banner_patternA_red" if k % 4 == 0 else "banner_patternB_red")
			ban.scale = Vector3.ONE * 2.4
			ban.position = dir * (ARENA_R - 0.1) + Vector3(0, 3.2, 0)
			ban.rotation.y = a2 + PI
			add_child(ban)
			Look.apply(ban, 0.02)
		if k % 4 == 2:
			_brazier(dir * (ARENA_R - 2.2))
	# gates
	for g in GATES:
		var arch = Look.box(Vector3(5.0, 0.9, 1.0), bronze, 0.0, 0.04)
		arch.position = g * 1.12 + Vector3(0, 6.2, 0)
		arch.rotation.y = atan2(g.x, g.z)
		add_child(arch)
		var glow = Look.box(Vector3(4.0, 5.5, 0.2), Color(1.0, 0.4, 0.1), 0.9, 0.0)
		glow.position = g * 1.14 + Vector3(0, 2.8, 0)
		glow.rotation.y = atan2(g.x, g.z)
		add_child(glow)
	# platforms with jump pads and grab bars (vertical play)
	for k in 4:
		var a3 = k * TAU / 4.0 + PI / 4.0
		var dir2 = Vector3(sin(a3), 0, cos(a3))
		var plat = _static_box(Vector3(7.0, 0.8, 7.0), dir2 * 18.0 + Vector3(0, 4.6, 0), bronze, 0.0, 0.04)
		var trim = Look.box(Vector3(7.2, 0.2, 7.2), gold, 0.6, 0.0)
		trim.position = dir2 * 18.0 + Vector3(0, 4.15, 0)
		add_child(trim)
		for leg in [Vector3(-2.8, 0, -2.8), Vector3(2.8, 0, 2.8), Vector3(2.8, 0, -2.8), Vector3(-2.8, 0, 2.8)]:
			var pillar = Look.cyl(0.35, 4.2, stone, 0.0, 0.03)
			pillar.position = dir2 * 18.0 + leg + Vector3(0, 2.1, 0)
			add_child(pillar)
		_jump_pad(dir2 * 11.0, (dir2 * 7.0 + Vector3(0, 17.0, 0)))
		var b_dir = Vector3(sin(a3 + PI / 4.0), 0, cos(a3 + PI / 4.0))
		_grab_bar(b_dir * 19.5 + Vector3(0, 6.8, 0), a3 + PI / 4.0)

func _brazier(at: Vector3) -> void:
	var bowl = Look.cyl(0.9, 0.6, Color(0.5, 0.25, 0.12), 0.0, 0.03, 1.2)
	bowl.position = at + Vector3(0, 1.6, 0)
	add_child(bowl)
	var stand = Look.cyl(0.25, 1.4, Color(0.3, 0.14, 0.08), 0.0, 0.03)
	stand.position = at + Vector3(0, 0.7, 0)
	add_child(stand)
	var f = CPUParticles3D.new()
	var m = SphereMesh.new()
	m.radius = 0.22
	m.height = 0.44
	m.radial_segments = 6
	m.rings = 3
	m.material = Look.glow(Fx.EMBER)
	f.mesh = m
	f.amount = 30
	f.lifetime = 0.8
	f.emission_shape = CPUParticles3D.EMISSION_SHAPE_SPHERE
	f.emission_sphere_radius = 0.5
	f.direction = Vector3.UP
	f.spread = 15.0
	f.initial_velocity_min = 2.0
	f.initial_velocity_max = 4.0
	f.gravity = Vector3(0, 2, 0)
	var c = Curve.new()
	c.add_point(Vector2(0, 1))
	c.add_point(Vector2(1, 0))
	f.scale_amount_curve = c
	f.color = Color(1.0, 0.55, 0.15)
	f.position = at + Vector3(0, 2.0, 0)
	add_child(f)
	var l = OmniLight3D.new()
	l.light_color = Color(1.0, 0.5, 0.18)
	l.light_energy = 3.0
	l.omni_range = 12.0
	l.position = at + Vector3(0, 3.0, 0)
	add_child(l)

func _jump_pad(at: Vector3, launch: Vector3) -> void:
	var pad = Look.cyl(1.3, 0.15, Color(1.0, 0.72, 0.25), 1.8, 0.03)
	pad.position = at + Vector3(0, 0.08, 0)
	add_child(pad)
	var ring = Look.cyl(1.6, 0.1, Color(0.5, 0.2, 0.08), 0.0, 0.0)
	ring.position = at + Vector3(0, 0.04, 0)
	add_child(ring)
	var area = Area3D.new()
	area.collision_layer = 0
	area.collision_mask = 2
	var cs = CollisionShape3D.new()
	var s = CylinderShape3D.new()
	s.radius = 1.3
	s.height = 1.0
	cs.shape = s
	area.add_child(cs)
	area.position = at + Vector3(0, 0.5, 0)
	add_child(area)
	area.body_entered.connect(func(b): if b is Player: b.launch(launch))

func _grab_bar(at: Vector3, yaw: float) -> void:
	var bar = Look.cyl(0.12, 6.0, Color(1.0, 0.75, 0.3), 1.0, 0.02)
	bar.rotation = Vector3(0, yaw, PI / 2)
	bar.position = at
	add_child(bar)
	var area = Area3D.new()
	area.collision_layer = 0
	area.collision_mask = 2
	var cs = CollisionShape3D.new()
	var s = BoxShape3D.new()
	s.size = Vector3(6.0, 1.6, 1.6)
	cs.shape = s
	area.add_child(cs)
	area.position = at - Vector3(0, 1.2, 0)
	area.rotation.y = yaw
	add_child(area)
	area.body_entered.connect(func(b): if b is Player: b.grab_bar())

# -------------------------------------------------------------- flow -----

func _set_state(s: String) -> void:
	state = s
	state_t = 0.0
	hud.on_state(s)

func _start_boss(i: int) -> void:
	index = i
	_clear_field()
	var d: Dictionary = bosses[i]
	var b = Boss.new()
	b.setup(d)
	add_child(b)
	b.global_position = Vector3(0, 0, -10) if not b.flying else Vector3(0, 3.5, -10)
	b.rotation.y = 0.0
	Game.boss = b
	player.global_position = Vector3(0, 0.2, 14)
	player.velocity = Vector3.ZERO
	player.yaw = 0.0
	player.pitch = 0.05
	player.health = player.max_health
	player.ammo = maxf(player.ammo, 50.0)
	player.dead = false
	fight_t = 0.0
	spawn_t = 2.5
	hazard_t = 8.0
	_show_card(b)

func _show_card(b) -> void:
	_set_state("card")
	get_tree().paused = true
	b.process_mode = Node.PROCESS_MODE_ALWAYS
	b.pose_for_card()
	var h: float = 2.4 if String(b.data.get("model")) == "eye" else 1.25 * b.scale_f
	var dist: float = 6.0 + b.scale_f * 1.6
	var face: Vector3 = b.global_position + Vector3(0, h, 0)
	card_cam.global_position = b.global_position + Vector3(dist * 0.35, h * 0.55, dist)
	card_cam.look_at(face, Vector3.UP)
	card_cam.current = true
	hud.namecard(b.handle, b.title, index + 1, bosses.size(), bool(b.data.get("final", false)))
	get_tree().create_timer(2.6, true, false, true).timeout.connect(_end_card)

func _end_card() -> void:
	get_tree().paused = false
	var b = Game.boss
	if b and is_instance_valid(b):
		b.process_mode = Node.PROCESS_MODE_INHERIT
		b.ai = true
	player.cam.current = true
	_set_state("fight")
	Game.announce("FIGHT", "%s — %s" % [b.handle, b.title.to_upper()], Fx.GOLD, 1.2)

func _clear_field() -> void:
	for e in Game.enemies.duplicate():
		if is_instance_valid(e):
			e.queue_free()
	Game.enemies.clear()
	for p in Game.pickups:
		if is_instance_valid(p["node"]):
			p["node"].queue_free()
	Game.pickups.clear()
	for s in Game.projectiles:
		if is_instance_valid(s["node"]):
			s["node"].queue_free()
	Game.projectiles.clear()
	for w in Game.waves:
		if is_instance_valid(w["node"]):
			w["node"].queue_free()
	Game.waves.clear()
	for h in hazards:
		if is_instance_valid(h["node"]):
			h["node"].queue_free()
	hazards.clear()
	Game.threats.clear()
	if Game.boss and is_instance_valid(Game.boss):
		Game.boss.queue_free()
	Game.boss = null
	Game.reset_time()

func _process(delta: float) -> void:
	state_t += delta
	match state:
		"title":
			_title_cam(delta)
			var hold = float(Game.arg("title-hold", 3.0))
			if state_t > hold and (pilot != null or Input.is_action_just_pressed("start")):
				_start_boss(index)
			elif pilot == null and Input.is_action_just_pressed("start"):
				_start_boss(index)
		"tour":
			_tour(delta)
		"won":
			if state_t > 4.5:
				Game.reset_time()
				if ladder and index + 1 < bosses.size():
					_start_boss(index + 1)
				else:
					_set_state("credits")
		"down":
			if state_t > 3.0:
				_start_boss(index)
		"credits":
			_title_cam(delta * 0.6)

func _title_cam(delta: float) -> void:
	card_cam.current = true
	var a = Game.time * 0.08
	card_cam.global_position = Vector3(sin(a) * 22.0, 9.0, cos(a) * 22.0)
	card_cam.look_at(Vector3(0, 3, 0), Vector3.UP)

func _tour(_delta: float) -> void:
	if state_t < 0.05 and tour_i == 0 and Game.boss == null:
		_tour_show(0)
	if state_t > 2.8:
		tour_i += 1
		if tour_i >= bosses.size():
			_set_state("credits")
			return
		_tour_show(tour_i)

func _tour_show(i: int) -> void:
	_clear_field()
	var b = Boss.new()
	b.setup(bosses[i])
	add_child(b)
	b.global_position = Vector3(0, 0, -10) if not b.flying else Vector3(0, 3.5, -10)
	Game.boss = b
	index = i
	state_t = 0.0
	b.process_mode = Node.PROCESS_MODE_ALWAYS
	b.pose_for_card()
	var h: float = 2.4 if String(b.data.get("model")) == "eye" else 1.25 * b.scale_f
	var dist: float = 6.0 + b.scale_f * 1.6
	card_cam.global_position = b.global_position + Vector3(dist * 0.35, h * 0.55, dist)
	card_cam.look_at(b.global_position + Vector3(0, h, 0), Vector3.UP)
	# the boss stands in the right third, clear of the slammed handle on the left
	card_cam.look_at(b.global_position + Vector3(0, h * 0.85, 0) - card_cam.global_transform.basis.x * h * 0.75, Vector3.UP)
	card_cam.current = true
	hud.namecard(b.handle, b.title, i + 1, bosses.size(), bool(b.data.get("final", false)))

func _physics_process(delta: float) -> void:
	if state != "fight":
		return
	fight_t += delta
	_spawner(delta)
	_hazards(delta)
	_update_pickups(delta)
	_update_shots(delta)
	_update_waves(delta)
	for t in Game.threats:
		t["t"] = maxf(0.0, float(t.get("at", 0.0)) - Game.time)

func _spawner(delta: float) -> void:
	spawn_t -= delta
	var b = Game.boss
	var phase: int = b.phase if b and is_instance_valid(b) else 1
	var cap = 3 + phase * 2
	if spawn_t <= 0.0:
		spawn_t = maxf(1.6, 3.2 - phase * 0.5)
		var minions = 0
		for e in Game.live_enemies():
			if e is Enemy and e.kind != "checkpoint":
				minions += 1
		if minions < cap:
			var g: Vector3 = GATES[randi() % GATES.size()]
			var k: String = ["grunt", "grunt", "grunt", "shield", "caster"].pick_random()
			spawn_enemy(k, g + Vector3(randf_range(-2, 2), 0, randf_range(-2, 2)))

func _hazards(delta: float) -> void:
	var b = Game.boss
	if b == null or not is_instance_valid(b) or b.phase < 2:
		return
	hazard_t -= delta
	if hazard_t <= 0.0:
		hazard_t = 5.5 if b.phase == 2 else 3.8
		for i in (2 if b.phase == 2 else 3):
			var at = player.global_position + Vector3(randf_range(-6, 6), 0, randf_range(-6, 6))
			if Vector2(at.x, at.z).length() > 24.0:
				continue
			var t = Look.telegraph(2.4, Color(1.0, 0.5, 0.1))
			add_child(t)
			t.global_position = Vector3(at.x, 0.06, at.z)
			hazards.append({"node": t, "pos": at, "t": 1.3})
			Game.threats.append({"pos": at, "radius": 2.4, "t": 1.3, "kind": "geyser", "owner": -1, "at": Game.time + 1.3})
	for h in hazards.duplicate():
		h["t"] -= delta
		if is_instance_valid(h["node"]):
			h["node"].set_instance_shader_parameter("progress", clampf(1.0 - h["t"] / 1.3, 0.0, 1.0))
		if h["t"] <= 0.0:
			var at2: Vector3 = h["pos"]
			Fx.fire(at2 + Vector3(0, 0.2, 0), 30, Vector3.UP, 12.0, 14.0)
			Fx.light(at2 + Vector3(0, 1, 0), Fx.EMBER, 8.0, 8.0, 0.3)
			if Vector2(player.global_position.x - at2.x, player.global_position.z - at2.z).length() < 2.4 and player.global_position.y < 3.0:
				player.hurt(14.0, at2)
			if is_instance_valid(h["node"]):
				h["node"].queue_free()
			hazards.erase(h)
	Game.threats = Game.threats.filter(func(x): return x.get("owner") != -1 or float(x.get("at", 0)) > Game.time)

# ---------------------------------------------------------- spawning -----

func spawn_enemy(kind: String, at: Vector3) -> Enemy:
	var e = Enemy.new()
	e.setup(kind)
	add_child(e)
	e.global_position = Vector3(at.x, at.y if kind == "checkpoint" else 0.1, at.z)
	Game.enemies.append(e)
	Fx.ring(Vector3(at.x, 0.1, at.z), 2.2, Fx.EMBER, 0.4, 0.2)
	return e

func spawn_clone(d: Dictionary, at: Vector3):
	var c = Boss.new()
	c.setup(d, true)
	add_child(c)
	c.global_position = at
	c.ai = true
	Game.enemies.append(c)
	return c

func spawn_pickup(kind: String, at: Vector3, count: int) -> void:
	var col: Color = {"health": Color(1.0, 0.3, 0.18), "ammo": Color(1.0, 0.78, 0.25), "armor": Color(0.85, 0.55, 0.3)}[kind]
	var amt: float = {"health": 9.0, "ammo": 7.0, "armor": 6.0}[kind]
	for i in count:
		var n: MeshInstance3D
		if kind == "armor":
			n = Look.box(Vector3(0.28, 0.4, 0.1), col, 1.6, 0.02)
		elif kind == "ammo":
			n = Look.box(Vector3(0.24, 0.24, 0.24), col, 1.8, 0.02)
		else:
			n = Look.ball(0.2, col, 2.2, 0.02)
		add_child(n)
		n.global_position = at
		var v = Vector3(randf_range(-1, 1), randf_range(0.8, 1.6), randf_range(-1, 1)).normalized() * randf_range(4.0, 7.0)
		Game.pickups.append({"node": n, "kind": kind, "amount": amt, "vel": v, "life": 15.0, "id": Game.new_id()})

func _update_pickups(delta: float) -> void:
	var pp = player.global_position + Vector3(0, 0.9, 0)
	for p in Game.pickups.duplicate():
		var n: Node3D = p["node"]
		p["life"] -= delta
		if not is_instance_valid(n) or p["life"] <= 0.0:
			if is_instance_valid(n):
				n.queue_free()
			Game.pickups.erase(p)
			continue
		var v: Vector3 = p["vel"]
		var to = pp - n.global_position
		var d = to.length()
		if d < 7.0 and not player.dead:
			v = v.lerp(to.normalized() * 22.0, minf(1.0, delta * 6.0))
		else:
			v.y -= 16.0 * delta
			v.x *= 0.98
			v.z *= 0.98
		n.global_position += v * delta
		if n.global_position.y < 0.3:
			n.global_position.y = 0.3
			v.y = absf(v.y) * 0.4
		p["vel"] = v
		n.rotation.y += delta * 4.0
		if d < 1.3:
			player.pickup(p["kind"], p["amount"])
			hud.pickup(p["kind"])
			Fx.sparks(n.global_position, n.material_override.get_shader_parameter("base_color") if n.material_override else Fx.GOLD, 6, 4.0)
			n.queue_free()
			Game.pickups.erase(p)

func spawn_shot(from: Vector3, vel: Vector3, dmg: float, kind: String, size := 0.5) -> void:
	var n = Node3D.new()
	add_child(n)
	n.global_position = from
	var col = Color(1.0, 0.5, 0.15)
	match kind:
		"tag":
			var card = Look.box(Vector3(0.9, 0.5, 0.05), Color(1.0, 0.8, 0.3), 0.6, 0.01)
			n.add_child(card)
			var l = Label3D.new()
			l.text = "-80%"
			l.font = Look.slam_font()
			l.font_size = 72
			l.modulate = Color(0.8, 0.1, 0.05)
			l.pixel_size = 0.005
			l.billboard = BaseMaterial3D.BILLBOARD_ENABLED
			l.outline_size = 0
			n.add_child(l)
		"note", "patch", "gavel":
			var l2 = Label3D.new()
			l2.text = {"note": "♪", "patch": "PATCH", "gavel": "MUTE"}[kind]
			l2.font = Look.slam_font()
			l2.font_size = 140 if kind == "note" else 72
			l2.modulate = Color(1.0, 0.65, 0.2)
			l2.outline_size = 22
			l2.outline_modulate = Fx.INK
			l2.pixel_size = 0.006
			l2.billboard = BaseMaterial3D.BILLBOARD_ENABLED
			n.add_child(l2)
			n.add_child(Look.ball(0.18, col, 3.0, 0.0))
		"coin":
			var c = Look.cyl(0.35, 0.08, Color(1.0, 0.78, 0.25), 1.5, 0.01)
			c.rotation.x = PI / 2
			n.add_child(c)
		"feather":
			n.add_child(Look.box(Vector3(0.12, 0.05, 0.9), Color(1.0, 0.88, 0.6), 2.5, 0.01))
		"crystal":
			n.add_child(Look.mesh(PrismMesh.new(), Color(1.0, 0.97, 0.92), 1.2, 0.02))
		"confetti":
			for i in 4:
				var bit = Look.box(Vector3(0.18, 0.18, 0.04), [Color(1.0, 0.3, 0.15), Color(1.0, 0.8, 0.3), Color(1.0, 0.95, 0.85)][i % 3], 1.5, 0.0)
				bit.position = Vector3(randf_range(-0.3, 0.3), randf_range(-0.3, 0.3), 0)
				bit.rotation = Vector3(randf() * 3, randf() * 3, 0)
				n.add_child(bit)
		"chime":
			n.add_child(Look.cyl(0.22, 0.3, Color(1.0, 0.8, 0.35), 1.5, 0.01, 0.06))
		_:
			n.add_child(Look.ball(0.32 if kind != "checkpoint" else 0.22, Color(1.0, 0.55, 0.15) if kind != "checkpoint" else Color(1.0, 0.85, 0.4), 3.0, 0.02))
	if size > 1.0:
		n.scale = Vector3(size * 1.5, 1.0, 1.0)
	n.look_at(from + vel, Vector3.UP)
	Game.projectiles.append({"node": n, "vel": vel, "dmg": dmg, "kind": kind, "size": size, "life": 4.0, "id": Game.new_id()})

func _update_shots(delta: float) -> void:
	var pp = player.global_position + Vector3(0, 0.9, 0)
	for s in Game.projectiles.duplicate():
		var n: Node3D = s["node"]
		s["life"] -= delta
		if not is_instance_valid(n):
			Game.projectiles.erase(s)
			continue
		n.global_position += s["vel"] * delta
		if s["kind"] == "coin" or s["kind"] == "confetti":
			n.rotate_object_local(Vector3.FORWARD, delta * 12.0)
		var hit_r: float = 0.9 + (float(s["size"]) if float(s["size"]) > 1.0 else 0.0)
		var flat = Vector2(n.global_position.x, n.global_position.z).length()
		if n.global_position.distance_to(pp) < hit_r:
			player.hurt(s["dmg"], n.global_position)
			Fx.sparks(n.global_position, Fx.EMBER, 8, 6.0)
			n.queue_free()
			Game.projectiles.erase(s)
		elif s["life"] <= 0.0 or flat > ARENA_R or n.global_position.y < 0.0:
			Fx.sparks(n.global_position, Fx.EMBER, 4, 4.0)
			n.queue_free()
			Game.projectiles.erase(s)

func spawn_wave(at: Vector3, speed: float, dmg: float, effect: String, color: Color) -> void:
	var t = TorusMesh.new()
	t.inner_radius = 0.9
	t.outer_radius = 1.0
	t.rings = 64
	t.ring_segments = 8
	t.material = Look.glow(color)
	var mi = MeshInstance3D.new()
	mi.mesh = t
	mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(mi)
	mi.global_position = Vector3(at.x, 0.45, at.z)
	Game.waves.append({"node": mi, "pos": Vector3(at.x, 0, at.z), "r": 1.0, "speed": speed, "dmg": dmg, "effect": effect, "hit": false, "id": Game.new_id()})

func _update_waves(delta: float) -> void:
	for w in Game.waves.duplicate():
		w["r"] += w["speed"] * delta
		var r: float = w["r"]
		var n: MeshInstance3D = w["node"]
		if is_instance_valid(n):
			n.scale = Vector3(r, 6.0, r)
		var d = Vector2(player.global_position.x - w["pos"].x, player.global_position.z - w["pos"].z).length()
		if not w["hit"] and absf(d - r) < 0.9 and player.global_position.y < 1.0:
			w["hit"] = true
			if player.hurt(w["dmg"], w["pos"]) and w["effect"] == "silence":
				player.silence(1.6)
		if r > ARENA_R:
			if is_instance_valid(n):
				n.queue_free()
			Game.waves.erase(w)

# ----------------------------------------------------------- events ------

func on_kill(_e) -> void:
	pass

func on_boss_phase(b, phase: int) -> void:
	Game.slowmo(0.5, 0.3)
	Game.shake(0.6)
	Fx.ring(b.global_position + Vector3(0, 1, 0), 18.0, Fx.EMBER, 0.6, 0.5)
	Game.announce("PHASE %s" % ["I", "II", "III"][phase - 1], "the arena burns" if phase == 2 else "no mercy", Fx.EMBER, 1.4)

func on_boss_dead(b) -> void:
	_set_state("won")
	var secs = snappedf(fight_t, 0.1)
	clears[b.handle] = secs
	print("CLEAR %s %.1f" % [b.handle, secs])
	var f = FileAccess.open("user://clears.json", FileAccess.WRITE)
	if f:
		f.store_string(JSON.stringify(clears))
	Game.slowmo(2.0, 0.2)
	Game.shake(1.0)
	for e in Game.enemies.duplicate():
		if is_instance_valid(e) and not e.dead:
			if e is Enemy:
				e.die(true)
			else:
				e.die()
	Game.announce("CHAMPION FALLS", "%s — %s  ·  %.1f s" % [b.handle, b.title.to_upper(), secs], Fx.GOLD, 3.5)

func _on_player_died() -> void:
	_set_state("down")
	Game.slowmo(1.5, 0.25)
	Game.announce("DOWN, NOT OUT", "the messenger rises again", Fx.EMBER, 2.5)

func credits_lines() -> Array:
	var lines: Array = ["ARES", "", "Hero", "Design Bakery", "", credit_line, ""]
	for b in bosses:
		lines.append("%s — %s" % [b.get("handle"), b.get("title")])
	lines += ["", "3D models (CC0)", "KayKit Adventurers, Skeletons and Dungeon Remastered by Kay Lousberg", "", "Engine", "Godot 4", "", "Made with Swarm Studio for Hermes Agent"]
	return lines
