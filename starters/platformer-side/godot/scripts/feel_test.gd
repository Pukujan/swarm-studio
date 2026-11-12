class_name FeelTest
extends Node2D
## Proves the feel headless, one physics step a frame:
##   godot --headless --fixed-fps 60 --path . -- --feel
## Prints FEEL {json}: the measured jump heights, and whether the coyote time, the buffer, the moving
## platform, the drop-through and the corner correction each worked (and that a late jump does not).

var body: PlatformerBody
var out := {}
var lift: MovingPlatform

static func requested() -> bool:
	return "--feel" in OS.get_cmdline_user_args()

func _ready() -> void:
	StarterLevel.block(self, Rect2(-1000, 0, 1200, 40))                # ground, ledge edge at x = 200
	StarterLevel.block(self, Rect2(200, 300, 2400, 40))                # lower ground
	StarterLevel.ledge(self, Rect2(-700, -100, 200, 12))               # one way
	StarterLevel.block(self, Rect2(-294, -80, 100, 20))                # a ceiling corner 4 px over the body
	lift = StarterLevel.mover(self, Vector2(1200, 200), Vector2(300, 0), 4.0)
	body = PlatformerBody.new()
	body.use_input = false
	add_child(body)
	await _run()
	print("FEEL ", JSON.stringify(out))
	get_tree().quit()

func _frames(n: int) -> void:
	for i in n:
		await get_tree().physics_frame

func _place(p: Vector2) -> void:
	body.global_position = p
	body.velocity = Vector2.ZERO
	body.input_dir = 0.0
	body.jump_held = false
	await _frames(8)

# hold jump for `hold` frames; → the height reached above the start
func _jump(hold: int) -> float:
	var y0 := body.global_position.y
	var top := y0
	body.jump_held = true
	body.press_jump()
	for i in 90:
		if i == hold:
			body.jump_held = false
		await _frames(1)
		top = minf(top, body.global_position.y)
	body.jump_held = false
	return y0 - top

func _run() -> void:
	var jumps := [0]
	body.jumped.connect(func(): jumps[0] += 1)
	# a held jump reaches jump_height; a tap is a short hop
	await _place(Vector2(-150, -16))
	out.full = snappedf(await _jump(999), 0.1)
	await _place(Vector2(-150, -16))
	out.tap = snappedf(await _jump(2), 0.1)
	# coyote: off the ledge, a jump 3 frames late still works; 15 frames late it does not
	for late in [3, 15]:
		await _place(Vector2(170, -16))
		body.input_dir = 1.0
		while body.is_on_floor():
			await _frames(1)
		await _frames(late)
		var before: int = jumps[0]
		body.press_jump()
		await _frames(2)
		out["coyote_%d" % late] = jumps[0] > before
		body.input_dir = 0.0
	# buffer: a jump pressed just before landing happens on landing
	await _place(Vector2(400, 200))
	while body.global_position.y < 300 - 15 - 20:
		await _frames(1)
	var b0: int = jumps[0]
	body.press_jump()
	await _frames(12)
	out.buffer = jumps[0] > b0
	# riding the moving platform
	await _place(lift.global_position + Vector2(0, -8 - 16))
	var x0 := body.global_position.x
	var p0 := lift.global_position.x
	await _frames(60)
	out.lift = snappedf(lift.global_position.x - p0, 0.1)
	out.ride = snappedf(body.global_position.x - x0, 0.1)
	out.ride_on_floor = body.is_on_floor()
	# down + jump drops through a one-way ledge
	await _place(Vector2(-600, -100 - 16))
	out.on_ledge = body.is_on_floor()
	body.drop_through()
	await _frames(20)
	out.dropped = body.global_position.y > -100
	# corner correction: the head clears a corner 4 px over it
	await _place(Vector2(-300, -16))
	out.corner = await _jump(999) > 70.0
