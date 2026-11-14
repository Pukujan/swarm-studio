class_name LookaheadCamera
extends Camera2D
## A side-view camera: looks ahead where the target faces, and holds its height while the target is
## in the air (so a jump does not shake the screen), catching up when it lands or falls far.

@export var target: Node2D
@export var lookahead := 90.0
@export var ahead_speed := 3.0
@export var catch_up := 6.0
@export var fall_far := 120.0
var _ahead := 0.0
var _y := 0.0

func _ready() -> void:
	if target:
		_y = target.global_position.y
		global_position = target.global_position

func _process(dt: float) -> void:
	if target == null:
		return
	var f := 0.0
	if target is PlatformerBody:
		f = float(target.facing)
	_ahead = lerpf(_ahead, f * lookahead, 1.0 - exp(-ahead_speed * dt))
	var p := target.global_position
	var grounded: bool = target is CharacterBody2D and target.is_on_floor()
	if grounded or p.y - _y > fall_far or _y - p.y > fall_far * 2.0:
		_y = lerpf(_y, p.y, 1.0 - exp(-catch_up * dt))
	global_position = Vector2(p.x + _ahead, _y)
