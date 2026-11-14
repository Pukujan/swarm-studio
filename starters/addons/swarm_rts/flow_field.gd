## FlowField: one path map over the whole grid, toward one target. Every unit sent there reads its
## direction from its cell, so 500 units cost one breadth-first search, not 500 path searches.
## Fields are kept for the last few targets (orders to the same cell reuse them).
##
##   var ff := FlowField.new(Vector2i(96, 96), 32.0)    # cells, cell size in pixels
##   ff.set_blocked(Vector2i(10, 4), true)               # rocks, water, buildings
##   var key := ff.prepare(target)                       # Swarm.move() does this
##   ff.direction(key, position)                         # a unit vector, or ZERO at the target
##   ff.blocked_at(position)
class_name FlowField
extends RefCounted

const DIRS: Array[Vector2i] = [Vector2i(1, 0), Vector2i(-1, 0), Vector2i(0, 1), Vector2i(0, -1), Vector2i(1, 1), Vector2i(-1, 1), Vector2i(1, -1), Vector2i(-1, -1)]
const KEEP := 12

var size: Vector2i
var cell: float
var origin := Vector2.ZERO
var blocked := PackedByteArray()
var _vec: Array[Vector2] = []
var _fields := {}            ## target cell -> PackedByteArray (a direction index per cell, 8 = none)
var _used: Array[int] = []   ## target cells, least recently used first
var _dist := PackedInt32Array()
var _queue := PackedInt32Array()

func _init(cells: Vector2i = Vector2i(64, 64), cell_size: float = 32.0) -> void:
	size = cells
	cell = cell_size
	blocked.resize(size.x * size.y)
	_dist.resize(size.x * size.y)
	_queue.resize(size.x * size.y)
	for d in DIRS:
		_vec.append(Vector2(d).normalized())

func cell_of(p: Vector2) -> Vector2i:
	return Vector2i(clampi(int((p.x - origin.x) / cell), 0, size.x - 1), clampi(int((p.y - origin.y) / cell), 0, size.y - 1))

func center_of(c: Vector2i) -> Vector2:
	return origin + (Vector2(c) + Vector2(0.5, 0.5)) * cell

func set_blocked(c: Vector2i, on: bool) -> void:
	if c.x < 0 or c.y < 0 or c.x >= size.x or c.y >= size.y:
		return
	blocked[c.x + c.y * size.x] = 1 if on else 0
	_fields.clear()
	_used.clear()

func blocked_at(p: Vector2) -> bool:
	var x := int((p.x - origin.x) / cell)
	var y := int((p.y - origin.y) / cell)
	if x < 0 or y < 0 or x >= size.x or y >= size.y:
		return true
	return blocked[x + y * size.x] == 1

## the field toward p, made once and kept; returns its key
func prepare(p: Vector2) -> int:
	var c := cell_of(p)
	var key := c.x + c.y * size.x
	if _fields.has(key):
		_used.erase(key)
	else:
		_fields[key] = _build(key)
		if _used.size() >= KEEP:
			_fields.erase(_used.pop_front())
	_used.append(key)
	return key

func direction(key: int, p: Vector2) -> Vector2:
	var f: PackedByteArray = _fields.get(key, PackedByteArray())
	if f.is_empty():
		return Vector2.ZERO
	var x := int((p.x - origin.x) / cell)
	var y := int((p.y - origin.y) / cell)
	if x < 0 or y < 0 or x >= size.x or y >= size.y:
		return Vector2.ZERO
	var d := f[x + y * size.x]
	return Vector2.ZERO if d >= 8 else _vec[d]

# breadth-first from the target over walkable cells, then each cell points at its lowest neighbour
# (a diagonal only when both sides are open, so units never cut a rock's corner)
func _build(target: int) -> PackedByteArray:
	var w := size.x
	var n := size.x * size.y
	_dist.fill(0x3fffffff)
	var out := PackedByteArray()
	out.resize(n)
	out.fill(8)
	var head := 0
	var tail := 0
	_dist[target] = 0
	_queue[tail] = target
	tail += 1
	while head < tail:
		var c := _queue[head]
		head += 1
		var cx := c % w
		var cy := c / w
		var nd := _dist[c] + 1
		for k in 4:
			var d := DIRS[k]
			var x := cx + d.x
			var y := cy + d.y
			if x < 0 or y < 0 or x >= w or y >= size.y:
				continue
			var j := x + y * w
			if blocked[j] == 1 or _dist[j] <= nd:
				continue
			_dist[j] = nd
			_queue[tail] = j
			tail += 1
	for c in n:
		if blocked[c] == 1 or c == target or _dist[c] >= 0x3fffffff:
			continue
		var cx := c % w
		var cy := c / w
		var best := _dist[c]
		var pick := 8
		for k in 8:
			var d := DIRS[k]
			var x := cx + d.x
			var y := cy + d.y
			if x < 0 or y < 0 or x >= w or y >= size.y:
				continue
			var j := x + y * w
			if blocked[j] == 1:
				continue
			if k >= 4 and (blocked[cx + d.x + cy * w] == 1 or blocked[cx + (cy + d.y) * w] == 1):
				continue
			var dj := _dist[j]
			# a diagonal step is worth a little more than one straight step
			if dj < best:
				best = dj
				pick = k
		out[c] = pick
	return out
