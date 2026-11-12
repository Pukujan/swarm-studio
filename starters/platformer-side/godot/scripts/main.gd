extends Node2D
## The Platformer starter's demo: a level, a placeholder hero with the feel built in, and the camera.
## Run with `-- --feel` for the headless feel test (scripts/feel_test.gd).

var hero: PlatformerBody
var cam: LookaheadCamera
var eye: Polygon2D

func _ready() -> void:
	if FeelTest.requested():
		add_child(FeelTest.new())
		return
	RenderingServer.set_default_clear_color(Color(0.09, 0.1, 0.14))
	_keys()
	StarterLevel.build(self)
	hero = PlatformerBody.new()
	hero.position = Vector2(-500, -20)
	var look := Polygon2D.new()       # the placeholder hero, until a painted sprite replaces it
	look.polygon = PackedVector2Array([Vector2(-10, -15), Vector2(10, -15), Vector2(10, 15), Vector2(-10, 15)])
	look.color = Color(0.98, 0.78, 0.3)
	hero.add_child(look)
	eye = Polygon2D.new()
	eye.polygon = PackedVector2Array([Vector2(3, -9), Vector2(7, -9), Vector2(7, -4), Vector2(3, -4)])
	eye.color = Color(0.1, 0.1, 0.12)
	hero.add_child(eye)
	hero.jumped.connect(func(): hero.create_tween().tween_property(look, "scale", Vector2(0.8, 1.2), 0.06).from(Vector2.ONE).finished.connect(func(): look.scale = Vector2.ONE))
	hero.landed.connect(func(): hero.create_tween().tween_property(look, "scale", Vector2.ONE, 0.1).from(Vector2(1.25, 0.8)))
	add_child(hero)
	cam = LookaheadCamera.new()
	cam.target = hero
	add_child(cam)
	cam.make_current()
	var hud := Label.new()
	hud.text = "Arrows or A D to run · Space, W or Up to jump (hold for higher) · Down + jump drops through a ledge"
	hud.position = Vector2(16, 12)
	var layer := CanvasLayer.new()
	layer.add_child(hud)
	add_child(layer)

func _process(_dt: float) -> void:
	if hero:
		eye.scale.x = hero.facing
		if hero.global_position.y > 900:
			hero.global_position = Vector2(-500, -20)
			hero.velocity = Vector2.ZERO

# WASD, Up and W jump too (ui_* are Godot's own)
func _keys() -> void:
	for pair in [["ui_left", KEY_A], ["ui_right", KEY_D], ["ui_down", KEY_S], ["ui_accept", KEY_W], ["ui_accept", KEY_UP]]:
		var e := InputEventKey.new()
		e.keycode = pair[1]
		InputMap.action_add_event(pair[0], e)
