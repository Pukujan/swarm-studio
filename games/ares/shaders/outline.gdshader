shader_type spatial;
render_mode unshaded, cull_front, depth_draw_opaque;

// Thick ink outline: an inverted hull drawn behind every cel-shaded mesh.
uniform vec4 ink : source_color = vec4(0.07, 0.025, 0.02, 1.0);
uniform float width = 0.025;

void vertex() {
	VERTEX += NORMAL * width;
}

void fragment() {
	ALBEDO = ink.rgb;
}
