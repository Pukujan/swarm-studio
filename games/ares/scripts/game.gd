extends Node
## Shared run state: the actors, time control (hit-stop, slow-mo), args and cosmetics.

var main: Node = null
var player = null
var boss = null
var enemies: Array = []     # minions, checkpoints and boss clones (all share the enemy interface)
var pickups: Array = []
var projectiles: Array = []
var threats: Array = []     # telegraphs: {pos, radius, t, kind, line_to}
var waves: Array = []       # expanding shockwave rings
var time := 0.0
var args := {}
var items: Array = []
var equipped := {}          # slot -> item
var base_scale := 1.0
var damage_taken := 1.0
var _stop := 0.0
var _slow := 0.0
var _id := 0
## Web (or --lite): the Compatibility renderer redraws each object per omni light, so the
## lite profile drops dynamic lights and SSAO and leans on emission instead.
var lite := false

func _ready() -> void:
	process_mode = Node.PROCESS_MODE_ALWAYS
	for a in OS.get_cmdline_user_args():
		var s = String(a).trim_prefix("--")
		var i = s.find("=")
		if i >= 0:
			args[s.substr(0, i)] = s.substr(i + 1)
		else:
			args[s] = true
	lite = OS.has_feature("web") or args.has("lite")
	if args.has("damage"):
		damage_taken = float(args["damage"])
	_load_items()

func _process(delta: float) -> void:
	var real = delta / maxf(Engine.time_scale, 0.001)
	if not get_tree().paused:
		time += delta
	if _stop > 0.0:
		_stop -= real
		if _stop <= 0.0:
			Engine.time_scale = base_scale
	if _slow > 0.0:
		_slow -= real
		if _slow <= 0.0:
			base_scale = 1.0
			if _stop <= 0.0:
				Engine.time_scale = 1.0

func hit_stop(sec: float, scale := 0.03) -> void:
	_stop = maxf(_stop, sec)
	Engine.time_scale = scale

func slowmo(sec: float, scale := 0.25) -> void:
	base_scale = scale
	_slow = sec
	if _stop <= 0.0:
		Engine.time_scale = scale

func reset_time() -> void:
	_stop = 0.0
	_slow = 0.0
	base_scale = 1.0
	Engine.time_scale = 1.0

func new_id() -> int:
	_id += 1
	return _id

func shake(amount: float) -> void:
	if player and is_instance_valid(player):
		player.trauma = minf(1.0, player.trauma + amount)

func announce(text: String, sub := "", color := Color(1.0, 0.78, 0.25), sec := 1.4) -> void:
	if main and main.hud:
		main.hud.announce(text, sub, color, sec)

func arg(name: String, fallback = null):
	return args.get(name, fallback)

func _load_items() -> void:
	var f = FileAccess.open("res://data/items.json", FileAccess.READ)
	if f == null:
		return
	var d = JSON.parse_string(f.get_as_text())
	if typeof(d) != TYPE_DICTIONARY:
		return
	items = d.get("items", [])
	var worn: Array = d.get("equipped", [])
	if args.has("equip"):
		worn = String(args["equip"]).split(",")
	for it in items:
		if worn.has(it.get("id", "")):
			equipped[it.get("slot", "")] = it

func cosmetic_color(slot: String, fallback: Color) -> Color:
	if equipped.has(slot):
		return Color(String(equipped[slot].get("color", fallback.to_html())))
	return fallback

func cosmetic_name(slot: String) -> String:
	return String(equipped[slot].get("name", "")) if equipped.has(slot) else ""

func live_enemies() -> Array:
	var out: Array = []
	for e in enemies:
		if is_instance_valid(e) and not e.dead:
			out.append(e)
	return out
