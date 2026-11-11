shader_type spatial;
render_mode diffuse_toon, specular_disabled;

// One cel shader for every pack, so KayKit, primitives and props read as one anime style.
uniform sampler2D albedo_tex : source_color, filter_linear_mipmap;
uniform float use_tex = 1.0;
uniform vec4 base_color : source_color = vec4(1.0);
uniform vec4 emit_color : source_color = vec4(0.0, 0.0, 0.0, 1.0);
uniform float emit_strength = 0.0;
instance uniform vec4 tint : source_color = vec4(1.0);
instance uniform float flash = 0.0;
instance uniform vec4 flash_color : source_color = vec4(1.0, 0.78, 0.25, 1.0);
instance uniform float fade = 1.0;
// Faces: above face_y (model space) the light is pulled toward the camera, so a face is
// lit from the front and never splits into a half-dark cel band. Off by default.
uniform float face_y = 99.0;
uniform float face_bias = 0.0;
varying float model_y;

void vertex() {
	model_y = VERTEX.y;
}

void fragment() {
	vec3 tex = mix(vec3(1.0), texture(albedo_tex, UV).rgb, use_tex);
	// Palette guard: texture colours that are green or blue dominant (KayKit hoods, gems)
	// are swung to red and bronze, so nothing on screen leaves the fiery palette.
	if (tex.g > tex.r * 1.08 && tex.g >= tex.b) {
		tex = vec3(tex.g, tex.r * 0.8 + tex.b * 0.2, tex.b * 0.6);
	} else if (tex.b > tex.r * 1.08 && tex.b > tex.g) {
		tex = vec3(tex.b, tex.g * 0.9 + tex.r * 0.1, tex.r * 0.5);
	}
	vec3 c = tex * base_color.rgb * tint.rgb;
	ALBEDO = mix(c, flash_color.rgb, clamp(flash, 0.0, 1.0));
	EMISSION = emit_color.rgb * emit_strength + flash_color.rgb * flash * 1.4;
	ROUGHNESS = 1.0;
	if (fade < 0.999) {
		ALPHA = fade;
	}
}

void light() {
	float ndl = dot(NORMAL, LIGHT);
	if (model_y > face_y) {
		ndl = mix(ndl, max(ndl, dot(NORMAL, VIEW)), face_bias);
	}
	float lit = smoothstep(0.0, 0.05, ndl) * 0.8 + smoothstep(0.55, 0.6, ndl) * 0.25;
	DIFFUSE_LIGHT += ALBEDO * LIGHT_COLOR * ATTENUATION * lit / PI;
	float rim = smoothstep(0.62, 0.66, 1.0 - dot(NORMAL, VIEW)) * smoothstep(0.0, 0.2, ndl);
	DIFFUSE_LIGHT += LIGHT_COLOR * ATTENUATION * rim * 0.12;
}
