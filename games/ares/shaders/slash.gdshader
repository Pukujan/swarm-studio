shader_type spatial;
render_mode unshaded, cull_disabled, depth_draw_never, blend_mix, fog_disabled, shadows_disabled;

// A blade trail: a crescent between angles a0 and a1 on a flat plane (radius 1 = reach).
// Thick at the leading edge, thin at the tail; hard bands of hot core, gold, red and an
// ink rim. `fade` retracts it from the tail in about 0.15 s. No glow.
uniform vec4 ink : source_color = vec4(0.09, 0.03, 0.025, 1.0);
uniform vec4 red : source_color = vec4(0.86, 0.16, 0.05, 1.0);
uniform vec4 gold : source_color = vec4(1.0, 0.74, 0.26, 1.0);
uniform vec4 hot : source_color = vec4(1.0, 0.96, 0.82, 1.0);
instance uniform float a0 = -1.0;
instance uniform float a1 = 1.0;
instance uniform float fade = 1.0;
instance uniform float width = 0.32;

void fragment() {
	vec2 p = UV * 2.0 - 1.0;
	float r = length(p);
	float a = atan(p.x, -p.y);
	float span = a1 - a0;
	float k = (a - a0) / span;
	if (abs(span) > 6.0) {
		// a full spin: measure from a0 around the circle
		k = fract((a - a0) / 6.2831853 * sign(span));
	}
	if (k < 0.0 || k > 1.0 || k < 1.0 - fade) discard;
	float w = mix(0.03, width, smoothstep(0.0, 1.0, k));
	float inner = 1.0 - w;
	if (r > 1.0 || r < inner) discard;
	float x = (r - inner) / max(w, 0.001);   // 0 inner edge .. 1 outer edge
	vec3 c = red.rgb;
	if (x > 0.25) c = gold.rgb;
	if (x > 0.55) c = hot.rgb;
	if (x > 0.88 || x < 0.08) c = ink.rgb;
	if (k > 0.97) c = ink.rgb;
	ALBEDO = c;
	ALPHA = 1.0;
}
