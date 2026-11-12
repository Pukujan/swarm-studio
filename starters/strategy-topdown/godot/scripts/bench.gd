## The measured test (docs/specs/38-game-starters.md): N units of two teams marching across the map and
## back, every system on (flow fields, separation, bites, fog, box-select drawing). Prints one line
## "BENCH {json}" and quits; on the Web it sets window.benchResult instead.
class_name StarterBench
extends Node

var game: Node2D
var n := 0
var frames := PackedFloat32Array()
var swarm_us := PackedFloat32Array()
var _t := 0.0
var _flip := false
var _warm := 90
var _last := 0
const MEASURE := 900

## a named flag from the command line (--off fog,rings) or the page (?off=fog,rings)
static func flag(name: String) -> String:
	var args := OS.get_cmdline_user_args()
	for k in args.size():
		if args[k] == "--" + name and k + 1 < args.size():
			return args[k + 1]
	if OS.has_feature("web"):
		var q = JavaScriptBridge.eval("new URLSearchParams(location.search).get('%s') || ''" % name, true)
		return str(q) if q != null else ""
	return ""

static func requested() -> int:
	var args := OS.get_cmdline_user_args()
	for k in args.size():
		if args[k] == "--bench" and k + 1 < args.size():
			return int(args[k + 1])
	if OS.has_feature("web"):
		var q = JavaScriptBridge.eval("new URLSearchParams(location.search).get('bench') || ''", true)
		if q != null and str(q) != "":
			return int(str(q))
	return 0

func start(g: Node2D, count: int) -> void:
	game = g
	n = count
	var s: Swarm = g.swarm
	# bites are checked as in play, but do no harm, so the load stays at n units the whole run
	s.fight = true
	s.damage = 0.0
	var rect: Rect2 = g.map.rect()
	var placed := 0
	var tries := 0
	while placed < n and tries < n * 20:
		tries += 1
		var p := Vector2(randf_range(rect.position.x + 64, rect.end.x - 64), randf_range(rect.position.y + 64, rect.end.y - 64))
		if g.map.flow.blocked_at(p):
			continue
		s.spawn(0 if placed % 2 == 0 else 1, p)
		placed += 1
	g.select.set_ids(s.ids_in_rect(rect, 0))
	for part in StarterBench.flag('off').split(','):
		if part == 'fog': g.fog.queue_free()
		if part == 'units': g.swarm.get_child(1).visible = false
		if part == 'rings': g.select.set_ids(PackedInt32Array())
	g.camera.zoom = Vector2(0.45, 0.45)
	g.camera.position = rect.get_center()
	_order()
	_last = Time.get_ticks_usec()

func _order() -> void:
	var s: Swarm = game.swarm
	var rect: Rect2 = game.map.rect()
	var a := rect.position + Vector2(200, 200)
	var b := rect.end - Vector2(200, 200)
	s.move(s.ids_in_rect(rect, 0), b if _flip else a)
	s.move(s.ids_in_rect(rect, 1), a if _flip else b)
	_flip = not _flip

func _process(dt: float) -> void:
	var now := Time.get_ticks_usec()
	var ft := float(now - _last) / 1000.0
	_last = now
	_t += dt
	if _t > 4.0:
		_t = 0.0
		_order()
	if _warm > 0:
		_warm -= 1
		return
	frames.append(ft)
	swarm_us.append(float(game.swarm.last_update_usec) / 1000.0)
	if frames.size() >= MEASURE:
		_report()

func _stat(a: PackedFloat32Array) -> Dictionary:
	var s := Array(a)
	s.sort()
	var sum := 0.0
	for v in s:
		sum += v
	return {"avg": snappedf(sum / s.size(), 0.01), "p95": snappedf(s[int(s.size() * 0.95)], 0.01), "max": snappedf(s[s.size() - 1], 0.01)}

func _report() -> void:
	var f := _stat(frames)
	var out := {
		"units": n, "alive": game.swarm.count(), "frames": frames.size(),
		"frame_ms": f, "fps_avg": snappedf(1000.0 / f.avg, 0.1), "swarm_ms": _stat(swarm_us),
		"off": StarterBench.flag("off"), "web": OS.has_feature("web"), "headless": DisplayServer.get_name() == "headless",
		"renderer": RenderingServer.get_current_rendering_method(), "godot": Engine.get_version_info().string
	}
	var line := JSON.stringify(out)
	print("BENCH " + line)
	set_process(false)
	if OS.has_feature("web"):
		JavaScriptBridge.eval("window.benchResult = " + line + ";", true)
	else:
		get_tree().quit()
