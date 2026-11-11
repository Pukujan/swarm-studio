class_name Boss
extends CharacterBody3D
## A community boss from data/bosses.json: one stylized family, unique by scale, tint, prop and moves.

var data: Dictionary = {}
var handle := ""
var title := ""
var id := 0
var hp := 1000.0
var max_hp := 1000.0
var phase := 1
var radius := 1.4
var dead := false
var clone := false
var flying := false
var armored := false
var ai := false
var disabled := {}
var weakpoints: Array = []
var stagger_t := 0.0
var burn_t := 0.0
var shard_cd := 0.0
var flash_t := 0.0
var intangible := 0.0
var move := ""
var move_t := 0.0
var move_stage := 0
var move_data := {}
var cd := 2.0
var seq := 0
var strafe := 1.0
var strafe_t := 0.0
var model: Node3D
var anim: AnimationPlayer
var prop: Node3D
var hand: Node3D
var tag: Label3D
var _anim_now := ""
var _tele: Array = []
var scale_f := 2.6
var tint := Color.WHITE

func setup(d: Dictionary, is_clone := false) -> void:
	data = d
	handle = String(d.get("handle", "?"))
	title = String(d.get("title", ""))
	max_hp = float(d.get("hp", 1000))
	clone = is_clone
	if clone:
		max_hp *= 0.22
	hp = max_hp
	flying = bool(d.get("flying", false))
	armored = bool(d.get("armored", false))
	scale_f = float(d.get("scale", 2.6)) * (0.7 if clone else 1.0)
	tint = Color(String(d.get("tint", "#ffffff")))

func _ready() -> void:
	id = Game.new_id()
	collision_layer = 4
	collision_mask = 1
	var model_name = String(data.get("model", "Knight"))
	radius = 0.55 * scale_f if model_name != "eye" else 2.4
	var cs = CollisionShape3D.new()
	var cap = CapsuleShape3D.new()
	cap.radius = radius
	cap.height = maxf(radius * 2.0 + 0.1, 0.75 * scale_f * 2.0) if model_name != "eye" else radius * 2.0 + 0.1
	cs.shape = cap
	cs.position.y = cap.height * 0.5
	add_child(cs)
	if model_name == "eye":
		_build_eye()
	else:
		model = Look.model(model_name)
		model.scale = Vector3.ONE * scale_f
		add_child(model)
		Look.apply(model, 0.012)
		for n in model.find_children("*", "MeshInstance3D", true, false):
			var nm = String(n.name)
			if nm.contains("Shield") or nm.contains("Sword") or nm.contains("Axe") or nm.contains("Staff") or nm.contains("Wand") or nm.contains("Crossbow") or nm.contains("Dagger") or nm.contains("Spellbook") or nm.contains("Mug") or nm.contains("Knife"):
				n.visible = false
		var aps = model.find_children("*", "AnimationPlayer", true, false)
		if aps.size() > 0:
			anim = aps[0]
			for a in ["Idle", "Running_A", "Walking_A", "2H_Melee_Idle", "Spellcasting", "Running_Strafe_Left", "Running_Strafe_Right", "Unarmed_Idle"]:
				if anim.has_animation(a):
					anim.get_animation(a).loop_mode = Animation.LOOP_LINEAR
		_attach_prop()
		Look.param(model, "tint", tint)
	_build_tag()
	_build_weakpoints()
	if flying:
		position.y = 3.5

func _build_tag() -> void:
	tag = Label3D.new()
	tag.text = handle
	tag.font = Look.slam_font()
	tag.font_size = 120
	tag.outline_size = 26
	tag.outline_modulate = Fx.INK
	tag.modulate = Color(1.0, 0.82, 0.35)
	tag.billboard = BaseMaterial3D.BILLBOARD_ENABLED
	tag.pixel_size = 0.01
	tag.position.y = (2.25 * scale_f if String(data.get("model")) != "eye" else 3.6)
	add_child(tag)

func _bone_attach(bone: String) -> Node3D:
	var sk = model.find_children("*", "Skeleton3D", true, false)
	if sk.is_empty():
		return model
	var ba = BoneAttachment3D.new()
	ba.bone_name = bone
	sk[0].add_child(ba)
	return ba

func _attach_prop() -> void:
	hand = _bone_attach("handslot.r")
	prop = Node3D.new()
	hand.add_child(prop)
	var gold = Color(1.0, 0.72, 0.25)
	var bronze = Color(0.66, 0.34, 0.16)
	var dark = Color(0.2, 0.08, 0.06)
	match String(data.get("prop", "")):
		"hammer":
			var h = Look.cyl(0.05, 1.4, dark, 0.0, 0.01)
			h.position.y = 0.5
			prop.add_child(h)
			var head = Look.box(Vector3(0.75, 0.42, 0.42), gold, 0.4, 0.012)
			head.position.y = 1.2
			prop.add_child(head)
			var lbl = Label3D.new()
			lbl.text = "TIMEOUT"
			lbl.font = Look.slam_font()
			lbl.font_size = 48
			lbl.modulate = Fx.INK
			lbl.pixel_size = 0.004
			lbl.position = Vector3(0, 1.2, 0.215)
			prop.add_child(lbl)
		"synth":
			var kb = Look.box(Vector3(1.4, 0.12, 0.42), Color(0.22, 0.08, 0.06), 0.0, 0.01)
			kb.position = Vector3(0, 0.2, 0.25)
			prop.add_child(kb)
			for k in 25:
				var white = k % 7 != 1 and k % 7 != 3 and k % 7 != 5
				var key = Look.box(Vector3(0.05, 0.05, 0.28 if white else 0.17), Color(1.0, 0.94, 0.86) if white else Color(0.12, 0.05, 0.04), 0.0, 0.0)
				key.position = Vector3(-0.66 + k * 0.055, 0.28, 0.26 if white else 0.2)
				prop.add_child(key)
			var glowbar = Look.box(Vector3(1.3, 0.03, 0.03), Color(1.0, 0.45, 0.15), 3.0, 0.0)
			glowbar.position = Vector3(0, 0.27, 0.05)
			prop.add_child(glowbar)
		"bells":
			for k in 6:
				var bell = Look.cyl(0.13, 0.22, gold, 0.6, 0.01, 0.04)
				var a = k * TAU / 6.0
				bell.position = Vector3(cos(a) * 0.55, 0.4, sin(a) * 0.55)
				prop.add_child(bell)
			var ringm = Look.cyl(0.58, 0.03, gold, 0.8, 0.0)
			ringm.position.y = 0.52
			prop.add_child(ringm)
		"caduceus":
			var staff = Look.cyl(0.05, 2.2, gold, 0.6, 0.01)
			staff.position.y = 0.8
			prop.add_child(staff)
			var orb = Look.ball(0.22, Color(1.0, 0.85, 0.5), 3.0, 0.01)
			orb.position.y = 2.0
			prop.add_child(orb)
			for s in 2:
				var w = Look.box(Vector3(0.5, 0.04, 0.16), gold, 0.8, 0.008)
				w.position = Vector3((s * 2 - 1) * 0.28, 1.85, 0)
				w.rotation.z = (s * 2 - 1) * 0.4
				prop.add_child(w)
			_build_wings()
		"cane":
			var c = Look.cyl(0.04, 1.3, dark, 0.0, 0.01)
			c.position.y = 0.4
			prop.add_child(c)
			var lamp = Look.cyl(0.18, 0.28, gold, 1.5, 0.01, 0.08)
			lamp.position.y = 1.15
			prop.add_child(lamp)
		"shaker":
			var s2 = Look.cyl(0.18, 0.5, Color(1.0, 0.96, 0.9), 0.0, 0.01)
			s2.position.y = 0.3
			prop.add_child(s2)
			var cap2 = Look.cyl(0.19, 0.12, gold, 0.4, 0.01, 0.1)
			cap2.position.y = 0.6
			prop.add_child(cap2)
		"flag":
			var pole = Look.cyl(0.035, 2.0, dark, 0.0, 0.01)
			pole.position.y = 0.8
			prop.add_child(pole)
			var cloth = Look.box(Vector3(0.9, 0.55, 0.03), Color(0.9, 0.16, 0.08), 0.2, 0.008)
			cloth.position = Vector3(0.45, 1.5, 0)
			prop.add_child(cloth)
		"gauntlets":
			var g = Look.box(Vector3(0.4, 0.4, 0.4), bronze, 0.3, 0.012)
			g.position.y = 0.1
			prop.add_child(g)
			var lh = _bone_attach("handslot.l")
			var g2 = Look.box(Vector3(0.4, 0.4, 0.4), bronze, 0.3, 0.012)
			lh.add_child(g2)
		"lantern":
			var l = Look.cyl(0.16, 0.34, Color(1.0, 0.8, 0.45), 2.4, 0.01)
			l.position.y = -0.1
			prop.add_child(l)
		"sign":
			var stick = Look.cyl(0.03, 1.2, dark, 0.0, 0.01)
			stick.position.y = 0.4
			prop.add_child(stick)
			var board = Look.box(Vector3(0.9, 0.5, 0.05), Color(1.0, 0.82, 0.3), 0.3, 0.01)
			board.position.y = 1.1
			prop.add_child(board)
			var sl = Label3D.new()
			sl.text = "-80%"
			sl.font = Look.slam_font()
			sl.font_size = 64
			sl.modulate = Color(0.75, 0.08, 0.05)
			sl.pixel_size = 0.005
			sl.position = Vector3(0, 1.1, 0.03)
			prop.add_child(sl)
		"briefcase":
			var bc = Look.box(Vector3(0.5, 0.36, 0.14), Color(0.36, 0.14, 0.08), 0.0, 0.01)
			bc.position.y = -0.1
			prop.add_child(bc)
			var clasp = Look.box(Vector3(0.12, 0.05, 0.16), gold, 1.0, 0.0)
			clasp.position.y = 0.05
			prop.add_child(clasp)
		"wrench":
			var wr = Look.box(Vector3(0.12, 1.1, 0.08), Color(0.7, 0.55, 0.42), 0.0, 0.01)
			wr.position.y = 0.4
			prop.add_child(wr)
			var jaw = Look.cyl(0.2, 0.1, Color(0.7, 0.55, 0.42), 0.0, 0.01)
			jaw.rotation.x = PI / 2
			jaw.position.y = 1.0
			prop.add_child(jaw)
			var key = Look.box(Vector3(0.6, 0.6, 0.06), gold, 0.6, 0.012)
			var back = _bone_attach("chest")
			key.position = Vector3(0, 0.3, -0.45)
			back.add_child(key)
		"scroll":
			var sc = Look.cyl(0.09, 0.7, Color(1.0, 0.9, 0.7), 0.3, 0.01)
			sc.rotation.z = PI / 2
			prop.add_child(sc)
		_:
			pass

func _build_wings() -> void:
	var back = _bone_attach("chest")
	for s in 2:
		var wing = Node3D.new()
		wing.name = "wing_l" if s == 0 else "wing_r"
		back.add_child(wing)
		wing.position = Vector3((s * 2 - 1) * 0.15, 0.35, -0.25)
		wing.rotation = Vector3(0.1, (s * 2 - 1) * 0.5, (s * 2 - 1) * 0.3)
		for f in 5:
			var feather = Look.box(Vector3(0.7 - f * 0.08, 0.05, 0.16), Color(1.0, 0.86, 0.55).lerp(Color(1.0, 0.5, 0.2), f / 5.0), 0.9, 0.006)
			feather.position = Vector3((s * 2 - 1) * (0.35 + f * 0.02), 0.25 - f * 0.12, 0)
			feather.rotation.z = (s * 2 - 1) * (0.5 - f * 0.18)
			wing.add_child(feather)

func _build_eye() -> void:
	model = Node3D.new()
	add_child(model)
	model.position.y = 2.4
	var ball = Look.ball(2.2, Color(1.0, 0.94, 0.86), 0.0, 0.06)
	model.add_child(ball)
	var iris = Look.cyl(1.0, 0.3, Color(0.95, 0.42, 0.08), 1.2, 0.03)
	iris.rotation.x = PI / 2
	iris.position.z = -2.05
	iris.name = "iris"
	model.add_child(iris)
	var pupil = Look.cyl(0.45, 0.34, Color(0.08, 0.02, 0.02), 0.0, 0.0)
	pupil.rotation.x = PI / 2
	pupil.position.z = -2.12
	model.add_child(pupil)
	for k in 8:
		var a = k * TAU / 8.0
		var lash = Look.box(Vector3(0.15, 1.2, 0.15), Color(0.85, 0.3, 0.1), 0.5, 0.02)
		lash.position = Vector3(cos(a) * 2.3, sin(a) * 2.3, 0.6)
		lash.rotation.z = a - PI / 2
		model.add_child(lash)
	Look.param(model, "tint", tint)

func _build_weakpoints() -> void:
	for w in data.get("weakpoints", []):
		var at = String(w.get("at", "prop"))
		var host: Node3D = null
		var off = Vector3.ZERO
		match at:
			"prop":
				host = prop if prop else model
				off = Vector3(0, 1.1, 0)
				if String(data.get("prop")) in ["synth", "bells", "briefcase", "lantern", "scroll", "gauntlets"]:
					off = Vector3(0, 0.25, 0.2)
			"chest":
				host = _bone_attach("chest")
				off = Vector3(0, 0.3, 0.35)
			"back":
				host = _bone_attach("chest")
				off = Vector3(0, 0.3, -0.45)
			"wing_l":
				var wl = model.find_child("wing_l", true, false)
				host = wl if wl else model
				off = Vector3(-0.6, 0.1, 0)
			"iris":
				host = model
				off = Vector3(0, 0, -2.2)
			_:
				host = model
		var wp = Weakpoint.new()
		wp.boss = self
		wp.wp_name = String(w.get("name", "Weak point"))
		wp.disables = String(w.get("disables", ""))
		wp.size = 0.32 if at != "iris" else 1.0
		host.add_child(wp)
		wp.position = off
		weakpoints.append(wp)

func _play(a: String, speed := 1.0, blend := 0.15) -> void:
	if anim == null or not anim.has_animation(a) or _anim_now == a:
		return
	_anim_now = a
	anim.play(a, blend, speed)

func is_staggered() -> bool:
	return stagger_t > 0.0 and not dead

func pose_for_card() -> void:
	_play("Cheer" if anim and anim.has_animation("Cheer") else "Idle")

# ------------------------------------------------------------------ AI ----

func _physics_process(delta: float) -> void:
	if dead:
		return
	flash_t = maxf(0.0, flash_t - delta)
	shard_cd = maxf(0.0, shard_cd - delta)
	intangible = maxf(0.0, intangible - delta)
	if stagger_t > 0.0:
		stagger_t -= delta
		Look.flash(model, 0.4 + 0.35 * sin(Game.time * 16.0), Fx.GOLD)
	else:
		Look.flash(model, flash_t * 5.0)
	if burn_t > 0.0:
		burn_t -= delta
		hp -= 10.0 * delta
		if Engine.get_physics_frames() % 6 == 0:
			Fx.fire(global_position + Vector3(randf_range(-1, 1), randf_range(1, 2.5) * scale_f * 0.5, randf_range(-1, 1)), 6)
	if String(data.get("model")) == "eye":
		model.position.y = 2.4 + sin(Game.time * 1.4) * 0.4
	var fade = 0.25 if intangible > 0.0 else 1.0
	Look.param(model, "fade", fade)
	if not ai:
		return
	var p = Game.player
	if p == null or not is_instance_valid(p):
		return
	var to: Vector3 = p.global_position - global_position
	to.y = 0
	var dist = to.length()
	var dir = to.normalized() if dist > 0.01 else Vector3.FORWARD
	if move == "":
		_face(dir, delta * 5.0)
		cd -= delta * (1.0 + (phase - 1) * 0.3)
		strafe_t -= delta
		if strafe_t <= 0.0:
			strafe_t = randf_range(1.5, 3.0)
			strafe = -strafe
		var keep = 11.0 if not flying else 13.0
		var want = dir * clampf(dist - keep, -1.0, 1.0) * 6.0 + dir.cross(Vector3.UP) * strafe * 3.5
		if stagger_t > 0.0:
			want = Vector3.ZERO
		velocity.x = move_toward(velocity.x, want.x, 20.0 * delta)
		velocity.z = move_toward(velocity.z, want.z, 20.0 * delta)
		if cd <= 0.0 and stagger_t <= 0.0:
			_next_move()
		_play("Running_A" if want.length() > 2.0 else "Idle")
	else:
		move_t += delta
		_run_move(delta, p, dir, dist)
	if flying:
		velocity.y = (4.5 + sin(Game.time * 1.2) * 0.8 - global_position.y) * 2.0
	elif not is_on_floor():
		velocity.y -= 40.0 * delta
	move_and_slide()
	_clamp_arena()
	_check_phase()

func _clamp_arena() -> void:
	var flat = Vector2(global_position.x, global_position.z)
	if flat.length() > 23.0:
		flat = flat.normalized() * 23.0
		global_position.x = flat.x
		global_position.z = flat.y

func _face(dir: Vector3, amt: float) -> void:
	var want = atan2(dir.x, dir.z)
	rotation.y = lerp_angle(rotation.y, want, minf(1.0, amt))

func _next_move() -> void:
	var moves: Array = data.get("moves", ["volley"])
	if clone:
		moves = ["volley", "charge"]
	for i in moves.size():
		var m = String(moves[(seq + i) % moves.size()])
		if not disabled.get(m, false):
			seq += i + 1
			_begin(m)
			return
	seq += 1
	_begin("volley")

func _begin(m: String) -> void:
	move = m
	move_t = 0.0
	move_stage = 0
	move_data = {}
	velocity.x = 0
	velocity.z = 0

func _end(next_cd := 1.4) -> void:
	move = ""
	cd = next_cd * (1.0 - (phase - 1) * 0.15)
	for t in _tele:
		if is_instance_valid(t):
			t.queue_free()
	_tele.clear()
	Game.threats = Game.threats.filter(func(x): return x.get("owner") != id)

func _tele_circle(at: Vector3, r: float, sec: float, kind: String) -> MeshInstance3D:
	var t = Look.telegraph(r)
	Game.main.add_child(t)
	t.global_position = Vector3(at.x, 0.06, at.z)
	_tele.append(t)
	Game.threats.append({"pos": Vector3(at.x, 0, at.z), "radius": r, "t": sec, "kind": kind, "owner": id, "at": Game.time + sec})
	return t

func _tele_line(from: Vector3, dir: Vector3, length: float, width: float, sec: float, kind: String) -> MeshInstance3D:
	var t = Look.telegraph_line(length, width)
	Game.main.add_child(t)
	var mid = from + dir * length * 0.5
	t.global_position = Vector3(mid.x, 0.07, mid.z)
	t.rotation.y = atan2(dir.x, dir.z)
	_tele.append(t)
	Game.threats.append({"pos": Vector3(from.x, 0, from.z), "dir": dir, "length": length, "radius": width * 0.5, "t": sec, "kind": kind, "owner": id, "at": Game.time + sec})
	return t

func _progress(sec: float) -> void:
	for t in _tele:
		if is_instance_valid(t) and t.material_override is ShaderMaterial:
			t.set_instance_shader_parameter("progress", clampf(move_t / sec, 0.0, 1.0))

func _shout(text: String, color := Color(1.0, 0.75, 0.3)) -> void:
	Fx.word(global_position + Vector3(0, 2.6 * scale_f, 0), text, color, 110, 0.8)

func _run_move(delta: float, p, dir: Vector3, dist: float) -> void:
	var sov = handle == "sovthpaw"
	match move:
		"slam":
			var wind = 1.15 if phase < 3 else 0.9
			var r = 5.5 if phase < 3 else 6.5
			if move_stage == 0:
				move_stage = 1
				move_data["target"] = p.global_position
				move_data["from"] = global_position
				_tele_circle(p.global_position, r, wind, "slam")
				_play("2H_Melee_Attack_Chop" if anim and anim.has_animation("2H_Melee_Attack_Chop") else "1H_Melee_Attack_Chop", 0.55)
				_shout("TIMEOUT!" if sov else "HNGH!")
			_progress(wind)
			var k = clampf(move_t / wind, 0.0, 1.0)
			var from: Vector3 = move_data["from"]
			var target: Vector3 = move_data["target"]
			var pos = from.lerp(target - (target - from).normalized() * 1.0, k)
			pos.y = (from.y if flying else 0.0) + sin(k * PI) * 7.0
			velocity = Vector3.ZERO
			global_position = pos
			_face((target - from).normalized(), delta * 10.0)
			if move_t >= wind:
				var hit_d = Vector2(p.global_position.x - target.x, p.global_position.z - target.z).length()
				Fx.dust(target, r)
				Fx.ring(target + Vector3(0, 0.3, 0), r * 1.3, Fx.EMBER, 0.4, 0.4)
				Fx.light(target + Vector3(0, 1, 0), Fx.EMBER, 12.0, 14.0, 0.3)
				Game.shake(0.8)
				Game.hit_stop(0.06)
				if hit_d < r and p.global_position.y < 2.2:
					if p.hurt(26.0, target):
						if sov:
							p.timeout(1.1)
				_end(1.6)
		"windup":
			var wind2 = 3.2
			if move_stage == 0:
				move_stage = 1
				_tele_circle(global_position, 10.0, wind2, "slam")
				_play("2H_Melee_Idle")
			_progress(wind2)
			if int(move_t * 2.0) != int((move_t - delta) * 2.0) and move_t < wind2:
				_shout("CLANK" if int(move_t * 2.0) % 2 == 0 else "…clank")
			model.rotation.z = sin(move_t * 20.0) * 0.04
			if move_t >= wind2:
				model.rotation.z = 0.0
				_play("2H_Melee_Attack_Chop", 1.6)
				Fx.dust(global_position, 10.0)
				Fx.ring(global_position + Vector3(0, 0.4, 0), 13.0, Fx.EMBER, 0.5, 0.6)
				Game.shake(1.0)
				Game.hit_stop(0.1)
				if dist < 10.0 + radius and p.global_position.y < 2.5:
					p.hurt(42.0, global_position)
				_end(2.0)
		"ring", "bells":
			var count = 3 if move == "bells" else 1
			var gap = 0.65
			if move_stage == 0:
				move_stage = 1
				move_data["fired"] = 0
				_play("Spellcast_Raise" if anim and anim.has_animation("Spellcast_Raise") else "Cheer", 1.0)
				_shout("ON-TOPIC!" if sov else ("~ chime ~" if move == "bells" else "HAAA!"))
			var fired: int = move_data["fired"]
			if fired < count and move_t >= 0.8 + fired * gap:
				move_data["fired"] = fired + 1
				Game.main.spawn_wave(global_position, 15.0 if move == "ring" else 11.0, 20.0 if move == "ring" else 14.0, "silence" if sov else "", Color(1.0, 0.8, 0.4) if move == "bells" else Fx.EMBER)
				Fx.light(global_position + Vector3(0, 2, 0), Fx.GOLD, 8.0, 12.0, 0.3)
			if move_t >= 0.8 + count * gap:
				_end(1.2)
		"charge":
			var tel = 0.9
			if move_stage == 0:
				move_stage = 1
				move_data["dir"] = dir
				_tele_line(global_position, dir, 28.0, 3.2, tel, "charge")
				_shout("YES SIR!" if handle == "flownium" else "CHARGE!")
				_play("Idle")
			var cdir: Vector3 = move_data["dir"]
			_face(cdir, delta * 12.0)
			if move_t < tel:
				_progress(tel)
				velocity.x = 0
				velocity.z = 0
			elif move_t < tel + 0.85:
				if move_stage == 1:
					move_stage = 2
					for t in _tele:
						if is_instance_valid(t):
							t.queue_free()
					_tele.clear()
				_play("Running_A", 2.0)
				velocity.x = cdir.x * 34.0
				velocity.z = cdir.z * 34.0
				if Engine.get_physics_frames() % 3 == 0:
					Fx.dust(global_position, 1.5)
				if dist < radius + 1.4 and not move_data.get("hit", false):
					move_data["hit"] = true
					p.hurt(24.0, global_position)
					p.velocity += cdir * 20.0 + Vector3(0, 8, 0)
			else:
				_end(1.0)
		"volley":
			if move_stage == 0:
				move_stage = 1
				_play("Spellcast_Shoot" if anim and anim.has_animation("Spellcast_Shoot") else "Throw", 1.0)
			if move_t >= 0.45 and move_stage == 1:
				move_stage = 2
				var n = 5 + phase * 2
				var from = global_position + Vector3(0, 1.4 * scale_f * 0.6 + (2.4 if String(data.get("model")) == "eye" else 0.0), 0)
				var aim: Vector3 = (p.global_position + Vector3(0, 1.0, 0)) - from
				var base = aim.normalized()
				for i in n:
					var a = (i - (n - 1) * 0.5) * 0.11
					var d2 = base.rotated(Vector3.UP, a)
					Game.main.spawn_shot(from, d2 * 20.0, 9.0, String(data.get("projectile", "ember")))
			if move_t >= 1.0:
				_end(0.9)
		"keys":
			var lanes = 5
			var order = [0, 2, 4, 1, 3, 4, 2, 0]
			if move_stage == 0:
				move_stage = 1
				move_data["i"] = 0
				move_data["base"] = dir
				for l in lanes:
					var ld: Vector3 = dir.rotated(Vector3.UP, (l - 2) * 0.22)
					_tele_line(global_position, ld, 30.0, 1.6, 0.7, "keys")
				_shout("♪ ♫ ♪")
				_play("Spellcasting")
			var i2: int = move_data["i"]
			if move_t >= 0.7 + i2 * 0.2 and i2 < order.size():
				move_data["i"] = i2 + 1
				var bd: Vector3 = move_data["base"]
				var ld2: Vector3 = bd.rotated(Vector3.UP, (order[i2] - 2) * 0.22)
				Game.main.spawn_shot(global_position + Vector3(0, 1.0, 0), ld2 * 22.0, 11.0, "note", 1.6)
			if move_t >= 0.7 + order.size() * 0.2 + 0.3:
				_end(1.2)
		"beam":
			var tel2 = 0.8
			var sweep = 2.6
			if move_stage == 0:
				move_stage = 1
				move_data["base"] = atan2(dir.x, dir.z)
				move_data["side"] = 1.0 if randf() < 0.5 else -1.0
				move_data["beam"] = _make_beam()
				_play("Spellcasting")
				_shout("I SEE YOU" if handle == "LocutusOfTheEye" else "HOLD STILL")
			var beam: Node3D = move_data["beam"]
			var ang: float = float(move_data["base"]) + float(move_data["side"]) * lerpf(-1.1, 1.1, clampf((move_t - tel2) / sweep, 0.0, 1.0))
			var bdir = Vector3(sin(ang), 0, cos(ang))
			_face(bdir, 1.0)
			var origin = global_position + Vector3(0, (2.4 if String(data.get("model")) == "eye" else 1.6 * scale_f * 0.55), 0)
			beam.global_position = origin
			beam.rotation = Vector3(0, ang, 0)
			beam.scale = Vector3(0.15 if move_t < tel2 else 1.0, 0.15 if move_t < tel2 else 1.0, 1.0)
			Game.threats = Game.threats.filter(func(x): return x.get("owner") != id)
			Game.threats.append({"pos": Vector3(origin.x, 0, origin.z), "dir": bdir, "length": 40.0, "radius": 1.3, "t": maxf(0.0, tel2 - move_t), "kind": "beam", "owner": id, "at": Game.time})
			if move_t >= tel2:
				var rel: Vector3 = p.global_position - origin
				rel.y = 0
				var along = rel.dot(bdir)
				var off = (rel - bdir * along).length()
				if along > 0.0 and along < 40.0 and off < 1.3 and p.global_position.y < origin.y + 1.5:
					if p.hurt(11.0, origin):
						pass
				if Engine.get_physics_frames() % 3 == 0:
					var hitp = origin + bdir * clampf(along, 2.0, 40.0)
					Fx.sparks(Vector3(hitp.x, 0.3, hitp.z), Fx.GOLD, 4, 6.0)
			if move_t >= tel2 + sweep:
				beam.queue_free()
				_end(1.3)
		"summon":
			if move_stage == 0:
				move_stage = 1
				_play("Spellcast_Summon" if anim and anim.has_animation("Spellcast_Summon") else "Cheer")
				_shout("RISE!")
				for i in 2 + phase:
					var a2 = randf() * TAU
					var at = global_position + Vector3(cos(a2), 0, sin(a2)) * 4.0
					Game.main.spawn_enemy(["grunt", "grunt", "shield", "caster"].pick_random(), at)
			if move_t >= 1.0:
				_end(1.0)
		"checkpoints":
			if move_stage == 0:
				move_stage = 1
				_play("Spellcast_Summon" if anim and anim.has_animation("Spellcast_Summon") else "Spellcast_Raise")
				_shout("LOADING CHECKPOINTS")
				var alive = 0
				for e in Game.live_enemies():
					if e is Enemy and e.kind == "checkpoint":
						alive += 1
				var n = clampi(3 + phase - alive, 0, 3 + phase)
				for i in n:
					var a3 = i * TAU / maxf(1.0, n)
					Game.main.spawn_enemy("checkpoint", global_position + Vector3(cos(a3) * 3.0, 2.0, sin(a3) * 3.0))
				Fx.ring(global_position + Vector3(0, 2, 0), 6.0, Fx.GOLD, 0.5, 0.3)
				Fx.light(global_position + Vector3(0, 3, 0), Fx.GOLD, 14.0, 18.0, 0.6)
			if move_t >= 1.2:
				_end(1.0)
		"split":
			if move_stage == 0:
				move_stage = 1
				_shout("THREE VENTURES")
				for s in 2:
					var c = Game.main.spawn_clone(data, global_position + Vector3((s * 2 - 1) * 4.0, 0, 0))
				Fx.ring(global_position + Vector3(0, 1, 0), 5.0, Fx.GOLD, 0.4, 0.4)
			if move_t >= 0.8:
				_end(1.2)
		"phase":
			if move_stage == 0:
				move_stage = 1
				intangible = 1.4
				_shout("boo")
			if move_t >= 1.2 and move_stage == 1:
				move_stage = 2
				var behind: Vector3 = p.global_position - p.forward_dir() * 6.0
				behind.y = global_position.y
				global_position = behind
				Fx.ink(global_position + Vector3(0, 2, 0), 1.0, Color(1.0, 0.85, 0.6))
				_face((p.global_position - global_position).normalized(), 1.0)
				_begin("slam")
				return
		"blink":
			if move_stage == 0:
				move_stage = 1
				Fx.ink(global_position + Vector3(0, 2, 0), 0.8, Fx.EMBER)
				var a4 = randf() * TAU
				global_position = Vector3(cos(a4) * 14.0, global_position.y, sin(a4) * 14.0)
				Fx.ink(global_position + Vector3(0, 2, 0), 0.8, Fx.EMBER)
			if move_t >= 0.4:
				_end(0.4)
		"rain", "pillars":
			var tel3 = 1.2
			if move_stage == 0:
				move_stage = 1
				var spots: Array = []
				for i in 7:
					var at2: Vector3
					if move == "rain":
						at2 = p.global_position + Vector3(randf_range(-7, 7), 0, randf_range(-7, 7))
					else:
						at2 = global_position + dir * (4.0 + i * 3.2)
					spots.append(at2)
					_tele_circle(at2, 2.2, tel3 + (i * 0.12 if move == "pillars" else 0.0), "slam")
				move_data["spots"] = spots
				_shout("HOTFIX!" if move == "pillars" else "SALTY!")
				_play("Spellcast_Raise" if anim and anim.has_animation("Spellcast_Raise") else "Cheer")
			_progress(tel3)
			if move_t >= tel3 + 0.9:
				_end(1.0)
			elif move_t >= tel3 and move_stage == 1:
				move_stage = 2
				for at3 in move_data["spots"]:
					Fx.fire(at3 + Vector3(0, 0.2, 0), 26, Vector3.UP, 15.0, 12.0)
					Fx.ring(at3 + Vector3(0, 0.2, 0), 2.6, Fx.EMBER, 0.3, 0.4)
					var dd = Vector2(p.global_position.x - at3.x, p.global_position.z - at3.z).length()
					if dd < 2.2 and p.global_position.y < 3.0:
						p.hurt(15.0, at3)
				Game.shake(0.4)
		_:
			_end(1.0)

func _make_beam() -> Node3D:
	var root = Node3D.new()
	Game.main.add_child(root)
	var b = BoxMesh.new()
	b.size = Vector3(1.1, 1.1, 40.0)
	b.material = Look.glow(Color(1.0, 0.55, 0.15), 0.85)
	var mi = MeshInstance3D.new()
	mi.mesh = b
	mi.position.z = 20.0
	mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	root.add_child(mi)
	var core = BoxMesh.new()
	core.size = Vector3(0.35, 0.35, 40.0)
	core.material = Look.glow(Color(1.0, 0.95, 0.8))
	var mc = MeshInstance3D.new()
	mc.mesh = core
	mc.position.z = 20.0
	root.add_child(mc)
	var l = OmniLight3D.new()
	l.light_color = Color(1.0, 0.6, 0.2)
	l.light_energy = 6.0
	l.omni_range = 10.0
	root.add_child(l)
	return root

func _check_phase() -> void:
	if clone:
		return
	var want = 1
	if hp < max_hp * 0.33:
		want = 3
	elif hp < max_hp * 0.66:
		want = 2
	if want > phase:
		phase = want
		Game.main.on_boss_phase(self, phase)

# ------------------------------------------------------------ damage -----

func take_hit(amount: float, at: Vector3, src := "") -> bool:
	if dead or intangible > 0.0 or not ai:
		return false
	if armored and stagger_t <= 0.0 and src == "gun":
		amount *= 0.7
	if burn_t > 0.0 and shard_cd <= 0.0 and src != "fire":
		shard_cd = 0.6
		Game.main.spawn_pickup("armor", global_position + Vector3(0, 2.0, 0), 1)
	flash_t = 0.08
	hp -= amount
	Fx.number(at, amount, Color(1.0, 0.92, 0.75) if amount < 30 else Fx.GOLD, amount >= 30)
	if hp <= 0.0:
		die()
	return true

func weakpoint_broken(wp) -> void:
	disabled[wp.disables] = true
	hp -= 90.0
	stagger_t = 3.2
	if move == wp.disables:
		_end(1.0)
	Game.slowmo(0.7, 0.22)
	Game.shake(0.9)
	Fx.ink(wp.global_position, 1.8, Fx.GOLD)
	Fx.light(wp.global_position, Fx.GOLD, 16.0, 20.0, 0.6)
	Game.announce("%s BROKEN" % wp.wp_name.to_upper(), "%s disabled" % wp.disables, Fx.GOLD, 1.6)
	if prop and String(wp.disables) != "" and wp.get_parent() == prop:
		prop.visible = false
	if hp <= 0.0:
		die()

func finish() -> void:
	stagger_t = 0.0
	hp -= 160.0
	Game.main.spawn_pickup("health", global_position + Vector3(0, 2.0, 0), 5)
	Fx.number(global_position + Vector3(0, 3, 0), 160, Fx.GOLD, true)
	if hp <= 0.0:
		die()

func rip() -> void:
	hp -= 110.0
	Game.main.spawn_pickup("ammo", global_position + Vector3(0, 2.0, 0), 5)
	Fx.number(global_position + Vector3(0, 3, 0), 110, Fx.EMBER, true)
	if hp <= 0.0:
		die()

func ignite() -> void:
	burn_t = 5.0

func punched(amount: float, from: Vector3) -> void:
	armored = false
	take_hit(amount, global_position + Vector3(0, 2, 0), "blast")

func die() -> void:
	if dead:
		return
	dead = true
	_end(0)
	Game.enemies.erase(self)
	ai = false
	if not clone:
		Game.main.on_boss_dead(self)
		_play("Death_A", 0.8)
		Fx.ink(global_position + Vector3(0, 2, 0), 3.0, Fx.GOLD)
		Fx.light(global_position + Vector3(0, 3, 0), Fx.GOLD, 20.0, 30.0, 1.2)
		var t = create_tween()
		t.tween_interval(2.5)
		t.tween_callback(queue_free)
	else:
		Fx.ink(global_position + Vector3(0, 2, 0), 1.6, Fx.GOLD)
		Game.main.on_kill(self)
		queue_free()
