class_name Player
extends CharacterBody3D
## The heroine (the Messenger or the Runner). Third person with a damped follow camera
## (gacha-action style), blade on the attack button, guns on aim. `--fps` keeps the old
## first-person view.

signal died

const SPEED := 13.5
const ACCEL := 95.0
const AIR_ACCEL := 45.0
const GRAVITY := 34.0
const JUMP := 11.5
const DJUMP := 10.5
const DASH_SPEED := 32.0
const DASH_TIME := 0.17
const DASH_REGEN := 1.3       # the Runner refills a little faster (see _timers)
const EYE := 1.6

const WEAPONS := [
	{"name": "REPEATER", "rate": 0.085, "dmg": 9.0, "pellets": 1, "spread": 0.012, "cost": 1.0, "range": 90.0},
	{"name": "SCATTER", "rate": 0.8, "dmg": 8.0, "pellets": 10, "spread": 0.075, "cost": 4.0, "range": 32.0},
	{"name": "LANCE", "rate": 0.25, "dmg": 95.0, "pellets": 1, "spread": 0.0, "cost": 8.0, "range": 140.0, "charge": 0.65},
]

var max_health := 100.0
var health := 100.0
var armor := 0.0
var max_armor := 50.0
var ammo := 50.0
var max_ammo := 90.0
var fuel := 2.0
var max_fuel := 3.0
var fire_cd := 0.0
var punch := 0
var dash_charges := 2.0
var jumps_left := 1
var weapon := 0
var fire_t := 0.0
var charge := 0.0
var swap_boost := 0.0
var last_hit_t := -10.0
var invuln := 0.0
var frozen := 0.0
var silenced := 0.0
var lock := 0.0
var lock_kind := ""
var lock_target = null
var lock_hit := false
var still_t := 0.0
var dash_t := 0.0
var dash_dir := Vector3.ZERO
var yaw := 0.0
var pitch := 0.0
var bob_t := 0.0
var trauma := 0.0
var fov_kick := 0.0
var recoil := 0.0
var dead := false
var hits := 0
var kills := 0
var aiming := false

# intent: filled by a human (mouse and keys) or by the reflex pilot
var in_move := Vector2.ZERO
var in_jump := false
var in_dash := false
var in_fire := false
var in_finish := false
var in_rip := false
var in_burn := false
var in_punch := false
var in_weapon := -1
var in_attack := false     # blade button held
var in_aim := false        # gun: aim and shoot
var in_ult := false
var pilot = null

# third person
var third := true
var hero := "messenger"
var avatar: Avatar
var rig: Node3D
var arm: SpringArm3D
var body_yaw := 0.0
var rig_yaw := 0.0
var aim_k := 0.0
var look_idle := 0.0
var cine_t := 0.0
var cine_yaw := 0.0
var melee: Melee
var style: Style
var ult := 0.0
var dash_start := -9.0
var perfect_cd := 0.0
var dash_max := 2.0
# run modifiers (roguelike upgrades write these)
var blade_reach := 1.0
var plunge_mult := 1.0
var mods := {}

var cam: Camera3D
var view: Node3D
var guns: Array = []
var muzzle: Node3D
var trail_color := Color(1.0, 0.6, 0.2)
var gun_color := Color(1.0, 0.75, 0.3)
var _jump_was := false

func _ready() -> void:
	add_to_group("player")
	collision_layer = 2
	collision_mask = 1
	floor_snap_length = 0.3
	var shape = CollisionShape3D.new()
	var cap = CapsuleShape3D.new()
	cap.radius = 0.42
	cap.height = 1.8
	shape.shape = cap
	shape.position.y = 0.9
	add_child(shape)
	third = not Game.arg("fps", false)
	hero = String(Game.arg("hero", hero))
	melee = Melee.new(self)
	style = Style.new()
	trail_color = Game.cosmetic_color("sandal_trail", trail_color)
	gun_color = Game.cosmetic_color("weapon_skin", gun_color)
	if hero == "messenger":
		max_health = 110.0
		health = max_health
	cam = Camera3D.new()
	cam.near = 0.05
	cam.far = 400.0
	if third:
		_build_third()
	else:
		cam.position.y = EYE
		cam.fov = 92.0
		add_child(cam)
		_build_view()
	cam.current = true

## Character select: rebuild the avatar as the other heroine.
func set_hero(h: String) -> void:
	hero = h
	max_health = 110.0 if h == "messenger" else 100.0
	health = max_health
	if not third:
		return
	avatar.queue_free()
	avatar = Avatar.new()
	add_child(avatar)
	avatar.build(hero)
	muzzle = avatar.muzzle

func _build_third() -> void:
	avatar = Avatar.new()
	add_child(avatar)
	avatar.build(hero)
	muzzle = avatar.muzzle
	rig = Node3D.new()
	rig.top_level = true
	add_child(rig)
	arm = SpringArm3D.new()
	arm.spring_length = 4.3
	arm.collision_mask = 1
	var sh = SphereShape3D.new()
	sh.radius = 0.3
	arm.shape = sh
	arm.margin = 0.1
	arm.add_excluded_object(get_rid())
	rig.add_child(arm)
	arm.add_child(cam)
	cam.fov = 68.0
	pitch = -0.2
	rig.global_position = global_position + Vector3(0, 1.55, 0)

func _build_view() -> void:
	view = Node3D.new()
	view.position = Vector3(0.34, -0.36, -0.62)
	cam.add_child(view)
	var bronze = Color(0.62, 0.32, 0.14)
	var dark = Color(0.16, 0.07, 0.05)
	for i in 3:
		var g = Node3D.new()
		view.add_child(g)
		guns.append(g)
		g.visible = i == 0
		var body = Look.box(Vector3(0.12, 0.14, 0.5), bronze, 0.0, 0.008)
		g.add_child(body)
		var grip = Look.box(Vector3(0.08, 0.2, 0.1), dark, 0.0, 0.008)
		grip.position = Vector3(0, -0.14, 0.12)
		grip.rotation.x = -0.3
		g.add_child(grip)
		var core = Look.ball(0.045, gun_color, 1.4, 0.006)
		core.position = Vector3(0, 0.09, 0.05)
		g.add_child(core)
		match i:
			0:
				for k in 3:
					var b = Look.cyl(0.022, 0.42, gun_color, 0.6, 0.006)
					b.rotation.x = PI / 2
					b.position = Vector3((k - 1) * 0.035, 0.02, -0.38)
					g.add_child(b)
			1:
				var b2 = Look.cyl(0.07, 0.36, bronze, 0.0, 0.008, 0.09)
				b2.rotation.x = PI / 2
				b2.position = Vector3(0, 0.02, -0.38)
				g.add_child(b2)
				var lip = Look.cyl(0.095, 0.05, gun_color, 1.2, 0.006)
				lip.rotation.x = PI / 2
				lip.position = Vector3(0, 0.02, -0.57)
				g.add_child(lip)
			2:
				var b3 = Look.cyl(0.03, 0.7, gun_color, 0.8, 0.006)
				b3.rotation.x = PI / 2
				b3.position = Vector3(0, 0.03, -0.5)
				g.add_child(b3)
				for k in 2:
					var wing = Look.box(Vector3(0.22, 0.015, 0.12), gun_color, 0.5, 0.006)
					wing.position = Vector3((k * 2 - 1) * 0.13, 0.08, -0.05)
					wing.rotation.z = (k * 2 - 1) * 0.35
					g.add_child(wing)
	muzzle = Node3D.new()
	muzzle.position = Vector3(0, 0.03, -0.75)
	view.add_child(muzzle)

func _unhandled_input(event: InputEvent) -> void:
	if pilot != null:
		return
	if event is InputEventMouseMotion and Input.mouse_mode == Input.MOUSE_MODE_CAPTURED:
		yaw -= event.relative.x * 0.0025
		pitch = clampf(pitch - event.relative.y * 0.0025, -1.4 if not third else -1.1, 1.4 if not third else 0.7)
		look_idle = 0.0

func _read_human() -> void:
	in_move = Vector2(Input.get_axis("left", "right"), Input.get_axis("back", "forward"))
	in_jump = Input.is_action_pressed("jump")
	in_dash = Input.is_action_just_pressed("dash")
	in_fire = Input.is_action_pressed("fire")
	in_attack = third and Input.is_action_pressed("attack")
	in_aim = third and Input.is_action_pressed("fire")
	in_ult = Input.is_action_just_pressed("ult")
	in_finish = Input.is_action_just_pressed("finish")
	in_rip = Input.is_action_just_pressed("rip")
	in_burn = Input.is_action_just_pressed("burn")
	in_punch = Input.is_action_just_pressed("punch")
	in_weapon = -1
	for i in 3:
		if Input.is_action_just_pressed("weapon%d" % (i + 1)):
			in_weapon = i

func _physics_process(delta: float) -> void:
	if dead:
		return
	if pilot != null:
		pilot.drive(self, delta)
	else:
		_read_human()
	_timers(delta)
	if lock > 0.0:
		_do_lock(delta)
	else:
		_move(delta)
		_actions(delta)
	_camera(delta)
	in_dash = false
	in_finish = false
	in_rip = false
	in_burn = false
	in_punch = false
	in_weapon = -1
	in_ult = false

func _timers(delta: float) -> void:
	invuln = maxf(0.0, invuln - delta)
	frozen = maxf(0.0, frozen - delta)
	silenced = maxf(0.0, silenced - delta)
	fire_cd = maxf(0.0, fire_cd - delta)
	swap_boost = maxf(0.0, swap_boost - delta)
	fire_t = maxf(0.0, fire_t - delta)
	fov_kick = maxf(0.0, fov_kick - delta * 3.0)
	recoil = maxf(0.0, recoil - delta * 8.0)
	trauma = maxf(0.0, trauma - delta * 1.6)
	dash_charges = minf(dash_max, dash_charges + delta / (DASH_REGEN * (0.8 if hero == "runner" else 1.0)))
	perfect_cd = maxf(0.0, perfect_cd - delta)
	cine_t = maxf(0.0, cine_t - delta)
	look_idle += delta
	style.tick(delta)
	fuel = minf(max_fuel, fuel + delta / 8.0)

func forward_dir() -> Vector3:
	return Vector3(-sin(yaw), 0, -cos(yaw))

func aim_dir() -> Vector3:
	return -cam.global_transform.basis.z

## Where the heroine's body points (third person); the camera's yaw in first person.
func facing() -> Vector3:
	if not third:
		return forward_dir()
	return Vector3(-sin(body_yaw), 0, -cos(body_yaw))

## Turn to the attack: the closest enemy near the camera's aim, else the aim itself.
func face_aim() -> void:
	if not third:
		return
	var fwd = forward_dir()
	var best = null
	var bd := 7.0
	var cands: Array = Game.live_enemies()
	if Game.boss and is_instance_valid(Game.boss) and not Game.boss.dead:
		cands.append(Game.boss)
	for e in cands:
		var to: Vector3 = e.global_position - global_position
		to.y = 0
		var d = to.length() - (float(e.radius) if "radius" in e else 0.5)
		if d < bd and (d < 2.0 or fwd.angle_to(to.normalized()) < 1.1):
			bd = d
			best = to
	if best != null:
		body_yaw = atan2(-best.x, -best.z)
	else:
		body_yaw = yaw
	avatar.rotation.y = body_yaw

func blade_mult() -> float:
	return float(mods.get("blade", 1.0)) * (1.25 if swap_boost > 0.0 else 1.0)

func guard_mult() -> float:
	return float(mods.get("guard", 1.0))

func blade_heft() -> float:
	return avatar.blade_scale if avatar else 1.0

func combo_hit() -> void:
	last_hit_t = Game.time
	hits += 1
	if Game.main:
		Game.main.hud.hitmark()

func _move(delta: float) -> void:
	if not third:
		rotation.y = yaw
		cam.rotation.x = pitch
	var on_floor = is_on_floor()
	if on_floor:
		jumps_left = 1
	var fwd = forward_dir()
	var right = Vector3(cos(yaw), 0, -sin(yaw))
	var wish = (fwd * in_move.y + right * in_move.x)
	if wish.length() > 1.0:
		wish = wish.normalized()
	if frozen > 0.0:
		wish = Vector3.ZERO
	if dash_t > 0.0:
		dash_t -= delta
		velocity.x = dash_dir.x * DASH_SPEED
		velocity.z = dash_dir.z * DASH_SPEED
		velocity.y = maxf(velocity.y, 0.0)
		if Engine.get_physics_frames() % 2 == 0:
			Fx.feathers(global_position + Vector3(0, 0.3, 0), trail_color)
	else:
		var target = wish * SPEED * float(mods.get("speed", 1.0))
		var a = ACCEL if on_floor else AIR_ACCEL
		if third and melee.busy():
			target *= 0.15
			a = 38.0
		var hv = Vector3(velocity.x, 0, velocity.z).move_toward(target, a * delta)
		if not (third and melee.move == "plunge"):
			velocity.x = hv.x
			velocity.z = hv.z
			velocity.y -= GRAVITY * delta * (0.45 if third and melee.busy() and not on_floor else 1.0)
	var jump_edge = in_jump and not _jump_was
	_jump_was = in_jump
	if jump_edge and frozen <= 0.0:
		if on_floor:
			velocity.y = JUMP
		elif jumps_left > 0:
			jumps_left -= 1
			velocity.y = DJUMP
			Fx.feathers(global_position, trail_color)
			Fx.ring(global_position, 1.6, trail_color, 0.3, 0.1)
	if in_dash and dash_charges >= 1.0 and frozen <= 0.0 and melee.move != "plunge":
		dash_charges -= 1.0
		dash_dir = wish.normalized() if wish.length() > 0.1 else (fwd if not third else facing())
		dash_start = Game.time
		melee.on_dash()
		if third:
			body_yaw = atan2(-dash_dir.x, -dash_dir.z)
		dash_t = DASH_TIME
		invuln = maxf(invuln, 0.24)
		fov_kick = 1.0
		Fx.feathers(global_position + Vector3(0, 0.6, 0), trail_color)
	if third and not melee.busy() and dash_t <= 0.0:
		if in_aim or in_fire:
			body_yaw = lerp_angle(body_yaw, yaw, minf(1.0, delta * 18.0))
		elif wish.length() > 0.1:
			body_yaw = lerp_angle(body_yaw, atan2(-wish.x, -wish.z), minf(1.0, delta * 12.0))
	if third and not melee.busy():
		avatar.rotation.y = body_yaw
	move_and_slide()
	var hspeed = Vector2(velocity.x, velocity.z).length()
	if on_floor and hspeed < 2.5 and Game.main and Game.main.state == "fight":
		still_t += delta
		if still_t > 1.6:
			_hurt_raw(7.0 * delta)
	else:
		still_t = maxf(0.0, still_t - delta * 2.0)
	if on_floor and hspeed > 1.0:
		bob_t += delta * hspeed * 0.75
	if global_position.y < -20.0:
		global_position = Vector3(0, 2, 12)
		velocity = Vector3.ZERO

func _actions(delta: float) -> void:
	if in_weapon >= 0 and in_weapon != weapon:
		if Game.time - last_hit_t < 0.5:
			swap_boost = 2.0
			if third:
				style.add("swap", "swap")
			Game.announce("SWAP BOOST", "", Color(1.0, 0.62, 0.2), 0.6)
		weapon = in_weapon
		charge = 0.0
		fire_t = maxf(fire_t, 0.08)
		for i in guns.size():
			guns[i].visible = i == weapon
	if frozen > 0.0:
		return
	if in_finish:
		var e = _nearest(4.0, true)
		if e != null:
			_start_lock("finish", e, 0.55)
			return
	if in_rip and fuel >= 1.0:
		var e2 = _nearest(3.8, false)
		if e2 != null:
			fuel -= 1.0
			_start_lock("rip", e2, 0.6)
			return
	if in_burn and fire_cd <= 0.0:
		_burn()
	if in_punch and punch > 0:
		_punch()
	if in_ult and ult >= 100.0 and Game.main:
		ult = 0.0
		Game.main.start_ult(self)
		return
	if third:
		melee.update(delta, in_attack)
		aiming = in_aim or in_fire
	var w: Dictionary = WEAPONS[weapon]
	if silenced > 0.0:
		charge = 0.0
		return
	if w.has("charge"):
		if in_fire and ammo >= w["cost"]:
			charge += delta
			if charge >= w["charge"]:
				_shoot(w)
				charge = 0.0
				fire_t = w["rate"]
		else:
			charge = 0.0
	elif in_fire and fire_t <= 0.0 and ammo >= w["cost"]:
		_shoot(w)
		fire_t = w["rate"]

func _nearest(r: float, staggered_only: bool):
	var best = null
	var bd = r
	for e in Game.live_enemies():
		if staggered_only and not e.is_staggered():
			continue
		var d = global_position.distance_to(e.global_position)
		if d < bd:
			bd = d
			best = e
	var b = Game.boss
	if b and is_instance_valid(b) and not b.dead:
		var d2 = Vector2(global_position.x - b.global_position.x, global_position.z - b.global_position.z).length() - b.radius
		if d2 < r and (not staggered_only or b.is_staggered()) and (best == null or d2 < bd):
			best = b
	return best

func _shoot(w: Dictionary) -> void:
	ammo -= w["cost"]
	recoil = 1.0 if weapon != 0 else 0.35
	trauma = minf(1.0, trauma + (0.05 if weapon == 0 else 0.22))
	var from = cam.global_position
	var mpos = muzzle.global_position
	var boost = 1.5 if swap_boost > 0.0 else 1.0
	var space = get_world_3d().direct_space_state
	for i in int(w["pellets"]):
		var dir = aim_dir()
		var sp: float = w["spread"]
		dir = (dir + cam.global_transform.basis.x * randf_range(-sp, sp) + cam.global_transform.basis.y * randf_range(-sp, sp)).normalized()
		var to = from + dir * float(w["range"])
		var q = PhysicsRayQueryParameters3D.create(from, to, 1 | 4 | 8)
		q.collide_with_areas = true
		q.exclude = [get_rid()]
		var hit = space.intersect_ray(q)
		var end = to
		if hit:
			end = hit["position"]
			var c = hit["collider"]
			if c and c.has_method("take_hit"):
				if c.take_hit(float(w["dmg"]) * boost * float(mods.get("gun", 1.0)), end, "gun"):
					last_hit_t = Game.time
					hits += 1
					if Game.main:
						Game.main.hud.hitmark()
					if third:
						style.add("gun%d" % weapon, "gun")
						if c is Boss and w.has("charge"):
							c.guard_hit(25.0 * guard_mult())
						if c is CharacterBody3D and not (c is Boss) and not (c is Pet) and not c.is_on_floor():
							c.velocity.y = maxf(c.velocity.y, 3.5)
						if randf() < 0.3:
							Game.main.spawn_orbs(end, 1, false)
			else:
				Fx.sparks(end, Color(1.0, 0.6, 0.25), 4, 5.0)
		var col = gun_color
		if weapon == 2:
			Fx.tracer(mpos, end, col, 0.16, 0.22)
			Fx.tracer(mpos, end, Color(1, 0.95, 0.8), 0.05, 0.18)
			_splash(end, 4.0, 40.0 * boost)
			Fx.fire(end, 16, Vector3.UP, 180.0, 6.0)
			Fx.light(end, Color(1, 0.6, 0.2), 8.0, 10.0, 0.2)
			Game.shake(0.25)
		else:
			Fx.tracer(mpos, end, col, 0.035 if weapon == 0 else 0.03, 0.06)
	Fx.light(mpos, Color(1.0, 0.7, 0.3), 5.0, 5.0, 0.06)
	Fx.sparks(mpos, gun_color, 4, 4.0)

func _splash(at: Vector3, r: float, dmg: float) -> void:
	for e in Game.live_enemies():
		if e.global_position.distance_to(at) < r:
			e.take_hit(dmg, e.global_position + Vector3(0, 1, 0), "blast")
	var b = Game.boss
	if b and is_instance_valid(b) and not b.dead and b.global_position.distance_to(at) < r + b.radius:
		b.take_hit(dmg * 0.6, at, "blast")

func _start_lock(kind: String, target, sec: float) -> void:
	lock = sec
	lock_kind = kind
	lock_target = target
	lock_hit = false
	invuln = maxf(invuln, sec + 0.35)
	fov_kick = 0.6
	if Game.main:
		Game.main.hud.callout(kind)

func _do_lock(delta: float) -> void:
	lock -= delta
	var t = lock_target
	if t == null or not is_instance_valid(t):
		lock = 0.0
		return
	var to: Vector3 = t.global_position - global_position
	to.y = 0
	var dist = to.length()
	var want_yaw = atan2(-to.x, -to.z)
	if third:
		body_yaw = lerp_angle(body_yaw, want_yaw, minf(1.0, delta * 18.0))
		avatar.rotation.y = body_yaw
	else:
		yaw = lerp_angle(yaw, want_yaw, minf(1.0, delta * 18.0))
		pitch = lerpf(pitch, -0.25, minf(1.0, delta * 10.0))
		rotation.y = yaw
		cam.rotation.x = pitch
	var reach = 1.6 + (t.radius if "radius" in t else 0.0)
	if dist > reach and not lock_hit:
		var v = to.normalized() * 26.0
		velocity = Vector3(v.x, 0, v.z)
	else:
		velocity = velocity.move_toward(Vector3.ZERO, 120.0 * delta)
		if not lock_hit:
			lock_hit = true
			var pos: Vector3 = t.global_position + Vector3(0, 1.2, 0)
			if lock_kind == "finish":
				var fin = Game.cosmetic_color("finisher", Fx.GOLD)
				t.finish()
				if third:
					cinematic(0.7, 1.25 if randf() < 0.5 else -1.25)
					Game.slowmo(0.45, 0.3)
					style.add("finish", "finish")
					Game.main.spawn_orbs(pos, 4, true)
					avatar.start_swing(Vector3(PI * 0.95, 0, 0), Vector3(PI * 0.2, 0, 0))
				punch = mini(2, punch + 1)
				kills += 1
				Game.hit_stop(0.16)
				Game.shake(0.7)
				Fx.ink(pos, 1.6, fin)
				Fx.light(pos, fin, 10.0, 12.0, 0.3)
				Fx.word(pos + Vector3(0, 1.2, 0), "FINISHED", fin, 90, 0.5)
			else:
				t.rip()
				kills += 1
				if third:
					style.add("rip", "rip")
				Game.hit_stop(0.12)
				Game.shake(0.6)
				Fx.sparks(pos, Color(1, 0.8, 0.3), 40, 14.0)
				Fx.ink(pos, 1.3, Fx.EMBER)
				Fx.word(pos + Vector3(0, 1.2, 0), "RIPPED", Fx.EMBER, 90, 0.5)
	move_and_slide()

func _burn() -> void:
	fire_cd = 7.0
	var fwd = forward_dir()
	var n = 0
	for e in Game.live_enemies():
		var to: Vector3 = e.global_position - global_position
		var d = to.length()
		if d < 3.0 or (d < 10.0 and fwd.dot(to.normalized()) > 0.45):
			e.ignite()
			e.take_hit(10.0, e.global_position + Vector3(0, 1, 0), "fire")
			n += 1
	var b = Game.boss
	if b and is_instance_valid(b) and not b.dead and global_position.distance_to(b.global_position) < 10.0 + b.radius:
		b.ignite()
	for k in 5:
		Fx.fire(global_position + Vector3(0, 1.2, 0) + fwd * (1.5 + k * 1.6), 22, fwd + Vector3(0, 0.3, 0), 25.0, 10.0)
	Fx.light(global_position + fwd * 4.0 + Vector3(0, 1.5, 0), Fx.EMBER, 12.0, 14.0, 0.5)
	Game.shake(0.3)
	if Game.main:
		Game.main.hud.callout("burn")

func _punch() -> void:
	punch -= 1
	var c = global_position + Vector3(0, 1, 0)
	for e in Game.live_enemies():
		if e.global_position.distance_to(global_position) < 7.5:
			e.punched(65.0, global_position)
	var b = Game.boss
	if b and is_instance_valid(b) and not b.dead and global_position.distance_to(b.global_position) < 7.5 + b.radius:
		b.punched(65.0, global_position)
	Fx.ring(c, 7.5, Fx.GOLD, 0.35, 0.6)
	Fx.ring(c, 5.0, Color(1, 0.95, 0.8), 0.25, 0.4)
	Fx.light(c, Fx.GOLD, 14.0, 14.0, 0.3)
	Game.hit_stop(0.1)
	Game.shake(0.8)
	fov_kick = 1.0
	if Game.main:
		Game.main.hud.callout("punch")

## A short cinematic angle: the camera swings to the side (yaw offset, rad) and pushes in.
func cinematic(sec: float, side: float) -> void:
	cine_t = sec
	cine_yaw = side

func _camera(delta: float) -> void:
	if third:
		_camera_third(delta)
		return
	var hspeed = Vector2(velocity.x, velocity.z).length()
	var bob = sin(bob_t * 2.0) * 0.05 * minf(1.0, hspeed / SPEED) if is_on_floor() else 0.0
	cam.position.y = EYE + bob
	var target_fov = 92.0 + fov_kick * 14.0 + minf(hspeed, 30.0) * 0.15
	if lock > 0.0:
		target_fov = 74.0
	cam.fov = lerpf(cam.fov, target_fov, minf(1.0, delta * 12.0))
	var s = trauma * trauma
	cam.h_offset = randf_range(-1, 1) * 0.18 * s
	cam.v_offset = randf_range(-1, 1) * 0.18 * s
	cam.rotation.z = randf_range(-1, 1) * 0.05 * s
	view.position = Vector3(0.34 + sin(bob_t) * 0.012, -0.36 + bob * 0.4 - recoil * 0.02, -0.62 + recoil * 0.09)
	view.rotation.x = recoil * 0.12 + charge * 0.1
	view.visible = lock <= 0.0

func _camera_third(delta: float) -> void:
	var real = delta / maxf(Engine.time_scale, 0.001)
	var hspeed = Vector2(velocity.x, velocity.z).length()
	# ease back behind the heroine while she runs and the mouse is still
	if pilot == null and look_idle > 0.9 and hspeed > 4.0 and not in_aim and not melee.busy():
		yaw = lerp_angle(yaw, body_yaw, minf(1.0, real * 1.4))
	aim_k = move_toward(aim_k, 1.0 if (in_aim and lock <= 0.0) else 0.0, real * 6.0)
	var c = 1.0 - exp(-real * 9.0)
	var right = Vector3(cos(yaw), 0, -sin(yaw))
	var focus = global_position + Vector3(0, 1.55 - aim_k * 0.05, 0) + right * aim_k * 0.65
	rig.global_position = rig.global_position.lerp(focus, minf(1.0, 1.0 - exp(-real * 14.0)))
	var want_yaw = yaw
	var want_pitch = pitch
	var length = lerpf(4.3, 2.5, aim_k)
	if cine_t > 0.0:
		want_yaw = body_yaw + cine_yaw
		want_pitch = -0.08
		length = 2.8
	rig_yaw = lerp_angle(rig_yaw, want_yaw, minf(1.0, 1.0 - exp(-real * (16.0 if cine_t <= 0.0 else 7.0))))
	rig.rotation = Vector3(lerp_angle(rig.rotation.x, want_pitch, minf(1.0, 1.0 - exp(-real * 16.0))), rig_yaw, 0)
	arm.spring_length = lerpf(arm.spring_length, length, c)
	var target_fov = 68.0 + fov_kick * 10.0 + minf(hspeed, 30.0) * 0.12 - aim_k * 8.0
	cam.fov = lerpf(cam.fov, target_fov, minf(1.0, real * 10.0))
	var s = trauma * trauma
	cam.h_offset = randf_range(-1, 1) * 0.22 * s
	cam.v_offset = randf_range(-1, 1) * 0.22 * s
	cam.rotation.z = randf_range(-1, 1) * 0.04 * s
	avatar.pose(delta, velocity, is_on_floor(), dash_t > 0.0, aiming or in_fire, avatar.swing)

func hurt(amount: float, from := Vector3.ZERO, kind := "") -> bool:
	if third and invuln > 0.0 and Game.time - dash_start < 0.2 and perfect_cd <= 0.0 and not dead:
		_perfect_dodge()
		return false
	if dead or invuln > 0.0 or lock > 0.0:
		return false
	if third:
		style.hurt()
	_hurt_raw(amount * Game.damage_taken)
	trauma = minf(1.0, trauma + 0.35)
	if Game.main:
		Game.main.hud.hurt(from)
	return true

func _hurt_raw(amount: float) -> void:
	var soak = minf(armor, amount * 0.6)
	armor -= soak
	health -= amount - soak
	if health <= 0.0 and not dead:
		health = 0.0
		dead = true
		died.emit()

## Dashed through a hit at the last moment: slow-mo, gold tint, and the next attack counters.
func _perfect_dodge() -> void:
	perfect_cd = 1.0
	Game.slowmo(0.6, 0.3)
	melee.counter_until = Game.time + 1.0
	style.add("perfect", "perfect")
	Fx.word(global_position + Vector3(0, 2.2, 0), "PERFECT", Fx.GOLD, 90, 0.5)
	if Game.main:
		Game.main.hud.perfect()
		Game.main.spawn_orbs(global_position + Vector3(0, 1.2, 0), 3, true)

func timeout(sec: float) -> void:
	frozen = sec
	velocity = Vector3.ZERO
	if Game.main:
		Game.main.hud.timed_out(sec)

func silence(sec: float) -> void:
	silenced = sec
	Game.announce("SILENCED", "off-topic", Color(1.0, 0.5, 0.3), sec)

func launch(v: Vector3) -> void:
	velocity = v
	jumps_left = 1
	Fx.feathers(global_position, trail_color)
	Fx.ring(global_position, 2.0, trail_color, 0.3, 0.1)

func grab_bar() -> void:
	velocity.y = maxf(velocity.y, 9.5)
	jumps_left = 1
	dash_charges = minf(2.0, dash_charges + 1.0)
	Fx.feathers(global_position + Vector3(0, 1.8, 0), Fx.GOLD)

func pickup(kind: String, amount: float) -> void:
	match kind:
		"health":
			health = minf(max_health, health + amount)
		"ammo":
			ammo = minf(max_ammo, ammo + amount)
		"armor":
			armor = minf(max_armor, armor + amount)
