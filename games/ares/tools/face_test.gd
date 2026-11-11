extends Node
## Painted-face test: the Messenger and possessed Teknium (Meshy) in the arena's own light,
## toon + outline, with and without the painted face. Saves shots/face-test-*.png, then quits.
## Run: godot --path . -- --face-test [--stage=ember] [--clip-t=0.4]

const CAST := [
	["messenger", "res://art/models/messenger-mv.glb", "res://assets/faces/messenger.png", -0.85],
	["teknium", "res://art/models/teknium-stage1-mv.glb", "res://assets/faces/teknium.png", 0.85],
]
var cam: Camera3D
var who := {}
var shots := []
var shot := -1
var wait := 0

func _ready() -> void:
	var main = Game.main
	main.stage.apply(String(Game.arg("stage", "ember")))
	main.player.visible = false
	main.player.process_mode = Node.PROCESS_MODE_DISABLED
	main.hud.visible = false
	main.set_process(false)          # the title orbit would keep taking the camera
	main.set_physics_process(false)
	main.card_cam.current = false
	cam = Camera3D.new()
	add_child(cam)
	cam.current = true
	for c in CAST:
		var m: Node3D = (load(c[1]) as PackedScene).instantiate()
		add_child(m)
		m.position = Vector3(c[3], 0.0, 0.0)
		Face.smooth(m)
		Look.apply(m, 0.009)
		for g in m.find_children("*", "MeshInstance3D", true, false):
			print("MESH %s %s node_scale=%s world_scale=%s skin=%s" % [c[0], g.name, g.global_transform.basis.get_scale(), Face.mesh_to_world(g).basis.get_scale(), g.skin != null])
		var pr = Face.profile(m)
		print("FACE %s top=%.3f nose_y=%.3f nose_z=%.3f chin_y=%.3f" % [c[0], pr["top"], pr["nose_y"], pr["nose_z"], pr["chin_y"]])
		var keys = pr["slices"].keys()
		keys.sort()
		var line = ""
		for k in keys:
			if k * 0.005 > pr["top"] - 0.34:
				line += "%.3f:%.3f " % [k * 0.005, pr["slices"][k]]
		print("PROFILE %s %s" % [c[0], line])
		var f: Dictionary = Face.FACES[c[0]]
		var face = Face.paint(m, load(f["tex"]), f)
		var ap = m.find_children("*", "AnimationPlayer", true, false)
		if ap.size() > 0 and not Game.arg("calib", false):
			var a: AnimationPlayer = ap[0]
			var names = a.get_animation_list()
			print("CLIPS %s %s" % [c[0], names])
			a.play(names[0])
			a.seek(float(Game.arg("clip-t", 0.4)), true)
			a.pause()
		who[c[0]] = {"m": m, "face": face, "head": Vector3(c[3], pr["nose_y"], pr["nose_z"])}
	# name, subject, camera offset from the subject's head, fov, painted face on
	shots = [
		["gameplay", "", Vector3(0, 1.6 - 1.1, 4.3), 68.0, true],
		["gameplay-raw", "", Vector3(0, 1.6 - 1.1, 4.3), 68.0, false],
	]
	for k in ["messenger", "teknium"]:
		shots.append(["%s-front" % k, k, Vector3(0, 0.0, 0.75), 30.0, true])
		shots.append(["%s-34" % k, k, Vector3(0.53, 0.02, 0.53), 30.0, true])
		shots.append(["%s-front-raw" % k, k, Vector3(0, 0.0, 0.75), 30.0, false])
		shots.append(["%s-mid" % k, k, Vector3(0.6, -0.25, 1.9), 40.0, true])
	if Game.arg("calib", false):
		# orthographic front view of the bare head in the rest pose: 0.4 m tall, centred on y 1.5
		shots = []
		for k in ["messenger", "teknium"]:
			shots.append(["calib-%s" % k, k, Vector3(0, 0, 2.0), -0.4, false])
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path("res://shots"))

func _process(_delta: float) -> void:
	if wait > 0:
		wait -= 1
		if wait == 0:
			var img = get_viewport().get_texture().get_image()
			var path = ProjectSettings.globalize_path("res://shots/face-test-%s.png" % shots[shot][0])
			img.save_png(path)
			print("SHOT %s cam=%s at=%s" % [path, get_viewport().get_camera_3d().get_path(), get_viewport().get_camera_3d().global_position])
		return
	shot += 1
	if shot >= shots.size():
		get_tree().quit()
		return
	var s = shots[shot]
	for k in who:
		who[k]["face"].visible = s[4]
		who[k]["m"].visible = s[1] == "" or s[1] == k
	var focus: Vector3
	if s[1] == "":
		focus = Vector3(0, 1.1, 0)
	else:
		var fm: MeshInstance3D = who[s[1]]["face"]
		focus = fm.global_transform * fm.get_aabb().get_center()
	cam.current = true
	if s[3] < 0.0:
		cam.projection = Camera3D.PROJECTION_ORTHOGONAL
		cam.size = -s[3]
		var x = who[s[1]]["m"].position.x
		cam.global_position = Vector3(x, 1.5, 2.0)
		cam.look_at(Vector3(x, 1.5, 0))
		wait = 6
		return
	cam.projection = Camera3D.PROJECTION_PERSPECTIVE
	cam.fov = s[3]
	cam.global_position = focus + s[2]
	cam.look_at(focus)
	wait = 6
