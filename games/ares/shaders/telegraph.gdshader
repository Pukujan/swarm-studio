shader_type spatial;
render_mode unshaded, cull_disabled, blend_add, depth_draw_never, shadows_disabled;

// Boss telegraphs on the floor: a hot ring that fills toward impact.
uniform vec4 color : source_color = vec4(1.0, 0.35, 0.08, 1.0);
instance uniform float progress = 0.0;
uniform float ring = 0.08;

void fragment() {
	vec2 p = UV * 2.0 - 1.0;
	float d = length(p);
	float edge = smoothstep(1.0, 1.0 - ring, d) * smoothstep(1.0 - ring * 2.5, 1.0 - ring, d);
	float fill = step(d, progress) * 0.35;
	float stripes = 0.12 * step(0.5, fract((p.x + p.y) * 6.0 + TIME * 2.0));
	float a = (edge + fill + stripes * step(d, 1.0)) * step(d, 1.0);
	ALBEDO = color.rgb * a * 2.0;
	ALPHA = a;
}
