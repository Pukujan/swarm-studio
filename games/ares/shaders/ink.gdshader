shader_type spatial;
render_mode unshaded, depth_test_disabled, depth_draw_never, cull_disabled, fog_disabled, shadows_disabled, blend_mix;

// Screen-space ink: a full-screen quad that inks silhouettes and creases from the depth
// buffer alone (the Compatibility renderer has no normal buffer). 1/depth is affine across
// a flat face, so its Laplacian is zero there and spikes at edges and folds.
uniform sampler2D depth_tex : hint_depth_texture, filter_nearest;
uniform vec4 ink : source_color = vec4(0.06, 0.02, 0.015, 1.0);
uniform float px = 1.6;
uniform float crease = 0.012;
uniform float far_fade = 140.0;

void vertex() {
	POSITION = vec4(VERTEX.xy, 1.0, 1.0);
}

float inv_depth(vec2 uv, mat4 inv_proj) {
	float d = texture(depth_tex, uv).r;
#if CURRENT_RENDERER == RENDERER_COMPATIBILITY
	vec3 ndc = vec3(uv * 2.0 - 1.0, d * 2.0 - 1.0);
#else
	vec3 ndc = vec3(uv * 2.0 - 1.0, d);
#endif
	vec4 v = inv_proj * vec4(ndc, 1.0);
	return -v.w / v.z;
}

void fragment() {
	vec2 o = px / VIEWPORT_SIZE * (VIEWPORT_SIZE.y / 1080.0);
	float c = inv_depth(SCREEN_UV, INV_PROJECTION_MATRIX);
	float l = inv_depth(SCREEN_UV - vec2(o.x, 0.0), INV_PROJECTION_MATRIX);
	float r = inv_depth(SCREEN_UV + vec2(o.x, 0.0), INV_PROJECTION_MATRIX);
	float u = inv_depth(SCREEN_UV - vec2(0.0, o.y), INV_PROJECTION_MATRIX);
	float d = inv_depth(SCREEN_UV + vec2(0.0, o.y), INV_PROJECTION_MATRIX);
	float lap = abs(l + r - 2.0 * c) + abs(u + d - 2.0 * c);
	float e = smoothstep(crease, crease * 2.2, lap / max(c, 1e-5));
	float dist = 1.0 / max(c, 1e-5);
	e *= 1.0 - smoothstep(far_fade * 0.6, far_fade, dist);
	ALBEDO = ink.rgb;
	ALPHA = e * ink.a;
}
