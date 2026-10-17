// World uses nearest sampling; glow uses linear sampling on its own texture.
// No scanline distortion: the puzzle text remains readable in the DOM HUD.
export const NIGHT_COMPOSITE = `
precision mediump float;
varying vec2 outTexCoord;
uniform sampler2D uWorld;
uniform sampler2D uGlow;
uniform vec2 uWorldSize;
uniform vec2 uCamera;
uniform vec2 uView;
uniform float uZoom;
uniform float uTime;
uniform float uDamage;
uniform float uEffects;
void main() {
    vec2 screen = vec2(outTexCoord.x, 1.0 - outTexCoord.y);
    vec2 worldPixel = screen * uView / uZoom + uCamera;
    if (worldPixel.x < 0.0 || worldPixel.y < 0.0 || worldPixel.x >= uWorldSize.x || worldPixel.y >= uWorldSize.y) {
        gl_FragColor = vec4(0.035, 0.043, 0.075, 1.0);
        return;
    }
    vec2 pixelUV = (floor(worldPixel) + 0.5) / uWorldSize;
    vec2 glowUV = worldPixel / uWorldSize;
    // RenderTextures have a framebuffer origin at the lower left.
    pixelUV.y = 1.0 - pixelUV.y;
    glowUV.y = 1.0 - glowUV.y;
    vec4 world = texture2D(uWorld, pixelUV);
    vec3 glow = texture2D(uGlow, glowUV).rgb;
    vec3 night = world.rgb * vec3(0.39, 0.46, 0.65);
    float lightStrength = max(glow.r, max(glow.g, glow.b));
    vec3 lit = mix(night, world.rgb * vec3(0.91, 0.87, 0.78), clamp(lightStrength * 1.2, 0.0, 0.88));
    lit += glow * 0.14;
    float edge = smoothstep(0.26, 0.79, distance(screen, vec2(0.5)));
    lit *= 1.0 - edge * 0.34 * uEffects;
    lit += vec3(0.18, 0.035, 0.055) * uDamage * edge;
    float breath = 1.0 + sin(uTime * 0.63) * 0.012 * uEffects;
    gl_FragColor = vec4(lit * breath, 1.0);
}
`;
