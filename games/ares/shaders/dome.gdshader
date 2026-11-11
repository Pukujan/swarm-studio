shader_type spatial;
render_mode unshaded, blend_mix, cull_back, depth_draw_never, fog_disabled;

// A pet's shield dome: a cel gold shell with a thick ink silhouette and hard bands,
// no soft glow. Hits flash it hot.
uniform vec4 ink : source_color = vec4(0.09, 0.03, 0.025, 1.0);
uniform vec4 gold : source_color = vec4(1.0, 0.72, 0.26, 1.0);
uniform vec4 hot : source_color = vec4(1.0, 0.93, 0.7, 1.0);
uniform vec4 heat : source_color = vec4(0.85, 0.2, 0.06, 1.0);
instance uniform float hit = 0.0;
instance uniform float fade = 1.0;

void fragment() {
	float rim = 1.0 - abs(dot(NORMAL, VIEW));
	vec3 wp = (INV_VIEW_MATRIX * vec4(VERTEX, 1.0)).xyz;
	// slow climbing stripes so the shell reads as a solid object, not a haze
	float stripe = step(0.82, fract(wp.y * 1.6 - TIME * 0.6));
	vec3 c = heat.rgb;
	float a = 0.10 + stripe * 0.22;
	if (rim > 0.55) { c = gold.rgb; a = 0.85; }
	if (rim > 0.72) { c = hot.rgb; a = 0.95; }
	if (rim > 0.86) { c = ink.rgb; a = 1.0; }
	c = mix(c, hot.rgb, hit * step(rim, 0.86));
	a = max(a, hit * 0.6);
	ALBEDO = c;
	ALPHA = a * fade;
}
