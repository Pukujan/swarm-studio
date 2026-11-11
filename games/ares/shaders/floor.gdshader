shader_type spatial;
render_mode diffuse_toon, specular_disabled;

// Arena sand: cel-lit with hard bands, mottled and scorched in world space.
uniform vec4 sand : source_color = vec4(0.55, 0.36, 0.24, 1.0);
uniform vec4 scorch : source_color = vec4(0.16, 0.07, 0.05, 1.0);
uniform vec4 heat : source_color = vec4(1.0, 0.4, 0.1, 1.0);
uniform float heat_amount = 0.0;

varying vec3 wp;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
	vec2 i = floor(p), f = fract(p);
	vec2 u = f * f * (3.0 - 2.0 * f);
	return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}

void vertex() {
	wp = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
}

void fragment() {
	float n = noise(wp.xz * 0.18) * 0.6 + noise(wp.xz * 0.7) * 0.4;
	// posterised: sand reads as painted patches, not gradients
	float band = floor(n * 3.0) / 3.0;
	vec3 c = mix(sand.rgb * 0.82, sand.rgb * 1.08, band);
	float r = length(wp.xz);
	float burn = smoothstep(0.62, 0.7, noise(wp.xz * 0.09 + 7.0)) * smoothstep(8.0, 22.0, r);
	c = mix(c, scorch.rgb, burn * 0.85);
	float crack = step(0.93, noise(wp.xz * 0.35 + 3.0)) * burn;
	ALBEDO = c;
	EMISSION = heat.rgb * crack * heat_amount;
	ROUGHNESS = 1.0;
}

void light() {
	float ndl = dot(NORMAL, LIGHT);
	float lit = smoothstep(0.0, 0.05, ndl) * 0.75 + smoothstep(0.5, 0.55, ndl) * 0.3;
	DIFFUSE_LIGHT += ALBEDO * LIGHT_COLOR * ATTENUATION * lit / PI;
}
