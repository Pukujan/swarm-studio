class_name Pet
extends Enemy
## A boss's robot pet. It follows its boss, plants itself and raises a gold dome over
## the boss that stops the player's shots (step inside the dome, or break the pet),
## and attacks: the Rhino charges in a line, the Protector sweeps a low beam.
## Hurt it enough while the dome is up and it staggers: the dome drops and it can be
## finished for health. Killing it first is a fine plan. Models: CC BY, see CREDITS.md.

const PETS := {
	"rhino": {"file": "res://assets/pets/rhino.glb", "height": 2.3, "hp": 240.0, "attack": "charge", "name": "RHINO BOT", "turn": PI},
	"protector": {"file": "res://assets/pets/protector.glb", "height": 2.4, "hp": 220.0, "attack": "beam", "name": "STREAM PROTECTOR", "hover": 0.6, "turn": 0.0},
}
const DOME_BREAK := 0.32      # share of max hp the pet must lose while shielding to drop the dome
const OUTLINE_WORLD := 0.03   # ink outline width in metres

var boss = null
var pet := "rhino"
var info: Dictionary = {}
var mode := "follow"          # follow, shield, windup, charge, beam, rest
var mode_t := 0.0
var shield_cd := 3.0
var attack_cd := 7.0
var shield_dmg := 0.0
var side := 1.0
var dome: MeshInstance3D
var dome_body: StaticBody3D
var dome_r := 4.0
var tether: MeshInstance3D
var beam: Node3D
var charge_dir := Vector3.ZERO
var charge_hit := false
var hover := 0.0
var _tele_node: Node3D

func setup_pet(p: String, owner_boss) -> void:
	pet = p
	info = PETS[p]
	boss = owner_boss
	kind = "%s pet" % p
	hp = float(info["hp"])
	max_hp = hp
	speed = 9.0
	dmg = 20.0
	radius = 1.1
	hover = float(info.get("hover", 0.0))
	flying = hover > 0.0
	side = 1.0 if randf() < 0.5 else -1.0

func _ready() -> void:
	id = Game.new_id()
	add_to_group("enemies")
	collision_layer = 4
	collision_mask = 1
	var cs = CollisionShape3D.new()
	var cap = CapsuleShape3D.new()
	cap.radius = 1.0
	cap.height = 2.4
	cs.shape = cap
	cs.position.y = 1.2 + hover
	add_child(cs)
	model = Node3D.new()
	add_child(model)
	var inner: Node3D = (load(String(info["file"])) as PackedScene).instantiate()
	model.add_child(inner)
	_fit(inner)
	var aps = inner.find_children("*", "AnimationPlayer", true, false)
	if aps.size() > 0:
		anim = aps[0]
		var list = anim.get_animation_list()
		if list.size() > 0:
			anim.get_animation(list[0]).loop_mode = Animation.LOOP_LINEAR
			anim.play(list[0])
	Look.param(model, "flash", 0.0)
	label = Label3D.new()
	label.text = String(info["name"])
	label.font = Look.body_font()
	label.font_size = 44
	label.outline_size = 12
	label.outline_modulate = Fx.INK
	label.modulate = Fx.GOLD
	label.billboard = BaseMaterial3D.BILLBOARD_ENABLED
	label.pixel_size = 0.006
	label.position.y = float(info["height"]) + hover + 0.5
	add_child(label)
	_build_dome()
	spawn_t = 0.4

## Scale the model to its target height, stand it on the floor and cel-shade it with an
## outline of fixed world width (the outline shader pushes vertices in model units).
func _fit(inner: Node3D) -> void:
	var box := AABB()
	var first := true
	for mi in inner.find_children("*", "MeshInstance3D", true, false):
		var a: AABB = (mi as MeshInstance3D).transform * (mi as MeshInstance3D).get_aabb()
		var p = mi.get_parent()
		while p and p != inner:
			if p is Node3D:
				a = (p as Node3D).transform * a
			p = p.get_parent()
		box = a if first else box.merge(a)
		first = false
	var h = maxf(box.size.y, 0.001)
	var s = float(info["height"]) / h
	inner.scale = Vector3.ONE * s
	inner.position = Vector3(-box.get_center().x * s, -box.position.y * s + hover, -box.get_center().z * s)
	inner.rotation.y = float(info.get("turn", 0.0))
	for node in inner.find_children("*", "MeshInstance3D", true, false):
		var mi := node as MeshInstance3D
		if mi.mesh == null:
			continue
		var k := mi.global_transform.basis.get_scale().x
		var ow := OUTLINE_WORLD / maxf(k, 0.0001)
		for i in mi.mesh.get_surface_count():
			var src = mi.get_active_material(i)
			var tex: Texture2D = null
			var col := Color.WHITE
			if src is BaseMaterial3D:
				tex = (src as BaseMaterial3D).albedo_texture
				col = (src as BaseMaterial3D).albedo_color
			mi.set_surface_override_material(i, Look.toon(tex, col, Color(0, 0, 0), 0.0, ow))

func _build_dome() -> void:
	dome_r = (boss.radius if boss else 1.4) + 3.2
	if boss and "scale_f" in boss:
		dome_r = maxf(dome_r, boss.scale_f * 1.3 + 1.0)
	dome = MeshInstance3D.new()
	var sm = SphereMesh.new()
	sm.radius = 1.0
	sm.height = 2.0
	sm.radial_segments = 40
	sm.rings = 20
	dome.mesh = sm
	var m = ShaderMaterial.new()
	m.shader = preload("res://shaders/dome.gdshader")
	dome.material_override = m
	dome.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	dome.top_level = true
	dome.visible = false
	add_child(dome)
	# The dome is a real target: shots from outside hit its shell and stop there.
	# Rays that start inside a shape do not hit it, so stepping in lets you shoot the boss.
	dome_body = preload("res://scripts/dome_shell.gd").new()
	dome_body.top_level = true
	dome_body.collision_layer = 0
	dome_body.collision_mask = 0
	dome_body.set("pet", self)
	var dcs = CollisionShape3D.new()
	var sph = SphereShape3D.new()
	sph.radius = dome_r
	dcs.shape = sph
	dome_body.add_child(dcs)
	add_child(dome_body)
	tether = MeshInstance3D.new()
	var cm = CylinderMesh.new()
	cm.top_radius = 0.09
	cm.bottom_radius = 0.09
	cm.height = 1.0
	cm.radial_segments = 6
	tether.mesh = cm
	tether.material_override = Look.toon(null, Fx.GOLD, Fx.GOLD, 1.4, 0.0)
	tether.top_level = true
	tether.visible = false
	add_child(tether)

func dome_up() -> bool:
	return mode == "shield" and not dead and stagger_t <= 0.0

## Shots that land on the dome shell.
func dome_hit(at: Vector3) -> void:
	dome.set_instance_shader_parameter("hit", 1.0)
	Fx.sparks(at, Fx.GOLD, 5, 6.0)

func _boss_ok() -> bool:
	return boss != null and is_instance_valid(boss) and not boss.dead

func _physics_process(delta: float) -> void:
	if dead:
		return
	var p = Game.player
	flash_t = maxf(0.0, flash_t - delta)
	shard_cd = maxf(0.0, shard_cd - delta)
	if burn_t > 0.0:
		burn_t -= delta
		_damage(6.0 * delta, false)
		if fire_fx == null:
			fire_fx = _flames()
		if burn_t <= 0.0 and fire_fx:
			fire_fx.queue_free()
			fire_fx = null
	_update_dome(delta)
	if not _boss_ok():
		die(false)
		return
	if stagger_t > 0.0:
		stagger_t -= delta
		var pulse = 0.45 + 0.4 * sin(Game.time * 18.0)
		Look.flash(model, maxf(pulse, flash_t * 4.0), Fx.GOLD)
		velocity = velocity.move_toward(Vector3.ZERO, 30.0 * delta)
		_gravity(delta)
		model.rotation.z = sin(Game.time * 9.0) * 0.12
		move_and_slide()
		if stagger_t <= 0.0:
			hp = maxf(hp, max_hp * 0.35)
			model.rotation.z = 0.0
			_set_mode("rest")
		return
	Look.flash(model, flash_t * 5.0)
	if spawn_t > 0.0 or p == null or not is_instance_valid(p) or not boss.ai:
		spawn_t = maxf(0.0, spawn_t - delta)
		return
	mode_t += delta
	shield_cd -= delta
	attack_cd -= delta
	var want := Vector3.ZERO
	match mode:
		"follow", "rest":
			var goal = _follow_point()
			var to = goal - global_position
			to.y = 0
			want = to.limit_length(1.0) * speed if to.length() > 0.6 else Vector3.ZERO
			_face_to(p.global_position, delta * 5.0)
			if mode == "rest" and mode_t > 2.5:
				_set_mode("follow")
			if mode == "follow":
				if shield_cd <= 0.0 and to.length() < 3.0:
					_set_mode("shield")
				elif attack_cd <= 0.0:
					_set_mode("windup")
		"shield":
			_face_to(boss.global_position, delta * 4.0)
			if mode_t > 8.0:
				shield_cd = 8.0
				_set_mode("follow")
		"windup":
			want = Vector3.ZERO
			_windup(p, delta)
		"charge":
			want = charge_dir * 24.0
			_face_to(global_position + charge_dir, 1.0)
			if not charge_hit and global_position.distance_to(p.global_position) < 2.2:
				charge_hit = true
				if p.hurt(22.0, global_position, "charge"):
					p.launch(charge_dir * 12.0 + Vector3(0, 7, 0))
					Game.shake(0.6)
			if Engine.get_physics_frames() % 2 == 0:
				Fx.sparks(global_position + Vector3(0, 0.3, 0), Fx.EMBER, 3, 5.0)
			var flat = Vector2(global_position.x, global_position.z).length()
			if mode_t > 1.1 or flat > 26.0:
				_stop_attack()
		"beam":
			_beam(p)
	# keep apart from minions
	for o in Game.enemies:
		if o != self and is_instance_valid(o) and not o.dead and mode != "charge":
			var away: Vector3 = global_position - o.global_position
			away.y = 0
			var dd = away.length()
			if dd < 2.2 and dd > 0.01:
				want += away / dd * (2.2 - dd) * 6.0
	velocity.x = move_toward(velocity.x, want.x, 60.0 * delta)
	velocity.z = move_toward(velocity.z, want.z, 60.0 * delta)
	_gravity(delta)
	move_and_slide()

func _gravity(delta: float) -> void:
	if flying:
		velocity.y = (0.4 + sin(Game.time * 2.2) * 0.25 - global_position.y) * 4.0
	else:
		velocity.y -= 30.0 * delta

func _follow_point() -> Vector3:
	var b: Vector3 = boss.global_position
	var to_p: Vector3 = Game.player.global_position - b
	to_p.y = 0
	var dir = to_p.normalized() if to_p.length() > 0.1 else Vector3.BACK
	var at = b + dir.cross(Vector3.UP) * side * (dome_r + 1.6) + dir * 1.0
	at.y = 0
	var flat = Vector2(at.x, at.z)
	if flat.length() > 24.0:
		flat = flat.normalized() * 24.0
	return Vector3(flat.x, 0, flat.y)

func _face_to(at: Vector3, amt: float) -> void:
	var to = at - global_position
	to.y = 0
	if to.length() < 0.05:
		return
	var want = atan2(-to.x, -to.z)
	rotation.y = lerp_angle(rotation.y, want, clampf(amt, 0.0, 1.0))

func _set_mode(m: String) -> void:
	mode = m
	mode_t = 0.0
	kind = "%s pet shielding the boss" % pet if m == "shield" else "%s pet" % pet
	if m == "shield":
		shield_dmg = 0.0
		Fx.word(global_position + Vector3(0, 3.2, 0), "SHIELD UP", Fx.GOLD, 90, 0.7)
		Fx.ring(boss.global_position + Vector3(0, 0.2, 0), dome_r, Fx.GOLD, 0.4, 0.2)

func _windup(p, delta: float) -> void:
	var tel := 1.1 if info["attack"] == "charge" else 0.8
	if mode_t <= delta * 1.5:
		var to: Vector3 = p.global_position - global_position
		to.y = 0
		charge_dir = to.normalized() if to.length() > 0.1 else -global_transform.basis.z
		if info["attack"] == "charge":
			_tele(global_position, charge_dir, 24.0, 2.6, tel, "charge")
			Fx.word(global_position + Vector3(0, 3.2, 0), "CHARGE", Fx.EMBER, 90, 0.7)
		else:
			beam = _make_beam()
			Fx.word(global_position + Vector3(0, 3.2, 0), "SWEEP", Fx.EMBER, 90, 0.7)
	if info["attack"] == "charge":
		_face_to(global_position + charge_dir, delta * 10.0)
		model.position.z = sin(mode_t * 40.0) * 0.06
		if _tele_node and is_instance_valid(_tele_node):
			_tele_node.set_instance_shader_parameter("progress", clampf(mode_t / tel, 0.0, 1.0))
		if mode_t >= tel:
			model.position.z = 0.0
			_clear_tele()
			charge_hit = false
			_set_mode("charge")
	else:
		_beam(p)

func _beam(p) -> void:
	# The sweep: a low beam that swings through 2 rad. Jump it (double jump) or dash past.
	var tel = 0.8
	var sweep = 2.2
	var t = mode_t
	var base = atan2(charge_dir.x, charge_dir.z)
	var ang = base + side * lerpf(-1.0, 1.0, clampf((t - tel) / sweep, 0.0, 1.0))
	var bdir = Vector3(sin(ang), 0, cos(ang))
	_face_to(global_position + bdir, 1.0)
	var origin = global_position + Vector3(0, 0.75, 0)
	if beam and is_instance_valid(beam):
		beam.global_position = origin
		beam.rotation = Vector3(0, ang, 0)
		var w = 0.15 if t < tel else 1.0
		beam.scale = Vector3(w, w, 1.0)
	Game.threats = Game.threats.filter(func(x): return x.get("owner") != id)
	Game.threats.append({"pos": Vector3(origin.x, 0, origin.z), "dir": bdir, "length": 22.0, "radius": 0.8, "t": maxf(0.0, tel - t), "kind": "beam", "owner": id, "at": Game.time})
	if mode == "windup" and t >= tel:
		mode = "beam"
	if t >= tel:
		var rel: Vector3 = p.global_position - origin
		rel.y = 0
		var along = rel.dot(bdir)
		var off = (rel - bdir * along).length()
		if along > 0.0 and along < 22.0 and off < 0.8 and p.global_position.y < origin.y + 0.5:
			p.hurt(9.0, origin, "beam")
		if Engine.get_physics_frames() % 3 == 0:
			var hitp = origin + bdir * clampf(along, 2.0, 22.0)
			Fx.sparks(Vector3(hitp.x, 0.3, hitp.z), Fx.GOLD, 3, 5.0)
	if t >= tel + sweep:
		_stop_attack()

func _make_beam() -> Node3D:
	# Cel beam: ink sleeve, red heat, gold-white core. Hard bands, no glow.
	var root = Node3D.new()
	Game.main.add_child(root)
	for layer in [[0.62, Fx.INK, 0.0], [0.46, Color(0.9, 0.22, 0.06), 1.2], [0.2, Color(1.0, 0.93, 0.7), 2.0]]:
		var b = BoxMesh.new()
		b.size = Vector3(layer[0], layer[0], 22.0)
		var mi = MeshInstance3D.new()
		mi.mesh = b
		mi.material_override = Look.toon(null, layer[1], layer[1] if layer[2] > 0.0 else Color(0, 0, 0), layer[2], 0.0)
		mi.position.z = 11.0
		mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		root.add_child(mi)
	return root

func _tele(from: Vector3, dir: Vector3, length: float, width: float, sec: float, kind_name: String) -> void:
	_clear_tele()
	var t = Look.telegraph_line(length, width)
	Game.main.add_child(t)
	var mid = from + dir * length * 0.5
	t.global_position = Vector3(mid.x, 0.07, mid.z)
	t.rotation.y = atan2(dir.x, dir.z)
	_tele_node = t
	Game.threats.append({"pos": Vector3(from.x, 0, from.z), "dir": dir, "length": length, "radius": width * 0.5, "t": sec, "kind": kind_name, "owner": id, "at": Game.time + sec})

func _clear_tele() -> void:
	if _tele_node and is_instance_valid(_tele_node):
		_tele_node.queue_free()
	_tele_node = null
	Game.threats = Game.threats.filter(func(x): return x.get("owner") != id)

func _stop_attack() -> void:
	_clear_tele()
	if beam and is_instance_valid(beam):
		beam.queue_free()
	beam = null
	model.position.z = 0.0
	attack_cd = randf_range(6.0, 8.0)
	_set_mode("rest")

func _update_dome(delta: float) -> void:
	var up = dome_up() and _boss_ok()
	dome.visible = up
	tether.visible = up
	dome_body.collision_layer = 8 if up else 0
	if not up:
		return
	var c: Vector3 = boss.global_position
	c.y = maxf(c.y, 0.0)
	dome.global_position = c
	dome.scale = Vector3.ONE * dome_r * minf(1.0, 0.3 + mode_t * 3.0)
	dome_body.global_position = c
	var h = float(dome.get_instance_shader_parameter("hit"))
	dome.set_instance_shader_parameter("hit", maxf(0.0, h - delta * 6.0))
	var a = global_position + Vector3(0, 1.2 + hover, 0)
	var b = c + Vector3(0, dome_r * 0.6, 0)
	tether.global_position = (a + b) * 0.5
	var span = b - a
	if span.length() > 0.01:
		tether.global_basis = Basis(Quaternion(Vector3.UP, span.normalized())).scaled(Vector3(1, span.length(), 1))

# ------------------------------------------------------------ damage -----

func take_hit(amount: float, at: Vector3, src := "") -> bool:
	if dead or spawn_t > 0.2:
		return false
	if burn_t > 0.0 and shard_cd <= 0.0 and src != "fire":
		shard_cd = 0.35
		Game.main.spawn_pickup("armor", global_position + Vector3(0, 1.4, 0), 1)
	flash_t = 0.1
	Fx.number(at, amount, Color(1.0, 0.92, 0.75) if amount < 30 else Fx.GOLD, amount >= 30)
	_damage(amount, true)
	return true

func _damage(amount: float, _stagger_ok: bool) -> void:
	if dead:
		return
	hp -= amount
	if mode == "shield":
		shield_dmg += amount
	if hp <= 0.0:
		if stagger_t > 0.0:
			die(false)
		else:
			hp = 1.0
			_stagger()
	elif mode == "shield" and shield_dmg >= max_hp * DOME_BREAK and stagger_t <= 0.0:
		_stagger()

func _stagger() -> void:
	if mode == "shield":
		Fx.ink(boss.global_position + Vector3(0, dome_r * 0.5, 0), 2.0, Fx.GOLD)
		Game.announce("DOME BROKEN", "finish the %s" % String(info["name"]).to_lower(), Fx.GOLD, 1.2)
		shield_cd = 9.0
	_stop_attack()
	stagger_t = 4.5
	Fx.sparks(global_position + Vector3(0, 1.6, 0), Fx.GOLD, 14, 6.0)

func finish() -> void:
	Game.main.spawn_pickup("health", global_position + Vector3(0, 1.0, 0), 5)
	die(true)

func rip() -> void:
	Game.main.spawn_pickup("ammo", global_position + Vector3(0, 1.0, 0), 5)
	take_hit(90.0, global_position + Vector3(0, 1.4, 0), "rip")

func punched(amount: float, from: Vector3) -> void:
	var away = global_position - from
	away.y = 0
	velocity = away.normalized() * 8.0 + Vector3(0, 4, 0)
	take_hit(amount, global_position + Vector3(0, 1.2, 0), "blast")

func die(big: bool) -> void:
	if dead:
		return
	_clear_tele()
	if beam and is_instance_valid(beam):
		beam.queue_free()
	if _boss_ok():
		Game.announce("%s DOWN" % String(info["name"]), "the dome is gone", Fx.GOLD, 1.2)
	super.die(true if big else false)
