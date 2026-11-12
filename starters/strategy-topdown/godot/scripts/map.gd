## The map: dirt, rocks the ants walk around, and the nest. Rocks are blocked cells in the FlowField.
## Replace the drawing with painted tiles once they exist; keep the blocked cells in step with them.
class_name StarterMap
extends Node2D

const CELL := 32.0
var cells := Vector2i(96, 96)
var flow: FlowField
var nest := Vector2.ZERO
var rocks: Array[Vector2i] = []

func build(seed_value: int = 7) -> void:
	flow = FlowField.new(cells, CELL)
	nest = Vector2(6, cells.y - 7) * CELL
	var rng := RandomNumberGenerator.new()
	rng.seed = seed_value
	for k in 46:
		var c := Vector2i(rng.randi_range(4, cells.x - 5), rng.randi_range(4, cells.y - 5))
		if Vector2(c).distance_to(nest / CELL) < 10.0:
			continue
		var r := rng.randi_range(1, 3)
		for y in range(-r, r + 1):
			for x in range(-r, r + 1):
				if x * x + y * y <= r * r:
					var cc := c + Vector2i(x, y)
					flow.set_blocked(cc, true)
					rocks.append(cc)
	queue_redraw()

func rect() -> Rect2:
	return Rect2(Vector2.ZERO, Vector2(cells) * CELL)

func _draw() -> void:
	draw_rect(rect(), Color(0.55, 0.42, 0.28))
	for c in rocks:
		draw_rect(Rect2(Vector2(c) * CELL, Vector2(CELL, CELL)), Color(0.38, 0.36, 0.34))
	draw_circle(nest, 70.0, Color(0.33, 0.22, 0.13))
	draw_circle(nest, 26.0, Color(0.12, 0.08, 0.05))
