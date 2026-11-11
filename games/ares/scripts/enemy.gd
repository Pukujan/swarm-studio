class_name Enemy
extends CharacterBody3D
## Arena minions: they keep coming, reel and flash GOLD when they can be finished.

const KINDS := {
	"grunt": {"model": "Skeleton_Minion", "hp": 45.0, "speed": 7.0, "dmg": 9.0, "scale": 1.15},
	"shield": {"model": "Skeleton_Warrior", "hp": 80.0, "speed": 5.5, "dmg": 12.0, "scale": 1.3},
	"caster": {"model": "Skeleton_Mage", "hp": 38.0, "speed": 6.0, "dmg": 8.0, "scale": 1.15},
	"checkpoint": {"model": "", "hp": 40.0, "speed": 9.0, "dmg": 7.0, "scale": 1.0},
}

var id := 0
var kind := "grunt"
var hp := 45.0
var max_hp := 45.0
var speed := 7.0
var dmg := 9.0
var radius := 0.5
var dead := false
var stagger_t := 0.0
var burn_t := 0.0
var shard_cd := 0.0
var shield := false
var flying := false
var attack_t := 0.0
var cd := 1.0
var flash_t := 0.0
var spawn_t := 0.6
var orbit := 0.0
var model: Node3D
var anim: AnimationPlayer
var fire_fx: CPUParticles3D
var label: Label3D
var _anim_now := ""

func setup(k: String) -> void:
	kind = k
	var d: Dictionary = KINDS[k]
	hp = d["hp"]
	max_hp = hp
	speed = d["speed"] * randf_range(0.9, 1.15)
	dmg = d["dmg"]
	shield = k == "shield"
	flying = k == "checkpoint"

func _ready() -> void:
	id = Game.new_id()
	add_to_group("enemies")
	collision_layer = 4
	collision_mask = 1
	var cs = CollisionShape3D.new()
	var cap = CapsuleShape3D.new()
	cap.radius = 0.5
	cap.height = 1.9
	cs.shape = cap
	cs.position.y = 0.95
	add_child(cs)
	var d: Dictionary = KINDS[kind]
	if kind == "checkpoint":
		model = Node3D.new()
		var core = Look.mesh(_ico(), Color(1.0, 0.82, 0.35), 2.2, 0.03)
		core.scale = Vector3.ONE * 0.55
		model.add_child(core)
		var halo = Look.cyl(0.75, 0.04, Color(1.0, 0.55, 0.15), 1.6, 0.0)
		halo.rotation.x = PI / 2
		model.add_child(halo)
		model.position.y = 1.0
		label = Label3D.new()
		label.text = "ckpt-%d" % (100 * randi_range(10, 99))
		label.font = Look.body_font()
		label.font_size = 40
		label.outline_size = 10
		label.outline_modulate = Fx.INK
		label.modulate = Color(1.0, 0.85, 0.5)
		label.billboard = BaseMaterial3D.BILLBOARD_ENABLED
		label.pixel_size = 0.006
		label.position.y = 1.0
		model.add_child(label)
		add_child(model)
	else:
		model = Look.model(d["model"])
		model.scale = Vector3.ONE * float(d["scale"])
		model.rotation.y = PI
		add_child(model)
		Look.apply(model, 0.018)
		for n in model.find_children("*", "MeshInstance3D", true, false):
			var nm = String(n.name)
			if nm.contains("Shield") and not (shield and nm.contains("Large_A")):
				n.visible = false
		var aps = model.find_children("*", "AnimationPlayer", true, false)
		if aps.size() > 0:
			anim = aps[0]
			for a in ["Running_A", "Idle", "Walking_D_Skeletons", "Idle_Combat", "Running_B"]:
				if anim.has_animation(a):
					anim.get_animation(a).loop_mode = Animation.LOOP_LINEAR
			_play("Spawn_Ground_Skeletons" if anim.has_animation("Spawn_Ground_Skeletons") else "Idle")
	Look.param(model, "flash", 0.0)
	orbit = randf() * TAU

func _ico() -> Mesh:
	var s = SphereMesh.new()
	s.radius = 1.0
	s.height = 2.0
	s.radial_segments = 6
	s.rings = 3
	return s

func _play(a: String, speed_scale := 1.0) -> void:
	if anim == null or not anim.has_animation(a):
		return
	if _anim_now == a:
		return
	_anim_now = a
	anim.play(a, 0.12, speed_scale)

func is_staggered() -> bool:
	return stagger_t > 0.0 and not dead

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
	if stagger_t > 0.0:
		stagger_t -= delta
		var pulse = 0.45 + 0.4 * sin(Game.time * 18.0)
		Look.flash(model, maxf(pulse, flash_t * 4.0), Fx.GOLD)
		velocity = velocity.move_toward(Vector3.ZERO, 30.0 * delta)
		if not flying:
			velocity.y -= 30.0 * delta
		model.rotation.z = sin(Game.time * 9.0) * 0.12
		move_and_slide()
		if stagger_t <= 0.0:
			hp = max_hp * 0.4
			model.rotation.z = 0.0
		return
	Look.flash(model, flash_t * 5.0)
	if spawn_t > 0.0:
		spawn_t -= delta
		return
	if p == null or not is_instance_valid(p):
		return
	var to: Vector3 = p.global_position - global_position
	to.y = 0
	var dist = to.length()
	var dir = to.normalized() if dist > 0.01 else Vector3.FORWARD
	look_at(global_position + dir, Vector3.UP)
	cd -= delta
	var want = Vector3.ZERO
	if kind == "caster" or kind == "checkpoint":
		var keep = 11.0 if kind == "caster" else 7.0
		orbit += delta * 0.6
		var side = dir.cross(Vector3.UP)
		want = (dir * (dist - keep) * 0.5 + side * 4.0 * sin(orbit)).limit_length(speed)
		if cd <= 0.0 and dist < 26.0:
			cd = randf_range(2.2, 3.2)
			_cast(p)
	else:
		if attack_t > 0.0:
			attack_t -= delta
			if attack_t <= 0.0 and dist < 2.6:
				p.hurt(dmg, global_position)
		elif dist > 1.7:
			want = dir * speed
		elif cd <= 0.0:
			cd = 1.1
			attack_t = 0.42
			_play("1H_Melee_Attack_Chop", 1.4)
	# keep apart from each other
	for o in Game.enemies:
		if o != self and is_instance_valid(o) and not o.dead:
			var away: Vector3 = global_position - o.global_position
			away.y = 0
			var dd = away.length()
			if dd < 1.6 and dd > 0.01:
				want += away / dd * (1.6 - dd) * 6.0
	velocity.x = move_toward(velocity.x, want.x, 50.0 * delta)
	velocity.z = move_toward(velocity.z, want.z, 50.0 * delta)
	if flying:
		velocity.y = (2.6 + sin(Game.time * 2.0 + orbit) * 0.6 - global_position.y) * 3.0
		model.rotation.y += delta * 3.0
	else:
		velocity.y -= 30.0 * delta
	move_and_slide()
	if attack_t <= 0.0 and not flying:
		_play("Running_A" if want.length() > 1.0 else "Idle")

func _cast(p) -> void:
	var from = global_position + Vector3(0, 1.4, 0)
	var aim: Vector3 = (p.global_position + Vector3(0, 1.0, 0) + p.velocity * 0.3) - from
	Game.main.spawn_shot(from, aim.normalized() * 17.0, dmg, "ember" if kind == "caster" else "checkpoint")
	_play("Spellcast_Shoot", 1.3)

func _flames() -> CPUParticles3D:
	var f = CPUParticles3D.new()
	var m = SphereMesh.new()
	m.radius = 0.16
	m.height = 0.32
	m.radial_segments = 6
	m.rings = 3
	m.material = Look.glow(Fx.EMBER)
	f.mesh = m
	f.amount = 24
	f.lifetime = 0.5
	f.emission_shape = CPUParticles3D.EMISSION_SHAPE_SPHERE
	f.emission_sphere_radius = 0.5
	f.direction = Vector3.UP
	f.initial_velocity_min = 1.5
	f.initial_velocity_max = 3.5
	f.gravity = Vector3(0, 4, 0)
	var c = Curve.new()
	c.add_point(Vector2(0, 1))
	c.add_point(Vector2(1, 0))
	f.scale_amount_curve = c
	f.color = Fx.EMBER
	f.position.y = 1.0
	add_child(f)
	return f

func take_hit(amount: float, at: Vector3, src := "") -> bool:
	if dead or spawn_t > 0.3:
		return false
	if shield and src != "blast":
		var to_p: Vector3 = (Game.player.global_position - global_position).normalized()
		var facing = -global_transform.basis.z
		if facing.dot(to_p) > 0.3:
			amount *= 0.2
			Fx.sparks(at, Color(1, 0.9, 0.6), 6, 6.0)
	if burn_t > 0.0 and shard_cd <= 0.0 and src != "fire":
		shard_cd = 0.35
		Game.main.spawn_pickup("armor", global_position + Vector3(0, 1.2, 0), 1)
	flash_t = 0.1
	Fx.number(at, amount, Color(1.0, 0.92, 0.75) if amount < 30 else Fx.GOLD, amount >= 30)
	_damage(amount, true)
	return true

func _damage(amount: float, stagger_ok: bool) -> void:
	if dead:
		return
	hp -= amount
	if hp <= 0.0:
		if stagger_t > 0.0 or not stagger_ok:
			die(false)
		elif stagger_t <= 0.0 and amount < max_hp * 0.6:
			hp = 1.0
			_stagger()
		else:
			die(false)
	elif hp <= max_hp * 0.3 and stagger_t <= 0.0:
		_stagger()

func _stagger() -> void:
	stagger_t = 4.5
	attack_t = 0.0
	_play("Hit_B")
	Fx.sparks(global_position + Vector3(0, 1.4, 0), Fx.GOLD, 12, 6.0)

func finish() -> void:
	Game.main.spawn_pickup("health", global_position + Vector3(0, 1.0, 0), 4)
	die(true)

func rip() -> void:
	Game.main.spawn_pickup("ammo", global_position + Vector3(0, 1.0, 0), 5)
	die(true)

func ignite() -> void:
	burn_t = 4.5

func punched(amount: float, from: Vector3) -> void:
	shield = false
	for n in model.find_children("*Shield*", "MeshInstance3D", true, false):
		n.visible = false
	var away = (global_position - from)
	away.y = 0
	velocity = away.normalized() * 16.0 + Vector3(0, 6, 0)
	take_hit(amount, global_position + Vector3(0, 1, 0), "blast")
	if not dead and stagger_t <= 0.0:
		_stagger()

func die(big: bool) -> void:
	if dead:
		return
	dead = true
	Game.enemies.erase(self)
	var pos = global_position + Vector3(0, 1.0, 0)
	Fx.ink(pos, 1.2 if big else 0.9)
	if not big and randf() < 0.35:
		Game.main.spawn_pickup("health" if randf() < 0.5 else "ammo", pos, 1)
	if Game.main:
		Game.main.on_kill(self)
	queue_free()
