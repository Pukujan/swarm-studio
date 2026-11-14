## RtsCamera: pan with the screen edges, the arrow keys or WASD, or by dragging with the middle button;
## zoom with the wheel (or a pinch). Never leaves the map.
##
##   camera.bounds = Rect2(Vector2.ZERO, map_size)
class_name RtsCamera
extends Camera2D

@export var pan_speed := 900.0
@export var edge := 18.0                 ## pixels from the window edge that pan
@export var edge_pan := true
@export var zoom_min := 0.35
@export var zoom_max := 2.0
@export var bounds := Rect2(0, 0, 4096, 4096)
var _drag := false

func _ready() -> void:
	make_current()

func _process(dt: float) -> void:
	var dir := Vector2(
		Input.get_axis("ui_left", "ui_right") + (1.0 if Input.is_physical_key_pressed(KEY_D) else 0.0) - (1.0 if Input.is_physical_key_pressed(KEY_A) else 0.0),
		Input.get_axis("ui_up", "ui_down") + (1.0 if Input.is_physical_key_pressed(KEY_S) else 0.0) - (1.0 if Input.is_physical_key_pressed(KEY_W) else 0.0))
	if edge_pan and DisplayServer.window_is_focused():
		var m := get_viewport().get_mouse_position()
		var s := get_viewport_rect().size
		if Rect2(Vector2.ZERO, s).has_point(m):
			if m.x < edge: dir.x -= 1.0
			elif m.x > s.x - edge: dir.x += 1.0
			if m.y < edge: dir.y -= 1.0
			elif m.y > s.y - edge: dir.y += 1.0
	if dir != Vector2.ZERO:
		position += dir.limit_length(1.0) * pan_speed * dt / zoom.x
	_clamp()

func _unhandled_input(e: InputEvent) -> void:
	if e is InputEventMouseButton:
		var mb := e as InputEventMouseButton
		if mb.button_index == MOUSE_BUTTON_WHEEL_UP and mb.pressed: _zoom_by(1.12)
		elif mb.button_index == MOUSE_BUTTON_WHEEL_DOWN and mb.pressed: _zoom_by(1.0 / 1.12)
		elif mb.button_index == MOUSE_BUTTON_MIDDLE: _drag = mb.pressed
	elif e is InputEventMouseMotion and _drag:
		position -= (e as InputEventMouseMotion).relative / zoom.x
	elif e is InputEventMagnifyGesture:
		_zoom_by((e as InputEventMagnifyGesture).factor)
	elif e is InputEventPanGesture:
		position += (e as InputEventPanGesture).delta * 8.0 / zoom.x

func _zoom_by(f: float) -> void:
	var z := clampf(zoom.x * f, zoom_min, zoom_max)
	zoom = Vector2(z, z)

func _clamp() -> void:
	var half := get_viewport_rect().size * 0.5 / zoom.x
	var lo := bounds.position + half
	var hi := bounds.end - half
	position.x = clampf(position.x, minf(lo.x, hi.x), maxf(lo.x, hi.x)) if lo.x <= hi.x else bounds.get_center().x
	position.y = clampf(position.y, minf(lo.y, hi.y), maxf(lo.y, hi.y)) if lo.y <= hi.y else bounds.get_center().y
