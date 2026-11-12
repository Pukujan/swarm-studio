## FogOfWar: the map stays dark where your units have not been, and dims where they were but are not
## now. One small picture over the map (a cell per fog cell), updated a few times a second.
##
##   fog.setup(swarm, team, map_rect)        # then add it above the map, below the HUD
##   fog.visible_at(position)                # e.g. to hide enemies in the dark
class_name FogOfWar
extends Sprite2D

@export var fog_cell := 48.0
@export var sight := 4                   ## cells a unit sees around it
@export var spread := 8                  ## frames one refresh is spread over
@export var unseen := 235                ## alpha of never-seen cells (0..255)
@export var seen := 120                  ## alpha of explored cells out of sight
var swarm: Swarm
var team := 0
var _w := 1
var _h := 1
var _origin := Vector2.ZERO
var _explored := PackedByteArray()
var _now := PackedByteArray()
var _px := PackedByteArray()
var _stamp := PackedVector2Array()
var _img: Image
var _tex: ImageTexture
var _acc := PackedByteArray()            ## this refresh's cells in sight, filled a slice of units a frame
var _mark := PackedInt32Array()          ## the refresh a cell was last stamped in (stamp each cell once)
var _pass := 1
var _slice := 0

func setup(s: Swarm, t: int, map: Rect2) -> void:
	swarm = s; team = t; _origin = map.position
	_w = ceili(map.size.x / fog_cell); _h = ceili(map.size.y / fog_cell)
	_explored.resize(_w * _h); _now.resize(_w * _h); _acc.resize(_w * _h); _mark.resize(_w * _h); _px.resize(_w * _h * 2)
	for y in range(-sight, sight + 1):
		for x in range(-sight, sight + 1):
			if x * x + y * y <= sight * sight:
				_stamp.append(Vector2(x, y))
	_img = Image.create(_w, _h, false, Image.FORMAT_LA8)
	_tex = ImageTexture.create_from_image(_img)
	texture = _tex
	centered = false
	position = _origin
	scale = Vector2(fog_cell, fog_cell)
	texture_filter = CanvasItem.TEXTURE_FILTER_LINEAR
	z_index = 40
	for k in spread:
		_stamp_slice()
	_publish()

func visible_at(p: Vector2) -> bool:
	var x := int((p.x - _origin.x) / fog_cell)
	var y := int((p.y - _origin.y) / fog_cell)
	return x >= 0 and y >= 0 and x < _w and y < _h and _now[x + y * _w] == 1

func _process(_dt: float) -> void:
	if swarm == null:
		return
	_stamp_slice()
	if _slice == 0:
		_publish()

# one slice of the units each frame: the cells each sees go into _acc
func _stamp_slice() -> void:
	var top := swarm._top
	var per := ceili(float(top) / spread)
	var from := _slice * per
	var to := mini(top, from + per)
	_slice = (_slice + 1) % spread
	var ox := _origin.x
	var oy := _origin.y
	var w := _w
	var h := _h
	for i in range(from, to):
		if swarm.alive[i] == 0 or swarm.team[i] != team:
			continue
		var cx := int((swarm.pos[i].x - ox) / fog_cell)
		var cy := int((swarm.pos[i].y - oy) / fog_cell)
		if cx < 0 or cy < 0 or cx >= w or cy >= h or _mark[cx + cy * w] == _pass:
			continue
		_mark[cx + cy * w] = _pass
		for s in _stamp:
			var x := cx + int(s.x)
			var y := cy + int(s.y)
			if x >= 0 and y >= 0 and x < w and y < h:
				_acc[x + y * w] = 1

# the refresh is complete: what is in sight now, what was explored, into the picture
func _publish() -> void:
	var a := _acc
	_acc = _now
	_now = a
	_acc.fill(0)
	_pass += 1
	for c in _w * _h:
		var on := _now[c]
		if on == 1:
			_explored[c] = 1
		_px[c * 2 + 1] = 0 if on == 1 else (seen if _explored[c] == 1 else unseen)
	_img.set_data(_w, _h, false, Image.FORMAT_LA8, _px)
	_tex.update(_img)
