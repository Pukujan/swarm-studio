shader_type sky;

// War-god dusk: ember red horizon into near-black, with a molten band.
void sky() {
	float y = EYEDIR.y;
	vec3 top = vec3(0.035, 0.012, 0.01);
	vec3 mid = vec3(0.32, 0.07, 0.02);
	vec3 hor = vec3(0.95, 0.38, 0.08);
	vec3 c = mix(mid, top, smoothstep(0.05, 0.6, y));
	c = mix(hor, c, smoothstep(-0.02, 0.12, y));
	c = mix(c, vec3(0.06, 0.02, 0.015), smoothstep(-0.02, -0.25, y));
	float sun = pow(max(dot(EYEDIR, normalize(vec3(0.3, 0.08, -1.0))), 0.0), 64.0);
	COLOR = c + vec3(1.0, 0.6, 0.2) * sun * 1.5;
}
