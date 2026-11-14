class_name StarterLevel
extends RefCounted
## The starter's level, built in code: solid blocks, one-way ledges and a moving platform.
## Replace it with the game's own (a TileMapLayer, or more calls to these helpers).

const SOLID := Color(0.24, 0.27, 0.34)
const LEDGE := Color(0.62, 0.52, 0.36)

static func block(parent: Node, rect: Rect2, color := SOLID) -> StaticBody2D:
	var b := StaticBody2D.new()
	b.position = rect.get_center()
	var s := CollisionShape2D.new()
	var r := RectangleShape2D.new()
	r.size = rect.size
	s.shape = r
	b.add_child(s)
	var v := Polygon2D.new()
	var h := rect.size / 2.0
	v.polygon = PackedVector2Array([-h, Vector2(h.x, -h.y), h, Vector2(-h.x, h.y)])
	v.color = color
	b.add_child(v)
	parent.add_child(b)
	return b

## a ledge you jump up through from below and drop through with down + jump
static func ledge(parent: Node, rect: Rect2) -> StaticBody2D:
	var b := block(parent, rect, LEDGE)
	b.collision_layer = 0
	b.set_collision_layer_value(PlatformerBody.ONE_WAY_LAYER, true)
	(b.get_child(0) as CollisionShape2D).one_way_collision = true
	return b

static func mover(parent: Node, at: Vector2, travel: Vector2, period := 3.0) -> MovingPlatform:
	var m := MovingPlatform.new()
	m.position = at
	m.travel = travel
	m.period = period
	parent.add_child(m)
	return m

## the demo level: ground with a gap, ledges, a moving platform over a pit, a low ceiling corner
static func build(parent: Node) -> void:
	block(parent, Rect2(-800, 0, 1400, 400))
	block(parent, Rect2(820, 0, 600, 400))
	block(parent, Rect2(1660, 0, 1400, 400))
	ledge(parent, Rect2(-300, -110, 200, 14))
	ledge(parent, Rect2(-60, -210, 180, 14))
	block(parent, Rect2(220, -190, 160, 30))
	mover(parent, Vector2(1480, -40), Vector2(0, -160), 2.5)
	block(parent, Rect2(-800, -900, 40, 900))
	block(parent, Rect2(3020, -900, 40, 900))
