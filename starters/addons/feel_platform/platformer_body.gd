class_name PlatformerBody
extends CharacterBody2D
## A side-view body that feels right from the first jump: coyote time, a jump buffer, a variable
## jump height (let go early for a short hop), a slower apex, a heavier fall, corner correction
## (slide around a ceiling corner instead of bonking), one-way platforms you drop through with
## down + jump, and riding moving platforms. Jump height and time are in pixels and seconds.

signal jumped
signal landed

const ONE_WAY_LAYER := 3                   ## the physics layer one-way platforms are on

@export var size := Vector2(20, 30)        ## the collision box, when the body has no shape of its own
@export var run_speed := 260.0
@export var ground_accel := 2200.0
@export var ground_decel := 2600.0
@export var air_accel := 1400.0
@export var jump_height := 110.0           ## px at the top of a held jump
@export var jump_time := 0.38              ## s to reach it
@export var fall_gravity_scale := 1.7
@export var cut_gravity_scale := 3.0       ## after jump is let go on the way up
@export var apex_hang := 0.6               ## gravity near the top while jump is held
@export var max_fall := 900.0
@export var coyote := 0.10                 ## s after leaving a ledge a jump still works
@export var buffer := 0.12                 ## s a jump pressed before landing is kept
@export var corner_nudge := 6              ## px slid sideways around a ceiling corner
@export var one_way_layer := ONE_WAY_LAYER
@export var use_input := true              ## false: drive it from code (input_dir, jump_held, press_jump)
@export var action_left := "ui_left"
@export var action_right := "ui_right"
@export var action_jump := "ui_accept"
@export var action_down := "ui_down"

var input_dir := 0.0
var jump_held := false
var facing := 1
var _press := false
var _drop := false
var _coyote_t := 0.0
var _buffer_t := 0.0
var _drop_t := 0.0
var _jumping := false
var _was_floor := false

func _ready() -> void:
	if not get_children().any(func(c): return c is CollisionShape2D):
		var s := CollisionShape2D.new()
		var r := RectangleShape2D.new()
		r.size = size
		s.shape = r
		add_child(s)
	set_collision_mask_value(one_way_layer, true)
	floor_snap_length = 6.0

## press jump from code (AI, tests); hold it with jump_held
func press_jump() -> void:
	_press = true

## drop through the one-way platform under the body
func drop_through() -> void:
	_drop = true

func gravity() -> float:
	return 2.0 * jump_height / (jump_time * jump_time)

func jump_speed() -> float:
	return 2.0 * jump_height / jump_time

func _physics_process(dt: float) -> void:
	if use_input:
		input_dir = Input.get_axis(action_left, action_right)
		jump_held = Input.is_action_pressed(action_jump)
		if Input.is_action_just_pressed(action_jump):
			if Input.is_action_pressed(action_down):
				_drop = true
			else:
				_press = true
	if _drop_t > 0.0:
		_drop_t -= dt
		if _drop_t <= 0.0:
			set_collision_mask_value(one_way_layer, true)
	var on_floor := is_on_floor()
	if on_floor:
		_coyote_t = coyote
		_jumping = false
	else:
		_coyote_t -= dt
	if _press:
		_buffer_t = buffer
		_press = false
	else:
		_buffer_t -= dt
	if _drop:
		_drop = false
		if on_floor and _on_one_way():
			set_collision_mask_value(one_way_layer, false)
			_drop_t = 0.25
			_coyote_t = 0.0
	if _buffer_t > 0.0 and _coyote_t > 0.0:
		velocity.y = -jump_speed()
		_buffer_t = 0.0
		_coyote_t = 0.0
		_jumping = true
		jumped.emit()
	var g := gravity()
	if velocity.y > 0.0:
		g *= fall_gravity_scale
	elif _jumping and not jump_held:
		g *= cut_gravity_scale
	elif _jumping and absf(velocity.y) < 60.0:
		g *= apex_hang
	velocity.y = minf(velocity.y + g * dt, max_fall)
	var target := input_dir * run_speed
	var a := air_accel
	if on_floor:
		a = ground_accel if absf(target) > 0.01 else ground_decel
	velocity.x = move_toward(velocity.x, target, a * dt)
	if input_dir > 0.01:
		facing = 1
	elif input_dir < -0.01:
		facing = -1
	_nudge_corner(dt)
	move_and_slide()
	var now := is_on_floor()
	if now and not _was_floor:
		landed.emit()
	_was_floor = now

func _on_one_way() -> bool:
	for i in get_slide_collision_count():
		var c := get_slide_collision(i).get_collider()
		if c is CollisionObject2D and c.get_collision_layer_value(one_way_layer):
			return true
	return false

# going up into a ceiling corner: slide sideways by the few pixels that clear it
func _nudge_corner(dt: float) -> void:
	if velocity.y >= 0.0 or corner_nudge <= 0:
		return
	var up := Vector2(0.0, velocity.y * dt)
	if not test_move(global_transform, up):
		return
	for k in range(1, corner_nudge + 1):
		for d in [-1, 1]:
			var side := Vector2(d * k, 0.0)
			if not test_move(global_transform, side) and not test_move(global_transform.translated(side), up):
				global_position.x += d * k
				return
