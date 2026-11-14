## Swarm: every unit of every team in one node, as packed arrays, drawn by one MultiMesh.
## Units are slots in a pool: spawn() reuses a dead slot, kill() frees it, so hundreds of units appear
## and die without allocations. Movement follows a FlowField (one path map per order, shared by the whole
## group), with separation so units spread instead of stacking, and optional melee between teams.
##
##   var id := swarm.spawn(team, position)        # -1 when the pool is full
##   swarm.move(ids, target)                      # order a group; returns the order id
##   swarm.ids_in_rect(rect, team)                # box selection
##   swarm.nearest(position, team, max_dist)      # click selection, targeting
##   swarm.kill(id); swarm.is_alive(id); swarm.position_of(id); swarm.count(team)
##   signals: unit_spawned(id), unit_died(id, team), group_arrived(order)
class_name Swarm
extends Node2D

signal unit_spawned(id: int)
signal unit_died(id: int, team: int)
signal group_arrived(order: int)

@export var max_units := 1024
@export var radius := 9.0                  ## body radius in pixels (separation and the hit range use it)
@export var speed := 90.0                  ## pixels a second
@export var fight := true                  ## units of different teams bite each other when close
@export var damage := 6.0                  ## per bite
@export var bite_every := 0.6              ## seconds between bites
@export var max_hp := 30.0
@export var unit_size := 22.0              ## drawn size in pixels
@export var team_colors: Array[Color] = [Color(0.16, 0.12, 0.10), Color(0.75, 0.18, 0.12), Color(0.2, 0.35, 0.8), Color(0.3, 0.6, 0.25)]
@export var texture: Texture2D             ## one picture for every unit, head pointing right (+x); PlaceholderArt.ant() when empty

var flow: FlowField                        ## set by the game (the map's walkable cells)

# the pool
var pos := PackedVector2Array()
var vel := PackedVector2Array()
var push := PackedVector2Array()           ## separation, computed for half the units each frame
var alive := PackedByteArray()
var team := PackedByteArray()
var hp := PackedFloat32Array()
var cool := PackedFloat32Array()
var order := PackedInt32Array()            ## the order a unit follows, -1 idle
var heading := PackedFloat32Array()
var _free := PackedInt32Array()
var _counts := PackedInt32Array([0, 0, 0, 0])

# orders: target, flow field key, units still walking
var _orders := {}                          ## id -> {to: Vector2, key: int, left: int, n: int}
var _next_order := 0

# spatial hash (cell = 2.5 radius), rebuilt every frame
var _cell := 24.0
var _gw := 1
var _gh := 1
var _head := PackedInt32Array()
var _link := PackedInt32Array()
var _bounds := Rect2(0, 0, 4096, 4096)

var _mm: MultiMesh
var _buf := PackedFloat32Array()
var _rings: MultiMesh
var _rbuf := PackedFloat32Array()
var picked := PackedByteArray()            ## 1 for a unit that wears a selection ring (BoxSelect sets it)
var ring_color := Color(1, 1, 1, 0.85)
var _top := 0                              ## one past the highest slot in use: every loop stops here
var _frame := 0
var last_update_usec := 0                  ## time the last update took (the bench reads it)

func _ready() -> void:
	pos.resize(max_units); vel.resize(max_units); push.resize(max_units)
	alive.resize(max_units); team.resize(max_units); hp.resize(max_units); cool.resize(max_units)
	order.resize(max_units); heading.resize(max_units); _link.resize(max_units); picked.resize(max_units)
	order.fill(-1)
	_free.resize(max_units)
	for i in max_units:
		_free[i] = max_units - 1 - i
	_cell = radius * 2.5
	var mesh := QuadMesh.new()
	mesh.size = Vector2(unit_size, unit_size)
	_mm = MultiMesh.new()
	_mm.transform_format = MultiMesh.TRANSFORM_2D
	_mm.use_colors = true
	_mm.mesh = mesh
	_mm.instance_count = max_units
	_buf.resize(max_units * 12)
	# the selection rings: a second MultiMesh under the units, one draw for all of them
	var ring_mesh := QuadMesh.new()
	ring_mesh.size = Vector2(radius * 3.2, radius * 3.2)
	_rings = MultiMesh.new()
	_rings.transform_format = MultiMesh.TRANSFORM_2D
	_rings.use_colors = true
	_rings.mesh = ring_mesh
	_rings.instance_count = max_units
	_rbuf.resize(max_units * 12)
	var rmi := MultiMeshInstance2D.new()
	rmi.multimesh = _rings
	rmi.texture = PlaceholderArt.ring()
	add_child(rmi)
	var mmi := MultiMeshInstance2D.new()
	mmi.multimesh = _mm
	mmi.texture = texture if texture else PlaceholderArt.ant()
	add_child(mmi)
	set_bounds(_bounds)

## the playable area; units never leave it
func set_bounds(r: Rect2) -> void:
	_bounds = r
	_gw = maxi(1, ceili(r.size.x / _cell))
	_gh = maxi(1, ceili(r.size.y / _cell))
	_head.resize(_gw * _gh)

func spawn(t: int, at: Vector2) -> int:
	if _free.is_empty():
		return -1
	var id := _free[_free.size() - 1]
	_free.resize(_free.size() - 1)
	pos[id] = at; vel[id] = Vector2.ZERO; push[id] = Vector2.ZERO
	alive[id] = 1; team[id] = t; hp[id] = max_hp; cool[id] = randf() * bite_every
	order[id] = -1; heading[id] = randf() * TAU; picked[id] = 0
	_top = maxi(_top, id + 1)
	_counts[t] += 1
	unit_spawned.emit(id)
	return id

func kill(id: int) -> void:
	if id < 0 or id >= max_units or alive[id] == 0:
		return
	alive[id] = 0
	picked[id] = 0
	_leave_order(id)
	for z in 12:
		_buf[id * 12 + z] = 0.0
		_rbuf[id * 12 + z] = 0.0
	_counts[team[id]] -= 1
	_free.append(id)
	unit_died.emit(id, team[id])

func is_alive(id: int) -> bool:
	return id >= 0 and id < max_units and alive[id] == 1

func position_of(id: int) -> Vector2:
	return pos[id]

func count(t: int = -1) -> int:
	if t < 0:
		return max_units - _free.size()
	return _counts[t]

## send units to a point; they share one flow field and stop together around it
func move(ids: PackedInt32Array, to: Vector2) -> int:
	var key := flow.prepare(to) if flow else -1
	var id := _next_order
	_next_order += 1
	var n := 0
	for u in ids:
		if is_alive(u):
			_leave_order(u)
			order[u] = id
			n += 1
	_orders[id] = {"to": to, "key": key, "left": n, "n": n}
	if n == 0:
		_orders.erase(id)
	return id

func ids_in_rect(r: Rect2, t: int = -1) -> PackedInt32Array:
	var out := PackedInt32Array()
	var a := r.abs()
	for i in _top:
		if alive[i] == 1 and (t < 0 or team[i] == t) and a.has_point(pos[i]):
			out.append(i)
	return out

func nearest(p: Vector2, t: int = -1, max_dist: float = 1e9) -> int:
	var best := -1
	var bd := max_dist * max_dist
	for i in _top:
		if alive[i] == 1 and (t < 0 or team[i] == t):
			var d := pos[i].distance_squared_to(p)
			if d < bd:
				bd = d; best = i
	return best

func _leave_order(u: int) -> void:
	var o := order[u]
	order[u] = -1
	if o >= 0 and _orders.has(o):
		_orders[o].left -= 1
		if _orders[o].left <= 0:
			_orders.erase(o)
			group_arrived.emit(o)

func _process(delta: float) -> void:
	var t0 := Time.get_ticks_usec()
	var dt := minf(delta, 0.05)
	_frame += 1
	_rebuild_hash()
	_separate_and_fight(dt)
	_steer(dt)
	_draw_units()
	last_update_usec = Time.get_ticks_usec() - t0

func _rebuild_hash() -> void:
	_head.fill(-1)
	var ox := _bounds.position.x
	var oy := _bounds.position.y
	for i in _top:
		if alive[i] == 0:
			continue
		var c := clampi(int((pos[i].x - ox) / _cell), 0, _gw - 1) + clampi(int((pos[i].y - oy) / _cell), 0, _gh - 1) * _gw
		_link[i] = _head[c]
		_head[c] = i

# half the units each frame: their push away from close neighbours, and a bite on a close enemy
func _separate_and_fight(dt: float) -> void:
	var r2 := radius * 2.0
	var r2sq := r2 * r2
	var bite_sq := (radius * 2.6) * (radius * 2.6)
	var ox := _bounds.position.x
	var oy := _bounds.position.y
	var parity := _frame & 1
	var dead := PackedInt32Array()
	for i in _top:
		if alive[i] == 0:
			continue
		cool[i] -= dt
		if (i & 1) != parity:
			continue
		var p := pos[i]
		var cx := clampi(int((p.x - ox) / _cell), 0, _gw - 1)
		var cy := clampi(int((p.y - oy) / _cell), 0, _gh - 1)
		var acc := Vector2.ZERO
		var seen := 0
		var my := team[i]
		var can_bite := fight and cool[i] <= 0.0
		for gy in range(maxi(cy - 1, 0), mini(cy + 2, _gh)):
			for gx in range(maxi(cx - 1, 0), mini(cx + 2, _gw)):
				var j := _head[gx + gy * _gw]
				while j != -1 and seen < 10:
					if j != i:
						var d := p - pos[j]
						var dsq := d.length_squared()
						if dsq < r2sq:
							seen += 1
							if dsq > 0.0001:
								var dl := sqrt(dsq)
								acc += d / dl * (r2 - dl)
							else:
								acc += Vector2(randf() - 0.5, randf() - 0.5)
						if can_bite and team[j] != my and dsq < bite_sq:
							can_bite = false
							cool[i] = bite_every
							hp[j] -= damage
							if hp[j] <= 0.0:
								dead.append(j)
					j = _link[j]
		push[i] = acc
	for d in dead:
		kill(d)

func _steer(dt: float) -> void:
	var lo := _bounds.position + Vector2(radius, radius)
	var hi := _bounds.end - Vector2(radius, radius)
	for i in _top:
		if alive[i] == 0:
			continue
		var want := Vector2.ZERO
		var o := order[i]
		if o >= 0:
			var ord: Dictionary = _orders.get(o, {})
			if ord.is_empty():
				order[i] = -1
			else:
				var to: Vector2 = ord.to
				var stop := 14.0 + sqrt(float(ord.n)) * radius * 1.3
				if pos[i].distance_squared_to(to) < stop * stop:
					_leave_order(i)
				else:
					var dir := flow.direction(ord.key, pos[i]) if flow and ord.key >= 0 else Vector2.ZERO
					if dir == Vector2.ZERO:
						dir = (to - pos[i]).normalized()
					want = dir * speed
		var v := vel[i].lerp(want + push[i] * 6.0, minf(1.0, dt * 8.0))
		var np := (pos[i] + v * dt).clamp(lo, hi)
		if flow and flow.blocked_at(np):
			var nx := Vector2(np.x, pos[i].y)
			var ny := Vector2(pos[i].x, np.y)
			if not flow.blocked_at(nx):
				np = nx
			elif not flow.blocked_at(ny):
				np = ny
			else:
				np = pos[i]
			v *= 0.5
		vel[i] = v
		pos[i] = np
		if v.length_squared() > 25.0:
			heading[i] = lerp_angle(heading[i], v.angle(), minf(1.0, dt * 10.0))

func _draw_units() -> void:
	var b := _buf
	var rb := _rbuf
	var rc := ring_color
	for i in _top:
		if alive[i] == 0:
			continue
		var k := i * 12
		var c := cos(heading[i])
		var s := sin(heading[i])
		var p := pos[i]
		var col: Color = team_colors[team[i] % team_colors.size()]
		b[k] = c; b[k + 1] = -s; b[k + 2] = 0.0; b[k + 3] = p.x
		b[k + 4] = s; b[k + 5] = c; b[k + 6] = 0.0; b[k + 7] = p.y
		b[k + 8] = col.r; b[k + 9] = col.g; b[k + 10] = col.b; b[k + 11] = col.a
		if picked[i] == 1:
			rb[k] = 1.0; rb[k + 1] = 0.0; rb[k + 2] = 0.0; rb[k + 3] = p.x
			rb[k + 4] = 0.0; rb[k + 5] = 1.0; rb[k + 6] = 0.0; rb[k + 7] = p.y
			rb[k + 8] = rc.r; rb[k + 9] = rc.g; rb[k + 10] = rc.b; rb[k + 11] = rc.a
		elif rb[k] != 0.0:
			for z in 12:
				rb[k + z] = 0.0
	_mm.buffer = b
	_rings.buffer = rb

## put rings under exactly these units
func pick(ids: PackedInt32Array) -> void:
	picked.fill(0)
	for i in ids:
		if is_alive(i):
			picked[i] = 1
