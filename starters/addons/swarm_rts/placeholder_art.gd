## PlaceholderArt: units drawn in code, so a starter shows ants moving before any art is painted.
## White shapes, tinted per team by the Swarm. The painted sprite replaces it (Swarm.texture).
class_name PlaceholderArt
extends RefCounted

static var _ant: ImageTexture

## a top-down ant, head to the right, 32 x 32
static func ant() -> ImageTexture:
	if _ant:
		return _ant
	var img := Image.create(32, 32, false, Image.FORMAT_RGBA8)
	img.fill(Color(0, 0, 0, 0))
	var w := Color(1, 1, 1, 1)
	# legs: three a side
	for k in 3:
		var x := 11 + k * 5
		_line(img, Vector2(x, 16), Vector2(x - 3 + k * 2, 5), w)
		_line(img, Vector2(x, 16), Vector2(x - 3 + k * 2, 27), w)
	_ellipse(img, Vector2(8, 16), Vector2(7, 5.5), w)    # abdomen
	_ellipse(img, Vector2(16, 16), Vector2(4, 3), w)     # thorax
	_ellipse(img, Vector2(23, 16), Vector2(4, 4), w)     # head
	_line(img, Vector2(25, 14), Vector2(30, 9), w)       # antennae
	_line(img, Vector2(25, 18), Vector2(30, 23), w)
	_ant = ImageTexture.create_from_image(img)
	return _ant

static var _ring: ImageTexture

## a thin white ring, 32 x 32, for the selection marks
static func ring() -> ImageTexture:
	if _ring:
		return _ring
	var img := Image.create(32, 32, false, Image.FORMAT_RGBA8)
	img.fill(Color(0, 0, 0, 0))
	for y in 32:
		for x in 32:
			var d := Vector2(x - 15.5, y - 15.5).length()
			var a := clampf(1.5 - absf(d - 13.5), 0.0, 1.0)
			if a > 0.0:
				img.set_pixel(x, y, Color(1, 1, 1, a))
	_ring = ImageTexture.create_from_image(img)
	return _ring

static func _ellipse(img: Image, c: Vector2, r: Vector2, col: Color) -> void:
	for y in range(int(c.y - r.y), int(c.y + r.y) + 1):
		for x in range(int(c.x - r.x), int(c.x + r.x) + 1):
			var d := Vector2((x - c.x) / r.x, (y - c.y) / r.y)
			if d.length_squared() <= 1.0 and x >= 0 and y >= 0 and x < img.get_width() and y < img.get_height():
				img.set_pixel(x, y, col)

static func _line(img: Image, a: Vector2, b: Vector2, col: Color) -> void:
	var n := int(a.distance_to(b)) + 1
	for k in n + 1:
		var p := a.lerp(b, float(k) / n)
		if p.x >= 0 and p.y >= 0 and p.x < img.get_width() and p.y < img.get_height():
			img.set_pixel(int(p.x), int(p.y), col)
