class_name Melee
extends RefCounted
## The blade: a small state machine of moves. Tap to chain (5-hit ground string ending in a
## spin), pause mid-string for a flurry, hold to charge a thrust (2 levels, full charge
## launches), back+attack is a launcher, attacks in the air keep you up (4-hit air string),
## hold in the air for a plunge with a shockwave, dash+attack is a lunge, and a perfect dodge
## turns the next attack into a counter flurry. Dashing cancels any move.
## Moves are data: tune them in MOVES. Swing poses are the right arm's Euler angles.

const CHAIN := 0.35          # window after a move to chain the next
const PAUSE := 0.4           # wait this long mid-string, then attack: flurry
const HOLD := 0.24           # held longer than this = charge (ground) or plunge (air)
const CHARGE1 := 0.45
const CHARGE2 := 1.0

const UP := PI * 0.5
const MOVES := {
	"l1": {"dmg": 16.0, "guard": 9.0, "reach": 2.8, "arc": 120.0, "dur": 0.26, "hit": 0.09, "stop": 0.045, "shake": 0.10, "step": 4.0, "from": Vector3(UP, -1.4, 0), "to": Vector3(UP, 1.2, 0), "tilt": 0.25, "anim": "slash1", "orbs": 1},
	"l2": {"dmg": 16.0, "guard": 9.0, "reach": 2.8, "arc": 120.0, "dur": 0.26, "hit": 0.09, "stop": 0.045, "shake": 0.10, "step": 4.0, "from": Vector3(UP, 1.2, 0), "to": Vector3(UP, -1.4, 0), "tilt": -0.3, "anim": "slash2", "orbs": 1},
	"l3": {"dmg": 20.0, "guard": 11.0, "reach": 3.0, "arc": 90.0, "dur": 0.3, "hit": 0.12, "stop": 0.05, "shake": 0.14, "step": 5.0, "from": Vector3(PI * 0.95, 0, 0), "to": Vector3(PI * 0.3, 0, 0), "tilt": 1.4, "anim": "slash3", "orbs": 1},
	"l4": {"dmg": 20.0, "guard": 12.0, "reach": 3.0, "arc": 130.0, "dur": 0.28, "hit": 0.1, "stop": 0.055, "shake": 0.14, "step": 4.0, "from": Vector3(UP, -1.5, 0.3), "to": Vector3(UP, 1.3, -0.3), "tilt": 0.1, "anim": "slash1", "orbs": 1},
	"l5": {"dmg": 34.0, "guard": 22.0, "reach": 3.6, "arc": 360.0, "dur": 0.42, "hit": 0.2, "stop": 0.11, "shake": 0.35, "step": 2.0, "from": Vector3(UP, -1.4, 0), "to": Vector3(UP, 1.2, 0), "tilt": 0.0, "spin": true, "anim": "slash3", "orbs": 3, "push": 9.0},
	"flurry": {"dmg": 9.0, "guard": 6.0, "reach": 3.0, "arc": 100.0, "dur": 0.6, "hit": 0.06, "hits": 6, "every": 0.08, "stop": 0.03, "shake": 0.06, "step": 1.5, "from": Vector3(UP, -1.2, 0), "to": Vector3(UP, 1.2, 0), "tilt": 0.0, "anim": "slash2", "orbs": 1},
	"thrust": {"dmg": 30.0, "guard": 18.0, "reach": 3.8, "arc": 50.0, "dur": 0.32, "hit": 0.08, "stop": 0.07, "shake": 0.2, "step": 9.0, "from": Vector3(UP * 0.6, 0, 0), "to": Vector3(UP, 0, 0), "tilt": 0.0, "anim": "thrust", "orbs": 2, "stab": true},
	"thrust2": {"dmg": 60.0, "guard": 40.0, "reach": 4.4, "arc": 60.0, "dur": 0.4, "hit": 0.1, "stop": 0.13, "shake": 0.45, "step": 14.0, "from": Vector3(UP * 0.6, 0, 0), "to": Vector3(UP, 0, 0), "tilt": 0.0, "anim": "thrust", "orbs": 4, "stab": true, "launch": 13.0},
	"launcher": {"dmg": 18.0, "guard": 14.0, "reach": 2.8, "arc": 110.0, "dur": 0.34, "hit": 0.1, "stop": 0.07, "shake": 0.2, "step": 2.0, "from": Vector3(PI * 0.15, 0, 0), "to": Vector3(PI * 1.0, 0, 0), "tilt": -1.4, "anim": "slash3", "orbs": 2, "launch": 13.5, "rise": 13.0},
	"a1": {"dmg": 15.0, "guard": 8.0, "reach": 2.8, "arc": 120.0, "dur": 0.24, "hit": 0.08, "stop": 0.045, "shake": 0.1, "step": 2.0, "from": Vector3(UP, -1.3, 0), "to": Vector3(UP, 1.2, 0), "tilt": 0.3, "anim": "slash1", "orbs": 1, "air": true},
	"a2": {"dmg": 15.0, "guard": 8.0, "reach": 2.8, "arc": 120.0, "dur": 0.24, "hit": 0.08, "stop": 0.045, "shake": 0.1, "step": 2.0, "from": Vector3(UP, 1.2, 0), "to": Vector3(UP, -1.3, 0), "tilt": -0.3, "anim": "slash2", "orbs": 1, "air": true},
	"a3": {"dmg": 17.0, "guard": 10.0, "reach": 2.9, "arc": 100.0, "dur": 0.26, "hit": 0.09, "stop": 0.05, "shake": 0.12, "step": 2.0, "from": Vector3(PI * 0.95, 0, 0), "to": Vector3(PI * 0.3, 0, 0), "tilt": 1.4, "anim": "slash3", "orbs": 1, "air": true},
	"a4": {"dmg": 26.0, "guard": 16.0, "reach": 3.2, "arc": 360.0, "dur": 0.34, "hit": 0.14, "stop": 0.09, "shake": 0.25, "step": 1.0, "from": Vector3(UP, -1.4, 0), "to": Vector3(UP, 1.2, 0), "tilt": 0.0, "spin": true, "anim": "slash3", "orbs": 2, "air": true, "spike": true},
	"plunge": {"dmg": 40.0, "guard": 26.0, "reach": 4.5, "arc": 360.0, "dur": 0.9, "hit": 99.0, "stop": 0.12, "shake": 0.6, "step": 0.0, "from": Vector3(PI, 0, 0), "to": Vector3(PI * 0.15, 0, 0), "tilt": 0.0, "anim": "plunge", "orbs": 3},
	"lunge": {"dmg": 26.0, "guard": 14.0, "reach": 3.2, "arc": 80.0, "dur": 0.3, "hit": 0.1, "stop": 0.07, "shake": 0.2, "step": 20.0, "from": Vector3(UP * 0.5, 0.8, 0), "to": Vector3(UP, -1.0, 0), "tilt": 0.0, "anim": "thrust", "orbs": 2},
	"counter": {"dmg": 18.0, "guard": 14.0, "reach": 3.4, "arc": 140.0, "dur": 0.7, "hit": 0.05, "hits": 7, "every": 0.08, "stop": 0.05, "shake": 0.12, "step": 3.0, "from": Vector3(UP, -1.4, 0), "to": Vector3(UP, 1.3, 0), "tilt": 0.0, "anim": "slash1", "orbs": 2},
}
const GROUND := ["l1", "l2", "l3", "l4", "l5"]
const AIR := ["a1", "a2", "a3", "a4"]

var p                       # the Player
var move := ""
var m: Dictionary = {}
var t := 0.0
var hits_done := 0
var ended_at := -9.0
var last_move := ""
var g_i := 0                # next index in the ground string
var a_i := 0                # next index in the air string
var held := 0.0
var pressed := false
var charge_lv := 0
var plunging := false
var hit_ids := {}           # per swing: who has been hit
var dash_at := -9.0
var counter_until := -9.0

func _init(player) -> void:
	p = player

func busy() -> bool:
	return move != ""

func cancel() -> void:
	if move == "plunge":
		return
	move = ""
	p.avatar.swing = -1.0

func on_dash() -> void:
	dash_at = Game.time
	a_i = 0            # an air dash refreshes the air string
	cancel()

## held: the attack button is down this frame.
func update(delta: float, held_now: bool) -> void:
	var on_floor: bool = p.is_on_floor()
	if on_floor:
		a_i = 0
	# input: decide on release (tap) or once the hold is long enough
	if held_now:
		if not pressed:
			pressed = true
			held = 0.0
		held += delta
		if not on_floor and held >= HOLD and move != "plunge" and p.lock <= 0.0:
			_start("plunge")
		elif on_floor and held >= HOLD:
			var lv = 2 if held >= CHARGE2 else (1 if held >= CHARGE1 else 0)
			if lv > charge_lv:
				charge_lv = lv
				Fx.ring(p.global_position + Vector3(0, 1.0, 0), 0.9 + lv * 0.4, Fx.GOLD if lv == 2 else Fx.EMBER, 0.25, 0.2)
				if lv == 2:
					Game.shake(0.15)
	elif pressed:
		pressed = false
		if held < HOLD:
			_tap(on_floor)
		elif on_floor and move != "plunge":
			_start("thrust2" if charge_lv >= 2 else "thrust")
		charge_lv = 0
		held = 0.0
	_run(delta, on_floor)

func charging() -> float:
	return clampf(held / CHARGE2, 0.0, 1.0) if pressed and held >= HOLD and p.is_on_floor() else 0.0

func _tap(on_floor: bool) -> void:
	if move != "" and t < float(m["dur"]) * 0.7:
		return  # still early in a swing; the press is eaten (no buffering mid-swing)
	if Game.time < counter_until:
		counter_until = -9.0
		_start("counter")
		return
	if Game.time - dash_at < 0.3:
		_start("lunge")
		return
	if not on_floor:
		_start(AIR[a_i % AIR.size()])
		a_i += 1
		return
	if p.in_move.y < -0.5:
		_start("launcher")
		g_i = 0
		return
	var gap = Game.time - ended_at
	if move == "" and gap > CHAIN + 0.5:
		g_i = 0
	elif move == "" and gap > PAUSE and gap <= CHAIN + 0.5 and g_i >= 2:
		g_i = 0
		_start("flurry")
		return
	_start(GROUND[g_i % GROUND.size()])
	g_i = (g_i + 1) % GROUND.size()

func _start(name: String) -> void:
	move = name
	m = MOVES[name]
	t = 0.0
	hits_done = 0
	hit_ids = {}
	plunging = name == "plunge"
	p.avatar.start_swing(m["from"], m["to"])
	p.avatar.play(String(m["anim"]))
	p.face_aim()
	var fwd: Vector3 = p.facing()
	if float(m["step"]) > 0.0 and p.lock <= 0.0:
		var keep_y = p.velocity.y
		p.velocity = fwd * float(m["step"]) * (1.0 if p.is_on_floor() else 0.4)
		p.velocity.y = keep_y
	if m.get("air", false):
		p.velocity.y = maxf(p.velocity.y, 3.2)   # air strings keep you aloft
	if m.has("rise"):
		p.velocity.y = float(m["rise"])          # jump after the launched enemy
	if plunging:
		p.velocity = Vector3(0, 6.0, 0)
	if not plunging:
		_trail(0.0)

func _run(delta: float, on_floor: bool) -> void:
	if move == "":
		return
	t += delta
	var dur: float = m["dur"]
	p.avatar.swing = clampf(t / dur, 0.0, 1.0)
	if m.get("spin", false):
		p.avatar.rotation.y = p.body_yaw + TAU * clampf(t / dur, 0.0, 1.0)
	if plunging:
		if t > 0.12:
			p.velocity = Vector3(0, -42.0, 0)
		if on_floor and t > 0.14:
			_hit_all(true)
			_shockwave()
			_end()
		elif t > 2.5:
			_end()
		return
	var n_hits: int = int(m.get("hits", 1))
	var every: float = float(m.get("every", 0.0))
	while hits_done < n_hits and t >= float(m["hit"]) + every * hits_done:
		if hits_done > 0:
			hit_ids = {}
			_trail(float(hits_done))
		_hit_all(hits_done == n_hits - 1)
		hits_done += 1
	if t >= dur:
		_end()

func _end() -> void:
	ended_at = Game.time
	last_move = move
	move = ""
	plunging = false
	p.avatar.swing = -1.0
	p.avatar.rotation.y = p.body_yaw

func _targets() -> Array:
	var out: Array = []
	for e in Game.live_enemies():
		out.append(e)
	var b = Game.boss
	if b and is_instance_valid(b) and not b.dead:
		out.append(b)
	return out

func _hit_all(last: bool) -> void:
	var origin: Vector3 = p.global_position
	var fwd: Vector3 = p.facing()
	var reach: float = float(m["reach"]) * p.blade_reach
	var arc: float = deg_to_rad(float(m["arc"])) * 0.5
	var any := false
	for e in _targets():
		if hit_ids.has(e.get_instance_id()):
			continue
		var r: float = float(e.radius) if "radius" in e else 0.5
		var to: Vector3 = e.global_position - origin
		var dy = to.y
		to.y = 0
		var d = to.length()
		if d > reach + r:
			continue
		if absf(dy) > 3.2 + r and not plunging:
			continue
		if arc < PI and d > 0.6 and fwd.angle_to(to / maxf(d, 0.001)) > arc + atan2(r, maxf(d, 0.1)):
			continue
		hit_ids[e.get_instance_id()] = true
		var at: Vector3 = e.global_position + Vector3(0, 1.1 if not (e is Boss) else 1.6, 0)
		var dmg: float = float(m["dmg"]) * p.blade_mult()
		if e.take_hit(dmg, at, "blade"):
			any = true
			if e is Boss:
				e.guard_hit(float(m["guard"]) * p.guard_mult())
			_knock(e, fwd)
			Game.main.spawn_orbs(at, int(m.get("orbs", 1)), false)
			p.style.add(move)
			Fx.sparks(at, Fx.GOLD, 6, 7.0)
	if any:
		p.combo_hit()
		Game.hit_stop(float(m["stop"]) * (1.6 if last and int(m.get("hits", 1)) > 1 else 1.0) * p.blade_heft())
		Game.shake(float(m["shake"]))

func _knock(e, fwd: Vector3) -> void:
	if e is Boss or e is Pet:
		return
	if not (e is CharacterBody3D):
		return
	if m.has("launch"):
		e.velocity = Vector3(0, float(m["launch"]), 0) + fwd * 1.5
	elif m.has("push"):
		e.velocity = fwd * float(m["push"]) + Vector3(0, 3, 0)
	elif m.get("spike", false):
		e.velocity = fwd * 2.0 + Vector3(0, -14, 0)
	elif not e.is_on_floor():
		e.velocity.y = maxf(e.velocity.y, 4.5)   # juggle: each air hit keeps them up
	else:
		e.velocity += fwd * 2.5

func _shockwave() -> void:
	var c: Vector3 = p.global_position
	var r: float = 4.5 * p.plunge_mult
	for e in _targets():
		var to: Vector3 = e.global_position - c
		to.y = 0
		if to.length() < r + (float(e.radius) if "radius" in e else 0.5) and not hit_ids.has(e.get_instance_id()):
			if e.take_hit(28.0 * p.blade_mult(), e.global_position + Vector3(0, 1, 0), "blast"):
				if e is Boss:
					e.guard_hit(18.0 * p.guard_mult())
				elif e is CharacterBody3D and not e is Pet:
					e.velocity = to.normalized() * 7.0 + Vector3(0, 9, 0)
				Game.main.spawn_orbs(e.global_position + Vector3(0, 1, 0), 1, false)
	Game.main.slash_ring(c, r)
	Fx.dust(c, r)
	Game.shake(0.6)
	Game.hit_stop(0.09)

func _trail(k: float) -> void:
	var fwd: Vector3 = p.facing()
	var yaw = atan2(-fwd.x, -fwd.z)
	var arc: float = deg_to_rad(float(m["arc"])) * 0.5
	var from_left: bool = float(m["from"].y) > float(m["to"].y)
	if int(m.get("hits", 1)) > 1:
		from_left = int(k) % 2 == 1
	var tilt: float = float(m["tilt"]) + (randf_range(-0.5, 0.5) if k > 0.0 else 0.0)
	var reach: float = float(m["reach"]) * p.blade_reach
	if m.get("stab", false):
		Game.main.slash_stab(p.global_position + Vector3(0, 1.15, 0), fwd, reach)
	else:
		Game.main.slash_trail(p.global_position + Vector3(0, 1.1, 0), yaw, tilt, reach, arc if not from_left else -arc, -arc if not from_left else arc)
