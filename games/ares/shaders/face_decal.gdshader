shader_type spatial;
render_mode cull_disabled, depth_draw_never, blend_mix, shadows_disabled, specular_disabled;

// A painted face laid on a 3D head: the illustration's face, fitted to the mesh surface,
// faded out in an oval so its skin melts into the model's skin. Lit like the head around it
// (front-biased cel light), and faded away as the head turns from the camera, where the
// model's own painted texture takes over.
uniform sampler2D face : source_color, filter_linear_mipmap;
uniform vec2 oval = vec2(0.4, 0.48);
uniform float feather = 0.35;
instance uniform float flash = 0.0;

void fragment() {
	vec4 t = texture(face, UV);
	vec2 d = (UV - vec2(0.5, 0.52)) / oval;
	float a = 1.0 - smoothstep(1.0 - feather, 1.0, length(d));
	float facing = dot(normalize(NORMAL), normalize(VIEW));
	a *= smoothstep(0.78, 0.9, facing);
	ALBEDO = mix(t.rgb, vec3(1.0, 0.85, 0.5), flash);
	ROUGHNESS = 1.0;
	ALPHA = a * t.a * COLOR.a;
}

void light() {
	// the face is always lit from the front, like the biased toon light on the head
	float ndl = max(dot(NORMAL, LIGHT), dot(NORMAL, VIEW));
	float lit = smoothstep(0.0, 0.05, ndl) * 0.8 + smoothstep(0.55, 0.6, ndl) * 0.25;
	DIFFUSE_LIGHT += ALBEDO * LIGHT_COLOR * ATTENUATION * lit / PI;
}
