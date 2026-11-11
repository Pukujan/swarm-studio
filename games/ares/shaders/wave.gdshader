shader_type spatial;
render_mode unshaded, cull_disabled, shadows_disabled, fog_disabled;

// A boss shockwave as a cel ring: ink edge, hot core band, ink edge. No soft glow.
// Drawn on a flat disc scaled to the wave; `radius` keeps the band width fixed in metres.
instance uniform float radius = 1.0;
uniform vec4 core : source_color = vec4(1.0, 0.82, 0.3, 1.0);
uniform vec4 rim : source_color = vec4(1.0, 0.25, 0.08, 1.0);
uniform vec4 ink : source_color = vec4(0.06, 0.02, 0.015, 1.0);
uniform float width = 0.9;

void fragment() {
	float d = length(UV * 2.0 - 1.0) * radius;   // metres from the centre
	float x = (d - (radius - width)) / width;     // 0..1 across the band
	if (x < 0.0 || x > 1.0) discard;
	vec3 c = ink.rgb;
	if (x > 0.14 && x < 0.86) c = rim.rgb;
	if (x > 0.32 && x < 0.68) c = core.rgb;
	ALBEDO = c;
}
