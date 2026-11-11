extends Control
## Everything on screen: resources, the boss bar, slammed callouts, name cards, title and credits.

const INK := Color(0.07, 0.025, 0.02)
const GOLD := Color(1.0, 0.76, 0.22)
const EMBER := Color(1.0, 0.42, 0.1)
const BLOOD := Color(0.9, 0.16, 0.08)
const CREAM := Color(1.0, 0.93, 0.82)

var slam: Font
var body: Font
var state := "title"
var t := 0.0
var msgs: Array = []
var hit_t := 0.0
var hurt_t := 0.0
var frozen_t := 0.0
var card := {}
var card_t := 99.0
var pick_t := {}
var perfect_t := 0.0
var break_t := 9.0
var cut: Dictionary = {}     # an active comic-panel cut-in (see cutin())
var hide_hud := false
var sel := "messenger"
var sel_t := -1.0
var card_tex: Texture2D
var panel: Array = []
var panel_tex: Texture2D

func _ready() -> void:
	process_mode = Node.PROCESS_MODE_ALWAYS
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	slam = Look.slam_font()
	body = Look.body_font()

func _process(delta: float) -> void:
	var real = delta / maxf(Engine.time_scale, 0.001)
	t += real
	card_t += real
	hit_t = maxf(0.0, hit_t - real)
	hurt_t = maxf(0.0, hurt_t - real)
	frozen_t = maxf(0.0, frozen_t - real)
	perfect_t = maxf(0.0, perfect_t - real)
	if sel_t >= 0.0:
		sel_t += real
	break_t += real
	if not cut.is_empty():
		cut["t"] += real
		if cut["t"] > cut["sec"]:
			cut = {}
	for k in pick_t.keys():
		pick_t[k] = maxf(0.0, pick_t[k] - real)
	for m in msgs.duplicate():
		m["t"] += real
		if m["t"] > m["sec"]:
			msgs.erase(m)
	queue_redraw()

func on_state(s: String) -> void:
	state = s
	t = 0.0

func announce(text: String, sub: String, color: Color, sec: float) -> void:
	msgs = msgs.filter(func(m): return m["text"] != text)
	msgs.append({"text": text, "sub": sub, "color": color, "sec": sec, "t": 0.0})
	if msgs.size() > 2:
		msgs.pop_front()

func callout(kind: String) -> void:
	match kind:
		"finish":
			announce("FINISHER", "+health", GOLD, 0.7)
		"rip":
			announce("RIP", "+ammo", EMBER, 0.7)
		"burn":
			announce("FIRE BURST", "burning foes drop armor", EMBER, 0.8)
		"punch":
			announce("POWER PUNCH", "shields broken", GOLD, 0.8)

func hitmark() -> void:
	hit_t = 0.12

func hurt(_from: Vector3) -> void:
	hurt_t = 0.45

func select_confirm() -> void:
	sel_t = 0.0

func story_panel(p: Array) -> void:
	panel = p
	panel_tex = load(String(p[0]))
	t = 0.0

func perfect() -> void:
	perfect_t = 0.6

func break_slam() -> void:
	break_t = 0.0

## A full-screen comic-panel cut-in: a portrait slides in diagonally over red and black
## speed lines, with a name slammed across. Used by ults, boss intros and the story.
func cutin(tex: Texture2D, name: String, sub := "", sec := 0.8, color := GOLD) -> void:
	cut = {"tex": tex, "name": name, "sub": sub, "sec": sec, "t": 0.0, "color": color}

func timed_out(sec: float) -> void:
	frozen_t = sec

func pickup(kind: String) -> void:
	pick_t[kind] = 0.4

func namecard(handle: String, title: String, n: int, total: int, final: bool) -> void:
	card = {"handle": handle, "title": title, "n": n, "total": total, "final": final}
	card_t = 0.0

# ---------------------------------------------------------------- draw ---

func _txt(font: Font, pos: Vector2, text: String, fsize: int, color: Color, align := HORIZONTAL_ALIGNMENT_LEFT, width := -1.0, outline := 0) -> void:
	if outline > 0:
		draw_string_outline(font, pos, text, align, width, fsize, outline, INK)
	draw_string(font, pos, text, align, width, fsize, color)

func _bar(r: Rect2, frac: float, color: Color, back := Color(0, 0, 0, 0.55)) -> void:
	var skew = r.size.y * 0.5
	var bg = PackedVector2Array([r.position + Vector2(skew, 0), r.position + Vector2(r.size.x + skew, 0), r.position + Vector2(r.size.x, r.size.y), r.position + Vector2(0, r.size.y)])
	draw_colored_polygon(bg, back)
	var w = r.size.x * clampf(frac, 0.0, 1.0)
	if w > 1.0:
		var fg = PackedVector2Array([r.position + Vector2(skew, 0), r.position + Vector2(w + skew, 0), r.position + Vector2(w, r.size.y), r.position + Vector2(0, r.size.y)])
		draw_colored_polygon(fg, color)
	draw_polyline(PackedVector2Array([bg[0], bg[1], bg[2], bg[3], bg[0]]), INK, 3.0)

func _pips(at: Vector2, n: int, filled: float, color: Color, r := 9.0) -> void:
	for i in n:
		var c = at + Vector2(i * r * 2.6, 0)
		var f = clampf(filled - i, 0.0, 1.0)
		draw_circle(c, r + 2.0, INK)
		draw_circle(c, r, Color(0.25, 0.1, 0.07))
		if f > 0.0:
			draw_circle(c, r * f, color)

func _draw() -> void:
	var vs = get_viewport_rect().size
	if vs.y < 100.0:
		return
	var S = vs.y / 1080.0
	var W = vs.x
	var H = vs.y
	if state == "title":
		_draw_title(S, W, H)
		return
	if state == "credits":
		_draw_credits(S, W, H)
		return
	if state == "select":
		_draw_select(S, W, H)
		return
	if state == "story":
		_draw_story(S, W, H)
		return
	var p = Game.player
	if p == null or not is_instance_valid(p):
		return
	if state != "card" and state != "tour" and not hide_hud:
		_draw_game(S, W, H, p)
		if p.third:
			_draw_blade(S, W, H, p)
	if card_t < 2.6:
		_draw_card(S, W, H)
	for i in msgs.size():
		_draw_msg(msgs[i], S, W, H, i)
	if not cut.is_empty():
		_draw_cut(S, W, H)

func _draw_blade(S: float, W: float, H: float, p) -> void:
	# perfect dodge: a thin gold wash
	if perfect_t > 0.0:
		draw_rect(Rect2(0, 0, W, H), Color(1.0, 0.75, 0.25, 0.16 * perfect_t / 0.6))
	# blade charge ring
	var ch: float = p.melee.charging()
	if ch > 0.0:
		var c = Vector2(W * 0.5, H * 0.5)
		draw_arc(c, 34 * S, -PI / 2, -PI / 2 + TAU * ch, 40, INK, 9.0 * S)
		draw_arc(c, 34 * S, -PI / 2, -PI / 2 + TAU * ch, 40, GOLD if ch >= 1.0 else EMBER, 5.0 * S)
	# combo counter and style rank, right side
	var st = p.style
	var rx = W - 70 * S
	var ry = H * 0.36
	if st.combo > 1:
		_txt(slam, Vector2(rx - 300 * S, ry), "%d" % st.combo, int(72 * S), CREAM, HORIZONTAL_ALIGNMENT_RIGHT, 300 * S, int(12 * S))
		_txt(body, Vector2(rx - 300 * S, ry + 30 * S), "HITS", int(24 * S), GOLD, HORIZONTAL_ALIGNMENT_RIGHT, 300 * S, int(6 * S))
	if st.points > 4.0:
		var lv: int = st.level()
		var col = [Color(0.75, 0.6, 0.5), CREAM, Color(1.0, 0.85, 0.55), GOLD, EMBER, BLOOD, BLOOD][lv]
		var sc = 1.0 + lv * 0.12
		draw_set_transform(Vector2(rx - 120 * S, ry + 150 * S), -0.12, Vector2(sc, sc))
		_txt(slam, Vector2(-200 * S, 0), st.rank(), int(110 * S), col, HORIZONTAL_ALIGNMENT_RIGHT, 300 * S, int(16 * S))
		draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)
		_bar(Rect2(rx - 200 * S, ry + 172 * S, 200 * S, 10 * S), st.fill(), col)
	# ult meter, bottom centre
	var uc = Vector2(W * 0.5, H - 92 * S)
	var full: bool = p.ult >= 100.0
	var r = 38 * S * (1.0 + (0.08 * sin(t * 8.0) if full else 0.0))
	draw_circle(uc, r + 5 * S, INK)
	draw_circle(uc, r, Color(0.22, 0.08, 0.05))
	draw_arc(uc, r * 0.78, -PI / 2, -PI / 2 + TAU * p.ult / 100.0, 40, GOLD if full else EMBER, r * 0.42)
	_txt(slam, Vector2(uc.x - 60 * S, uc.y + 16 * S), "Q" if full else "%d" % p.ult, int((40 if full else 26) * S), CREAM if full else Color(1, 0.85, 0.7), HORIZONTAL_ALIGNMENT_CENTER, 120 * S, int(8 * S))
	if full:
		_txt(body, Vector2(uc.x - 200 * S, uc.y - 52 * S), "WINGED VERDICT", int(22 * S), GOLD, HORIZONTAL_ALIGNMENT_CENTER, 400 * S, int(6 * S))
	# guard bar under the boss bar
	var b = Game.boss
	if b and is_instance_valid(b) and not b.dead:
		var bw = 900 * S
		var bx = (W - bw) * 0.5
		var broken: bool = b.broken_t > 0.0
		_bar(Rect2(bx + 40 * S, 106 * S, bw * 0.6, 10 * S), b.guard / b.max_guard if not broken else b.broken_t / 4.0, CREAM if not broken else GOLD)
		_txt(body, Vector2(bx + bw * 0.6 + 60 * S, 117 * S), "BROKEN ×2" if broken else "GUARD", int(17 * S), GOLD if broken else CREAM, HORIZONTAL_ALIGNMENT_LEFT, -1, int(4 * S))
	# BREAK: an ink splash with the word slammed on it
	if break_t < 1.1:
		var k = clampf(break_t / 0.12, 0.0, 1.0)
		var a = 1.0 - clampf((break_t - 0.8) / 0.3, 0.0, 1.0)
		var c2 = Vector2(W * 0.5, H * 0.4)
		var rng = RandomNumberGenerator.new()
		rng.seed = 7
		for i in 14:
			var ang = rng.randf() * TAU
			var rr = (90 + rng.randf() * 160) * S * k
			draw_circle(c2 + Vector2(cos(ang), sin(ang)) * rr * 0.9, (24 + rng.randf() * 40) * S * k, Color(INK, a))
		draw_circle(c2, 150 * S * k, Color(INK, a))
		var sc2 = 1.6 - 0.6 * k
		draw_set_transform(c2, -0.1, Vector2(sc2, sc2))
		_txt(slam, Vector2(-W * 0.5, 40 * S), "BREAK", int(150 * S), Color(GOLD, a), HORIZONTAL_ALIGNMENT_CENTER, W, int(18 * S))
		draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)

func _draw_cut(S: float, W: float, H: float) -> void:
	var k: float = cut["t"]
	var sec: float = cut["sec"]
	var inn = clampf(k / 0.12, 0.0, 1.0)
	var out = clampf((sec - k) / 0.12, 0.0, 1.0)
	var a = minf(inn, out)
	# the panel: a diagonal band across the screen
	var band = H * 0.62
	var cy = H * 0.5
	var slope = H * 0.22
	var poly = PackedVector2Array([Vector2(0, cy - band * 0.5 + slope), Vector2(W, cy - band * 0.5 - slope), Vector2(W, cy + band * 0.5 - slope), Vector2(0, cy + band * 0.5 + slope)])
	draw_rect(Rect2(0, 0, W, H), Color(0, 0, 0, 0.55 * a))
	draw_colored_polygon(poly, Color(0.55, 0.06, 0.03, a))
	# speed lines
	var rng = RandomNumberGenerator.new()
	rng.seed = int(k * 30.0)
	for i in 40:
		var y = rng.randf_range(cy - band * 0.6, cy + band * 0.6)
		var x = rng.randf_range(-W * 0.2, W)
		var l = rng.randf_range(W * 0.1, W * 0.4)
		var col = Color(0.05, 0.02, 0.02, a) if i % 3 else Color(1.0, 0.7, 0.25, 0.6 * a)
		draw_line(Vector2(x, y + slope * (1.0 - 2.0 * x / W)), Vector2(x + l, y + slope * (1.0 - 2.0 * (x + l) / W)), col, rng.randf_range(2, 7) * S)
	# portrait slides in from the lower right
	var tex: Texture2D = cut["tex"]
	if tex:
		var th = band * 1.25
		var tw = th * tex.get_width() / maxf(1.0, tex.get_height())
		var slide = (1.0 - ease(inn, 0.3)) * W * 0.5 - k * 60 * S
		draw_texture_rect(tex, Rect2(W * 0.5 - tw * 0.35 + slide, cy - th * 0.55 + slide * 0.3, tw, th), false, Color(1, 1, 1, a))
	draw_polyline(PackedVector2Array([poly[0], poly[1]]), Color(GOLD, a), 8 * S)
	draw_polyline(PackedVector2Array([poly[3], poly[2]]), Color(GOLD, a), 8 * S)
	var col2: Color = cut["color"]
	_txt(slam, Vector2(70 * S - (1.0 - inn) * 400 * S, cy + band * 0.32), String(cut["name"]), int(118 * S), Color(col2, a), HORIZONTAL_ALIGNMENT_LEFT, -1, int(16 * S))
	if String(cut["sub"]) != "":
		_txt(body, Vector2(78 * S - (1.0 - inn) * 400 * S, cy + band * 0.32 + 52 * S), String(cut["sub"]), int(34 * S), Color(CREAM, a), HORIZONTAL_ALIGNMENT_LEFT, -1, int(8 * S))

func _draw_game(S: float, W: float, H: float, p) -> void:
	# damage vignette and the still-punish brand
	if hurt_t > 0.0:
		var a = hurt_t / 0.45 * 0.45
		draw_rect(Rect2(0, 0, W, 40 * S), Color(BLOOD, a))
		draw_rect(Rect2(0, H - 40 * S, W, 40 * S), Color(BLOOD, a))
		draw_rect(Rect2(0, 0, 40 * S, H), Color(BLOOD, a))
		draw_rect(Rect2(W - 40 * S, 0, 40 * S, H), Color(BLOOD, a))
	if p.still_t > 1.2:
		_txt(slam, Vector2(0, H * 0.62), "KEEP MOVING", int(54 * S), Color(BLOOD, 0.6 + 0.4 * sin(t * 12.0)), HORIZONTAL_ALIGNMENT_CENTER, W, int(12 * S))
	if p.frozen > 0.0:
		draw_rect(Rect2(0, 0, W, H), Color(0.12, 0.1, 0.1, 0.55))
		var sc = 1.0 + maxf(0.0, 0.25 - (1.1 - p.frozen)) * 3.0
		draw_set_transform(Vector2(W * 0.5, H * 0.45), -0.05, Vector2(sc, sc))
		_txt(slam, Vector2(-W * 0.5, 0), "TIMED OUT", int(170 * S), CREAM, HORIZONTAL_ALIGNMENT_CENTER, W, int(28 * S))
		_txt(body, Vector2(-W * 0.5, 70 * S), "by the Moderator", int(40 * S), GOLD, HORIZONTAL_ALIGNMENT_CENTER, W, int(8 * S))
		draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)
	# crosshair
	var c = Vector2(W * 0.5, H * 0.5)
	var gap = 9.0 * S + p.recoil * 8.0 * S
	var cc = GOLD if p.silenced <= 0.0 else Color(0.5, 0.4, 0.35)
	for d in [Vector2(1, 0), Vector2(-1, 0), Vector2(0, 1), Vector2(0, -1)]:
		draw_line(c + d * gap, c + d * (gap + 12 * S), INK, 6.0 * S)
		draw_line(c + d * gap, c + d * (gap + 12 * S), cc, 3.0 * S)
	if hit_t > 0.0:
		for d2 in [Vector2(1, 1), Vector2(-1, 1), Vector2(1, -1), Vector2(-1, -1)]:
			draw_line(c + d2 * 8 * S, c + d2 * 18 * S, CREAM, 3.0 * S)
	if p.charge > 0.0:
		draw_arc(c, 26 * S, -PI / 2, -PI / 2 + TAU * p.charge / 0.65, 32, EMBER, 4.0 * S)
	# bottom left: health, armor, punch
	var x = 60 * S
	var y = H - 150 * S
	_txt(slam, Vector2(x, y), "%d" % ceil(p.health), int(84 * S), CREAM if p.health > 30 else BLOOD, HORIZONTAL_ALIGNMENT_LEFT, -1, int(14 * S))
	_txt(body, Vector2(x + 150 * S, y - 40 * S), "HEALTH", int(22 * S), GOLD, HORIZONTAL_ALIGNMENT_LEFT, -1, int(6 * S))
	_bar(Rect2(x, y + 18 * S, 380 * S, 22 * S), p.health / p.max_health, BLOOD if pick_t.get("health", 0.0) <= 0.0 else CREAM)
	_bar(Rect2(x, y + 50 * S, 300 * S, 14 * S), p.armor / p.max_armor, Color(0.9, 0.58, 0.3) if pick_t.get("armor", 0.0) <= 0.0 else CREAM)
	_txt(body, Vector2(x + 320 * S, y + 64 * S), "ARMOR %d" % p.armor, int(20 * S), CREAM, HORIZONTAL_ALIGNMENT_LEFT, -1, int(5 * S))
	_txt(body, Vector2(x, y + 104 * S), "PUNCH", int(20 * S), GOLD, HORIZONTAL_ALIGNMENT_LEFT, -1, int(5 * S))
	_pips(Vector2(x + 92 * S, y + 97 * S), 2, p.punch, GOLD, 9 * S)
	_txt(body, Vector2(x + 160 * S, y + 104 * S), "DASH", int(20 * S), GOLD, HORIZONTAL_ALIGNMENT_LEFT, -1, int(5 * S))
	_pips(Vector2(x + 238 * S, y + 97 * S), 2, p.dash_charges, CREAM, 9 * S)
	# bottom right: weapon, ammo, rip fuel, fire burst
	var rx = W - 60 * S
	var w: Dictionary = p.WEAPONS[p.weapon]
	_txt(slam, Vector2(rx - 400 * S, y), "%d" % p.ammo, int(84 * S), CREAM if p.ammo >= w["cost"] * 3 else BLOOD, HORIZONTAL_ALIGNMENT_RIGHT, 400 * S, int(14 * S))
	_txt(body, Vector2(rx - 400 * S, y - 66 * S), w["name"] + ("  ×1.5" if p.swap_boost > 0.0 else ""), int(26 * S), GOLD if p.swap_boost <= 0.0 else EMBER, HORIZONTAL_ALIGNMENT_RIGHT, 400 * S, int(6 * S))
	for i in 3:
		var wx = rx - 300 * S + i * 100 * S
		var on: bool = i == p.weapon
		draw_rect(Rect2(wx, y + 20 * S, 86 * S, 8 * S), GOLD if on else Color(0.35, 0.15, 0.1))
		_txt(body, Vector2(wx, y + 50 * S), ["1 REP", "2 SCAT", "3 LANCE"][i], int(18 * S), CREAM if on else Color(0.7, 0.5, 0.4), HORIZONTAL_ALIGNMENT_LEFT, -1, int(4 * S))
	_txt(body, Vector2(rx - 330 * S, y + 104 * S), "RIP", int(20 * S), EMBER, HORIZONTAL_ALIGNMENT_LEFT, -1, int(5 * S))
	_pips(Vector2(rx - 270 * S, y + 97 * S), 3, p.fuel, EMBER, 9 * S)
	_txt(body, Vector2(rx - 170 * S, y + 104 * S), "BURN", int(20 * S), EMBER, HORIZONTAL_ALIGNMENT_LEFT, -1, int(5 * S))
	_bar(Rect2(rx - 100 * S, y + 90 * S, 90 * S, 14 * S), 1.0 - p.fire_cd / 7.0, EMBER if p.fire_cd <= 0.0 else Color(0.5, 0.2, 0.1))
	if p.silenced > 0.0:
		_txt(slam, Vector2(0, H * 0.5 + 90 * S), "SILENCED", int(44 * S), Color(1, 0.5, 0.3), HORIZONTAL_ALIGNMENT_CENTER, W, int(10 * S))
	# boss bar
	var b = Game.boss
	if b and is_instance_valid(b):
		var bw = 900 * S
		var bx = (W - bw) * 0.5
		_txt(slam, Vector2(bx, 64 * S), b.handle, int(46 * S), GOLD, HORIZONTAL_ALIGNMENT_LEFT, -1, int(10 * S))
		_txt(body, Vector2(bx, 64 * S), b.title.to_upper(), int(24 * S), CREAM, HORIZONTAL_ALIGNMENT_RIGHT, bw, int(6 * S))
		_bar(Rect2(bx, 78 * S, bw, 22 * S), b.hp / b.max_hp, EMBER if not b.is_staggered() else GOLD)
		for k in [0.66, 0.33]:
			draw_line(Vector2(bx + bw * k + 11 * S, 78 * S), Vector2(bx + bw * k, 100 * S), INK, 3.0)
		var wx2 = bx
		for wp in b.weakpoints:
			var col = GOLD if not wp.broken else Color(0.4, 0.25, 0.2)
			_txt(body, Vector2(wx2, 128 * S), ("✕ " if wp.broken else "◆ ") + wp.wp_name, int(19 * S), col, HORIZONTAL_ALIGNMENT_LEFT, -1, int(5 * S))
			wx2 += 300 * S
	# Jev's current decision
	var pl = Game.main.pilot if Game.main else null
	if pl and pl.say != "":
		var src: String = "JEV" if pl.source == "jev" else "AUTO"
		_txt(body, Vector2(0, H - 36 * S), "%s ▸ %s" % [src, pl.say], int(24 * S), CREAM if pl.source == "jev" else Color(0.85, 0.7, 0.6), HORIZONTAL_ALIGNMENT_CENTER, W, int(6 * S))

func _draw_msg(m: Dictionary, S: float, W: float, H: float, i: int) -> void:
	var k: float = m["t"]
	var sc = 1.0 + maxf(0.0, 0.12 - k) * 6.0
	var a = clampf((m["sec"] - k) / 0.25, 0.0, 1.0)
	var y = H * 0.3 + i * 120 * S
	draw_set_transform(Vector2(W * 0.5, y), -0.03, Vector2(sc, sc))
	_txt(slam, Vector2(-W * 0.5, 0), m["text"], int(96 * S), Color(m["color"], a), HORIZONTAL_ALIGNMENT_CENTER, W, int(18 * S))
	if m["sub"] != "":
		_txt(body, Vector2(-W * 0.5, 46 * S), m["sub"], int(30 * S), Color(CREAM, a), HORIZONTAL_ALIGNMENT_CENTER, W, int(7 * S))
	draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)

func _draw_card(S: float, W: float, H: float) -> void:
	var k = card_t
	# freeze-frame wash, then a slammed diagonal band
	draw_rect(Rect2(0, 0, W, H), Color(0.1, 0.02, 0.01, 0.35))
	var slide = clampf(k / 0.14, 0.0, 1.0)
	var bx = lerpf(-W, 0.0, ease(slide, 0.3))
	var top = H * 0.56
	var band = PackedVector2Array([Vector2(bx - 100, top), Vector2(bx + W * 1.1, top - 120 * S), Vector2(bx + W * 1.1, top + 120 * S), Vector2(bx - 100, top + 240 * S)])
	draw_colored_polygon(band, Color(0.62, 0.07, 0.04, 0.94))
	var band2 = PackedVector2Array([Vector2(bx - 100, top + 240 * S), Vector2(bx + W * 1.1, top + 120 * S), Vector2(bx + W * 1.1, top + 134 * S), Vector2(bx - 100, top + 254 * S)])
	draw_colored_polygon(band2, GOLD)
	if k > 0.1:
		var sk = k - 0.1
		var sc = 1.0 + maxf(0.0, 0.1 - sk) * 9.0
		var jitter = Vector2(randf_range(-1, 1), randf_range(-1, 1)) * maxf(0.0, 0.25 - sk) * 30.0 * S
		draw_set_transform(Vector2(W * 0.08, top + 110 * S) + jitter, -0.11, Vector2(sc, sc))
		var hs = int((190 if card["handle"].length() < 10 else 150) * S)
		_txt(slam, Vector2(0, 0), card["handle"], hs, CREAM, HORIZONTAL_ALIGNMENT_LEFT, -1, int(30 * S))
		draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)
	if k > 0.3:
		var tk = clampf((k - 0.3) / 0.12, 0.0, 1.0)
		draw_set_transform(Vector2(W * 0.08 + (1.0 - tk) * 300 * S, top + 190 * S), -0.11, Vector2.ONE)
		_txt(slam, Vector2(0, 0), "— " + String(card["title"]).to_upper(), int(74 * S), GOLD, HORIZONTAL_ALIGNMENT_LEFT, -1, int(14 * S))
		draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)
	if k > 0.45:
		var lbl = "FINAL CHAMPION" if card["final"] else "CHAMPION %d / %d" % [card["n"], card["total"]]
		_txt(body, Vector2(W * 0.08, top - 120 * S), lbl, int(34 * S), GOLD, HORIZONTAL_ALIGNMENT_LEFT, -1, int(8 * S))

func _draw_title(S: float, W: float, H: float) -> void:
	draw_rect(Rect2(0, 0, W, H), Color(0.05, 0.01, 0.0, 0.45))
	var sc = 1.0 + maxf(0.0, 0.15 - t) * 6.0
	draw_set_transform(Vector2(W * 0.5, H * 0.46), 0.0, Vector2(sc, sc))
	_txt(slam, Vector2(-W * 0.5, 0), "ARES", int(300 * S), GOLD, HORIZONTAL_ALIGNMENT_CENTER, W, int(40 * S))
	draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)
	if t > 0.3:
		_txt(body, Vector2(0, H * 0.46 + 70 * S), "HERMES'S SWIFT MESSENGER STORMS THE WAR GOD'S ARENA", int(34 * S), CREAM, HORIZONTAL_ALIGNMENT_CENTER, W, int(8 * S))
	if t > 0.6:
		_txt(body, Vector2(0, H * 0.46 + 120 * S), "14 CHAMPIONS  ·  ONE MESSENGER", int(28 * S), EMBER, HORIZONTAL_ALIGNMENT_CENTER, W, int(7 * S))
	if t > 1.0 and fmod(t, 1.0) < 0.7:
		_txt(body, Vector2(0, H * 0.86), "PRESS ENTER", int(30 * S), CREAM, HORIZONTAL_ALIGNMENT_CENTER, W, int(7 * S))

## Character select: two big illustrated cards; the chosen one slides forward with a gold ink flash.
func _draw_select(S: float, W: float, H: float) -> void:
	draw_rect(Rect2(0, 0, W, H), Color(0.04, 0.01, 0.0, 0.72))
	if card_tex == null:
		card_tex = load("res://assets/art/hero-card.webp")
	_txt(slam, Vector2(0, 130 * S), "CHOOSE YOUR MESSENGER", int(70 * S), GOLD, HORIZONTAL_ALIGNMENT_CENTER, W, int(12 * S))
	var names = {"messenger": ["THE MESSENGER", "laurel, white dress, red cape  ·  +10 health"], "runner": ["THE RUNNER", "auburn ponytail, dagger  ·  faster dash"]}
	var i = 0
	for h in ["messenger", "runner"]:
		var picked: bool = h == sel
		var k = clampf(sel_t / 0.35, 0.0, 1.0) if sel_t >= 0.0 else 0.0
		var cw = 470 * S
		var ch = cw * 683.0 / 600.0
		var cx = W * 0.5 + (i * 2 - 1) * 290 * S
		var sc = 1.0
		if picked:
			sc = 1.06 + 0.12 * k
			cx = lerpf(cx, W * 0.5, k * 0.6)
		elif sel_t >= 0.0:
			sc = 1.0 - 0.15 * k
		var r = Rect2(cx - cw * sc * 0.5, H * 0.52 - ch * sc * 0.5, cw * sc, ch * sc)
		var a = 1.0 if picked or sel_t < 0.0 else 1.0 - k * 0.7
		var tilt = (i * 2 - 1) * 0.04
		draw_set_transform(r.get_center(), tilt, Vector2.ONE)
		var lr = Rect2(-r.size * 0.5, r.size)
		draw_rect(lr.grow(10 * S), Color(INK, a))
		draw_texture_rect(card_tex, lr, false, Color(1, 1, 1, a) if picked else Color(0.6, 0.5, 0.45, a))
		draw_rect(lr.grow(4 * S), Color(GOLD if picked else Color(0.4, 0.2, 0.12), a), false, 5 * S)
		draw_rect(Rect2(lr.position.x, lr.end.y - 120 * S, lr.size.x, 120 * S), Color(INK, 0.82 * a))
		_txt(slam, Vector2(lr.position.x, lr.end.y - 62 * S), names[h][0], int(54 * S), Color(GOLD if picked else CREAM, a), HORIZONTAL_ALIGNMENT_CENTER, lr.size.x, int(10 * S))
		_txt(body, Vector2(lr.position.x, lr.end.y - 22 * S), names[h][1], int(21 * S), Color(CREAM, a), HORIZONTAL_ALIGNMENT_CENTER, lr.size.x, int(5 * S))
		draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)
		i += 1
	if sel_t >= 0.0 and sel_t < 0.5:
		var f = 1.0 - sel_t / 0.5
		draw_rect(Rect2(0, 0, W, H), Color(1.0, 0.8, 0.35, 0.35 * f))
		var rng = RandomNumberGenerator.new()
		rng.seed = 3
		for j in 10:
			var ang = rng.randf() * TAU
			draw_circle(Vector2(W * 0.5, H * 0.52) + Vector2(cos(ang), sin(ang)) * (260 + rng.randf() * 200) * S * (1.0 - f * 0.5), (20 + rng.randf() * 34) * S, Color(INK, f))
	if sel_t >= 0.35:
		_txt(slam, Vector2(0, H - 70 * S), "ENTER THE COLOSSEUM", int(64 * S), GOLD, HORIZONTAL_ALIGNMENT_CENTER, W, int(12 * S))
	elif fmod(t, 1.0) < 0.75:
		_txt(body, Vector2(0, H - 70 * S), "A / D TO CHOOSE  ·  ENTER TO FIGHT", int(28 * S), CREAM, HORIZONTAL_ALIGNMENT_CENTER, W, int(7 * S))

## A story beat: one comic panel (an art crop that slowly pushes in), a caption box and
## an optional title card slammed across it.
func _draw_story(S: float, W: float, H: float) -> void:
	draw_rect(Rect2(0, 0, W, H), Color(0.03, 0.01, 0.0, 1.0))
	if panel.is_empty() or panel_tex == null:
		return
	var focus: Rect2 = panel[1]
	var tint: Color = panel[4]
	var a = clampf(t / 0.25, 0.0, 1.0)
	var zoom = 1.0 + t * 0.025
	var tw = float(panel_tex.get_width())
	var th = float(panel_tex.get_height())
	var src = Rect2(focus.position.x * tw, focus.position.y * th, focus.size.x * tw, focus.size.y * th)
	var c = src.get_center()
	src.size /= zoom
	src.position = c - src.size * 0.5
	# fit the crop inside a tilted panel
	var pr = Rect2(W * 0.08, H * 0.08, W * 0.84, H * 0.7)
	var aspect = src.size.x / maxf(1.0, src.size.y)
	var want = pr.size.x / pr.size.y
	if aspect > want:
		var nh = src.size.x / want
		src.position.y -= (nh - src.size.y) * 0.5
		src.size.y = nh
	else:
		var nw = src.size.y * want
		src.position.x -= (nw - src.size.x) * 0.5
		src.size.x = nw
	draw_set_transform(pr.get_center(), -0.015, Vector2.ONE)
	var lr = Rect2(-pr.size * 0.5, pr.size)
	# a portrait image is narrower than the panel: keep the crop inside the picture and
	# narrow the panel to match, instead of smearing its edge pixels
	var inside: Rect2 = src.intersection(Rect2(0, 0, tw, th))
	if inside.size.x < src.size.x - 0.5 or inside.size.y < src.size.y - 0.5:
		var k = lr.size / src.size
		lr = Rect2(lr.position + (inside.position - src.position) * k, inside.size * k)
		lr.position = -lr.size * 0.5
		src = inside
	draw_rect(lr.grow(14 * S), Color(GOLD, a))
	draw_rect(lr.grow(8 * S), Color(INK, a))
	draw_texture_rect_region(panel_tex, lr, src, Color(tint, a))
	draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)
	var cap = String(panel[2])
	if cap != "":
		var k = clampf((t - 0.3) / 0.3, 0.0, 1.0)
		var box = Rect2(W * 0.14, H * 0.78, W * 0.72, 120 * S)
		draw_rect(box.grow(6 * S), Color(GOLD, k))
		draw_rect(box, Color(CREAM, k))
		draw_multiline_string(body, box.position + Vector2(28 * S, 48 * S), cap, HORIZONTAL_ALIGNMENT_LEFT, box.size.x - 56 * S, int(32 * S), 3, Color(INK, k))
	var title = String(panel[3])
	if title != "" and t > 0.6:
		var k2 = clampf((t - 0.6) / 0.15, 0.0, 1.0)
		var sc = 1.8 - 0.8 * k2
		draw_set_transform(Vector2(W * 0.5, H * 0.45), -0.06, Vector2(sc, sc))
		var col = Color(1.0, 0.3, 0.2) if title.begins_with("ARES ·") else GOLD
		_txt(slam, Vector2(-W * 0.5, 0), title, int((200 if title == "ARES" else 120) * S), Color(col, k2), HORIZONTAL_ALIGNMENT_CENTER, W, int(20 * S))
		draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)

func _draw_credits(S: float, W: float, H: float) -> void:
	draw_rect(Rect2(0, 0, W, H), Color(0.05, 0.01, 0.0, 0.6))
	var lines: Array = Game.main.credits_lines()
	var y = H + 40 * S - t * 70 * S
	for i in lines.size():
		var line: String = lines[i]
		var big = i == 0
		var head = line in ["Hero", "3D models (CC0)", "Engine"] or line.begins_with("Bosses:")
		var fs = int((140 if big else (40 if head else 32)) * S)
		var col = GOLD if big or head else CREAM
		_txt(slam if big or head else body, Vector2(0, y), line, fs, col, HORIZONTAL_ALIGNMENT_CENTER, W, int((24 if big else 8) * S))
		y += (170 if big else 52) * S
