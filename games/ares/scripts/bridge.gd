extends Node
## The Jev bridge: a local TCP line feed. Every 250 ms the game sends its state as one
## JSON line; a client (jev/ares-jev.mjs) answers with {"tactic", "target", "why"}.

const PORT := 47800

var server := TCPServer.new()
var peer: StreamPeerTCP = null
var buf := ""
var last := 0

func _ready() -> void:
	process_mode = Node.PROCESS_MODE_ALWAYS
	var port = int(Game.arg("jev-port", PORT))
	var err = server.listen(port, "127.0.0.1")
	print("JEV bridge on 127.0.0.1:%d %s" % [port, "ok" if err == OK else "failed %d" % err])

func _process(_d: float) -> void:
	if server.is_connection_available():
		peer = server.take_connection()
		print("JEV connected")
	if peer == null:
		return
	peer.poll()
	if peer.get_status() != StreamPeerTCP.STATUS_CONNECTED:
		peer = null
		return
	var n = peer.get_available_bytes()
	if n > 0:
		buf += peer.get_utf8_string(n)
		while buf.find("\n") >= 0:
			var i = buf.find("\n")
			var line = buf.substr(0, i)
			buf = buf.substr(i + 1)
			var cmd = JSON.parse_string(line)
			if typeof(cmd) == TYPE_DICTIONARY and Game.main and Game.main.pilot:
				Game.main.pilot.command(String(cmd.get("tactic", "")), int(cmd.get("target", -1)), String(cmd.get("why", "")), "jev")
	var now = Time.get_ticks_msec()
	if now - last >= 250:
		last = now
		peer.put_data((JSON.stringify(state()) + "\n").to_utf8_buffer())

func _v(v: Vector3) -> Array:
	return [snappedf(v.x, 0.1), snappedf(v.y, 0.1), snappedf(v.z, 0.1)]

func state() -> Dictionary:
	var m = Game.main
	var p = Game.player
	var out = {"t": snappedf(Game.time, 0.01), "state": m.state if m else "", "boss": null, "hero": null, "enemies": [], "projectiles": [], "threats": [], "pickups": {}}
	if p and is_instance_valid(p):
		out["hero"] = {"pos": _v(p.global_position), "health": int(p.health), "armor": int(p.armor), "ammo": int(p.ammo), "fuel": snappedf(p.fuel, 0.1),
			"fire_cd": snappedf(p.fire_cd, 0.1), "punch": p.punch, "dash": snappedf(p.dash_charges, 0.1), "weapon": p.WEAPONS[p.weapon]["name"],
			"frozen": p.frozen > 0.0, "silenced": p.silenced > 0.0, "tactic": m.pilot.tactic if m and m.pilot else ""}
	var b = Game.boss
	if b and is_instance_valid(b) and not b.dead:
		var wps: Array = []
		for w in b.weakpoints:
			if not w.broken:
				wps.append({"id": w.id, "name": w.wp_name, "hp": int(w.hp), "disables": w.disables, "pos": _v(w.global_position)})
		out["boss"] = {"id": b.id, "handle": b.handle, "title": b.title, "hp": int(b.hp), "max": int(b.max_hp), "phase": b.phase, "pos": _v(b.global_position),
			"move": b.move, "staggered": b.is_staggered(), "weakpoints": wps}
	for e in Game.live_enemies():
		out["enemies"].append({"id": e.id, "kind": e.kind if e is Enemy else "clone", "pos": _v(e.global_position), "dist": snappedf(p.global_position.distance_to(e.global_position), 0.1) if p else 0.0,
			"hp": int(e.hp), "staggered": e.is_staggered(), "burning": e.burn_t > 0.0, "shield": e is Enemy and e.shield})
	for s in Game.projectiles.slice(0, 12):
		if is_instance_valid(s["node"]):
			out["projectiles"].append({"kind": s["kind"], "pos": _v(s["node"].global_position)})
	for th in Game.threats:
		out["threats"].append({"kind": th.get("kind"), "pos": _v(th.get("pos")), "radius": th.get("radius"), "t": snappedf(float(th.get("t", 0.0)), 0.05)})
	for pk in Game.pickups:
		out["pickups"][pk["kind"]] = out["pickups"].get(pk["kind"], 0) + 1
	return out
