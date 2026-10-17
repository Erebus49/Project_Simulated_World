// Native pixel sampling for the world; a separate, linearly sampled light map.
export const TOWN_COMPOSITE = `
precision mediump float;
varying vec2 outTexCoord;
uniform sampler2D uWorld;
uniform sampler2D uGlow;
uniform vec2 uWorldSize;
uniform vec2 uCamera;
uniform vec2 uView;
uniform float uZoom;
void main(){
 vec2 screen=vec2(outTexCoord.x,1.0-outTexCoord.y);
 vec2 worldPixel=screen*uView/uZoom+uCamera;
 vec2 pixelUV=(floor(worldPixel)+0.5)/uWorldSize;
 vec2 lightUV=worldPixel/uWorldSize;
 pixelUV.y=1.0-pixelUV.y;lightUV.y=1.0-lightUV.y;
 vec3 world=texture2D(uWorld,pixelUV).rgb;
 vec3 light=texture2D(uGlow,lightUV).rgb;
 float amount=clamp(max(light.r,max(light.g,light.b)),0.0,1.0);
 vec3 color=world*vec3(0.78,0.86,0.88);
 color=mix(color,world*vec3(1.06,0.99,0.87),amount*0.67)+light*0.075;
 float edge=smoothstep(0.35,0.82,distance(screen,vec2(0.5)));
 color*=1.0-edge*0.16;
 gl_FragColor=vec4(color,1.0);
}`;
