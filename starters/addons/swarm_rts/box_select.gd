## BoxSelect: drag a box with the left mouse button (or one finger) to pick your units, click one to pick
## it alone, right-click (or tap with units picked) to send them there. Draws the box and a ring under
## each picked unit. Add it as a child of the world (it works in world coordinates).
##
##   select.swarm = swarm; select.team = 0
##   signals: selected(ids), ordered(ids, target)
class_name BoxSelect
extends Node2D

signal selected(ids: PackedInt32Array)
signal ordered(ids: PackedInt32Array, target: Vector2)

@export var team := 0
@export var box_color := Color(1, 1, 1, 0.9)
var swarm: Swarm
var ids := PackedInt32Array()
var _from := Vector2.ZERO
var _dragging := false
var _moved := false

func _ready() -> void:
	z_index = 50

func _unhandled_input(e: InputEvent) -> void:
	if swarm == null:
		return
	if e is InputEventMouseButton:
		var mb := e as InputEventMouseButton
		if mb.button_index == MOUSE_BUTTON_LEFT:
			if mb.pressed:
				_from = get_global_mouse_position(); _dragging = true; _moved = false
			elif _dragging:
				_dragging = false
				_finish(get_global_mouse_position())
		elif mb.button_index == MOUSE_BUTTON_RIGHT and mb.pressed and not ids.is_empty():
			order(get_global_mouse_position())
	elif e is InputEventMouseMotion and _dragging:
		if get_global_mouse_position().distance_to(_from) > 6.0:
			_moved = true
	elif e is InputEventScreenTouch:
		var st := e as InputEventScreenTouch
		var at := get_canvas_transform().affine_inverse() * st.position
		if st.pressed:
			_from = at; _dragging = true; _moved = false
		elif _dragging:
			_dragging = false
			# a tap with units picked sends them; a drag picks
			if not _moved and not ids.is_empty():
				order(at)
			else:
				_finish(at)
	elif e is InputEventScreenDrag and _dragging:
		_moved = true

func _finish(to: Vector2) -> void:
	if _moved:
		ids = swarm.ids_in_rect(Rect2(_from, to - _from), team)
	else:
		var one := swarm.nearest(to, team, swarm.radius * 3.0)
		ids = PackedInt32Array([one]) if one >= 0 else PackedInt32Array()
	swarm.pick(ids)
	selected.emit(ids)

func order(to: Vector2) -> void:
	var live := PackedInt32Array()
	for i in ids:
		if swarm.is_alive(i):
			live.append(i)
	ids = live
	swarm.pick(ids)
	if ids.is_empty():
		return
	swarm.move(ids, to)
	ordered.emit(ids, to)

## pick these units from code (the rings come with them)
func set_ids(next: PackedInt32Array) -> void:
	ids = next
	if swarm:
		swarm.pick(ids)

func _process(_dt: float) -> void:
	# only the box needs drawing here (the rings are the Swarm's)
	if _dragging or _was_box:
		queue_redraw()
	_was_box = _dragging and _moved

var _was_box := false

func _draw() -> void:
	if _dragging and _moved:
		var m := get_global_mouse_position()
		var box := Rect2(_from, m - _from).abs()
		draw_rect(box, Color(box_color, 0.12), true)
		draw_rect(box, box_color, false, 1.5)
