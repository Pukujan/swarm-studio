shader_type sky;

// War-god dusk: near-black overhead into the stage's fire at the horizon (the painted
// backdrop covers the horizon itself; this fills above and between).
uniform vec3 top : source_color = vec3(0.03, 0.01, 0.008);
uniform vec3 mid : source_color = vec3(0.26, 0.07, 0.03);
uniform vec3 horizon : source_color = vec3(0.9, 0.36, 0.08);

void sky() {
	float y = EYEDIR.y;
	vec3 c = mix(mid, top, smoothstep(0.08, 0.7, y));
	c = mix(horizon, c, smoothstep(0.0, 0.2, y));
	c = mix(c, top * 2.0, smoothstep(-0.02, -0.25, y));
	COLOR = c;
}
