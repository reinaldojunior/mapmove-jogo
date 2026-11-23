// Céu com shader: degradê do zênite ao horizonte, brilho do sol e nuvens de ruído (Perlin/fbm) que andam com o vento.
// É uma cúpula que acompanha a câmera; não recebe névoa e fica atrás de tudo.

import * as THREE from 'three';
import { tempoVento } from './grama.js';

const VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww; // sempre no fundo
}`;

const FRAG = /* glsl */ `
uniform float uTempo;
uniform vec3 uSol;
uniform vec3 uZenite, uMeio, uHorizonte;
uniform float uCobertura;
varying vec3 vDir;
float h(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float ruido(vec2 p) {
  vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(h(i), h(i + vec2(1, 0)), u.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < OITAVAS; i++) { v += a * ruido(p); p = p * 2.03 + 11.7; a *= 0.5; }
  return v;
}
void main() {
  vec3 d = normalize(vDir);
  float y = max(d.y, 0.0);
  vec3 ceu = mix(uHorizonte, uMeio, smoothstep(0.0, 0.18, y));
  ceu = mix(ceu, uZenite, smoothstep(0.18, 0.75, y));
  float sol = max(dot(d, uSol), 0.0);
  ceu += vec3(1.0, 0.95, 0.8) * (pow(sol, 300.0) * 1.2 + pow(sol, 12.0) * 0.18);
  // nuvens num "teto" plano: projeta a direção no plano das nuvens
  if (d.y > 0.0) {
    vec2 uv = d.xz / (d.y + 0.06) * 0.55 + vec2(uTempo * 0.006, uTempo * 0.002);
    float n = fbm(uv);
    float dens = smoothstep(1.0 - uCobertura, 1.0 - uCobertura + 0.2, n);
    float base = fbm(uv * 1.7 + 3.1); // parte de baixo um pouco mais escura
    vec3 nuvem = mix(vec3(0.78, 0.82, 0.88), vec3(1.0), smoothstep(0.35, 0.75, base));
    nuvem += vec3(1.0, 0.92, 0.75) * pow(sol, 6.0) * 0.25; // borda iluminada perto do sol
    float some = smoothstep(0.0, 0.07, d.y); // somem bem rente ao horizonte, na névoa
    ceu = mix(ceu, nuvem, dens * some * 0.95);
  }
  gl_FragColor = vec4(ceu, 1.0);
  #include <colorspace_fragment>
}`;

export function criarCeu({ oitavas = 5, cobertura = 0.5 } = {}) {
  const c = (hex) => new THREE.Color(hex);
  const mat = new THREE.ShaderMaterial({
    vertexShader: VERT, fragmentShader: FRAG,
    defines: { OITAVAS: oitavas },
    uniforms: {
      uTempo: tempoVento, uSol: { value: new THREE.Vector3(0.4, 0.6, -0.7).normalize() },
      uZenite: { value: c(0x2f86f0) }, uMeio: { value: c(0x8ccaff) }, uHorizonte: { value: c(0xcfe9ff) },
      uCobertura: { value: cobertura }
    },
    side: THREE.BackSide, depthWrite: false, depthTest: false, fog: false
  });
  const ceu = new THREE.Mesh(new THREE.SphereGeometry(500, 32, 16), mat);
  ceu.renderOrder = -1000;
  ceu.frustumCulled = false;
  return ceu;
}
