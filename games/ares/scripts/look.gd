class_name Look
extends RefCounted
## One look for every pack: cel shading, an ink outline, per-instance tint and flash.

const TOON := preload("res://shaders/toon.gdshader")
const OUTLINE := preload("res://shaders/outline.gdshader")
const TELEGRAPH := preload("res://shaders/telegraph.gdshader")

static var _toons := {}
static var _outlines := {}
static var _scenes := {}
static var _statics := {}
## While true, new toon materials come out static (scenery being built).
static var scenery := false
static var _static_shader: Shader

static func outline(width: float) -> ShaderMaterial:
	var key = snappedf(width, 0.001)
	if _outlines.has(key):
		return _outlines[key]
	var m = ShaderMaterial.new()
	m.shader = OUTLINE
	m.set_shader_parameter("width", key)
	_outlines[key] = m
	return m

static func toon(tex: Texture2D, color: Color, emit := Color(0, 0, 0), emit_strength := 0.0, ow := 0.02) -> ShaderMaterial:
	var key = "%d|%s|%s|%.2f|%.3f" % [tex.get_instance_id() if tex else 0, color.to_html(), emit.to_html(), emit_strength, ow]
	if _toons.has(key):
		return _static_of(_toons[key]) if scenery else _toons[key]
	var m = ShaderMaterial.new()
	m.shader = TOON
	if tex:
		m.set_shader_parameter("albedo_tex", tex)
		m.set_shader_parameter("use_tex", 1.0)
	else:
		m.set_shader_parameter("use_tex", 0.0)
	m.set_shader_parameter("base_color", color)
	m.set_shader_parameter("emit_color", emit)
	m.set_shader_parameter("emit_strength", emit_strength)
	if ow > 0.0:
		m.next_pass = outline(ow)
	_toons[key] = m
	return _static_of(m) if scenery else m

## Scenery never flashes or fades, but every instance of a shader with instance uniforms
## takes slots in a buffer WebGL caps at 1024 (4 per toon mesh). Swap static scenery to a
## twin shader whose per-instance values are plain uniforms.
static func make_static(root: Node) -> void:
	for g in root.find_children("*", "GeometryInstance3D", true, false):
		if g is MeshInstance3D:
			var mi := g as MeshInstance3D
			if mi.material_override:
				mi.material_override = _static_of(mi.material_override)
			if mi.mesh:
				for i in mi.mesh.get_surface_count():
					var m = mi.get_surface_override_material(i)
					if m:
						mi.set_surface_override_material(i, _static_of(m))

static func _static_of(m: Material) -> Material:
	if not (m is ShaderMaterial and (m as ShaderMaterial).shader == TOON):
		return m
	if _statics.has(m):
		return _statics[m]
	if _static_shader == null:
		_static_shader = Shader.new()
		_static_shader.code = TOON.code.replace("instance uniform", "uniform")
	var d: ShaderMaterial = m.duplicate()
	d.shader = _static_shader
	_statics[m] = d
	return d

## How many live instances use instance uniforms (WebGL holds 1024 slots, 4 per toon mesh).
static func count_instance_users(root: Node) -> Dictionary:
	var out := {}
	for g in root.find_children("*", "GeometryInstance3D", true, false):
		var mats := []
		var gi := g as GeometryInstance3D
		if gi.material_override:
			mats.append(gi.material_override)
		if g is MeshInstance3D and g.mesh:
			for i in g.mesh.get_surface_count():
				mats.append(g.get_active_material(i))
		for m in mats:
			if m is ShaderMaterial and m.shader and m.shader.code.contains("instance uniform"):
				var top = g
				while top.get_parent() and top.get_parent() != root:
					top = top.get_parent()
				var k = "%s:%s" % [top.name, m.shader.resource_path.get_file()]
				out[k] = out.get(k, 0) + 1
				break
	return out

static func model(file: String) -> Node3D:
	var path = "res://assets/models/%s.glb" % file
	if not _scenes.has(path):
		_scenes[path] = load(path)
	var s: PackedScene = _scenes[path]
	return s.instantiate() as Node3D

## Swap every surface of a loaded model for the cel shader, keeping its texture.
static func apply(node: Node, ow := 0.02, color := Color.WHITE) -> void:
	for mi in node.find_children("*", "MeshInstance3D", true, false):
		var m = mi as MeshInstance3D
		if m.mesh == null:
			continue
		for i in m.mesh.get_surface_count():
			var src = m.get_active_material(i)
			var tex: Texture2D = null
			var c = color
			if src is BaseMaterial3D:
				tex = (src as BaseMaterial3D).albedo_texture
				c = (src as BaseMaterial3D).albedo_color * color
			m.set_surface_override_material(i, toon(tex, c, Color(0, 0, 0), 0.0, ow))

static func mesh(shape: Mesh, color: Color, emit := 0.0, ow := 0.02) -> MeshInstance3D:
	var mi = MeshInstance3D.new()
	mi.mesh = shape
	mi.material_override = toon(null, color, color if emit > 0.0 else Color(0, 0, 0), emit, ow)
	return mi

static func box(size: Vector3, color: Color, emit := 0.0, ow := 0.02) -> MeshInstance3D:
	var b = BoxMesh.new()
	b.size = size
	return mesh(b, color, emit, ow)

static func cyl(r: float, h: float, color: Color, emit := 0.0, ow := 0.02, top := -1.0, sides := 24) -> MeshInstance3D:
	var c = CylinderMesh.new()
	c.top_radius = r if top < 0.0 else top
	c.bottom_radius = r
	c.height = h
	c.radial_segments = sides
	return mesh(c, color, emit, ow)

static func ball(r: float, color: Color, emit := 0.0, ow := 0.02) -> MeshInstance3D:
	var s = SphereMesh.new()
	s.radius = r
	s.height = r * 2.0
	s.radial_segments = 20
	s.rings = 12
	return mesh(s, color, emit, ow)

static func geo(node: Node) -> Array:
	if node.has_meta("_geo"):
		return node.get_meta("_geo")
	var list: Array = node.find_children("*", "GeometryInstance3D", true, false)
	if node is GeometryInstance3D:
		list.append(node)
	node.set_meta("_geo", list)
	return list

static func param(node: Node, name: String, value) -> void:
	for g in geo(node):
		if is_instance_valid(g):
			(g as GeometryInstance3D).set_instance_shader_parameter(name, value)

static func flash(node: Node, amount: float, color := Color(1.0, 0.95, 0.85)) -> void:
	param(node, "flash_color", color)
	param(node, "flash", amount)

static func telegraph(radius: float, color := Color(1.0, 0.32, 0.06)) -> MeshInstance3D:
	var q = PlaneMesh.new()
	q.size = Vector2(radius * 2.0, radius * 2.0)
	var mi = MeshInstance3D.new()
	mi.mesh = q
	var m = ShaderMaterial.new()
	m.shader = TELEGRAPH
	m.set_shader_parameter("color", color)
	mi.material_override = m
	mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	return mi

static func telegraph_line(length: float, width: float, color := Color(1.0, 0.32, 0.06)) -> MeshInstance3D:
	var q = PlaneMesh.new()
	q.size = Vector2(width, length)
	var mi = MeshInstance3D.new()
	mi.mesh = q
	var m = StandardMaterial3D.new()
	m.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	m.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	m.blend_mode = BaseMaterial3D.BLEND_MODE_ADD
	m.albedo_color = Color(color.r, color.g, color.b, 0.55)
	m.cull_mode = BaseMaterial3D.CULL_DISABLED
	mi.material_override = m
	mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	return mi

static func glow(color: Color, alpha := 1.0) -> StandardMaterial3D:
	var m = StandardMaterial3D.new()
	m.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	m.albedo_color = Color(color.r, color.g, color.b, alpha)
	if alpha < 1.0:
		m.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	m.vertex_color_use_as_albedo = true
	m.cull_mode = BaseMaterial3D.CULL_DISABLED
	return m

# Bundled OFL fonts (assets/fonts), so the web build looks the same: browsers have no Impact.
static var _slam: Font
static var _body: Font

static func slam_font() -> Font:
	if _slam == null:
		_slam = load("res://assets/fonts/Anton-Regular.ttf")
	return _slam

static func body_font() -> Font:
	if _body == null:
		var v = FontVariation.new()
		v.base_font = load("res://assets/fonts/Oswald.ttf")
		v.variation_opentype = {TextServerManager.get_primary_interface().name_to_tag("wght"): 600}
		_body = v
	return _body
