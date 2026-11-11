shader_type spatial;
render_mode unshaded, cull_front, depth_draw_opaque;

// Thick ink outline: an inverted hull drawn behind every cel-shaded mesh.
uniform vec4 ink : source_color = vec4(0.07, 0.025, 0.02, 1.0);
uniform float width = 0.025;
// A box (model space) where the hull is not drawn, e.g. over a painted face.
uniform vec3 hole_lo = vec3(99.0);
uniform vec3 hole_hi = vec3(99.0);

void vertex() {
	float w = width;
	if (all(greaterThan(VERTEX, hole_lo)) && all(lessThan(VERTEX, hole_hi))) {
		w = 0.0;   // the hull sits on the skin, hidden behind it
	}
	VERTEX += NORMAL * w;
}

void fragment() {
	ALBEDO = ink.rgb;
}
