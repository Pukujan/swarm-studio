class_name Look
extends RefCounted
## One look for every pack: cel shading, an ink outline, per-instance tint and flash.

const TOON := preload("res://shaders/toon.gdshader")
const OUTLINE := preload("res://shaders/outline.gdshader")
const TELEGRAPH := preload("res://shaders/telegraph.gdshader")

static var _toons := {}
static var _outlines := {}
static var _scenes := {}

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
		return _toons[key]
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
	return m

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

static func slam_font() -> Font:
	var f = SystemFont.new()
	f.font_names = PackedStringArray(["Impact", "Arial Black", "Arial"])
	f.font_weight = 900
	return f

static func body_font() -> Font:
	var f = SystemFont.new()
	f.font_names = PackedStringArray(["Bahnschrift", "Segoe UI", "Arial"])
	f.font_weight = 700
	return f
