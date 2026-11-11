extends Node
## Juice: ink splashes, sparks, damage numbers, tracers, muzzle flashes, rings.

const INK := Color(0.09, 0.03, 0.025)
const GOLD := Color(1.0, 0.76, 0.22)
const EMBER := Color(1.0, 0.42, 0.1)

func _root() -> Node:
	return get_tree().current_scene

func _burst(pos: Vector3, color: Color, amount: int, speed: float, size: float, life: float, gravity := -18.0, spread := 180.0, dir := Vector3.UP) -> CPUParticles3D:
	var p = CPUParticles3D.new()
	var m = SphereMesh.new()
	m.radius = size
	m.height = size * 2.0
	m.radial_segments = 6
	m.rings = 3
	m.material = Look.glow(color)
	p.mesh = m
	p.amount = amount
	p.one_shot = true
	p.explosiveness = 0.95
	p.lifetime = life
	p.direction = dir
	p.spread = spread
	p.initial_velocity_min = speed * 0.4
	p.initial_velocity_max = speed
	p.gravity = Vector3(0, gravity, 0)
	p.scale_amount_min = 0.5
	p.scale_amount_max = 1.4
	var curve = Curve.new()
	curve.add_point(Vector2(0, 1))
	curve.add_point(Vector2(1, 0))
	p.scale_amount_curve = curve
	p.color = color
	_root().add_child(p)
	p.global_position = pos
	p.emitting = true
	get_tree().create_timer(life + 0.2, false).timeout.connect(p.queue_free)
	return p

## Kills burst into stylized ink (never gore): a dark splash with a gold rim and a floor blot.
func ink(pos: Vector3, scale := 1.0, rim := GOLD) -> void:
	_burst(pos, INK, int(26 * scale), 11.0 * scale, 0.16 * scale, 0.9)
	_burst(pos, rim, int(14 * scale), 9.0 * scale, 0.09 * scale, 0.6)
	_burst(pos, Color(0.55, 0.06, 0.04), int(10 * scale), 7.0 * scale, 0.12 * scale, 0.8)
	var blot = Look.cyl(0.9 * scale, 0.02, INK, 0.0, 0.0)
	blot.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	_root().add_child(blot)
	blot.global_position = Vector3(pos.x, 0.03, pos.z)
	blot.rotation.y = randf() * TAU
	blot.scale = Vector3(0.3, 1, 0.3)
	var t = blot.create_tween()
	t.tween_property(blot, "scale", Vector3(1.0 + randf() * 0.4, 1, 0.8 + randf() * 0.4), 0.18)
	t.tween_interval(5.0)
	t.tween_property(blot, "scale", Vector3(0.01, 1, 0.01), 1.5)
	t.tween_callback(blot.queue_free)

func sparks(pos: Vector3, color := GOLD, amount := 10, speed := 9.0) -> void:
	_burst(pos, color, amount, speed, 0.05, 0.35, -12.0)

func fire(pos: Vector3, amount := 18, dir := Vector3.UP, spread := 30.0, speed := 7.0) -> void:
	_burst(pos, EMBER, amount, speed, 0.18, 0.55, 4.0, spread, dir)
	_burst(pos, GOLD, amount / 2, speed * 0.8, 0.1, 0.4, 6.0, spread, dir)

func feathers(pos: Vector3, color: Color) -> void:
	var p = _burst(pos, color, 10, 3.0, 0.07, 0.8, -2.0)
	p.damping_min = 3.0
	p.damping_max = 5.0

func number(pos: Vector3, amount: float, color := Color(1.0, 0.9, 0.7), big := false) -> void:
	var l = Label3D.new()
	l.text = str(int(round(amount)))
	l.font = Look.slam_font()
	l.font_size = 96 if big else 64
	l.outline_size = 18
	l.outline_modulate = INK
	l.modulate = color
	l.billboard = BaseMaterial3D.BILLBOARD_ENABLED
	l.no_depth_test = true
	l.pixel_size = 0.006
	l.render_priority = 10
	_root().add_child(l)
	l.global_position = pos + Vector3(randf_range(-0.4, 0.4), 0.3, randf_range(-0.4, 0.4))
	var t = l.create_tween().set_parallel(true)
	t.tween_property(l, "global_position", l.global_position + Vector3(0, 1.4, 0), 0.7).set_ease(Tween.EASE_OUT).set_trans(Tween.TRANS_CUBIC)
	t.tween_property(l, "modulate:a", 0.0, 0.35).set_delay(0.4)
	t.chain().tween_callback(l.queue_free)

func word(pos: Vector3, text: String, color := GOLD, size := 80, life := 1.0) -> Label3D:
	var l = Label3D.new()
	l.text = text
	l.font = Look.slam_font()
	l.font_size = size
	l.outline_size = 20
	l.outline_modulate = INK
	l.modulate = color
	l.billboard = BaseMaterial3D.BILLBOARD_ENABLED
	l.no_depth_test = true
	l.pixel_size = 0.008
	_root().add_child(l)
	l.global_position = pos
	l.scale = Vector3.ONE * 1.8
	var t = l.create_tween()
	t.tween_property(l, "scale", Vector3.ONE, 0.12).set_trans(Tween.TRANS_BACK)
	t.tween_interval(life)
	t.tween_property(l, "modulate:a", 0.0, 0.25)
	t.tween_callback(l.queue_free)
	return l

func tracer(from: Vector3, to: Vector3, color: Color, width := 0.05, life := 0.08) -> void:
	var len = from.distance_to(to)
	if len < 0.1:
		return
	var mi = MeshInstance3D.new()
	var b = BoxMesh.new()
	b.size = Vector3(width, width, len)
	b.material = Look.glow(color)
	mi.mesh = b
	mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	_root().add_child(mi)
	mi.global_position = (from + to) * 0.5
	mi.look_at(to, Vector3.UP if absf((to - from).normalized().y) < 0.99 else Vector3.RIGHT)
	var t = mi.create_tween()
	t.tween_property(mi, "scale", Vector3(0.1, 0.1, 1.0), life)
	t.tween_callback(mi.queue_free)

func light(pos: Vector3, color: Color, energy := 4.0, range_ := 6.0, life := 0.08) -> void:
	if Game.lite:
		return
	var l = OmniLight3D.new()
	l.light_color = color
	l.light_energy = energy
	l.omni_range = range_
	_root().add_child(l)
	l.global_position = pos
	var t = l.create_tween()
	t.tween_property(l, "light_energy", 0.0, life)
	t.tween_callback(l.queue_free)

## A flat expanding ring (shockwaves, punch blasts, boss phase changes).
func ring(pos: Vector3, radius: float, color := GOLD, life := 0.4, height := 0.25) -> void:
	var t = TorusMesh.new()
	t.inner_radius = 0.85
	t.outer_radius = 1.0
	t.rings = 48
	t.ring_segments = 8
	t.material = Look.glow(color)
	var mi = MeshInstance3D.new()
	mi.mesh = t
	mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	_root().add_child(mi)
	mi.global_position = pos
	mi.scale = Vector3(0.2, height * 4.0, 0.2)
	var tw = mi.create_tween().set_parallel(true)
	tw.tween_property(mi, "scale", Vector3(radius, height, radius), life).set_ease(Tween.EASE_OUT).set_trans(Tween.TRANS_CUBIC)
	tw.chain().tween_callback(mi.queue_free)

func dust(pos: Vector3, radius := 3.0) -> void:
	_burst(pos + Vector3(0, 0.2, 0), Color(0.45, 0.22, 0.12), 24, radius * 3.0, 0.25, 0.7, -4.0, 80.0)
	ring(pos + Vector3(0, 0.1, 0), radius, Color(1.0, 0.6, 0.25), 0.35)
