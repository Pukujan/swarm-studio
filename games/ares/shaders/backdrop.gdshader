shader_type spatial;
render_mode unshaded, cull_disabled, fog_disabled, shadows_disabled;

// A painted burning colosseum wrapped round the arena (strips cut from the ARES site art).
// The top melts into the sky, the bottom into the stage's heat haze.
uniform sampler2D paint : source_color, filter_linear_mipmap, repeat_enable;
uniform float repeats = 3.0;
uniform vec4 tint : source_color = vec4(1.0);
uniform vec4 sky_color : source_color = vec4(0.2, 0.05, 0.03, 1.0);
uniform vec4 haze_color : source_color = vec4(0.5, 0.15, 0.05, 1.0);

void fragment() {
	vec3 c = texture(paint, vec2(UV.x * repeats, UV.y)).rgb;
	// palette guard: no green or blue survives (ivy, sky patches)
	if (c.g > c.r * 1.05 && c.g >= c.b) c = vec3(c.g, c.r * 0.8, c.b * 0.6);
	if (c.b > c.r * 1.05 && c.b > c.g) c = vec3(c.b, c.g, c.r * 0.5);
	c *= tint.rgb;
	c = mix(sky_color.rgb, c, smoothstep(0.0, 0.16, UV.y));
	c = mix(c, haze_color.rgb, smoothstep(0.82, 1.0, UV.y) * 0.85);
	ALBEDO = c;
}
