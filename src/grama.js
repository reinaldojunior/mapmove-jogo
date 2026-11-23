// Grama mais viva sem pesar:
// 1) manchas naturais na cor do gramado (ruído calculado na placa de vídeo, quase sem custo);
// 2) tufos de grama balançando com o vento, só na beira da pista perto do corredor (uma malha instanciada).

import * as THREE from 'three';

// ruído suave (value noise) em GLSL: vizinhos parecidos, ondas sem emenda
const RUIDO_GLSL = /* glsl */ `
float gHash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float gRuido(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(gHash(i), gHash(i + vec2(1.0, 0.0)), u.x), mix(gHash(i + vec2(0.0, 1.0)), gHash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float gCamadas(vec2 p) { return gRuido(p) * 0.55 + gRuido(p * 2.3 + 17.0) * 0.3 + gRuido(p * 5.1 + 41.0) * 0.15; }
`;

// manchas grandes (mais verde / mais seca) e pequenas (variação de tom), presas ao chão do mundo
export function manchasDeGrama(material, forca = 1) {
  material.onBeforeCompile = (sh) => {
    sh.uniforms.uForcaManchas = { value: forca };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vChaoG;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvChaoG = (modelMatrix * vec4(transformed, 1.0)).xz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec2 vChaoG;\nuniform float uForcaManchas;\n${RUIDO_GLSL}`)
      .replace('#include <map_fragment>', `#include <map_fragment>
      {
        float grande = gCamadas(vChaoG * 0.045);
        float fina = gRuido(vChaoG * 0.6);
        vec3 seca = diffuseColor.rgb * vec3(1.13, 1.06, 0.78);
        vec3 verde = diffuseColor.rgb * vec3(0.82, 0.95, 0.78);
        vec3 c = mix(verde, seca, smoothstep(0.35, 0.75, grande));
        c *= 0.93 + fina * 0.14;
        diffuseColor.rgb = mix(diffuseColor.rgb, c, uForcaManchas);
      }`);
  };
  material.customProgramCacheKey = () => 'manchas-grama';
  material.needsUpdate = true;
  return material;
}

// um tufo: algumas folhas finas em volta do centro; "alt" vai de 0 (pé) a 1 (ponta)
function geometriaTufo() {
  const pos = [], alt = [], cor = [];
  const base = new THREE.Color(0x3f7f2c), ponta = new THREE.Color(0x9fd76a);
  const folhas = 7;
  for (let i = 0; i < folhas; i++) {
    const a = (i / folhas) * Math.PI * 2 + Math.random() * 0.6;
    const r = Math.random() * 0.16, h = 0.28 + Math.random() * 0.3, larg = 0.045;
    const cx = Math.cos(a) * r, cz = Math.sin(a) * r;
    const lado = a + Math.PI / 2, dx = Math.cos(lado) * larg, dz = Math.sin(lado) * larg;
    const inc = 0.08 + Math.random() * 0.1; // folha caída para fora
    const tx = cx + Math.cos(a) * inc, tz = cz + Math.sin(a) * inc;
    pos.push(cx - dx, 0, cz - dz, cx + dx, 0, cz + dz, tx, h, tz);
    alt.push(0, 0, 1);
    const p = ponta.clone().offsetHSL(0, 0, (Math.random() - 0.5) * 0.08);
    cor.push(base.r, base.g, base.b, base.r, base.g, base.b, p.r, p.g, p.b);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('alt', new THREE.Float32BufferAttribute(alt, 1));
  g.setAttribute('color', new THREE.Float32BufferAttribute(cor, 3));
  g.computeVertexNormals();
  return g;
}

// relógio do vento, o mesmo para tufos e árvores (atualizado pelos tufos a cada quadro)
export const tempoVento = { value: 0 };

// árvores balançando: quanto mais alto o ponto, mais ele mexe (o pé do tronco fica parado);
// cada árvore tem sua fase, e rajadas lentas passam por todas. Funciona em malha comum e instanciada.
export function balancoDeArvore(material, { altura = 7, forca = 1 } = {}) {
  const antes = material.onBeforeCompile;
  material.onBeforeCompile = (sh, r) => {
    antes?.(sh, r);
    sh.uniforms.uTempo = tempoVento;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTempo;')
      .replace('#include <project_vertex>', `
      vec4 mvPosition = vec4(transformed, 1.0);
      vec4 origemA = vec4(0.0, 0.0, 0.0, 1.0);
      #ifdef USE_INSTANCING
        mvPosition = instanceMatrix * mvPosition;
        origemA = instanceMatrix * origemA;
      #endif
      vec4 mundoA = modelMatrix * mvPosition;
      origemA = modelMatrix * origemA;
      float hA = max(0.0, mundoA.y - origemA.y);
      float wA = pow(clamp(hA / ${altura.toFixed(1)}, 0.0, 1.0), 2.0) * ${forca.toFixed(2)};
      float rajadaA = sin(uTempo * 0.45 + origemA.x * 0.04 + origemA.z * 0.03) * 0.5 + 0.5;
      float ondaA = sin(uTempo * 1.25 + origemA.x * 0.13 + origemA.z * 0.11);
      mundoA.x += ondaA * wA * (0.07 + 0.2 * rajadaA) + sin(uTempo * 3.3 + mundoA.y * 1.9 + origemA.x) * wA * 0.025;
      mundoA.z += ondaA * wA * (0.04 + 0.12 * rajadaA) + cos(uTempo * 2.9 + mundoA.x * 1.3) * wA * 0.025;
      mvPosition = viewMatrix * mundoA;
      gl_Position = projectionMatrix * mvPosition;`);
  };
  const chave = material.customProgramCacheKey?.bind(material);
  material.customProgramCacheKey = () => `arvore-${altura}-${forca}-${chave ? chave() : ''}`;
  material.needsUpdate = true;
  return material;
}

// tufos que acompanham o corredor: cada um tem um "s" (metros do percurso); quem fica para trás vai para a frente
export function criarTufos(maximo) {
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
  const tempo = tempoVento;
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTempo = tempo;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float alt;\nuniform float uTempo;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
      {
        // vento: rajadas que passam pelo gramado (fase muda com a posição do tufo)
        vec4 c = modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        float onda = sin(uTempo * 1.7 + c.x * 0.21 + c.z * 0.17) * 0.5 + 0.5;
        float tremor = sin(uTempo * 6.0 + c.x * 3.1) * 0.25;
        float k = alt * alt * (0.05 + 0.13 * onda + 0.03 * tremor);
        transformed.x += k; transformed.z += k * 0.6;
        transformed.y -= k * 0.25;
      }`);
  };
  mat.customProgramCacheKey = () => 'tufos-grama';
  const malha = new THREE.InstancedMesh(geometriaTufo(), mat, maximo);
  malha.frustumCulled = false;
  malha.castShadow = false; malha.receiveShadow = false;
  malha.count = 0;
  const itens = [];
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), e = new THREE.Vector3(), eixoY = new THREE.Vector3(0, 1, 0);

  // onde(s, d) → { x, y, z, ok }: posição no mundo e se pode ter grama ali
  function colocar(i, s, onde) {
    const it = itens[i];
    it.s = s;
    const r = onde(s, it.d);
    if (r.ok) {
      p.set(r.x, r.y, r.z); q.setFromAxisAngle(eixoY, it.giro); e.setScalar(it.esc);
    } else { p.set(0, -999, 0); e.setScalar(0); }
    m.compose(p, q, e);
    malha.setMatrixAt(i, m);
  }

  return {
    malha,
    // espalha `qtd` tufos de sCorredor-10 até sCorredor+comp, nos dois lados, entre dMin e dMax
    montar(qtd, sCorredor, onde, { comp = 90, dMin = 8, dMax = 12.5 } = {}) {
      malha.count = Math.min(qtd, maximo);
      itens.length = 0;
      this.ciclo = comp + 10;
      for (let i = 0; i < malha.count; i++) {
        const lado = i % 2 ? 1 : -1;
        // mais tufos perto da calçada, menos lá no fundo
        const d = lado * (dMin + (dMax - dMin) * Math.pow(Math.random(), 1.6));
        itens.push({ d, giro: Math.random() * Math.PI * 2, esc: 0.75 + Math.random() * 0.6, s: 0 });
        colocar(i, sCorredor - 10 + Math.random() * this.ciclo, onde);
      }
      malha.instanceMatrix.needsUpdate = true;
    },
    atualizar(sCorredor, t, onde) {
      tempo.value = t;
      let mudou = false;
      for (let i = 0; i < malha.count; i++) {
        if (itens[i].s >= sCorredor - 10) continue;
        colocar(i, itens[i].s + this.ciclo, onde);
        mudou = true;
      }
      if (mudou) malha.instanceMatrix.needsUpdate = true;
    }
  };
}
