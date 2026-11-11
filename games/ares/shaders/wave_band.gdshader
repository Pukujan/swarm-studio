shader_type spatial;
render_mode unshaded, cull_disabled, shadows_disabled, fog_disabled;

// The standing edge of a shockwave: a short wall in hard bands, inked top and bottom.
uniform vec4 core : source_color = vec4(1.0, 0.82, 0.3, 1.0);
uniform vec4 rim : source_color = vec4(1.0, 0.25, 0.08, 1.0);
uniform vec4 ink : source_color = vec4(0.06, 0.02, 0.015, 1.0);

void fragment() {
	float y = UV.y;
	vec3 c = ink.rgb;
	if (y > 0.12 && y < 0.88) c = rim.rgb;
	if (y > 0.3 && y < 0.62) c = core.rgb;
	ALBEDO = c;
}
