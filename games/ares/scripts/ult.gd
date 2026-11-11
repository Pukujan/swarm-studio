extends Node
## Winged Verdict, the heroine's ultimate. Time nearly stops, a comic-panel cut-in slides
## her portrait across red and black speed lines, then she flies at the target and lands an
## aerial storm of slashes while the camera orbits, ending on a freeze frame and an ink burst.
## Each heroine reads her portrait from PORTRAITS (placeholder art until the splash arrives).

const PORTRAITS := {
	"messenger": "res://assets/art/hero-card.webp",
	"runner": "res://assets/art/hero-card.webp",
}
const SLASHES := 9
const DMG := 42.0

var p
var target = null

func _ready() -> void:
	process_mode = Node.PROCESS_MODE_ALWAYS

func _wait(sec: float) -> void:
	await get_tree().create_timer(sec, true, false, true).timeout

func run(player) -> void:
	p = player
	target = _pick()
	var hud = Game.main.hud
	p.invuln = maxf(p.invuln, 6.0)
	p.melee.cancel()
	# 1. dim, near-freeze
	Engine.time_scale = 0.05
	hud.hide_hud = true
	var tex: Texture2D = load(PORTRAITS.get(p.hero, PORTRAITS["messenger"]))
	hud.cutin(tex, "WINGED VERDICT", p.avatar.HEROES[p.hero]["name"], 0.85)
	await _wait(0.85)
	# 2. into the air at the target, the camera swings round
	Engine.time_scale = 0.6
	var c: Vector3 = target.global_position if target else p.global_position + p.facing() * 4.0
	var r: float = (float(target.radius) if target and "radius" in target else 0.6) + 1.6
	var hy = 2.2 if not (target is Boss) else 1.2 * target.scale_f * 0.6
	p.cinematic(2.0, 1.6)
	for i in SLASHES:
		if not is_instance_valid(p) or p.dead:
			break
		var ang = TAU * float(i) / SLASHES * 1.37
		var at = c + Vector3(sin(ang) * r, hy + sin(i * 1.7) * 0.6, cos(ang) * r)
		p.global_position = at - Vector3(0, 1.0, 0)
		p.velocity = Vector3.ZERO
		var to = c - at
		p.body_yaw = atan2(-to.x, -to.z)
		p.avatar.rotation.y = p.body_yaw
		p.avatar.start_swing(Vector3(PI * 0.5, -1.4 if i % 2 == 0 else 1.2, 0), Vector3(PI * 0.5, 1.2 if i % 2 == 0 else -1.4, 0))
		p.avatar.swing = 0.0
		p.cine_yaw = 1.6 + i * 0.35
		Game.main.slash_trail(c + Vector3(0, hy, 0), randf() * TAU, randf_range(-1.2, 1.2), r + 1.4, -1.3, 1.3)
		_hit(c, r + 2.0, DMG, 10.0)
		Game.shake(0.25)
		await _wait(0.07)
		p.avatar.swing = 0.6
		await _wait(0.03)
	# 3. the verdict: one last cross slash, freeze frame, ink burst
	if is_instance_valid(p) and not p.dead:
		Game.main.slash_trail(c + Vector3(0, hy, 0), 0.0, 0.8, r + 3.0, -1.5, 1.5)
		Game.main.slash_trail(c + Vector3(0, hy, 0), PI * 0.5, -0.8, r + 3.0, 1.5, -1.5)
		_hit(c, r + 3.0, DMG * 3.0, 40.0)
		Engine.time_scale = 0.02
		Fx.ink(c + Vector3(0, hy, 0), 3.4, Fx.GOLD)
		Game.shake(1.0)
		await _wait(0.35)
		p.global_position = Vector3(c.x, 0.2, c.z) + (p.global_position - c).normalized() * Vector3(1, 0, 1) * (r + 2.0)
	Game.reset_time()
	hud.hide_hud = false
	if is_instance_valid(p):
		p.invuln = 0.6
	queue_free()

func _pick():
	var b = Game.boss
	if b and is_instance_valid(b) and not b.dead:
		return b
	var best = null
	var bd = 40.0
	for e in Game.live_enemies():
		var d = e.global_position.distance_to(p.global_position)
		if d < bd:
			bd = d
			best = e
	return best

func _hit(c: Vector3, r: float, dmg: float, guard: float) -> void:
	var list: Array = Game.live_enemies()
	if Game.boss and is_instance_valid(Game.boss) and not Game.boss.dead:
		list.append(Game.boss)
	for e in list:
		var to: Vector3 = e.global_position - c
		to.y = 0
		if to.length() < r + (float(e.radius) if "radius" in e else 0.5):
			if e.take_hit(dmg * p.blade_mult(), e.global_position + Vector3(0, 1.6, 0), "blade"):
				if e is Boss:
					e.guard_hit(guard)
				elif e is CharacterBody3D and not e is Pet:
					e.velocity = to.normalized() * 4.0 + Vector3(0, 8, 0)
