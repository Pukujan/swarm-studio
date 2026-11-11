class_name Avatar
extends Node3D
## The heroine you see in third person. Until the rigged Meshy GLBs arrive this is a
## cel-shaded placeholder (1.7 m) built from primitives, with a blade in the right hand
## and a gun in the left. `use_model(path)` swaps in a rigged GLB: clips are played by
## name (CLIPS below) and the props move onto its hand bones; any clip that is missing
## falls back to the procedural lean, bob and swing used by the placeholder.

## state -> clip names to try, first found wins
const CLIPS := {
	"idle": ["idle", "Idle"],
	"run": ["run", "Run", "running", "Running"],
	"jump": ["jump", "Jump"],
	"dash": ["dash", "Dash"],
	"shoot": ["shoot", "Shoot", "shoot_pose"],
	"slash1": ["slash1", "Slash1", "sword_slash_1"],
	"slash2": ["slash2", "Slash2", "sword_slash_2"],
	"slash3": ["slash3", "Slash3", "sword_slash_3"],
	"thrust": ["thrust", "Thrust"],
	"plunge": ["plunge", "Plunge"],
	"hit": ["hit", "Hit"],
	"death": ["death", "Death"],
}

const HEROES := {
	"messenger": {"name": "BAKER", "dress": Color(0.95, 0.9, 0.8), "cape": Color(0.72, 0.1, 0.06), "hair": Color(0.3, 0.16, 0.08), "laurel": true, "ponytail": false, "model": "res://assets/heroes/messenger.glb"},
	"runner": {"name": "THE RUNNER", "dress": Color(0.32, 0.18, 0.1), "cape": Color(0.58, 0.12, 0.06), "hair": Color(0.62, 0.24, 0.08), "laurel": false, "ponytail": true, "model": "res://assets/heroes/runner.glb"},
}

const SKIN := Color(0.98, 0.8, 0.66)
const GOLD := Color(1.0, 0.74, 0.28)
const BRONZE := Color(0.62, 0.34, 0.14)

var hero := "messenger"
var body: Node3D        # everything that leans
var arm_r: Node3D       # shoulder pivots
var arm_l: Node3D
var hand_r: Node3D
var hand_l: Node3D
var blade: Node3D
var gun: Node3D
var cape: Node3D
var hair_tail: Node3D
var muzzle: Node3D
var model: Node3D       # a rigged GLB, when present
var anim: AnimationPlayer
var _clip := ""
var lean := Vector2.ZERO
var bob_t := 0.0
var swing := 0.0        # 0..1 progress of the current blade swing, -1 when idle
var swing_from := Vector3.ZERO
var swing_to := Vector3.ZERO
var blade_scale := 1.0
var gun_out := 0.0      # 0 = gun lowered, 1 = gun aimed

func build(h: String) -> void:
	hero = h if HEROES.has(h) else "messenger"
	var d: Dictionary = HEROES[hero]
	body = Node3D.new()
	add_child(body)
	var ow := 0.012
	# legs, dress, torso, head
	for s in [-1, 1]:
		var leg = Look.cyl(0.065, 0.62, SKIN, 0.0, ow)
		leg.position = Vector3(0.09 * s, 0.33, 0)
		body.add_child(leg)
		var sandal = Look.box(Vector3(0.11, 0.06, 0.22), BRONZE, 0.0, ow)
		sandal.position = Vector3(0.09 * s, 0.03, -0.03)
		body.add_child(sandal)
		var wing = Look.box(Vector3(0.02, 0.1, 0.16), GOLD, 0.6, ow)
		wing.position = Vector3(0.16 * s, 0.1, 0.06)
		wing.rotation = Vector3(0.5, 0, 0.4 * s)
		body.add_child(wing)
	var dress = Look.cyl(0.36, 0.62, d["dress"], 0.0, ow, 0.17, 12)
	dress.position.y = 0.78
	body.add_child(dress)
	var torso = Look.cyl(0.17, 0.42, d["dress"], 0.0, ow, 0.19, 12)
	torso.position.y = 1.28
	body.add_child(torso)
	var belt = Look.cyl(0.175, 0.06, GOLD, 0.3, ow, -1.0, 12)
	belt.position.y = 1.1
	body.add_child(belt)
	var neck = Look.cyl(0.05, 0.1, SKIN, 0.0, ow)
	neck.position.y = 1.52
	body.add_child(neck)
	var head = Look.ball(0.12, SKIN, 0.0, ow)
	head.position.y = 1.6
	body.add_child(head)
	var hair = Look.ball(0.135, d["hair"], 0.0, ow)
	hair.position = Vector3(0, 1.63, 0.025)
	hair.scale = Vector3(1.0, 0.95, 1.0)
	body.add_child(hair)
	if d["laurel"]:
		var tor = TorusMesh.new()
		tor.inner_radius = 0.12
		tor.outer_radius = 0.15
		var laurel = Look.mesh(tor, GOLD, 0.8, ow)
		laurel.position.y = 1.66
		laurel.rotation.x = 0.15
		body.add_child(laurel)
	if d["ponytail"]:
		hair_tail = Node3D.new()
		hair_tail.position = Vector3(0, 1.68, 0.13)
		body.add_child(hair_tail)
		var tail = Look.cyl(0.05, 0.42, d["hair"], 0.0, ow, 0.02, 8)
		tail.position.y = -0.2
		hair_tail.add_child(tail)
	# cape from the shoulders
	cape = Node3D.new()
	cape.position = Vector3(0, 1.46, 0.14)
	body.add_child(cape)
	var cl = Look.box(Vector3(0.46, 0.95, 0.03), d["cape"], 0.0, ow)
	cl.position.y = -0.47
	cape.add_child(cl)
	# arms
	arm_r = _arm(1, d)
	arm_l = _arm(-1, d)
	hand_r = arm_r.get_child(1)
	hand_l = arm_l.get_child(1)
	blade = _blade()
	hand_r.add_child(blade)
	gun = _gun()
	hand_l.add_child(gun)
	muzzle = Node3D.new()
	muzzle.position = Vector3(0, 0.03, -0.42)
	gun.add_child(muzzle)
	_try_model(String(d["model"]))

func _arm(side: int, d: Dictionary) -> Node3D:
	var pivot = Node3D.new()
	pivot.position = Vector3(0.24 * side, 1.44, 0)
	body.add_child(pivot)
	var a = Look.cyl(0.05, 0.5, d["dress"] if side < 0 else SKIN, 0.0, 0.012)
	a.position.y = -0.25
	pivot.add_child(a)
	var hand = Node3D.new()
	hand.position.y = -0.52
	pivot.add_child(hand)
	var fist = Look.ball(0.055, SKIN, 0.0, 0.012)
	hand.add_child(fist)
	return pivot

func _blade() -> Node3D:
	var b = Node3D.new()
	# held pointing along the forearm's forward (-Z of the hand when the arm is raised)
	var hilt = Look.cyl(0.03, 0.2, Color(0.16, 0.07, 0.05), 0.0, 0.01)
	hilt.rotation.x = PI / 2
	b.add_child(hilt)
	var guard = Look.box(Vector3(0.26, 0.04, 0.06), GOLD, 0.6, 0.01)
	guard.position.z = -0.1
	b.add_child(guard)
	var edge = Look.box(Vector3(0.09, 0.025, 1.05), Color(1.0, 0.93, 0.78), 0.9, 0.012)
	edge.position.z = -0.63
	b.add_child(edge)
	var core = Look.box(Vector3(0.035, 0.03, 0.95), Color(0.85, 0.2, 0.06), 1.4, 0.0)
	core.position.z = -0.6
	b.add_child(core)
	b.rotation.x = -PI / 2
	return b

func _gun() -> Node3D:
	var g = Node3D.new()
	var body_m = Look.box(Vector3(0.08, 0.1, 0.32), BRONZE, 0.0, 0.01)
	g.add_child(body_m)
	var barrel = Look.cyl(0.025, 0.24, GOLD, 0.6, 0.008)
	barrel.rotation.x = PI / 2
	barrel.position = Vector3(0, 0.02, -0.26)
	g.add_child(barrel)
	g.rotation.x = -PI / 2
	return g

## A rigged GLB replaces the primitives when it exists in the project.
func _try_model(path: String) -> void:
	if not ResourceLoader.exists(path):
		return
	var s = load(path) as PackedScene
	if s == null:
		return
	use_model(s.instantiate())

func use_model(m: Node3D) -> void:
	model = m
	for c in body.get_children():
		if c != arm_r and c != arm_l:
			c.visible = false
	for c in arm_r.get_children() + arm_l.get_children():
		if c != hand_r and c != hand_l:
			c.visible = false
	for c in hand_r.get_children() + hand_l.get_children():
		if c != blade and c != gun:
			c.visible = false
	body.add_child(m)
	Look.apply(m, 0.012)
	var aps = m.find_children("*", "AnimationPlayer", true, false)
	if aps.size() > 0:
		anim = aps[0]
	var sk = m.find_children("*", "Skeleton3D", true, false)
	if sk.size() > 0:
		var skel: Skeleton3D = sk[0]
		for pair in [[blade, ["RightHand", "mixamorig:RightHand", "hand_r", "Hand_R", "right_hand"]], [gun, ["LeftHand", "mixamorig:LeftHand", "hand_l", "Hand_L", "left_hand"]]]:
			for bn in pair[1]:
				var bi = skel.find_bone(bn)
				if bi >= 0:
					var att = BoneAttachment3D.new()
					att.bone_name = bn
					skel.add_child(att)
					pair[0].reparent(att, false)
					break

func has_clip(state: String) -> bool:
	return _find_clip(state) != ""

func _find_clip(state: String) -> String:
	if anim == null:
		return ""
	for n in CLIPS.get(state, []):
		if anim.has_animation(n):
			return n
	return ""

func play(state: String, speed := 1.0) -> void:
	var n = _find_clip(state)
	if n == "" or n == _clip:
		return
	_clip = n
	anim.play(n, 0.1, speed)

## Start a procedural swing: the right arm sweeps from one pose to another (Euler, rad).
func start_swing(from: Vector3, to: Vector3) -> void:
	swing = 0.0
	swing_from = from
	swing_to = to

## Called every frame by the player with its motion, so the body leans into runs and dashes.
func pose(delta: float, vel: Vector3, on_floor: bool, dashing: bool, aiming: bool, swing_t: float) -> void:
	var local_v = global_transform.basis.inverse() * Vector3(vel.x, 0, vel.z)
	var hs = Vector2(vel.x, vel.z).length()
	var want = Vector2(clampf(-local_v.z / 14.0, -1, 1) * 0.22, clampf(local_v.x / 14.0, -1, 1) * -0.18)
	if dashing:
		want *= 2.2
	lean = lean.lerp(want, minf(1.0, delta * 10.0))
	body.rotation = Vector3(-lean.x, 0, lean.y)
	if on_floor and hs > 1.0:
		bob_t += delta * hs * 0.9
	body.position.y = absf(sin(bob_t)) * 0.05 if on_floor else 0.0
	cape.rotation.x = clampf(0.15 + hs * 0.05 + (0.0 if on_floor else 0.3), 0.0, 1.3)
	if hair_tail:
		hair_tail.rotation.x = clampf(0.2 + hs * 0.04, 0.0, 1.0)
	gun_out = move_toward(gun_out, 1.0 if aiming else 0.0, delta * 8.0)
	# arms: run swing, gun raise, blade swing
	var run = sin(bob_t) * minf(1.0, hs / 10.0) * 0.6 if on_floor else -0.6
	arm_l.rotation = Vector3(lerpf(run, PI / 2, gun_out), 0, lerpf(-0.15, 0.0, gun_out))
	if swing_t >= 0.0:
		var k = ease(clampf(swing_t, 0.0, 1.0), 0.35)
		arm_r.rotation = swing_from.lerp(swing_to, k)
	else:
		arm_r.rotation = Vector3(-run + 0.25, 0, 0.25)
	blade.scale = Vector3.ONE * blade_scale
	if anim:
		if swing_t >= 0.0:
			pass
		elif dashing:
			play("dash")
		elif not on_floor:
			play("jump")
		elif aiming:
			play("shoot")
		elif hs > 1.5:
			play("run", clampf(hs / 10.0, 0.6, 1.6))
		else:
			play("idle")
