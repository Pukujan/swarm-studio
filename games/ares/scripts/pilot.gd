extends Node
## The local reflex controller. Jev (or the scripted fallback) picks a tactic;
## this strafes, aims, jumps shockwaves and dashes out of telegraphs in real time.

const TACTICS := ["pressure", "finish", "rip", "burn", "punch", "weakpoint", "evade", "collect"]

var tactic := "pressure"
var target_id := -1
var source := "auto"
var say := ""
var last_cmd := -99.0
var decided := -99.0
var strafe := 1.0
var strafe_t := 0.0
var hop_t := 1.0
var aim_noise := Vector2.ZERO
var stats := {"jev": 0, "auto": 0}

func command(t: String, target := -1, why := "", src := "jev") -> void:
	if not TACTICS.has(t):
		return
	tactic = t
	target_id = target
	source = src
	last_cmd = Game.time
	stats[src] = stats.get(src, 0) + 1
	say = why if why != "" else _say(t)

func _say(t: String) -> String:
	match t:
		"finish": return "finish the staggered foe for health"
		"rip": return "rip a minion for ammo"
		"burn": return "burn the pack for armor"
		"punch": return "power punch the crowd"
		"weakpoint": return "shoot the weak point"
		"evade": return "back off and dodge"
		"collect": return "grab the drops"
	return "pressure the champion"

func _find(id: int):
	for e in Game.live_enemies():
		if e.id == id:
			return e
	var b = Game.boss
	if b and is_instance_valid(b):
		if b.id == id:
			return b
		for w in b.weakpoints:
			if w.id == id and not w.broken:
				return w
	return null

## The same rules Jev is given, used whenever Jev has not answered lately.
func scripted(p) -> void:
	var b = Game.boss
	var stag = _nearest(p, func(e): return e.is_staggered(), 22.0)
	var minion = _nearest(p, func(e): return e is Enemy, 20.0)
	var crowd = _crowd(p, 7.0)
	var t = "pressure"
	var target = -1
	if stag and (p.health < 75.0 or p.global_position.distance_to(stag.global_position) < 9.0):
		t = "finish"
		target = stag.id
	elif p.ammo < 14.0 and p.fuel >= 1.0 and minion:
		t = "rip"
		target = minion.id
	elif p.armor < 12.0 and p.fire_cd <= 0.0 and crowd >= 2:
		t = "burn"
	elif p.punch > 0 and crowd >= 3:
		t = "punch"
	elif p.health < 30.0 and Game.pickups.size() > 0:
		t = "collect"
	elif b and is_instance_valid(b) and not b.dead:
		var live: Array = b.weakpoints.filter(func(w): return not w.broken)
		if live.size() > 0 and fmod(Game.time, 9.0) < 4.5:
			t = "weakpoint"
			target = live[0].id
	if t != tactic or Game.time - decided > 3.0:
		decided = Game.time
		command(t, target, "", "auto")
		last_cmd = Game.time - 2.0

func _nearest(p, pred: Callable, r: float):
	var best = null
	var bd = r
	for e in Game.live_enemies():
		if not pred.call(e):
			continue
		var d: float = p.global_position.distance_to(e.global_position)
		if d < bd:
			bd = d
			best = e
	var b = Game.boss
	if b and is_instance_valid(b) and not b.dead and pred.call(b):
		var d2: float = p.global_position.distance_to(b.global_position)
		if d2 < bd:
			best = b
	return best

func _crowd(p, r: float) -> int:
	var n = 0
	for e in Game.live_enemies():
		if p.global_position.distance_to(e.global_position) < r:
			n += 1
	return n

func drive(p, delta: float) -> void:
	if Game.main == null or Game.main.state != "fight":
		p.in_move = Vector2.ZERO
		p.in_fire = false
		return
	if Game.time - last_cmd > 2.5:
		scripted(p)
	var b = Game.boss
	var target = _find(target_id) if target_id >= 0 else null
	var aim_at = null
	var goal = null
	var keep = 12.0
	match tactic:
		"finish":
			if target == null or not target.is_staggered():
				target = _nearest(p, func(e): return e.is_staggered(), 30.0)
			if target:
				goal = target.global_position
				keep = 0.0
				aim_at = target.global_position + Vector3(0, 1.0, 0)
				if p.global_position.distance_to(target.global_position) < 3.6 + (target.radius if "radius" in target else 0.0):
					p.in_finish = true
		"rip":
			if target == null or not (target is Enemy):
				target = _nearest(p, func(e): return e is Enemy, 30.0)
			if target:
				goal = target.global_position
				keep = 0.0
				aim_at = target.global_position + Vector3(0, 1.0, 0)
				if p.global_position.distance_to(target.global_position) < 3.4:
					p.in_rip = true
		"burn":
			var c = _crowd_center(p)
			if c != Vector3.INF:
				goal = c
				keep = 4.0
				aim_at = c + Vector3(0, 1.0, 0)
				if p.global_position.distance_to(c) < 7.0:
					p.in_burn = true
		"punch":
			var c2 = _crowd_center(p)
			if c2 != Vector3.INF:
				goal = c2
				keep = 2.0
				aim_at = c2 + Vector3(0, 1.0, 0)
				if _crowd(p, 6.5) >= 2:
					p.in_punch = true
		"weakpoint":
			if target and target is Weakpoint:
				aim_at = target.global_position
			elif b and is_instance_valid(b):
				for w in b.weakpoints:
					if not w.broken:
						aim_at = w.global_position
						break
		"collect":
			var best = null
			var bd = 99.0
			for pk in Game.pickups:
				var n: Node3D = pk["node"]
				if is_instance_valid(n):
					var d: float = p.global_position.distance_to(n.global_position)
					if d < bd:
						bd = d
						best = n.global_position
			if best != null:
				goal = best
				keep = 0.0
		"evade":
			keep = 18.0
	if aim_at == null and b and is_instance_valid(b):
		for pt in b.pets:
			if is_instance_valid(pt) and pt.dome_up() and p.global_position.distance_to(pt.dome.global_position) > pt.dome_r:
				aim_at = pt.global_position + Vector3(0, 1.2 + pt.hover, 0)
	if aim_at == null:
		if b and is_instance_valid(b) and not b.dead and b.intangible <= 0.0:
			aim_at = b.global_position + Vector3(0, (2.4 if String(b.data.get("model")) == "eye" else 1.2 * b.scale_f), 0)
		else:
			var e = _nearest(p, func(x): return true, 60.0)
			if e:
				aim_at = e.global_position + Vector3(0, 1.0, 0)
	if goal == null:
		if b and is_instance_valid(b):
			goal = b.global_position
		else:
			goal = Vector3.ZERO
	if p.third:
		var close = _blade_target(p)
		# hit and run: dart in on the boss for a combo, then back out to range
		if tactic == "pressure" and b and is_instance_valid(b) and not b.dead and (fmod(Game.time, 7.0) < 2.6 or b.is_staggered()):
			goal = b.global_position
			keep = float(b.radius) + 1.4
		if close != null and tactic != "evade" and tactic != "collect":
			# taps: 2 frames down, 4 up, so the chain keeps going; launch now and then
			p.in_attack = Engine.get_physics_frames() % 6 < 2
			p.in_move.y = -1.0 if fmod(Game.time, 9.0) < 0.3 else p.in_move.y
		else:
			p.in_attack = false
		if p.ult >= 100.0 and b and is_instance_valid(b) and not b.dead and b.ai:
			p.in_ult = true
	_steer(p, delta, goal, keep)
	_dodge(p)
	_aim(p, delta, aim_at)
	_weapon(p, aim_at)

func _blade_target(p):
	var best = null
	for e in Game.live_enemies():
		if e.global_position.distance_to(p.global_position) < 3.2 + (float(e.radius) if "radius" in e else 0.5):
			best = e
	var b = Game.boss
	if b and is_instance_valid(b) and not b.dead and b.intangible <= 0.0:
		var d = Vector2(b.global_position.x - p.global_position.x, b.global_position.z - p.global_position.z).length()
		if d < 3.0 + b.radius and absf(b.global_position.y - p.global_position.y) < 4.0:
			best = b
	return best

func _crowd_center(p) -> Vector3:
	var sum = Vector3.ZERO
	var n = 0
	for e in Game.live_enemies():
		if e is Enemy and p.global_position.distance_to(e.global_position) < 16.0:
			sum += e.global_position
			n += 1
	return sum / n if n > 0 else Vector3.INF

func _steer(p, delta: float, goal: Vector3, keep: float) -> void:
	strafe_t -= delta
	if strafe_t <= 0.0:
		strafe_t = randf_range(1.2, 2.6)
		strafe = -strafe
	var to: Vector3 = goal - p.global_position
	to.y = 0
	var d = to.length()
	var dir = to / d if d > 0.01 else Vector3.ZERO
	var side = dir.cross(Vector3.UP) * strafe
	var radial = clampf((d - keep) * 0.35, -1.0, 1.0)
	var want = dir * radial + side * (0.9 if keep > 1.0 else 0.25)
	# stay inside the ring and away from the wall
	var flat = Vector3(p.global_position.x, 0, p.global_position.z)
	if flat.length() > 21.0:
		want += -flat.normalized() * 1.2
	# never stand still
	if want.length() < 0.4:
		want += side
	want = want.limit_length(1.0)
	var fwd: Vector3 = p.forward_dir()
	var right = Vector3(cos(p.yaw), 0, -sin(p.yaw))
	p.in_move = Vector2(want.dot(right), want.dot(fwd))
	hop_t -= delta
	p.in_jump = false
	if hop_t <= 0.0:
		hop_t = randf_range(1.4, 3.2)
		p.in_jump = true
	if d > 14.0 and keep < 2.0 and p.dash_charges >= 2.0:
		p.in_dash = true

func _dodge(p) -> void:
	var pos: Vector3 = p.global_position
	# shockwave rings: jump them
	for w in Game.waves:
		var dd = Vector2(pos.x - w["pos"].x, pos.z - w["pos"].z).length()
		var gap: float = dd - float(w["r"])
		if gap > 0.0 and gap < 2.6 and p.is_on_floor():
			p.in_jump = true
	# floor telegraphs and lines: dash out before impact
	for th in Game.threats:
		var t_left: float = th.get("t", 1.0)
		if t_left > 0.55 and th.get("kind") != "beam":
			continue
		var out = Vector3.ZERO
		if th.has("dir"):
			var rel: Vector3 = pos - th["pos"]
			rel.y = 0
			var dir: Vector3 = th["dir"]
			var along = rel.dot(dir)
			var off = rel - dir * along
			if along > -1.0 and along < float(th["length"]) and off.length() < float(th["radius"]) + 1.2:
				out = off.normalized() if off.length() > 0.05 else dir.cross(Vector3.UP)
				if th.get("kind") == "beam":
					out = dir.cross(Vector3.UP) * (1.0 if off.dot(dir.cross(Vector3.UP)) >= 0.0 else -1.0)
		else:
			var rel2: Vector3 = pos - th["pos"]
			rel2.y = 0
			if rel2.length() < float(th["radius"]) + 0.8:
				out = rel2.normalized() if rel2.length() > 0.05 else Vector3(1, 0, 0)
		if out != Vector3.ZERO:
			var fwd: Vector3 = p.forward_dir()
			var right = Vector3(cos(p.yaw), 0, -sin(p.yaw))
			p.in_move = Vector2(out.dot(right), out.dot(fwd)).normalized()
			if p.dash_charges >= 1.0 and t_left < 0.4:
				p.in_dash = true
			elif th.get("kind") == "beam" and p.is_on_floor():
				p.in_jump = true
	# projectiles about to land: sidestep
	for s in Game.projectiles:
		var n: Node3D = s["node"]
		if not is_instance_valid(n):
			continue
		var rel3: Vector3 = pos + Vector3(0, 1, 0) - n.global_position
		var v: Vector3 = s["vel"]
		if rel3.length() < 6.0 and v.dot(rel3) > 0.0 and p.dash_charges >= 1.5:
			var side: Vector3 = v.normalized().cross(Vector3.UP)
			var fwd2: Vector3 = p.forward_dir()
			var right2 = Vector3(cos(p.yaw), 0, -sin(p.yaw))
			p.in_move = Vector2(side.dot(right2), side.dot(fwd2)).normalized()
			p.in_dash = true
			break

func _aim(p, delta: float, at) -> void:
	if at == null:
		p.in_fire = false
		return
	var from: Vector3 = p.cam.global_position
	var to: Vector3 = at - from
	var want_yaw = atan2(-to.x, -to.z)
	var want_pitch = atan2(to.y, Vector2(to.x, to.z).length())
	aim_noise = aim_noise.lerp(Vector2(randf_range(-0.03, 0.03), randf_range(-0.02, 0.02)), delta * 4.0)
	var k = minf(1.0, delta * 9.0)
	p.yaw = lerp_angle(p.yaw, want_yaw + aim_noise.x, k)
	p.pitch = clampf(lerpf(p.pitch, want_pitch + aim_noise.y, k), -1.3, 1.3)
	var err = absf(angle_difference(p.yaw, want_yaw)) + absf(p.pitch - want_pitch)
	p.in_fire = err < 0.12 and tactic != "collect"

func _weapon(p, at) -> void:
	if at == null:
		return
	var d: float = p.global_position.distance_to(at)
	var w = 0
	if d < 8.0 and p.ammo >= 8.0:
		w = 1
	elif tactic == "weakpoint" or (d > 14.0 and p.ammo > 30.0 and fmod(Game.time, 6.0) < 1.6):
		w = 2 if p.ammo >= 8.0 else 0
	if w != p.weapon:
		p.in_weapon = w
