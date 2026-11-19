import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import './style.css';
import {
  FAIXAS, PULO, M_POR_UNIDADE, HIDRATACAO_A_CADA_M, colide, coleta,
  velocidade, desidratar, hidratar, formatarPace, formatarKm, bpm
} from './regras.js';

const $ = (s) => document.querySelector(s);
const palco = $('#palco');

// ─── RENDER ───────────────────────────────────────────────────────────────────

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
palco.prepend(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xcfe9ff, 70, 175);
const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 500);
const CAM_BASE = new THREE.Vector3(0, 4.3, 7.6);
camera.position.copy(CAM_BASE);

scene.add(new THREE.HemisphereLight(0xffffff, 0x7fa86a, 1.7));
const sol = new THREE.DirectionalLight(0xfff4e0, 2.3);
sol.position.set(-6, 14, 8);
scene.add(sol);

function redimensionar() {
  const w = palco.clientWidth, h = palco.clientHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', redimensionar);

// ─── TEXTURAS DESENHADAS EM CANVAS ────────────────────────────────────────────

function textura(w, h, desenhar, repeticao = [1, 1]) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  desenhar(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(...repeticao);
  t.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return t;
}

function texTexto(txt, { w = 512, h = 128, fundo = '#1e88ff', cor = '#fff', tam = 72, borda } = {}) {
  return textura(w, h, (g) => {
    g.fillStyle = fundo; g.fillRect(0, 0, w, h);
    if (borda) { g.strokeStyle = borda; g.lineWidth = 10; g.strokeRect(5, 5, w - 10, h - 10); }
    g.fillStyle = cor;
    g.font = `800 ${tam}px "Baloo 2", system-ui, sans-serif`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(txt, w / 2, h / 2 + 4);
  });
}

scene.background = textura(16, 256, (g, w, h) => {
  const gr = g.createLinearGradient(0, 0, 0, h);
  gr.addColorStop(0, '#3d9bff'); gr.addColorStop(0.6, '#9fd6ff'); gr.addColorStop(1, '#e6f6ff');
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
});

const texAsfalto = textura(512, 512, (g, w, h) => {
  g.fillStyle = '#5a5e66'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 2600; i++) {
    const c = 80 + Math.random() * 40;
    g.fillStyle = `rgba(${c},${c},${c + 6},0.5)`;
    g.fillRect(Math.random() * w, Math.random() * h, 2, 2);
  }
  // pista de 8 unidades: divisas das faixas em x = ±1,1 e bordas em ±3,4
  const px = (x) => ((x + 4) / 8) * w;
  g.fillStyle = '#1e88ff';
  for (const x of [-3.4, 3.4]) g.fillRect(px(x) - 7, 0, 14, h);
  for (const x of [-1.1, 1.1]) for (let y = 0; y < h; y += 128) g.fillRect(px(x) - 6, y + 10, 12, 80);
}, [1, 30]);

const texCalcada = textura(256, 256, (g, w, h) => {
  g.fillStyle = '#d9d4c7'; g.fillRect(0, 0, w, h);
  g.strokeStyle = '#2b2b2b';
  g.lineWidth = 14;
  // calçadão em ondas, como em Copacabana
  for (let y = -64; y < h + 64; y += 64) {
    g.beginPath();
    for (let x = 0; x <= w; x += 8) g.lineTo(x, y + Math.sin((x / w) * Math.PI * 2) * 20);
    g.stroke();
  }
}, [1, 40]);

const texGrama = textura(128, 128, (g, w, h) => {
  g.fillStyle = '#5fb04a'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 500; i++) {
    g.fillStyle = Math.random() < 0.5 ? '#4f9e3d' : '#6cc055';
    g.fillRect(Math.random() * w, Math.random() * h, 3, 5);
  }
}, [6, 60]);

const texJanelas = textura(128, 256, (g, w, h) => {
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h);
  g.fillStyle = 'rgba(40,70,110,0.55)';
  for (let y = 12; y < h; y += 32) for (let x = 10; x < w; x += 30) g.fillRect(x, y, 18, 20);
});

const texListras = textura(256, 64, (g, w, h) => {
  g.fillStyle = '#fff'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#ff6a00';
  for (let x = -h; x < w + h; x += 64) {
    g.beginPath(); g.moveTo(x, 0); g.lineTo(x + 32, 0); g.lineTo(x + 32 - h, h); g.lineTo(x - h, h); g.fill();
  }
});

const texFaixaPedestre = textura(256, 64, (g, w, h) => {
  g.clearRect(0, 0, w, h);
  g.fillStyle = 'rgba(255,255,255,0.92)';
  for (let x = 6; x < w; x += 32) g.fillRect(x, 0, 18, h);
});

const texPlaca = texTexto('CORRIDA DE RUA', { w: 512, h: 96, fundo: '#1356c9', cor: '#ffd21f', tam: 58 });
const texNumero = texTexto('1273', { w: 256, h: 192, fundo: '#ffffff', cor: '#111', tam: 96, borda: '#1e88ff' });
const texHidratacao = texTexto('💧 HIDRATAÇÃO', { w: 512, h: 128, fundo: '#1e88ff', cor: '#fff', tam: 64 });

// ─── MATERIAIS E GEOMETRIAS COMPARTILHADAS ────────────────────────────────────

const matCache = new Map();
const mat = (cor, extra = {}) => {
  const k = cor + JSON.stringify(extra);
  if (!matCache.has(k)) matCache.set(k, new THREE.MeshStandardMaterial({ color: cor, roughness: 0.75, ...extra }));
  return matCache.get(k);
};
const malha = (geo, m, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); return o; };

const G = {
  caixa: new THREE.BoxGeometry(1, 1, 1),
  esfera: new THREE.SphereGeometry(1, 20, 14),
  cilindro: new THREE.CylinderGeometry(1, 1, 1, 18),
  capsula: new THREE.CapsuleGeometry(0.5, 1, 6, 12),
  cone: new THREE.ConeGeometry(1, 1, 18),
  roda: new THREE.TorusGeometry(0.42, 0.06, 8, 24),
  moeda: new THREE.CylinderGeometry(0.42, 0.42, 0.1, 24)
};
const PELES = [0xf1c27d, 0xe0ac69, 0xc68642, 0x8d5524, 0x5c3a1e];
const CAMISAS = [0xff4d4d, 0x1e88ff, 0x2ecc71, 0xffd21f, 0xff8c1a, 0xb05cff, 0xffffff, 0x14b8a6];
const escolher = (arr) => arr[Math.floor(Math.random() * arr.length)];

// ─── CORREDOR ─────────────────────────────────────────────────────────────────

function membro(comp, raio, m) {
  const piv = new THREE.Group();
  const o = malha(G.capsula, m, 0, -comp / 2, 0);
  o.scale.set(raio * 2, comp / 2, raio * 2);
  piv.add(o);
  return piv;
}

function criarCorredor() {
  const g = new THREE.Group();
  const pele = mat(0xc68642), camisa = mat(0xf2d600), detalhe = mat(0x1fae5b), short = mat(0x161616);
  const tenis = mat(0x7ed957), cabelo = mat(0x2b1a10);

  const corpo = new THREE.Group();
  g.add(corpo);

  const torso = malha(G.caixa, camisa, 0, 1.55, 0); torso.scale.set(0.72, 0.82, 0.42); corpo.add(torso);
  const gola = malha(G.caixa, detalhe, 0, 1.94, 0); gola.scale.set(0.5, 0.06, 0.44); corpo.add(gola);
  const numero = new THREE.Mesh(new THREE.PlaneGeometry(0.46, 0.34), new THREE.MeshBasicMaterial({ map: texNumero }));
  numero.position.set(0, 1.55, 0.215); corpo.add(numero);
  const quadril = malha(G.caixa, short, 0, 1.08, 0); quadril.scale.set(0.7, 0.34, 0.44); corpo.add(quadril);

  const cabeca = new THREE.Group(); cabeca.position.set(0, 2.25, 0); corpo.add(cabeca);
  const rosto = malha(G.esfera, pele); rosto.scale.setScalar(0.27); cabeca.add(rosto);
  const cab = malha(G.esfera, cabelo, 0, 0.07, 0.02); cab.scale.set(0.285, 0.24, 0.285); cabeca.add(cab);
  const faixa = malha(G.cilindro, mat(0xffd21f), 0, 0.06, 0); faixa.scale.set(0.29, 0.07, 0.29); cabeca.add(faixa);

  const pernas = [], joelhos = [], bracos = [], cotovelos = [];
  for (const lado of [-1, 1]) {
    const coxa = membro(0.5, 0.13, pele); coxa.position.set(lado * 0.18, 0.98, 0); corpo.add(coxa);
    const shortPerna = malha(G.caixa, short, 0, -0.12, 0); shortPerna.scale.set(0.3, 0.26, 0.32); coxa.add(shortPerna);
    const joelho = membro(0.48, 0.11, pele); joelho.position.set(0, -0.5, 0); coxa.add(joelho);
    const pe = malha(G.caixa, tenis, 0, -0.5, -0.08); pe.scale.set(0.2, 0.14, 0.36); joelho.add(pe);
    pernas.push(coxa); joelhos.push(joelho);

    const ombro = membro(0.42, 0.09, pele); ombro.position.set(lado * 0.46, 1.9, 0); corpo.add(ombro);
    const manga = malha(G.esfera, camisa, 0, -0.04, 0); manga.scale.setScalar(0.13); ombro.add(manga);
    const ante = membro(0.38, 0.08, pele); ante.position.set(0, -0.42, 0); ombro.add(ante);
    const relogio = malha(G.cilindro, mat(0x111111), 0, -0.3, 0); relogio.scale.set(0.09, 0.06, 0.09);
    if (lado < 0) ante.add(relogio);
    bracos.push(ombro); cotovelos.push(ante);
  }

  const sombra = new THREE.Mesh(new THREE.CircleGeometry(0.6, 24), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.25 }));
  sombra.rotation.x = -Math.PI / 2; sombra.position.y = 0.02;
  scene.add(sombra);

  g.scale.setScalar(0.92);
  scene.add(g);
  return { g, corpo, pernas, joelhos, bracos, cotovelos, sombra };
}

function animarCorredor(c, fase, noAr) {
  if (noAr) {
    c.pernas[0].rotation.x = 1.0; c.joelhos[0].rotation.x = -1.6;
    c.pernas[1].rotation.x = -0.5; c.joelhos[1].rotation.x = -1.1;
    c.bracos[0].rotation.x = -1.1; c.bracos[1].rotation.x = 0.9;
    c.cotovelos[0].rotation.x = c.cotovelos[1].rotation.x = 1.0;
    c.corpo.position.y = 0;
    return;
  }
  const s = Math.sin(fase);
  for (let i = 0; i < 2; i++) {
    const lado = i === 0 ? 1 : -1;
    c.pernas[i].rotation.x = s * 0.85 * lado;
    c.joelhos[i].rotation.x = -Math.max(0, -s * lado) * 1.5 - 0.15;
    c.bracos[i].rotation.x = -s * 0.75 * lado;
    c.cotovelos[i].rotation.x = 1.25;
  }
  c.corpo.position.y = Math.abs(Math.cos(fase)) * 0.12;
  c.corpo.rotation.x = 0.12;
}

// ─── CENÁRIO QUE SE REPETE ────────────────────────────────────────────────────

const COMPRIMENTO = 240; // trecho de cenário reciclado à frente do corredor
const ZONA_FIM = 16;

const estrada = new THREE.Mesh(new THREE.PlaneGeometry(8, COMPRIMENTO), new THREE.MeshStandardMaterial({ map: texAsfalto, roughness: 0.95 }));
estrada.rotation.x = -Math.PI / 2;
estrada.position.z = ZONA_FIM - COMPRIMENTO / 2;
scene.add(estrada);

const faixasLaterais = [];
for (const lado of [-1, 1]) {
  const calc = new THREE.Mesh(new THREE.PlaneGeometry(4, COMPRIMENTO), new THREE.MeshStandardMaterial({ map: texCalcada, roughness: 1 }));
  calc.rotation.x = -Math.PI / 2; calc.position.set(lado * 6, 0.01, ZONA_FIM - COMPRIMENTO / 2);
  scene.add(calc);
  const grama = new THREE.Mesh(new THREE.PlaneGeometry(40, COMPRIMENTO), new THREE.MeshStandardMaterial({ map: texGrama, roughness: 1 }));
  grama.rotation.x = -Math.PI / 2; grama.position.set(lado * 28, 0, ZONA_FIM - COMPRIMENTO / 2);
  scene.add(grama);
  faixasLaterais.push(calc, grama);
}

function torcedor() {
  const g = new THREE.Group();
  const cor = escolher(CAMISAS), pele = mat(escolher(PELES));
  const corpo = malha(G.capsula, mat(cor), 0, 1.0, 0); corpo.scale.set(0.5, 0.5, 0.4); g.add(corpo);
  const cabeca = malha(G.esfera, pele, 0, 1.68, 0); cabeca.scale.setScalar(0.22); g.add(cabeca);
  if (Math.random() < 0.55) {
    for (const lado of [-1, 1]) {
      const b = malha(G.capsula, pele, lado * 0.42, 1.62, 0); b.scale.set(0.11, 0.3, 0.11); b.rotation.z = -lado * 0.75; g.add(b);
    }
  }
  if (Math.random() < 0.25) { const bone = malha(G.esfera, mat(escolher(CAMISAS)), 0, 1.8, 0); bone.scale.set(0.24, 0.12, 0.24); g.add(bone); }
  return g;
}

function segmentoTorcida(lado) {
  const g = new THREE.Group();
  const placa = new THREE.Mesh(new THREE.PlaneGeometry(5.6, 0.9), new THREE.MeshStandardMaterial({ map: texPlaca }));
  placa.position.set(lado * 4.25, 0.7, 0); placa.rotation.y = -lado * Math.PI / 2; g.add(placa);
  const topo = malha(G.caixa, mat(0xdfe6ee), lado * 4.25, 1.2, 0); topo.scale.set(0.08, 0.08, 5.6); g.add(topo);
  for (let i = 0; i < 4; i++) {
    const p = torcedor();
    p.position.set(lado * (4.9 + Math.random() * 1.4), 0, -2.4 + i * 1.5 + Math.random() * 0.4);
    p.rotation.y = -lado * Math.PI / 2 + (Math.random() - 0.5) * 0.6;
    g.add(p);
  }
  return g;
}

function arvore() {
  const g = new THREE.Group();
  const tronco = malha(G.cilindro, mat(0x7a4a24), 0, 1.5, 0); tronco.scale.set(0.22, 3, 0.22); g.add(tronco);
  const verde = mat(Math.random() < 0.5 ? 0x2f9e44 : 0x3cb371);
  for (let i = 0; i < 3; i++) {
    const copa = malha(G.esfera, verde, (Math.random() - 0.5) * 1.4, 3.6 + Math.random() * 0.9, (Math.random() - 0.5) * 1.4);
    copa.scale.setScalar(1.3 + Math.random() * 0.5); g.add(copa);
  }
  return g;
}

function palmeira() {
  const g = new THREE.Group();
  const tronco = malha(G.cilindro, mat(0x9c7b4f), 0, 2.6, 0); tronco.scale.set(0.16, 5.2, 0.16); tronco.rotation.z = 0.08; g.add(tronco);
  const folha = mat(0x2e8b57);
  for (let i = 0; i < 7; i++) {
    const f = malha(G.esfera, folha, 0, 5.3, 0); f.scale.set(1.5, 0.12, 0.35);
    f.rotation.y = (i / 7) * Math.PI * 2; f.rotation.z = -0.35; f.translateX(1.1); g.add(f);
  }
  return g;
}

function predio() {
  const h = 9 + Math.random() * 18, w = 5 + Math.random() * 4, d = 7 + Math.random() * 5;
  const cores = [0xf4d7b5, 0xd6e4f0, 0xf7f1e3, 0xe8c4a0, 0xcfe8d5, 0xf0d0d8];
  const m = new THREE.MeshStandardMaterial({ color: escolher(cores), map: texJanelas, roughness: 0.9 });
  m.map = texJanelas.clone(); m.map.needsUpdate = true; m.map.repeat.set(Math.round(w / 2), Math.round(h / 4));
  const o = new THREE.Mesh(G.caixa, m); o.scale.set(w, h, d); o.position.y = h / 2;
  return o;
}

// junta as peças sem textura num único mesh com cores por vértice: 1 desenho por objeto em vez de dezenas
const matVertice = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 });
function achatar(grupo) {
  grupo.updateMatrixWorld(true);
  const inv = grupo.matrixWorld.clone().invert();
  const geos = [], comTextura = [];
  grupo.traverse((o) => {
    if (!o.isMesh) return;
    if (Array.isArray(o.material) || o.material.map || o.material.transparent) { comTextura.push(o); return; }
    const g = (o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone());
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
    g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld));
    const cor = o.material.color, n = g.attributes.position.count, c = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { c[i * 3] = cor.r; c[i * 3 + 1] = cor.g; c[i * 3 + 2] = cor.b; }
    g.setAttribute('color', new THREE.BufferAttribute(c, 3));
    geos.push(g);
  });
  const novo = new THREE.Group();
  novo.position.copy(grupo.position); novo.quaternion.copy(grupo.quaternion); novo.scale.copy(grupo.scale);
  if (geos.length) novo.add(new THREE.Mesh(mergeGeometries(geos), matVertice));
  for (const o of comTextura) {
    new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld).decompose(o.position, o.quaternion, o.scale);
    novo.add(o);
  }
  return novo;
}

const cenario = [];
function addCenario(obj, z) {
  const o = obj.isMesh ? obj : achatar(obj);
  o.position.z = z;
  scene.add(o);
  cenario.push(o);
}

for (let z = ZONA_FIM; z > ZONA_FIM - COMPRIMENTO; z -= 6) {
  for (const lado of [-1, 1]) addCenario(segmentoTorcida(lado), z);
}
for (let z = ZONA_FIM; z > ZONA_FIM - COMPRIMENTO; z -= 12) {
  for (const lado of [-1, 1]) {
    const a = Math.random() < 0.4 ? palmeira() : arvore();
    a.position.x = lado * (9 + Math.random() * 2);
    addCenario(a, z - Math.random() * 6);
  }
}
for (let z = ZONA_FIM; z > ZONA_FIM - COMPRIMENTO; z -= 14) {
  for (const lado of [-1, 1]) {
    const p = predio();
    p.position.x = lado * (16 + Math.random() * 6);
    addCenario(p, z);
  }
}

// morros no horizonte (Pão de Açúcar e Corcovado), fixos e sem neblina
const morroMat = new THREE.MeshStandardMaterial({ color: 0x5f8f5a, roughness: 1, fog: false });
const morros = [[-34, 0, -230, 9, 30, 9], [-20, 0, -250, 14, 16, 12], [38, 0, -240, 11, 34, 10], [52, 0, -260, 20, 18, 14]];
for (const [x, y, z, sx, sy, sz] of morros) {
  const m = new THREE.Mesh(G.esfera, morroMat); m.position.set(x, y, z); m.scale.set(sx, sy, sz); scene.add(m);
}
const cristo = malha(G.caixa, new THREE.MeshStandardMaterial({ color: 0xf2f2f2, fog: false }), 38, 35.5, -240);
cristo.scale.set(0.6, 3, 0.6); scene.add(cristo);
const bracosCristo = malha(G.caixa, cristo.material, 38, 36.4, -240); bracosCristo.scale.set(3.4, 0.45, 0.5); scene.add(bracosCristo);

// ─── OBSTÁCULOS E ITENS ───────────────────────────────────────────────────────

// parado na lateral até o corredor chegar perto; então cruza para estar na faixa `alvo` quando passar por ele
function atravessarQuandoPerto(zGatilho, alvo) {
  return function () {
    if (this.vx || this.z < zGatilho) return;
    const tempo = -this.z / estado.vel;
    this.vx = (alvo - this.x) / tempo;
    this.obj.rotation.y = this.vx > 0 ? 0 : Math.PI;
  };
}

const LONGE = -150;
let entidades = [];

function addEntidade(e) {
  scene.add(e.obj);
  entidades.push(e);
  return e;
}

function cone(x, z) {
  const g = new THREE.Group();
  const base = malha(G.caixa, mat(0xff6a00), 0, 0.04, 0); base.scale.set(0.8, 0.08, 0.8); g.add(base);
  const c = malha(G.cone, mat(0xff6a00), 0, 0.5, 0); c.scale.set(0.32, 0.9, 0.32); g.add(c);
  const listra = malha(G.cilindro, mat(0xffffff), 0, 0.55, 0); listra.scale.set(0.2, 0.14, 0.2); g.add(listra);
  return addEntidade({ tipo: 'cone', motivo: 'Tropeçou no cone', obj: g, x, z, w: 0.8, d: 0.8, h: 0.95 });
}

function barreira(x, z) {
  const g = new THREE.Group();
  const placa = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.38, 0.08), [mat(0xffffff), mat(0xffffff), mat(0xffffff), mat(0xffffff), new THREE.MeshStandardMaterial({ map: texListras }), new THREE.MeshStandardMaterial({ map: texListras })]);
  placa.position.y = 0.85; g.add(placa);
  for (const lado of [-1, 1]) {
    const perna = malha(G.caixa, mat(0xc98a4b), lado * 0.8, 0.5, 0); perna.scale.set(0.1, 1, 0.1); perna.rotation.x = 0.2; g.add(perna);
    const perna2 = perna.clone(); perna2.rotation.x = -0.2; g.add(perna2);
  }
  return addEntidade({ tipo: 'barreira', motivo: 'Bateu na barreira', obj: g, x, z, w: 1.9, d: 0.5, h: 1.08 });
}

function cachorro(z) {
  const g = new THREE.Group();
  const caramelo = mat(0xc8873e), escuro = mat(0x7a4a1e);
  const corpo = malha(G.capsula, caramelo, 0, 0.55, 0); corpo.scale.set(0.38, 0.5, 0.38); corpo.rotation.z = Math.PI / 2; g.add(corpo);
  const cabeca = malha(G.esfera, caramelo, 0.62, 0.85, 0); cabeca.scale.set(0.26, 0.22, 0.22); g.add(cabeca);
  const focinho = malha(G.esfera, caramelo, 0.86, 0.8, 0); focinho.scale.set(0.14, 0.1, 0.12); g.add(focinho);
  const nariz = malha(G.esfera, mat(0x111111), 0.98, 0.82, 0); nariz.scale.setScalar(0.045); g.add(nariz);
  for (const lado of [-1, 1]) {
    const orelha = malha(G.esfera, escuro, 0.56, 1.0, lado * 0.14); orelha.scale.set(0.08, 0.14, 0.05); orelha.rotation.x = lado * 0.4; g.add(orelha);
  }
  const rabo = malha(G.capsula, caramelo, -0.62, 0.8, 0); rabo.scale.set(0.08, 0.25, 0.08); rabo.rotation.z = 0.8; g.add(rabo);
  const patas = [];
  for (const [px, pz] of [[0.32, 0.14], [0.32, -0.14], [-0.32, 0.14], [-0.32, -0.14]]) {
    const p = membro(0.38, 0.06, caramelo); p.position.set(px, 0.42, pz); g.add(p); patas.push(p);
  }
  const lado = Math.random() < 0.5 ? -1 : 1;
  g.rotation.y = lado > 0 ? Math.PI : 0;
  return addEntidade({
    tipo: 'cachorro', motivo: 'Esbarrou no cachorro', obj: g, x: lado * 5.2, z, w: 1.5, d: 0.6, h: 0.95, rabo, patas,
    atualizar: atravessarQuandoPerto(-38, escolher(FAIXAS)),
    anima(t) {
      this.rabo.rotation.x = Math.sin(t * 18) * 0.6;
      this.patas.forEach((p, i) => { p.rotation.z = Math.sin(t * 16 + (i % 2) * Math.PI) * 0.7; });
    }
  });
}

function ciclista(x, z) {
  const g = new THREE.Group();
  const quadro = mat(0x111111);
  for (const pz of [-0.55, 0.55]) {
    const r = malha(G.roda, quadro, 0, 0.48, pz); r.rotation.y = Math.PI / 2; g.add(r);
  }
  const barra = malha(G.caixa, mat(0xff3b30), 0, 0.85, 0); barra.scale.set(0.07, 0.07, 1.1); barra.rotation.x = -0.15; g.add(barra);
  const banco = malha(G.caixa, quadro, 0, 1.12, 0.38); banco.scale.set(0.15, 0.06, 0.3); g.add(banco);
  const guidao = malha(G.caixa, quadro, 0, 1.15, -0.5); guidao.scale.set(0.6, 0.05, 0.05); g.add(guidao);
  const roupa = mat(escolher([0x1e88ff, 0xff8c1a, 0x2ecc71]));
  const tronco = malha(G.capsula, roupa, 0, 1.55, 0.05); tronco.scale.set(0.5, 0.45, 0.4); tronco.rotation.x = -0.55; g.add(tronco);
  const cabeca = malha(G.esfera, mat(escolher(PELES)), 0, 2.05, -0.3); cabeca.scale.setScalar(0.2); g.add(cabeca);
  const capacete = malha(G.esfera, mat(0xffffff), 0, 2.12, -0.3); capacete.scale.set(0.23, 0.15, 0.27); g.add(capacete);
  const pernas = [];
  for (const lado of [-1, 1]) { const p = membro(0.75, 0.09, mat(0x161616)); p.position.set(lado * 0.17, 1.15, 0.3); g.add(p); pernas.push(p); }
  return addEntidade({
    tipo: 'ciclista', motivo: 'Bateu na bicicleta', obj: g, x, z, w: 0.9, d: 1.8, h: 2.3, vz: -7, pernas,
    anima(t) { this.pernas.forEach((p, i) => { p.rotation.x = Math.sin(t * 9 + i * Math.PI) * 0.6 - 0.3; }); }
  });
}

function carro(z) {
  const g = new THREE.Group();
  const cor = mat(escolher([0xd9d9d9, 0xe63946, 0x1d4ed8, 0xfacc15, 0x111827]), { roughness: 0.35, metalness: 0.3 });
  const base = malha(G.caixa, cor, 0, 0.6, 0); base.scale.set(3.1, 0.7, 1.6); g.add(base);
  const cabine = malha(G.caixa, cor, -0.15, 1.2, 0); cabine.scale.set(1.7, 0.6, 1.45); g.add(cabine);
  const vidro = malha(G.caixa, mat(0x9ad0ff, { roughness: 0.1 }), -0.15, 1.22, 0); vidro.scale.set(1.72, 0.42, 1.47); g.add(vidro);
  for (const px of [-0.95, 0.95]) for (const pz of [-0.78, 0.78]) {
    const r = malha(G.cilindro, mat(0x111111), px, 0.36, pz); r.scale.set(0.36, 0.22, 0.36); r.rotation.x = Math.PI / 2; g.add(r);
  }
  const lado = Math.random() < 0.5 ? -1 : 1;
  const faixaPedestre = new THREE.Mesh(new THREE.PlaneGeometry(8, 2.6), new THREE.MeshBasicMaterial({ map: texFaixaPedestre, transparent: true }));
  faixaPedestre.rotation.x = -Math.PI / 2; faixaPedestre.position.y = 0.02;
  addEntidade({ tipo: 'decor', obj: faixaPedestre, x: 0, z, w: 0, d: 0, h: 0 });
  return addEntidade({
    tipo: 'carro', motivo: 'Bateu no carro', obj: g, x: lado * 12, z, w: 3.1, d: 1.6, h: 2.2,
    atualizar: atravessarQuandoPerto(-64, escolher(FAIXAS))
  });
}

function moeda(x, z) {
  const o = malha(G.moeda, mat(0xffc400, { metalness: 0.6, roughness: 0.3, emissive: 0x6b4a00 }), 0, 1, 0);
  o.rotation.x = Math.PI / 2;
  return addEntidade({ tipo: 'moeda', item: true, pontos: 10, obj: o, x, z, y: 1, anima(t) { this.obj.rotation.z = t * 4; } });
}

function gel(x, z) {
  const g = new THREE.Group();
  const s = malha(G.caixa, mat(0xffd21f, { emissive: 0x6b5500 }), 0, 1.05, 0); s.scale.set(0.45, 0.65, 0.12); g.add(s);
  const raio = malha(G.caixa, mat(0x1e88ff), 0, 1.05, 0.07); raio.scale.set(0.12, 0.35, 0.02); raio.rotation.z = 0.5; g.add(raio);
  return addEntidade({ tipo: 'gel', item: true, pontos: 50, obj: g, x, z, y: 1, anima(t) { this.obj.rotation.y = Math.sin(t * 3) * 0.6; this.obj.position.y = Math.sin(t * 4) * 0.1; } });
}

function copo(x, z, posto) {
  const g = new THREE.Group();
  const vidro = malha(G.cilindro, new THREE.MeshStandardMaterial({ color: 0xe8f6ff, transparent: true, opacity: 0.55, roughness: 0.1 }), 0, 1.05, 0);
  vidro.scale.set(0.24, 0.5, 0.24); g.add(vidro);
  const agua = malha(G.cilindro, mat(0x2aa8ff, { emissive: 0x0a4d8c }), 0, 0.98, 0); agua.scale.set(0.21, 0.34, 0.21); g.add(agua);
  const brilho = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.55, 32), new THREE.MeshBasicMaterial({ color: 0x7fd4ff, transparent: true, opacity: 0.7, side: THREE.DoubleSide }));
  brilho.rotation.x = -Math.PI / 2; brilho.position.y = 0.05; g.add(brilho);
  return addEntidade({ tipo: 'copo', item: true, agua: true, posto, pontos: 20, obj: g, x, z, y: 1, anima(t) { this.obj.position.y = Math.sin(t * 4 + this.z) * 0.12; } });
}

function postoHidratacao(z) {
  const g = new THREE.Group();
  const lado = 1;
  const mesa = malha(G.caixa, mat(0xffffff), lado * 3.65, 0.8, 0); mesa.scale.set(0.9, 0.08, 4); g.add(mesa);
  const toalha = malha(G.caixa, mat(0x1e88ff), lado * 3.65, 0.55, 0); toalha.scale.set(0.92, 0.5, 4.02); g.add(toalha);
  for (let i = 0; i < 8; i++) {
    const c = malha(G.cilindro, mat(0x7fd4ff), lado * 3.55, 0.98, -1.7 + i * 0.48); c.scale.set(0.09, 0.22, 0.09); g.add(c);
  }
  for (let i = 0; i < 2; i++) {
    const v = torcedor(); v.children[0].material = mat(0xff8c1a);
    v.position.set(lado * 4.4, 0, -1 + i * 2); v.rotation.y = -Math.PI / 2; g.add(v);
  }
  const tenda = malha(G.cone, mat(0x1e88ff), lado * 4.1, 3.2, 0); tenda.scale.set(2.2, 1, 2.6); tenda.rotation.y = Math.PI / 4; g.add(tenda);
  for (const pz of [-1.6, 1.6]) { const haste = malha(G.cilindro, mat(0xdddddd), lado * 3.1, 1.4, pz); haste.scale.set(0.05, 2.8, 0.05); g.add(haste); }
  const faixa = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.65), new THREE.MeshBasicMaterial({ map: texHidratacao }));
  faixa.position.set(lado * 3.1, 2.55, 0); faixa.rotation.y = -Math.PI / 2 + 0.5; g.add(faixa);
  addEntidade({ tipo: 'decor', obj: g, x: 0, z, w: 0, d: 0, h: 0 });
  for (let fila = 0; fila < 3; fila++) for (const x of FAIXAS) copo(x, z - 3 + fila * 3, true);
}

function porticoKm(z, km) {
  const g = new THREE.Group();
  const azul = mat(0x1356c9);
  for (const lado of [-1, 1]) { const p = malha(G.caixa, azul, lado * 4.2, 2.6, 0); p.scale.set(0.5, 5.2, 0.5); g.add(p); }
  const topo = new THREE.Mesh(new THREE.BoxGeometry(9, 1.1, 0.5), [azul, azul, azul, azul, new THREE.MeshStandardMaterial({ map: texTexto(`${km}K`, { w: 512, h: 96, fundo: '#ffd21f', cor: '#0b1d3a', tam: 80 }) }), azul]);
  topo.position.y = 5.5; g.add(topo);
  return addEntidade({ tipo: 'decor', obj: g, x: 0, z, w: 0, d: 0, h: 0 });
}

// ─── SPAWN ────────────────────────────────────────────────────────────────────

function sortearFaixas(n) {
  const f = [...FAIXAS].sort(() => Math.random() - 0.5);
  return f.slice(0, n);
}

function gerarPadrao(z, nivel) {
  const r = Math.random();
  if (r < 0.2) {
    for (const x of sortearFaixas(Math.random() < 0.5 + nivel * 0.3 ? 2 : 1)) cone(x, z);
  } else if (r < 0.36) {
    for (const x of sortearFaixas(Math.random() < 0.3 + nivel * 0.3 ? 2 : 1)) barreira(x, z);
  } else if (r < 0.5) {
    cachorro(z);
  } else if (r < 0.64) {
    ciclista(escolher(FAIXAS), z);
  } else if (r < 0.76) {
    carro(z);
  } else if (r < 0.86) {
    const x = escolher(FAIXAS);
    for (let i = 0; i < 6; i++) moeda(x, z - i * 2.4);
  } else if (r < 0.94) {
    gel(escolher(FAIXAS), z);
  } else {
    copo(escolher(FAIXAS), z, false);
  }
  // moedas extras numa faixa livre de vez em quando
  if (r < 0.36 && Math.random() < 0.5) {
    const ocupadas = new Set(entidades.filter((e) => e.z === z && !e.item).map((e) => e.x));
    const livre = FAIXAS.find((x) => !ocupadas.has(x));
    if (livre !== undefined) for (let i = 0; i < 4; i++) moeda(livre, z + 4 - i * 2.4);
  }
}

// ─── ESTADO ───────────────────────────────────────────────────────────────────

const corredor = criarCorredor();
const estado = {
  modo: 'inicio', t: 0, vel: velocidade(0), dist: 0, metros: 0, pontos: 0, agua: 100,
  faixa: 1, x: 0, y: 0, vy: 0, fase: 0, proximoSpawn: 30, proximoPosto: HIDRATACAO_A_CADA_M, proximoKm: 1000, tremor: 0
};

let recorde = 0;
try { recorde = Number(localStorage.getItem('mapmove-recorde')) || 0; } catch { /* sem storage */ }

function reiniciar() {
  for (const e of entidades) scene.remove(e.obj);
  entidades = [];
  Object.assign(estado, {
    t: 0, vel: velocidade(0), dist: 0, metros: 0, pontos: 0, agua: 100, faixa: 1, x: 0, y: 0, vy: 0, fase: 0,
    proximoSpawn: 30, proximoPosto: HIDRATACAO_A_CADA_M, proximoKm: 1000, tremor: 0
  });
}

// ─── HUD ──────────────────────────────────────────────────────────────────────

const hud = {
  km: $('#hudKm'), pace: $('#hudPace'), bpm: $('#hudBpm'), agua: $('#hudAgua'), aguaTxt: $('#hudAguaTxt'),
  aguaBox: $('.pilula.agua'), pontos: $('#hudPontos')
};
let hudTimer = 0;
function atualizarHud() {
  hud.km.textContent = formatarKm(estado.metros);
  hud.pace.textContent = formatarPace(estado.vel * M_POR_UNIDADE);
  hud.bpm.textContent = bpm(estado.vel);
  hud.agua.style.width = `${estado.agua}%`;
  hud.aguaTxt.textContent = `${Math.round(estado.agua)}%`;
  hud.aguaBox.classList.toggle('baixa', estado.agua < 25);
  hud.pontos.textContent = Math.floor(estado.pontos).toLocaleString('pt-BR');
}

let avisoTimer;
function aviso(txt, classe = '') {
  const el = $('#aviso');
  el.hidden = true; void el.offsetWidth;
  el.className = classe; el.textContent = txt; el.hidden = false;
  clearTimeout(avisoTimer);
  avisoTimer = setTimeout(() => { el.hidden = true; }, 1500);
}

function mostrar(tela) {
  for (const id of ['telaInicio', 'telaPausa', 'telaFim']) $('#' + id).hidden = id !== tela;
  $('#hud').hidden = tela === 'telaInicio';
}

function iniciar() {
  reiniciar();
  estado.modo = 'jogando';
  mostrar(null);
  atualizarHud();
}

function pausar() {
  if (estado.modo !== 'jogando') return;
  estado.modo = 'pausa';
  mostrar('telaPausa');
}

function continuar() {
  if (estado.modo !== 'pausa') return;
  estado.modo = 'jogando';
  mostrar(null);
}

function terminar(motivo) {
  estado.modo = 'fim';
  estado.tremor = 0.4;
  const pontos = Math.floor(estado.pontos);
  if (pontos > recorde) {
    recorde = pontos;
    try { localStorage.setItem('mapmove-recorde', String(recorde)); } catch { /* sem storage */ }
  }
  $('#fimMotivo').textContent = motivo;
  $('#fimKm').textContent = formatarKm(estado.metros);
  $('#fimPontos').textContent = pontos.toLocaleString('pt-BR');
  $('#fimRecorde').textContent = recorde.toLocaleString('pt-BR');
  setTimeout(() => { if (estado.modo === 'fim') mostrar('telaFim'); }, 700);
}

// ─── CONTROLES ────────────────────────────────────────────────────────────────

function mover(d) { if (estado.modo === 'jogando') estado.faixa = Math.max(0, Math.min(2, estado.faixa + d)); }
function pular() { if (estado.modo === 'jogando' && estado.y === 0) estado.vy = PULO.velocidade; }

window.addEventListener('keydown', (e) => {
  const k = e.key;
  if (k === 'ArrowLeft' || k === 'a' || k === 'A') mover(-1);
  else if (k === 'ArrowRight' || k === 'd' || k === 'D') mover(1);
  else if (k === 'ArrowUp' || k === 'w' || k === 'W' || k === ' ') { e.preventDefault(); if (estado.modo === 'inicio' || estado.modo === 'fim') iniciar(); else pular(); }
  else if (k === 'p' || k === 'P' || k === 'Escape') { if (estado.modo === 'pausa') continuar(); else pausar(); }
});

let toque = null;
palco.addEventListener('touchstart', (e) => { const t = e.touches[0]; toque = { x: t.clientX, y: t.clientY }; }, { passive: true });
palco.addEventListener('touchend', (e) => {
  if (!toque) return;
  const t = e.changedTouches[0];
  const dx = t.clientX - toque.x, dy = t.clientY - toque.y;
  toque = null;
  if (Math.max(Math.abs(dx), Math.abs(dy)) < 28) return;
  if (Math.abs(dx) > Math.abs(dy)) mover(dx > 0 ? 1 : -1);
  else if (dy < 0) pular();
});

$('#btnCorrer').addEventListener('click', iniciar);
$('#btnDeNovo').addEventListener('click', iniciar);
$('#btnPausa').addEventListener('click', pausar);
$('#btnContinuar').addEventListener('click', continuar);
document.addEventListener('visibilitychange', () => { if (document.hidden) pausar(); });

// ─── LOOP ─────────────────────────────────────────────────────────────────────

const relogio = new THREE.Clock();

function passo(dt) {
  const s = estado;
  s.t += dt;
  s.vel = velocidade(s.t);
  const dz = s.vel * dt;
  s.dist += dz;
  s.metros = s.dist * M_POR_UNIDADE;
  s.pontos += dz * M_POR_UNIDADE;
  s.agua = desidratar(s.agua, dt);
  if (s.agua <= 0) return terminar('Desidratou! 💧');

  // corredor: troca de faixa suave e pulo
  const alvo = FAIXAS[s.faixa];
  s.x += (alvo - s.x) * Math.min(1, dt * 14);
  if (s.vy !== 0 || s.y > 0) {
    s.vy += PULO.gravidade * dt;
    s.y = Math.max(0, s.y + s.vy * dt);
    if (s.y === 0) s.vy = 0;
  }
  s.fase += dt * s.vel * 0.62;

  // cenário e pista andam na direção da câmera
  texAsfalto.offset.y += dz / 8;
  texCalcada.offset.y += dz / 6;
  texGrama.offset.y += dz / 4;
  for (const o of cenario) {
    o.position.z += dz;
    if (o.position.z > ZONA_FIM) o.position.z -= COMPRIMENTO;
  }

  // novos obstáculos, postos de hidratação e pórticos de km
  s.proximoSpawn -= dz;
  if (s.proximoSpawn <= 0) {
    const nivel = Math.min(1, s.t / 120);
    gerarPadrao(LONGE, nivel);
    s.proximoSpawn = 26 - nivel * 9 + Math.random() * 8;
  }
  const mLonge = s.metros + -LONGE * M_POR_UNIDADE;
  if (mLonge >= s.proximoPosto) { postoHidratacao(LONGE - 12); s.proximoPosto += HIDRATACAO_A_CADA_M; s.proximoSpawn = Math.max(s.proximoSpawn, 30); }
  if (mLonge >= s.proximoKm) { porticoKm(LONGE - 6, s.proximoKm / 1000); s.proximoKm += 1000; }

  const c = { x: s.x, y: s.y, z: 0 };
  for (const e of entidades) {
    e.z += dz + (e.vz || 0) * dt;
    if (e.atualizar) e.atualizar();
    if (e.vx) e.x += e.vx * dt;
    e.obj.position.x = e.x;
    e.obj.position.z = e.z;
    if (e.anima) e.anima(s.t);
    if (e.pego || e.tipo === 'decor') continue;
    if (e.item) {
      if (coleta(c, e)) {
        e.pego = true;
        scene.remove(e.obj);
        s.pontos += e.pontos;
        if (e.agua) {
          s.agua = hidratar(s.agua, e.posto ? 20 : 10);
          aviso(e.posto ? 'PONTO DE HIDRATAÇÃO +20' : '💧 +10');
        } else if (e.tipo === 'gel') aviso('⚡ GEL +50');
      }
    } else if (colide(c, e)) {
      return terminar(e.motivo);
    }
  }
  entidades = entidades.filter((e) => {
    if (e.z > ZONA_FIM || e.pego) { scene.remove(e.obj); return false; }
    return true;
  });

  if (s.metros >= s.proximoKm - 1000 && s.metros - dz * M_POR_UNIDADE < s.proximoKm - 1000) aviso(`${(s.proximoKm - 1000) / 1000} KM!`, 'km');

  hudTimer -= dt;
  if (hudTimer <= 0) { atualizarHud(); hudTimer = 0.1; }
}

function desenhar(dt) {
  const s = estado;
  corredor.g.position.set(s.x, s.y, 0);
  corredor.g.rotation.z = (FAIXAS[s.faixa] - s.x) * -0.12;
  corredor.sombra.position.set(s.x, 0.02, 0);
  corredor.sombra.scale.setScalar(1 - Math.min(0.5, s.y / 4));
  if (s.modo === 'jogando') animarCorredor(corredor, s.fase, s.y > 0.05);
  else if (s.modo === 'inicio') { s.fase += dt * 6; animarCorredor(corredor, s.fase, false); }

  camera.position.set(CAM_BASE.x + s.x * 0.45, CAM_BASE.y + s.y * 0.25, CAM_BASE.z);
  if (s.tremor > 0) {
    s.tremor = Math.max(0, s.tremor - dt);
    camera.position.x += (Math.random() - 0.5) * s.tremor;
    camera.position.y += (Math.random() - 0.5) * s.tremor;
  }
  camera.lookAt(s.x * 0.6, 1.4, -9);
  renderer.render(scene, camera);
}

function loop() {
  const dt = Math.min(0.05, relogio.getDelta());
  if (estado.modo === 'jogando') passo(dt);
  desenhar(dt);
  requestAnimationFrame(loop);
}

if (recorde) $('#recordeInicio').textContent = `Recorde: ${recorde.toLocaleString('pt-BR')} pontos`;
redimensionar();
mostrar('telaInicio');
loop();

// ganchos para testes automatizados
window.__jogo = { estado, entidades: () => entidades, mover, pular, iniciar, passo, info: renderer.info };
