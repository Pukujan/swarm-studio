class_name Stage
extends Node3D
## The look of the arena around the fight. Each stage has one identity: a painted backdrop
## cut from the ARES site art, a fire colour and a ruin silhouette. Everything here is
## visual only; floor, wall and platform collisions stay in main.gd, so every stage plays
## the same. Static pieces are MultiMeshes so the web build draws them in a few calls.

const R := 30.0
const SEGMENTS := 28
const INK := Color(0.06, 0.02, 0.015)
const STONE := Color(0.13, 0.085, 0.07)
const BRONZE := Color(0.62, 0.34, 0.14)
const GOLD := Color(1.0, 0.72, 0.26)

const THEMES := {
	"ember": {"paint": "ember", "fire": Color(1.0, 0.42, 0.08), "core": Color(1.0, 0.8, 0.32),
		"sky": Color(0.26, 0.07, 0.03), "haze": Color(0.62, 0.2, 0.06), "fog": Color(0.42, 0.14, 0.05),
		"sand": Color(0.44, 0.28, 0.18), "ruin": "arches", "heat": 0.8},
	"crimson": {"paint": "crimson", "fire": Color(1.0, 0.14, 0.05), "core": Color(1.0, 0.55, 0.22),
		"sky": Color(0.2, 0.03, 0.025), "haze": Color(0.5, 0.06, 0.03), "fog": Color(0.38, 0.05, 0.03),
		"sand": Color(0.4, 0.22, 0.16), "ruin": "tiers", "heat": 1.0},
	"gold": {"paint": "gold", "fire": Color(1.0, 0.68, 0.18), "core": Color(1.0, 0.95, 0.6),
		"sky": Color(0.32, 0.13, 0.04), "haze": Color(0.72, 0.4, 0.12), "fog": Color(0.5, 0.27, 0.1),
		"sand": Color(0.5, 0.35, 0.21), "ruin": "pylons", "heat": 0.6},
	"snow": {"paint": "snow", "fire": Color(1.0, 0.6, 0.25), "core": Color(1.0, 0.92, 0.7),
		"sky": Color(0.36, 0.24, 0.22), "haze": Color(0.78, 0.6, 0.52), "fog": Color(0.62, 0.5, 0.46),
		"sand": Color(0.62, 0.56, 0.52), "ruin": "arches", "heat": 0.2},
	"ruin": {"paint": "ruin", "fire": Color(1.0, 0.5, 0.26), "core": Color(1.0, 0.86, 0.62),
		"sky": Color(0.17, 0.06, 0.05), "haze": Color(0.38, 0.16, 0.1), "fog": Color(0.3, 0.13, 0.09),
		"sand": Color(0.38, 0.28, 0.22), "ruin": "broken", "heat": 0.5, "ash": true},
	"inferno": {"paint": "inferno", "fire": Color(1.0, 0.3, 0.04), "core": Color(1.0, 0.93, 0.55),
		"sky": Color(0.14, 0.03, 0.02), "haze": Color(0.6, 0.14, 0.03), "fog": Color(0.46, 0.1, 0.03),
		"sand": Color(0.32, 0.18, 0.12), "ruin": "colossi", "heat": 1.8},
}

var theme := {}
var theme_name := ""
var env: Environment
var sky_mat: ShaderMaterial
var floor_mat: ShaderMaterial
var lava_mat: ShaderMaterial
var _root: Node3D
var _rng := RandomNumberGenerator.new()

func setup(environment: Environment, sky_material: ShaderMaterial, floor_material: ShaderMaterial, lava_material: ShaderMaterial) -> void:
	env = environment
	sky_mat = sky_material
	floor_mat = floor_material
	lava_mat = lava_material

func apply(name_: String) -> void:
	if not THEMES.has(name_):
		name_ = "ember"
	if name_ == theme_name:
		return
	theme_name = name_
	theme = THEMES[name_]
	if _root:
		_root.queue_free()
	_root = Node3D.new()
	add_child(_root)
	Look.scenery = true
	_rng.seed = hash(name_)
	_air()
	_backdrop()
	_wall()
	# the painting carries the upper tiers; the 3D silhouette below it is the stage's own
	match String(theme["ruin"]):
		"tiers":
			_banners()
		"pylons":
			_pylons()
		"broken":
			_rubble()
	if theme["ruin"] == "colossi":
		_obelisks()
	_rim_fire(520 if theme["ruin"] != "broken" else 200)
	_embers()
	Look.scenery = false

# ------------------------------------------------------------- air -------

func _air() -> void:
	var fire: Color = theme["fire"]
	sky_mat.set_shader_parameter("top", Color(0.03, 0.01, 0.008))
	sky_mat.set_shader_parameter("mid", theme["sky"])
	sky_mat.set_shader_parameter("horizon", fire.lerp(theme["haze"], 0.4))
	env.fog_light_color = (theme["fog"] as Color).darkened(0.35)
	env.ambient_light_color = Color(0.55, 0.42, 0.36).lerp(fire, 0.12)
	floor_mat.set_shader_parameter("sand", theme["sand"])
	floor_mat.set_shader_parameter("heat", fire)
	floor_mat.set_shader_parameter("heat_amount", float(theme["heat"]) * 1.4)
	lava_mat.set_shader_parameter("base_color", fire)
	lava_mat.set_shader_parameter("emit_color", fire)

# -------------------------------------------------------- backdrop -------

func _backdrop() -> void:
	var m = ShaderMaterial.new()
	m.shader = preload("res://shaders/backdrop.gdshader")
	m.set_shader_parameter("paint", load("res://assets/backdrops/%s.jpg" % theme["paint"]))
	m.set_shader_parameter("sky_color", Color(0.05, 0.016, 0.012))
	m.set_shader_parameter("haze_color", theme["haze"])
	m.set_shader_parameter("repeats", 3.0)
	var c = CylinderMesh.new()
	c.top_radius = 70.0
	c.bottom_radius = 70.0
	c.height = 40.0
	c.cap_top = false
	c.cap_bottom = false
	c.radial_segments = 64
	c.rings = 1
	var mi = MeshInstance3D.new()
	mi.mesh = c
	mi.material_override = m
	mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	mi.position.y = 34.0
	mi.extra_cull_margin = 400.0
	_root.add_child(mi)

# ----------------------------------------------------------- walls -------

func _seg(k: int, radius: float, lateral: float, y: float, yaw_extra := 0.0) -> Transform3D:
	var a = k * TAU / SEGMENTS
	var dir = Vector3(sin(a), 0, cos(a))
	var side = Vector3(cos(a), 0, -sin(a))
	return Transform3D(Basis(Vector3.UP, a + yaw_extra), dir * radius + side * lateral + Vector3(0, y, 0))

func _box(size: Vector3) -> BoxMesh:
	var b = BoxMesh.new()
	b.size = size
	return b

## A batch of identical pieces in one draw call, cel-shaded with no hull outline (the
## screen-space ink pass outlines the arena).
func _mm(shape: Mesh, color: Color, xforms: Array, emit := 0.0, emit_color := Color.BLACK) -> MultiMeshInstance3D:
	var mm = MultiMesh.new()
	mm.transform_format = MultiMesh.TRANSFORM_3D
	mm.mesh = shape
	mm.instance_count = xforms.size()
	for i in xforms.size():
		mm.set_instance_transform(i, xforms[i])
	var mmi = MultiMeshInstance3D.new()
	mmi.multimesh = mm
	mmi.material_override = Look.toon(null, color, emit_color if emit > 0.0 else Color(0, 0, 0), emit, 0.0)
	_root.add_child(mmi)
	return mmi

func _wall() -> void:
	var piers: Array = []
	var lintels: Array = []
	var trims: Array = []
	var heat: Array = []
	var base: Array = []
	var broken = theme["ruin"] == "broken"
	for k in SEGMENTS:
		var h = 9.0
		if broken:
			h = _rng.randf_range(5.0, 9.0)
		for side in [-3.0, 3.0]:
			var t = _seg(k, R + 1.0, side, h * 0.5)
			piers.append(t.scaled_local(Vector3(1.0, h / 9.0, 1.0)))
		if not broken or _rng.randf() > 0.4:
			lintels.append(_seg(k, R + 1.0, 0.0, 8.4))
			trims.append(_seg(k, R + 0.15, 0.0, 9.2))
		heat.append(_seg(k, R + 2.2, 0.0, 3.6))
		base.append(_seg(k, R - 0.3, 0.0, 0.18))
	_mm(_box(Vector3(1.6, 9.0, 2.2)), STONE, piers)
	_mm(_box(Vector3(7.6, 1.4, 2.2)), STONE.lightened(0.04), lintels)
	_mm(_box(Vector3(7.6, 0.28, 0.5)), BRONZE, trims, 0.25, GOLD)
	var fire: Color = theme["fire"]
	_mm(_box(Vector3(3.4, 5.6, 0.3)), fire.darkened(0.78), heat, 0.3, fire.darkened(0.45))
	_mm(_box(Vector3(7.4, 0.22, 0.4)), fire, base, 1.2, fire)

func _banners() -> void:
	for k in SEGMENTS:
		var t = _seg(k, R - 0.1, 3.0, 4.6)
		var ban = Look.model("banner_patternA_red" if k % 2 == 0 else "banner_patternB_red")
		ban.scale = Vector3(2.4, 3.2, 2.4)
		ban.transform = Transform3D(t.basis.rotated(Vector3.UP, PI).scaled(Vector3(2.4, 3.2, 2.4)), t.origin)
		_root.add_child(ban)
		Look.apply(ban, 0.0, Color(1.0, 0.8, 0.75))

func _pylons() -> void:
	var cols: Array = []
	var caps: Array = []
	var tops: PackedVector3Array = []
	for k in SEGMENTS:
		if k % 2 != 0:
			continue
		var t = _seg(k, R + 2.4, 3.8, 0.0)
		cols.append(t.translated(Vector3(0, 9.0, 0)))
		caps.append(t.translated(Vector3(0, 18.3, 0)))
		tops.append(t.origin + Vector3(0, 19.2, 0))
	_mm(_box(Vector3(1.8, 18.0, 1.8)), STONE, cols)
	_mm(_box(Vector3(2.6, 0.7, 2.6)), BRONZE, caps, 0.3, GOLD)
	var f = _flames(30 * tops.size() / 4, 1.6)
	f.emission_shape = CPUParticles3D.EMISSION_SHAPE_POINTS
	f.emission_points = tops
	_root.add_child(f)

func _rubble() -> void:
	var chunks: Array = []
	for i in 22:
		var a = _rng.randf() * TAU
		var r = _rng.randf_range(R - 4.5, R - 1.5)
		var b = Basis(Vector3(_rng.randf(), _rng.randf(), _rng.randf()).normalized(), _rng.randf_range(0.3, 1.2))
		chunks.append(Transform3D(b.scaled(Vector3.ONE * _rng.randf_range(0.6, 1.4)), Vector3(sin(a) * r, 0.4, cos(a) * r)))
	_mm(_box(Vector3(1.4, 1.0, 2.2)), STONE.lightened(0.05), chunks)

func _obelisks() -> void:
	var cols: Array = []
	var caps: Array = []
	for k in 4:
		var a = k * TAU / 4.0 + PI / 4.0
		var p = Vector3(sin(a), 0, cos(a)) * (R + 9.0)
		cols.append(Transform3D(Basis(Vector3.UP, a), p + Vector3(0, 16.0, 0)))
		caps.append(Transform3D(Basis(Vector3.UP, a), p + Vector3(0, 32.6, 0)))
	_mm(_box(Vector3(3.6, 32.0, 3.6)), STONE.darkened(0.2), cols)
	var prism = PrismMesh.new()
	prism.size = Vector3(3.6, 3.0, 3.6)
	_mm(prism, GOLD, caps, 0.6, GOLD)
	var fire: Color = theme["fire"]
	var bands: Array = []
	for t in cols:
		for y in [-8.0, 4.0]:
			bands.append(t.translated(Vector3(0, y, 0)))
	_mm(_box(Vector3(3.9, 0.5, 3.9)), fire, bands, 1.8, fire)

# ------------------------------------------------------------ fire -------

static var _flame_tex := {}

## A cel flame: a teardrop in hard bands (core, fire, deep fire) inside an ink edge.
static func flame_texture(core: Color, fire: Color) -> Texture2D:
	var key = core.to_html() + fire.to_html()
	if _flame_tex.has(key):
		return _flame_tex[key]
	var w = 48
	var h = 72
	var img = Image.create(w, h, false, Image.FORMAT_RGBA8)
	for y in h:
		var v = 1.0 - float(y) / float(h - 1)          # 0 at the bottom, 1 at the tip
		var half = 0.92 * pow(maxf(1.0 - v, 0.0), 0.75) * smoothstep(0.0, 0.32, v + 0.06)
		for x in w:
			var u = absf((float(x) / float(w - 1)) * 2.0 - 1.0)
			var d = u / maxf(half, 0.001)
			var c = Color(0, 0, 0, 0)
			if d < 1.0:
				c = Color(INK, 1.0)
			if d < 0.8:
				c = Color(fire.darkened(0.25), 1.0)
			if d < 0.62 and v < 0.85:
				c = Color(fire, 1.0)
			if d < 0.36 and v < 0.5:
				c = Color(core.lerp(fire, 0.25), 1.0)
			img.set_pixel(x, y, c)
	var tex = ImageTexture.create_from_image(img)
	_flame_tex[key] = tex
	return tex

func _flame_mat(core: Color, fire: Color) -> StandardMaterial3D:
	var m = StandardMaterial3D.new()
	m.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	m.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA_SCISSOR
	m.alpha_scissor_threshold = 0.5
	m.albedo_texture = flame_texture(core, fire)
	m.texture_filter = BaseMaterial3D.TEXTURE_FILTER_NEAREST
	m.billboard_mode = BaseMaterial3D.BILLBOARD_FIXED_Y
	m.vertex_color_use_as_albedo = true
	m.disable_fog = true
	return m

func _flames(amount: int, size: float) -> CPUParticles3D:
	var f = CPUParticles3D.new()
	var q = QuadMesh.new()
	q.size = Vector2(size * 0.66, size)
	q.material = _flame_mat(theme["core"], theme["fire"])
	f.mesh = q
	f.amount = maxi(amount, 8)
	f.lifetime = 0.7
	f.direction = Vector3.UP
	f.spread = 12.0
	f.initial_velocity_min = 1.5
	f.initial_velocity_max = 3.5
	f.gravity = Vector3(0, 1.5, 0)
	var c = Curve.new()
	c.add_point(Vector2(0, 0.6))
	c.add_point(Vector2(0.3, 1.0))
	c.add_point(Vector2(1, 0.0))
	f.scale_amount_curve = c
	f.scale_amount_min = 0.7
	f.scale_amount_max = 1.5
	return f

func _rim_fire(amount: int) -> void:
	var f = _flames(amount, 3.2)
	f.emission_shape = CPUParticles3D.EMISSION_SHAPE_RING
	f.emission_ring_axis = Vector3.UP
	f.emission_ring_radius = R + 1.0
	f.emission_ring_inner_radius = R + 0.2
	f.emission_ring_height = 0.2
	f.position.y = 9.6
	f.visibility_aabb = AABB(Vector3(-40, -2, -40), Vector3(80, 12, 80))
	_root.add_child(f)

func _embers() -> void:
	var ash = theme.get("ash", false)
	var e = CPUParticles3D.new()
	var q = QuadMesh.new()
	q.size = Vector2(0.14, 0.14)
	var core: Color = Color(0.92, 0.86, 0.8) if ash else theme["core"]
	q.material = _flame_mat(core, Color(0.7, 0.62, 0.56) if ash else theme["fire"])
	e.mesh = q
	e.amount = 220
	e.lifetime = 8.0
	e.preprocess = 8.0
	e.emission_shape = CPUParticles3D.EMISSION_SHAPE_BOX
	e.emission_box_extents = Vector3(34, 1, 34)
	e.position.y = 18.0 if ash else 0.5
	e.direction = Vector3(0.3, -1.0 if ash else 1.0, 0.1)
	e.spread = 25.0
	e.gravity = Vector3(0.6, -0.4 if ash else 0.5, 0.2)
	e.initial_velocity_min = 0.8
	e.initial_velocity_max = 2.6
	e.scale_amount_min = 0.6
	e.scale_amount_max = 1.8
	e.visibility_aabb = AABB(Vector3(-40, -2, -40), Vector3(80, 40, 80))
	_root.add_child(e)
