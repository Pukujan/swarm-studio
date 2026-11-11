class_name Face
extends RefCounted
## Painted faces for 3D heroes. Meshy heads read as plastic at anime proportions, so the
## face from the illustration is laid over the head: a small mesh fitted to the head's
## front surface (projected along +Z, the model's front), carrying the painted eyes, nose
## and mouth, faded at the edges and riding the Head bone. The rest of the head keeps the
## cel shader, with the light pulled toward the camera above the chin so the face never
## splits into a half-dark band.

const SHADER := preload("res://shaders/face_decal.gdshader")
const GRID := 24
## Where the nose tip and chin sit in a face crop (v, 0 top .. 1 bottom).
const NOSE_V := 0.55
const CHIN_V := 0.86
## Per hero: the crop, where its eyes and mouth sit (v), and where the model's eyes and
## mouth sit (model y, rest pose, measured from an orthographic front shot).
const FACES := {
	"messenger": {"tex": "res://assets/faces/messenger.png", "eye_v": 0.286, "mouth_v": 0.703, "eye_y": 1.567, "mouth_y": 1.520},
	"teknium": {"tex": "res://assets/faces/teknium.png", "eye_v": 0.326, "mouth_v": 0.664, "eye_y": 1.581, "mouth_y": 1.546},
}

## Measure the head's front profile in the model's own space: top, nose tip, chin.
static func profile(model: Node3D) -> Dictionary:
	var pts := _points(model)
	var top := -INF
	for v in pts:
		if absf(v.x) < 0.12:
			top = maxf(top, v.y)
	# frontmost z per 5 mm slice along the centre line
	var slices := {}
	for v in pts:
		if absf(v.x) < 0.015 and v.y > top - 0.34:
			var k := int(floor(v.y / 0.005))
			slices[k] = maxf(slices.get(k, -INF), v.z)
	var nose_k := 0
	var nose_z := -INF
	for k in slices:
		# the nose: the furthest-forward point in the upper part of the head
		if k * 0.005 > top - 0.26 and slices[k] > nose_z:
			nose_z = slices[k]
			nose_k = k
	# the chin: the sharpest step back below the nose (where the jaw meets the neck)
	var chin_k := nose_k - 8
	var drop := 0.0
	for k in range(nose_k - 4, nose_k - 26, -1):
		if slices.has(k) and slices.has(k - 2):
			var d: float = slices[k] - slices[k - 2]
			if d > drop:
				drop = d
				chin_k = k
	return {"top": top, "nose_y": nose_k * 0.005, "nose_z": nose_z, "chin_y": chin_k * 0.005, "slices": slices}

## Lay `tex` over the model's face. Options: bias (front light on the face, 0..1),
## height (face height in m, else from the profile), lift (gap off the skin), dx/dy (nudge).
static func paint(model: Node3D, tex: Texture2D, opts := {}) -> MeshInstance3D:
	var pr := profile(model)
	var nose_y: float = pr["nose_y"] + float(opts.get("dy", 0.0))
	var h: float = float(opts.get("height", (pr["nose_y"] - pr["chin_y"]) / (CHIN_V - NOSE_V)))
	if opts.has("eye_y"):
		# eyes and mouth pin the crop: height from their gap, nose_y is v = NOSE_V's height
		h = (float(opts["eye_y"]) - float(opts["mouth_y"])) / (float(opts["mouth_v"]) - float(opts["eye_v"]))
		nose_y = float(opts["eye_y"]) + (float(opts["eye_v"]) - NOSE_V) * h + float(opts.get("dy", 0.0))
		pr["chin_y"] = float(opts["mouth_y"]) - 0.03
	var w: float = h * float(tex.get_width()) / float(tex.get_height()) * float(opts.get("wide", 1.0))
	var lift: float = float(opts.get("lift", 0.004))
	var dx: float = float(opts.get("dx", 0.0))
	# bucket the front-facing skin by 6 mm cells: frontmost z per cell
	var cell := 0.006
	var depth := {}
	for v in _points(model):
		if absf(v.x - dx) < w and v.y < nose_y + h and v.y > nose_y - h and v.z > pr["nose_z"] - 0.14:
			var k := Vector2i(int(floor(v.x / cell)), int(floor(v.y / cell)))
			depth[k] = maxf(depth.get(k, -INF), v.z)
	var front := -INF
	var mid := Vector2i(int(floor(dx / cell)), int(floor((nose_y) / cell)))
	for ox in range(-2, 3):
		for oy in range(-2, 3):
			front = maxf(front, depth.get(mid + Vector2i(ox, oy), -INF))
	if front == -INF:
		front = pr["nose_z"]
	var zs := []
	var raw := []
	for j in GRID + 1:
		var row := []
		for i in GRID + 1:
			var x := dx + (float(i) / GRID - 0.5) * w
			var y := nose_y + (NOSE_V - float(j) / GRID) * h
			var best := -INF
			for ox in [-1, 0, 1]:
				for oy in [-1, 0, 1]:
					var k: Vector2i = Vector2i(int(floor(x / cell)) + ox, int(floor(y / cell)) + oy)
					if depth.has(k) and depth[k] > front - 0.07:
						best = maxf(best, depth[k])
			row.append(best)
		zs.append(row)
		raw.append(row.duplicate())
	# fill holes from neighbours, then soften so hair strands don't spike the sheet
	var fallback: float = front - 0.04
	var hit := []
	for j in GRID + 1:
		var row := []
		for i in GRID + 1:
			row.append(zs[j][i] > -INF)
		hit.append(row)
	for pass_ in 2:
		var out := []
		for j in GRID + 1:
			var row := []
			for i in GRID + 1:
				var sum := 0.0
				var n := 0.0
				for o in [Vector2i(0, 0), Vector2i(1, 0), Vector2i(-1, 0), Vector2i(0, 1), Vector2i(0, -1)]:
					var a: int = i + o.x
					var b: int = j + o.y
					if a >= 0 and b >= 0 and a <= GRID and b <= GRID and zs[b][a] > -INF:
						sum += zs[b][a]
						n += 1.0
				row.append(sum / n if n > 0.0 else (zs[j][i] if zs[j][i] > -INF else fallback))
			out.append(row)
		zs = out
	for j in GRID + 1:
		for i in GRID + 1:
			zs[j][i] = maxf(zs[j][i], raw[j][i])
	var st := SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)
	var sk := _skeleton(model)
	var to_local := Transform3D.IDENTITY
	var att: Node3D = model
	if sk:
		var bi := -1
		for bn in ["Head", "head", "mixamorig:Head"]:
			bi = sk.find_bone(bn)
			if bi >= 0:
				break
		if bi >= 0:
			var ba := BoneAttachment3D.new()
			ba.bone_name = sk.get_bone_name(bi)
			sk.add_child(ba)
			att = ba
			var bone_model: Transform3D = model.global_transform.affine_inverse() * sk.global_transform * sk.get_bone_global_pose(bi)
			to_local = bone_model.affine_inverse()
	for j in GRID + 1:
		for i in GRID + 1:
			var x := dx + (float(i) / GRID - 0.5) * w
			var y := nose_y + (NOSE_V - float(j) / GRID) * h
			st.set_uv(Vector2(float(i) / GRID, float(j) / GRID))
			st.set_color(Color(1, 1, 1, 1.0 if hit[j][i] else 0.0))
			st.set_normal(to_local.basis * Vector3(0, 0, 1))
			st.add_vertex(to_local * Vector3(x, y, zs[j][i] + lift))
	for j in GRID:
		for i in GRID:
			var a := j * (GRID + 1) + i
			st.add_index(a)
			st.add_index(a + 1)
			st.add_index(a + GRID + 1)
			st.add_index(a + 1)
			st.add_index(a + GRID + 2)
			st.add_index(a + GRID + 1)
	var mi := MeshInstance3D.new()
	mi.mesh = st.commit()
	var m := ShaderMaterial.new()
	m.shader = SHADER
	m.set_shader_parameter("face", tex)
	m.render_priority = 2
	mi.material_override = m
	mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	mi.name = "PaintedFace"
	att.add_child(mi)
	# front light on the rest of the head
	var bias := float(opts.get("bias", 0.7))
	for g in model.find_children("*", "MeshInstance3D", true, false):
		var gm := g as MeshInstance3D
		if gm == mi or gm.mesh == null:
			continue
		for s in gm.mesh.get_surface_count():
			var mat = gm.get_active_material(s)
			if mat is ShaderMaterial:
				var d: ShaderMaterial = mat.duplicate()
				d.set_shader_parameter("face_y", float(pr["chin_y"]) - 0.03)
				d.set_shader_parameter("face_bias", bias)
				# no ink lines across the painted face: the hull is cut away inside it
				if d.next_pass is ShaderMaterial:
					var o: ShaderMaterial = d.next_pass.duplicate()
					o.set_shader_parameter("hole_lo", Vector3(dx - w * 0.4, float(pr["chin_y"]) + 0.02, front - 0.05))
					o.set_shader_parameter("hole_hi", Vector3(dx + w * 0.4, nose_y + h * 0.4, 9.0))
					d.next_pass = o
				gm.set_surface_override_material(s, d)
	return mi

## Meshy exports flat normals (each triangle its own), which facets a face under cel
## shading. Average the normals of every vertex that shares a position.
static func smooth(model: Node3D) -> void:
	for g in model.find_children("*", "MeshInstance3D", true, false):
		var gm := g as MeshInstance3D
		if not gm.mesh is ArrayMesh:
			continue
		var src: ArrayMesh = gm.mesh
		var out := ArrayMesh.new()
		var mats := []
		for s in src.get_surface_count():
			var arr: Array = src.surface_get_arrays(s)
			var pos: PackedVector3Array = arr[Mesh.ARRAY_VERTEX]
			var nrm: PackedVector3Array = arr[Mesh.ARRAY_NORMAL]
			var idx: PackedInt32Array = arr[Mesh.ARRAY_INDEX] if arr[Mesh.ARRAY_INDEX] != null else PackedInt32Array()
			# face normals summed per welded position (area weighted)
			var sums := {}
			var key := func(v: Vector3) -> Vector3i: return Vector3i(roundi(v.x * 2000.0), roundi(v.y * 2000.0), roundi(v.z * 2000.0))
			var tri := idx.size() if idx.size() > 0 else pos.size()
			for t in range(0, tri, 3):
				var a: int = idx[t] if idx.size() > 0 else t
				var b: int = idx[t + 1] if idx.size() > 0 else t + 1
				var c: int = idx[t + 2] if idx.size() > 0 else t + 2
				var fn := (pos[b] - pos[a]).cross(pos[c] - pos[a])
				for vi in [a, b, c]:
					var k = key.call(pos[vi])
					sums[k] = sums.get(k, Vector3.ZERO) + fn
			for i in pos.size():
				var n: Vector3 = sums.get(key.call(pos[i]), Vector3.ZERO)
				if n.length_squared() > 0.0:
					n = n.normalized()
					# Godot winding is clockwise: keep the original side
					if nrm.size() == pos.size() and n.dot(nrm[i]) < 0.0:
						n = -n
					nrm[i] = n
			arr[Mesh.ARRAY_NORMAL] = nrm
			arr[Mesh.ARRAY_TANGENT] = null
			out.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, arr, [], {}, src.surface_get_format(s) & Mesh.ARRAY_FLAG_USE_8_BONE_WEIGHTS)
			mats.append(gm.get_active_material(s))
		gm.mesh = out
		for s in mats.size():
			if gm.get_surface_override_material(s) == null and mats[s]:
				gm.set_surface_override_material(s, mats[s])

## Where a mesh's own vertices land in the world in the rest pose. A skinned mesh ignores
## its node transform: its vertices go through the bind pose and the bone's rest instead.
static func mesh_to_world(gm: MeshInstance3D) -> Transform3D:
	var sk := gm.get_node_or_null(gm.skeleton) as Skeleton3D
	if sk == null or gm.skin == null or gm.skin.get_bind_count() == 0:
		return gm.global_transform
	var bi := gm.skin.get_bind_bone(0)
	if bi < 0:
		bi = sk.find_bone(gm.skin.get_bind_name(0))
	return sk.global_transform * sk.get_bone_global_rest(bi) * gm.skin.get_bind_pose(0)

static func _skeleton(model: Node3D) -> Skeleton3D:
	var s = model.find_children("*", "Skeleton3D", true, false)
	return s[0] if s.size() > 0 else null

## Every vertex of every mesh in the bind pose, in the model's own space.
static func _points(model: Node3D) -> PackedVector3Array:
	var out := PackedVector3Array()
	var inv := model.global_transform.affine_inverse()
	for g in model.find_children("*", "MeshInstance3D", true, false):
		var gm := g as MeshInstance3D
		if gm.mesh == null or gm.name == "PaintedFace":
			continue
		var xf: Transform3D = inv * mesh_to_world(gm)
		for s in gm.mesh.get_surface_count():
			var arr = gm.mesh.surface_get_arrays(s)
			for v in arr[Mesh.ARRAY_VERTEX]:
				out.append(xf * v)
	return out
