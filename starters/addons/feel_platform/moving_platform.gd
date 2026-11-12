class_name MovingPlatform
extends AnimatableBody2D
## A platform that eases back and forth along `travel`; a PlatformerBody standing on it rides along.

@export var travel := Vector2(200, 0)
@export var period := 3.0                  ## s for one way
@export var size := Vector2(128, 16)
@export var color := Color(0.55, 0.6, 0.7)
var _from := Vector2.ZERO
var _t := 0.0

func _ready() -> void:
	_from = position
	var s := CollisionShape2D.new()
	var r := RectangleShape2D.new()
	r.size = size
	s.shape = r
	add_child(s)

func _physics_process(dt: float) -> void:
	_t += dt
	position = _from + travel * ((1.0 - cos(_t / period * PI)) * 0.5)

func _draw() -> void:
	draw_rect(Rect2(-size / 2.0, size), color)
