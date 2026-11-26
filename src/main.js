import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import './style.css';
import { PistaReal, PistaReta, frente, direita, difAngulo } from './pista.js';
import * as R from './regras.js';
import { criarControles } from './controles.js';
import { encontrarTravessas, travessasGenericas, buscarVias } from './travessas.js';
import { criarSom } from './som.js';
import * as P from './perfil.js';
import * as TR from './treinos.js';
import * as L from './loja.js';
import * as Conta from './conta.js';
import { rigarQuadrupede, animarQuadrupede } from './quadrupede.js';
import { preencherBordas } from './textura.js';
import { criarVitrine } from './vitrine.js';
import { criarBandana } from './bandana.js';
import { criarCeu } from './ceu.js';
import * as CL from './clima.js';
import { CEUS } from './ceus.js';
import { refinarDistancias } from './refino.js';
import { modoPercurso, aplicarPercursoAjustado, sufixo, JANELA as JANELA_AJUSTADO, modoRuas, aplicarRuasOSM } from './percursoAjustado.js';
import { montarRuas, pinturaRuas, conesDosRetornos, eixoDaPista } from './ruasOSM.js';
import * as PL from './pelotao.js';
import * as MD from './medalhas.js';
import { gerarCartao } from './cartao.js';
import * as FT from './fantasma.js';
import { manchasDeGrama, criarTufos, balancoDeArvore } from './grama.js';
import { clone as clonarComOssos } from 'three/addons/utils/SkeletonUtils.js';
import { pistasDuplas, duplaEm, viadutosDoPercurso } from './osm.js';
import { construirViadutos as montarViadutos, ajustarCameraViaduto } from './viaduto.js';
import { posicaoEstendida, amostrasDoPercurso, planoFita, faixasAvenida, faixasComuns, amostrasAvenida } from './faixas.js';
import { prepararOSM, zonasDoPercurso, zonaEm, areaEm, pontoNoPoligono, placasDoPercurso, abreviarRua } from './osm.js';

const SUPABASE_URL = 'https://ssfsxdmzbubvygctdjgf.supabase.co';
const SUPABASE_KEY = 'sb_publishable_s2yoUApfYl_ZvSUkqYYrVw_uXwKsybM';
// provas do jogo: percurso vem do Portal (Supabase) e o entorno de public/osm/<slug>.json.
// O nome mostrado é genérico (sem o nome oficial do evento, para não usar a marca dos organizadores).
const PROVAS = [
  { slug: '1-meia-maratona-de-indaiatuba-2026-12-13', cidade: 'Indaiatuba', nome: 'Meia de Indaiatuba', curto: 'Meia de Indaiatuba' },
  // relevo: 0 = desenho plano (Sorocaba tem morros e trechos de ida e volta lado a lado: com o relevo desenhado
  // a rua ficava em barrancos e com placas flutuando). A subida/descida continua valendo no jogo e no HUD.
  { slug: '9-maratona-sorocaba-novembro-azul-2026-11-21', cidade: 'Sorocaba', relevo: 0, nome: 'Desafio 42K – Bora correr em Sorocaba', curto: 'Desafio 42K' }
];
// percurso ajustado ao OSM (etapa 3, modo de teste): ?percurso=ajustado liga, ?percurso=gps desliga (src/percursoAjustado.js)
const MODO_PERCURSO = modoPercurso();
// desenho das ruas a partir do mapa (etapa 4, modo de teste): ?ruas=osm liga, ?ruas=atual desliga; só com o percurso
// ajustado. Sem isso, o desenho é o de sempre.
const MODO_RUAS = modoRuas();
let PROVA_SLUG = (() => { try { const s = localStorage.getItem('mapmove-prova'); if (PROVAS.some((p) => p.slug === s)) return s; } catch { /* sem storage */ } return PROVAS[0].slug; })();
const NOME_NO_JOGO = Object.fromEntries(PROVAS.map((p) => [p.slug, p.nome]));

const $ = (s) => document.querySelector(s);
const palco = $('#palco');

// ─── RENDER ───────────────────────────────────────────────────────────────────

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.92;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
palco.prepend(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xcfe9ff, 80, 230);
const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 700);

// luz de ambiente gerada na hora (sem arquivo): dá brilho e reflexo aos materiais
{
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.3;
  pmrem.dispose();
}
scene.add(new THREE.HemisphereLight(0xcfe8ff, 0x55703f, 0.95));
// sol de manhã, com sombra só perto do corredor (a caixa da sombra acompanha ele)
const sol = new THREE.DirectionalLight(0xfff1d6, 3.1);
const SOL_OFFSET = new THREE.Vector3(-14, 26, 9);
sol.castShadow = true;
sol.shadow.mapSize.set(1024, 1024);
Object.assign(sol.shadow.camera, { left: -24, right: 24, top: 24, bottom: -24, near: 1, far: 80 });
sol.shadow.bias = -0.0006;
sol.shadow.normalBias = 0.03;
scene.add(sol, sol.target);

// qualidade gráfica: começa alta e desce sozinha se o celular não aguentar
const NIVEIS = [
  { nome: 'alta', pr: Math.min(window.devicePixelRatio, 1.75), sombra: true },
  { nome: 'média', pr: Math.min(window.devicePixelRatio, 1.25), sombra: true },
  { nome: 'baixa', pr: 1, sombra: false }
];
let nivel = 0;
try { nivel = Math.max(0, Math.min(2, Number(localStorage.getItem('mapmove-qualidade')) || 0)); } catch { /* sem storage */ }
function aplicarQualidade(n) {
  nivel = n;
  renderer.setPixelRatio(NIVEIS[n].pr);
  sol.castShadow = NIVEIS[n].sombra;
  try { localStorage.setItem('mapmove-qualidade', String(n)); } catch { /* sem storage */ }
  if (typeof montarTufos === 'function' && typeof estado !== 'undefined') montarTufos();
  if (typeof redimensionar === 'function') redimensionar();
}

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

// céu de verdade: degradê, sol e nuvens de ruído andando (o degradê acima fica de reserva)
const ceu = criarCeu();
ceu.material.uniforms.uSol.value.copy(SOL_OFFSET).normalize(); // sol do céu no mesmo lugar da luz do jogo
scene.add(ceu);

// ─── CLIMA: céu, névoa, luz, asfalto molhado e chuva caindo ─────────────────────
const CEU_PADRAO = { zen: 0x2f86f0, meio: 0x8ccaff, hor: 0xcfe9ff };
const CEU_FECHADO = { zen: 0x76828f, meio: 0xa3adb8, hor: 0xc3cad1 };
const chuva = (() => {
  const N = 1400, pos = new Float32Array(N * 6);
  for (let i = 0; i < N; i++) {
    const x = (Math.random() - 0.5) * 50, y = Math.random() * 26, z = (Math.random() - 0.5) * 50;
    pos.set([x, y, z, x + 0.05, y - 0.7, z + 0.05], i * 6);
  }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const l = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0xc8d4e0, transparent: true, opacity: 0.45, fog: false }));
  l.frustumCulled = false; l.visible = false;
  return l;
})();
scene.add(chuva);
function aplicarClima(c) {
  const fechado = c ? Math.max(0, (c.nuvens - 0.5) / 0.5) : 0; // 0 = céu aberto, 1 = fechado
  const u = ceu.material.uniforms, mistura = (a, b) => new THREE.Color(a).lerp(new THREE.Color(b), fechado);
  u.uZenite.value.copy(mistura(CEU_PADRAO.zen, CEU_FECHADO.zen));
  u.uMeio.value.copy(mistura(CEU_PADRAO.meio, CEU_FECHADO.meio));
  u.uHorizonte.value.copy(mistura(CEU_PADRAO.hor, CEU_FECHADO.hor));
  u.uCobertura.value = c ? 0.32 + c.nuvens * 0.45 : 0.5;
  u.uEscuro.value = c?.chuva ? 0.9 : fechado * 0.4;
  scene.fog.color.copy(u.uHorizonte.value);
  scene.fog.near = c?.chuva ? 45 : 80; scene.fog.far = c?.chuva ? 160 : 230;
  sol.intensity = 3.1 * (1 - 0.6 * fechado);
  // asfalto molhado: mais escuro e brilhante
  for (const m of [matRua, matRuaFaixas, matRuaOutra]) { m.roughness = c?.chuva ? 0.38 : 0.95; m.color.setScalar(c?.chuva ? 0.78 : 1); }
  chuva.visible = !!c?.chuva;
  chuva.geometry.setDrawRange(0, [2800, 1600, 700][nivel] || 700);
}
function animarChuva(dt) {
  if (!chuva.visible) return;
  chuva.position.set(camera.position.x, camera.position.y - 6, camera.position.z);
  const a = chuva.geometry.attributes.position, p = a.array, queda = 24 * dt;
  for (let i = 0; i < p.length; i += 6) {
    p[i + 1] -= queda; p[i + 4] -= queda;
    if (p[i + 4] < 0) { const y = 26 + Math.random() * 2; p[i + 1] = y; p[i + 4] = y - 0.7; }
  }
  a.needsUpdate = true;
}

// asfalto de 8 m de largura por 8 m de comprimento por repetição
// manchas do asfalto: borradas e fracas (os retângulos escuros pareciam defeito de desenho na pista)
function manchaAsfalto(g, w, h) {
  const x = Math.random() * w, y = Math.random() * h, r = 30 + Math.random() * 60;
  const gr = g.createRadialGradient(x, y, 0, x, y, r), cor = Math.random() < 0.5 ? '30,32,36' : '95,98,104';
  gr.addColorStop(0, `rgba(${cor},0.16)`); gr.addColorStop(1, `rgba(${cor},0)`);
  g.fillStyle = gr; g.beginPath(); g.ellipse(x, y, r, r * (0.5 + Math.random() * 0.5), Math.random() * 3, 0, Math.PI * 2); g.fill();
}
const texAsfalto = textura(512, 512, (g, w, h) => {
  g.fillStyle = '#4a4e55'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 6; i++) {
    manchaAsfalto(g, w, h);
  }
  for (let i = 0; i < 4000; i++) {
    const c = 55 + Math.random() * 50;
    g.fillStyle = `rgba(${c},${c},${c + 6},0.5)`;
    g.fillRect(Math.random() * w, Math.random() * h, 2, 2);
  }
  const px = (x) => ((x + 4) / 8) * w;
  // (a linha azul da prova não fica mais na textura: é uma faixa própria por baixo do asfalto, ver BORDA_AZUL)
  g.fillStyle = 'rgba(255,255,255,0.85)';
  for (let y = 0; y < h; y += 256) g.fillRect(px(0) - 5, y + 30, 10, 140);
});

// asfalto de avenida (mão única, 3 faixas): tracejado a cada terço; `azul` = linhas azuis da prova nas bordas
function texAsfaltoFaixas(azul) {
  return textura(512, 512, (g, w, h) => {
    g.fillStyle = '#4a4e55'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 6; i++) {
      manchaAsfalto(g, w, h);
    }
    for (let i = 0; i < 4000; i++) { const c = 55 + Math.random() * 50; g.fillStyle = `rgba(${c},${c},${c + 6},0.5)`; g.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
    const px = (x) => ((x + 4) / 8) * w;
    if (!azul) { g.fillStyle = 'rgba(255,255,255,0.8)'; for (const x of [-3.8, 3.8]) g.fillRect(px(x) - 4, 0, 8, h); }
    g.fillStyle = 'rgba(255,255,255,0.85)';
    for (const x of [-1.33, 1.33]) for (let y = 0; y < h; y += 256) g.fillRect(px(x) - 5, y + 30, 10, 140);
  });
}

// calçada de placas de concreto (a ondulada preta e branca virava um borrão listrado de longe)
const texCalcada = textura(256, 256, (g, w, h) => {
  g.fillStyle = '#d3cfc6'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 1500; i++) { const c = 190 + Math.random() * 40; g.fillStyle = `rgba(${c},${c - 3},${c - 10},0.5)`; g.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
  g.fillStyle = 'rgba(120,115,105,0.55)';
  for (let y = 0; y < h; y += 64) g.fillRect(0, y, w, 3);
  g.fillRect(0, 0, 3, h); g.fillRect(w / 2, 0, 3, h);
});

const texGrama = textura(128, 128, (g, w, h) => {
  g.fillStyle = '#6cba52'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 900; i++) {
    const v = Math.random();
    g.fillStyle = v < 0.4 ? '#5ba843' : v < 0.85 ? '#7ccb5f' : '#a6c76a';
    g.fillRect(Math.random() * w, Math.random() * h, 1.5, 2 + Math.random() * 3);
  }
});

// gramado claro e manchado: multiplica a cor de cada área (parque, mata, campo)
const texGramado = textura(256, 256, (g, w, h) => {
  g.fillStyle = '#e9eee4'; g.fillRect(0, 0, w, h);
  const mancha = (x, y, r, cor) => {
    for (const dx of [-w, 0, w]) for (const dy of [-h, 0, h]) {
      const gr = g.createRadialGradient(x + dx, y + dy, 0, x + dx, y + dy, r);
      gr.addColorStop(0, cor); gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr; g.fillRect(x + dx - r, y + dy - r, r * 2, r * 2);
    }
  };
  for (let i = 0; i < 26; i++) mancha(Math.random() * w, Math.random() * h, 20 + Math.random() * 50, Math.random() < 0.5 ? 'rgba(255,255,235,0.3)' : 'rgba(60,90,30,0.08)');
  for (let i = 0; i < 2600; i++) {
    const v = Math.random();
    g.fillStyle = v < 0.45 ? 'rgba(70,110,40,0.22)' : v < 0.9 ? 'rgba(255,255,230,0.3)' : 'rgba(190,170,90,0.25)';
    g.fillRect(Math.random() * w, Math.random() * h, 1.5, 2 + Math.random() * 3);
  }
});

// ondinhas da água: mapa de normais feito de senos que fecham na borda (repete sem emenda)
const texAguaNormal = (() => {
  const N = 128, c = document.createElement('canvas'); c.width = c.height = N;
  const g = c.getContext('2d'), img = g.createImageData(N, N);
  const ondas = [[1, 2, 0.6], [3, -1, 0.35], [-2, 3, 0.3], [5, 4, 0.12], [-6, 1, 0.1]];
  const alt = (x, y) => ondas.reduce((a, [kx, ky, amp]) => a + amp * Math.sin(((kx * x + ky * y) / N) * Math.PI * 2), 0);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const dx = alt(x + 1, y) - alt(x - 1, y), dy = alt(x, y + 1) - alt(x, y - 1);
    const nx = -dx * 2.2, ny = -dy * 2.2, l = Math.hypot(nx, ny, 1), i = (y * N + x) * 4;
    img.data[i] = (nx / l * 0.5 + 0.5) * 255; img.data[i + 1] = (ny / l * 0.5 + 0.5) * 255; img.data[i + 2] = (1 / l * 0.5 + 0.5) * 255; img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
})();

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

const texNumero = texTexto('1273', { w: 256, h: 192, fundo: '#ffffff', cor: '#111', tam: 96, borda: '#1e88ff' });
const texHidratacao = texTexto('💧 HIDRATAÇÃO', { w: 512, h: 128, fundo: '#1e88ff', cor: '#fff', tam: 64 });

// faixas da grade da torcida: nome da prova alternando com frases motivacionais
const FRASES = ['CADA KM É UMA VITÓRIA!', 'RESPIRA E VAI QUE VOCÊ CONSEGUE!', 'A DOR PASSA, A MEDALHA FICA!', 'SEU ÚNICO ADVERSÁRIO É VOCÊ!'];
function texFaixa(txt) {
  return textura(1024, 128, (g, w, h) => {
    g.fillStyle = '#1356c9'; g.fillRect(0, 0, w, h);
    let tam = 76;
    const fonte = () => { g.font = `800 ${tam}px "Baloo 2", system-ui, sans-serif`; };
    fonte();
    while (g.measureText(txt).width > w - 60 && tam > 30) { tam -= 4; fonte(); }
    g.fillStyle = '#ffd21f'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(txt, w / 2, h / 2 + 4);
  });
}
let matsFaixa = [];
function definirFaixas(nome) {
  for (const m of matsFaixa) { m.map.dispose(); m.dispose(); }
  matsFaixa = [nome.toUpperCase(), ...FRASES].map((t) => new THREE.MeshStandardMaterial({ map: texFaixa(t) }));
}

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
  esfera: new THREE.SphereGeometry(1, 12, 8),
  cilindro: new THREE.CylinderGeometry(1, 1, 1, 12),
  capsula: new THREE.CapsuleGeometry(0.5, 1, 3, 8),
  cone: new THREE.ConeGeometry(1, 1, 18),
  roda: new THREE.TorusGeometry(0.42, 0.06, 8, 24),
  moeda: new THREE.CylinderGeometry(0.42, 0.42, 0.1, 24),
  tronco: new THREE.CylinderGeometry(0.12, 0.2, 1, 8),
  // copa facetada (estilo low poly): normais por face
  copa: (() => { const g = new THREE.IcosahedronGeometry(1, 1).toNonIndexed(); g.computeVertexNormals(); return g; })()
};
const PELES = [0xf1c27d, 0xe0ac69, 0xc68642, 0x8d5524, 0x5c3a1e];
const CAMISAS = [0xff4d4d, 0x1e88ff, 0x2ecc71, 0xffd21f, 0xff8c1a, 0xb05cff, 0xffffff, 0x14b8a6];
const escolher = (arr) => arr[Math.floor(Math.random() * arr.length)];
const aleat = (a, b) => a + Math.random() * (b - a);

// junta as peças sem textura num único mesh com cores por vértice: 1 desenho por objeto
const matVertice = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 });
const matArvore = balancoDeArvore(matVertice.clone()); // copa balançando com o vento
function achatar(grupo) {
  grupo.updateMatrixWorld(true);
  const inv = grupo.matrixWorld.clone().invert();
  const geos = [], comTextura = [];
  grupo.traverse((o) => {
    if (!o.isMesh) return;
    if (Array.isArray(o.material) || o.material.map || o.material.transparent) { comTextura.push(o); return; }
    const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
    g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld));
    const cor = o.material.color, n = g.attributes.position.count, c = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { c[i * 3] = cor.r; c[i * 3 + 1] = cor.g; c[i * 3 + 2] = cor.b; }
    g.setAttribute('color', new THREE.BufferAttribute(c, 3));
    geos.push(g);
  });
  // as peças ficam relativas ao grupo; o grupo novo herda a escala dele (posição e giro vêm de quem usa)
  const novo = new THREE.Group();
  novo.scale.copy(grupo.scale);
  if (geos.length) { const m = new THREE.Mesh(mergeGeometries(geos), grupo.userData.balanca ? matArvore : matVertice); m.castShadow = true; novo.add(m); }
  for (const o of comTextura) {
    new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld).decompose(o.position, o.quaternion, o.scale);
    novo.add(o);
  }
  return novo;
}

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
    if (lado < 0) { const relogio = malha(G.cilindro, mat(0x111111), 0, -0.3, 0); relogio.scale.set(0.09, 0.06, 0.09); ante.add(relogio); }
    bracos.push(ombro); cotovelos.push(ante);
  }

  const sombra = new THREE.Mesh(new THREE.CircleGeometry(0.6, 24), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.25, depthWrite: false }));
  sombra.rotation.x = -Math.PI / 2;
  scene.add(sombra);

  g.scale.setScalar(0.92);
  scene.add(g);
  return { g, corpo, pernas, joelhos, bracos, cotovelos, sombra };
}

const ALTURA_ATLETA = 2.15;
// personagens jogáveis: cada um com as animações de correr, parado e comemorar (yaw corrige a direção do arquivo)
const PERSONAGENS = {
  portal: { nome: 'Corredor Mapmove', desc: 'O atleta do simulador do Portal, com boné, óculos e colete.', emoji: '🏃',
    anims: [['correr', 'atleta-corrida.glb', 0], ['parado', 'atleta-parado.glb', 37], ['comemorar', 'atleta-comemora.glb', 0]] },
  liso: { nome: 'Corredor liso', desc: 'Experimental: regata e shorts lisos, ideal para os acessórios da loja.', emoji: '🏃‍♂️',
    anims: [['correr', 'corredor-corrida.glb', 0], ['parado', 'corredor-parado.glb', 0], ['comemorar', 'corredor-comemora.glb', 0]] },
  corredora: { nome: 'Corredora',
    // a cabeça dela fica mais baixa no osso que a do corredor liso (onde os acessórios foram calibrados)
    cabeca: { dx: -0.006, dy: -0.034, dz: -0.018, rx: -4, esc: 0.93, oculos: { pos: [-0.006, 0.046, 0.048], tam: 0.08 }, bandana: { pos: [-0.006, 0.07, 0.02], rot: [-8, 0, 0], tam: 0.15, largura: 0.62 } }, desc: 'Feita no Meshy: aquece com polichinelos e pula os carros com rolamento.', emoji: '🏃🏾‍♀️',
    // um arquivo com várias animações: estado do jogo → nome da animação no arquivo
    arquivo: 'corredora.glb', clipes: { caminhar: 'Walking', correr: 'Run_02', parado: 'jumping_jacks', aquecer: 'jumping_jacks', comemorar: 'Cheer_with_Both_Hands_Up', pular: 'Run_Jump_and_Roll' } },
  maratonista: { nome: 'Maratonista',
    cabeca: { dx: 0, dy: -0.028, dz: -0.014, rx: -4, esc: 0.96, oculos: { pos: [0, 0.056, 0.05], tam: 0.085 }, bandana: { pos: [0, 0.075, 0.02], rot: [-8, 0, 0], tam: 0.142, largura: 0.72 } }, desc: 'Feito no Meshy a partir das fichas de 3 vistas.', emoji: '🏃🏾',
    anims: [['correr', 'maratonista-corrida.glb', 0], ['parado', 'maratonista-parado.glb', 0], ['comemorar', 'maratonista-comemora.glb', 0]] }
};
let vitrine = null; // vitrine 3D dos personagens (loja), criada na primeira vez
const gltfLoader = new GLTFLoader();
// modelos exportados do Meshy vêm com a malha comprimida (Draco)
gltfLoader.setDRACOLoader(new DRACOLoader().setDecoderPath('/draco/'));

let carregandoAtleta = 0;
async function carregarAtleta(c, id = 'portal') {
  const vez = ++carregandoAtleta;
  const pers = PERSONAGENS[id] || PERSONAGENS.portal;
  if (pers.arquivo) return carregarAtletaUnico(c, pers, id, vez);
  // carrega tudo antes de trocar, para o corredor não sumir no meio
  const gltfs = await Promise.all(pers.anims.map(([, arquivo]) => gltfLoader.loadAsync(`/modelos/${arquivo}`)));
  if (vez !== carregandoAtleta) return;
  if (c.atleta?.holder) c.g.remove(c.atleta.holder);
  const pedida = c.atleta?.pedida;
  const holder = new THREE.Group();
  c.g.add(holder);
  c.atleta = { holder, partes: {}, atual: null, pedida, id };
  for (const [k, [nome, , yaw]] of pers.anims.entries()) {
    const gltf = gltfs[k];
    const model = gltf.scene;
    model.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(model, true), h = (box.max.y - box.min.y) || 1;
    model.position.set(-(box.min.x + box.max.x) / 2, -box.min.y, -(box.min.z + box.max.z) / 2);
    model.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = true; o.frustumCulled = false;
      // modelos do Meshy vêm com mapa de metal/brilho: com o sol do jogo viram manchas brancas; deixa a pele e a roupa foscas
      for (const m of [].concat(o.material)) {
        if (!m?.isMeshStandardMaterial || !m.metalnessMap) continue;
        m.metalness = 0; m.metalnessMap = null;
        m.roughness = 1; m.envMapIntensity = 0.6;
        m.needsUpdate = true;
      }
    });
    // o modelo olha para +z; o corredor do jogo olha para -z
    const grp = new THREE.Group(); grp.add(model);
    grp.scale.setScalar(ALTURA_ATLETA / c.g.scale.x / h);
    grp.rotation.y = Math.PI + (yaw * Math.PI) / 180;
    grp.visible = false;
    holder.add(grp);
    const mixer = new THREE.AnimationMixer(model);
    const acao = mixer.clipAction(gltf.animations[0]);
    acao.play();
    c.atleta.partes[nome] = { grp, mixer, acao, model, h, minY: box.min.y };
    if (nome === 'correr') { c.corpo.visible = false; trocarAnimacao(c, 'parado'); }
  }
  trocarAnimacao(c, pedida || 'parado');
  vestirAtleta();
}

// objetos 3D (carro, mesa de água, barreira): carregados uma vez e clonados para cada uso
const PROPS = {
  carro: { arquivo: 'carro.glb', comprimento: 3.6, eixo: 'x', giro: 0 },
  // carros do pacote Free Low Poly Vehicles (Rgsdev, CC0): rodas separadas que giram no jogo; a frente vai para +x
  'carro-sedan': { arquivo: 'carros/sedan.glb', comprimento: 4.4, eixo: 'x', giro: 0 },
  'carro-hatch': { arquivo: 'carros/hatchback.glb', comprimento: 4.2, eixo: 'x', giro: 0 },
  'carro-suv': { arquivo: 'carros/suv.glb', comprimento: 4.6, eixo: 'x', giro: 0 },
  'carro-taxi': { arquivo: 'carros/taxi.glb', comprimento: 4.5, eixo: 'x', giro: 0 },
  'carro-picape': { arquivo: 'carros/pickup.glb', comprimento: 5.0, eixo: 'x', giro: 0 },
  'carro-van': { arquivo: 'carros/van.glb', comprimento: 5.0, eixo: 'x', giro: 0 },
  'carro-classico': { arquivo: 'carros/muscle.glb', comprimento: 4.8, eixo: 'x', giro: 0 },
  'carro-esporte': { arquivo: 'carros/sports.glb', comprimento: 4.5, eixo: 'x', giro: 0 },
  'carro-policia': { arquivo: 'carros/police-sedan.glb', comprimento: 4.6, eixo: 'x', giro: 0 },
  ambulancia: { arquivo: 'carros/ambulance.glb', comprimento: 5.6, eixo: 'z', giro: 0 },
  // carro desgovernado (Meshy): malha única; as rodas são recortadas na carga para poderem girar. Frente para -x
  'carro-festa': { arquivo: 'carros/carro-festa.glb', comprimento: 4.3, eixo: 'x', giro: 0, preparar: (m) => separarRodas(m, RODAS_FESTA) },
  // mesa e cavalete vão pela altura real; o comprimento sai da proporção do modelo
  mesa: { arquivo: 'mesa-agua.glb', altura: 1.0, eixo: 'z', giro: 0 },
  barreira: { arquivo: 'barreira.glb', altura: 1.12, eixo: 'x', giro: 0 },
  // cenário de parque
  ipe: { arquivo: 'ipe2.glb', altura: 6.5, balanca: true },
  placa: { arquivo: 'placa.glb', altura: 4.2 },
  arvoreGrande: { arquivo: 'arvore.glb', altura: 8, balanca: true },
  banco: { arquivo: 'banco.glb', comprimento: 1.8, eixo: 'x', giro: 0 },
  poste: { arquivo: 'poste.glb', altura: 5 },
  pedalinho: { arquivo: 'pedalinho.glb', comprimento: 2.4, eixo: 'z', giro: 0 },
  torcedor: { arquivo: 'torcedor.glb', altura: 1.75 },
  // lugares do mapa (modelos Higgsfield); a frente do modelo fica para +z
  igreja: { arquivo: 'igreja.glb', altura: 16, giro: -Math.PI / 2 },
  escola: { arquivo: 'escola.glb', comprimento: 26, giro: -Math.PI / 2 },
  padaria: { arquivo: 'padaria.glb', comprimento: 10, giro: -Math.PI / 2 },
  mercado: { arquivo: 'mercado.glb', comprimento: 15, giro: 0 },
  posto: { arquivo: 'posto.glb', comprimento: 18, giro: -Math.PI / 2 },
  // Centro Cultural "Piano" (modelo do Meshy, reduzido para 20 mil triângulos)
  piano: { arquivo: 'piano.glb', comprimento: 46, eixo: 'x', giro: 0 },
};

async function carregarProp(nome) {
  const cfg = PROPS[nome];
  const gltf = await gltfLoader.loadAsync(`/modelos/${cfg.arquivo}`);
  const model = gltf.scene;
  if (cfg.balanca) model.traverse((o) => { if (o.isMesh) o.material = balancoDeArvore(o.material.clone(), { altura: cfg.altura || 7 }); });
  cfg.preparar?.(model);
  model.updateMatrixWorld(true);
  let box = new THREE.Box3().setFromObject(model, true);
  const tam = box.getSize(new THREE.Vector3());
  // deixa o lado comprido no eixo pedido
  const longoEmX = tam.x >= tam.z;
  if (cfg.eixo && (cfg.eixo === 'x') !== longoEmX) model.rotation.y = Math.PI / 2;
  model.rotation.y += cfg.giro || 0;
  model.updateMatrixWorld(true);
  box = new THREE.Box3().setFromObject(model, true);
  const t2 = box.getSize(new THREE.Vector3());
  const escala = cfg.altura ? cfg.altura / Math.max(t2.y, 0.001) : cfg.comprimento / Math.max(t2.x, t2.z, 0.001);
  const g = new THREE.Group();
  model.position.set(-(box.min.x + box.max.x) / 2, -box.min.y, -(box.min.z + box.max.z) / 2);
  g.add(model);
  g.scale.setScalar(escala);
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  if (cfg.balanca) g.userData.balanca = true; // peças sem textura, ao serem juntadas, também balançam
  cfg.modelo = g;
  cfg.tamanho = t2.multiplyScalar(escala);
}

// clone do modelo 3D, ou null enquanto não carregou (aí usa o desenho de blocos)
function prop(nome) {
  const m = PROPS[nome]?.modelo;
  return m ? m.clone() : null;
}

// materiais do Meshy vêm com mapa de metal/brilho: com o sol do jogo viram manchas brancas; deixa foscos
function prepararMalhaAtleta(model) {
  model.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = true; o.frustumCulled = false;
    for (const m of [].concat(o.material)) {
      if (!m?.isMeshStandardMaterial) continue;
      // as peças da textura (pele, roupa) ficam coladas no atlas com uma borda branca entre elas, que vazava
      // e virava manchas brancas no celular: preenche a borda com a cor da peça vizinha
      preencherBordas([m.map, m.normalMap, m.roughnessMap], [o.geometry], 8);
      // o Meshy picota o boneco em centenas de pedacinhos no atlas: ler sem misturar vizinhos (nem mipmaps)
      // evita que o branco da regata invada a pele quando o corredor fica pequeno na tela
      for (const t of [m.map, m.normalMap, m.roughnessMap]) {
        if (!t) continue;
        t.generateMipmaps = false; t.minFilter = THREE.NearestFilter; t.magFilter = THREE.LinearFilter; t.needsUpdate = true;
      }
      // o relevo picotado também gera brilhos falsos nas emendas: dispensa
      if (m.normalMap) { m.normalMap = null; m.needsUpdate = true; }
      if (!m.metalnessMap) continue;
      m.metalness = 0; m.metalnessMap = null;
      m.roughness = 1; m.envMapIntensity = 0.6;
      m.needsUpdate = true;
    }
  });
}

// salto com rolamento: trava o avanço do quadril (quem anda é a pista) e tira a subida (quem sobe é o jogo)
function clipeDeSalto(clipe) {
  const c = clipe.clone();
  for (const tr of c.tracks) {
    if (!/Hips\.position$/.test(tr.name)) continue;
    const v = tr.values, x0 = v[0], y0 = v[1], z0 = v[2];
    for (let i = 0; i < v.length; i += 3) { v[i] = x0; v[i + 1] = Math.min(v[i + 1], y0); v[i + 2] = z0; }
  }
  return c;
}
const SALTO_ANIM = { de: 0.8, ate: 3.3, duracao: 1.5 }; // trecho do clipe: decolagem → de pé de novo

async function carregarAtletaUnico(c, pers, id, vez) {
  const gltf = await gltfLoader.loadAsync(`/modelos/${pers.arquivo}`);
  if (vez !== carregandoAtleta) return;
  if (c.atleta?.holder) c.g.remove(c.atleta.holder);
  const pedida = c.atleta?.pedida;
  const holder = new THREE.Group();
  c.g.add(holder);
  c.atleta = { holder, partes: {}, atual: null, pedida, id };
  const model = gltf.scene;
  model.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(model, true), h = (box.max.y - box.min.y) || 1;
  model.position.set(-(box.min.x + box.max.x) / 2, -box.min.y, -(box.min.z + box.max.z) / 2);
  prepararMalhaAtleta(model);
  const grp = new THREE.Group(); grp.add(model);
  grp.scale.setScalar(ALTURA_ATLETA / c.g.scale.x / h);
  grp.rotation.y = Math.PI;
  holder.add(grp);
  const mixer = new THREE.AnimationMixer(model);
  for (const [estado, nomeClipe] of Object.entries(pers.clipes)) {
    let clipe = gltf.animations.find((a) => a.name === nomeClipe);
    if (!clipe) continue;
    if (estado === 'pular') clipe = clipeDeSalto(clipe);
    const acao = mixer.clipAction(clipe);
    if (estado === 'pular' || estado === 'comemorar') { acao.setLoop(estado === 'pular' ? THREE.LoopOnce : THREE.LoopRepeat); acao.clampWhenFinished = true; }
    c.atleta.partes[estado] = { grp, mixer, acao, model, h, minY: box.min.y, unico: true };
  }
  c.corpo.visible = false;
  trocarAnimacao(c, pedida || 'parado');
  vestirAtleta();
}

function trocarAnimacao(c, nome) {
  const a = c.atleta;
  if (!a) return;
  a.pedida = nome;
  // quem não tem aquecimento fica parado; quem não tem salto corre no ar
  const parte = a.partes[nome] || (nome === 'aquecer' && a.partes.parado) || a.partes.correr;
  // (caminhar e pular sem animação própria caem na corrida)
  if (!parte || a.atual === parte) return;
  if (a.atual && a.atual.grp === parte.grp) {
    // mesmo boneco, outra animação: transição suave
    a.atual.acao.fadeOut(0.15);
    parte.acao.reset().fadeIn(0.15).play();
    if (nome === 'pular') parte.acao.time = SALTO_ANIM.de;
  } else {
    if (a.atual) a.atual.grp.visible = false;
    parte.grp.visible = true;
    parte.acao.reset().play();
  }
  a.atual = parte;
}

// ─── PELOTÃO: OUTROS CORREDORES (NPCs), MOTO BATEDORA E CARRO LÍDER ─────────────
const NPC_POR_NIVEL = [14, 9, 5];
const NPC_TOTAL = 120; // inscritos virtuais na prova (só os perto de você aparecem)
const npcModelos = [];
let pelotao = [], npcPool = [];
(async () => {
  for (const [arq, clipe] of [['corredora.glb', 'Run_02'], ['maratonista-corrida.glb', null]]) {
    try {
      const g = await gltfLoader.loadAsync(`/modelos/${arq}`);
      prepararMalhaAtleta(g.scene);
      g.scene.updateMatrixWorld(true);
      const clip = (clipe && g.animations.find((a) => a.name === clipe)) || g.animations[0];
      npcModelos.push({ cena: g.scene, clip, box: new THREE.Box3().setFromObject(g.scene, true) });
    } catch (e) { console.warn('npc', arq, e); }
  }
})();
function criarNpc(k) {
  const m = npcModelos[k % npcModelos.length];
  const model = clonarComOssos(m.cena), b = m.box, h = (b.max.y - b.min.y) || 1;
  model.position.set(-(b.min.x + b.max.x) / 2, -b.min.y, -(b.min.z + b.max.z) / 2);
  model.traverse((o) => { if (o.isMesh) { o.castShadow = nivel === 0; o.frustumCulled = false; } });
  const grp = new THREE.Group(); grp.add(model);
  grp.scale.setScalar((ALTURA_ATLETA * aleat(0.92, 1.03)) / h); grp.rotation.y = Math.PI;
  const holder = new THREE.Group(); holder.add(grp); holder.visible = false; scene.add(holder);
  const mixer = new THREE.AnimationMixer(model), acao = mixer.clipAction(m.clip);
  acao.play(); mixer.update(Math.random() * m.clip.duration);
  return { holder, mixer, npc: null };
}
function prepararPelotao() {
  pelotao = prova ? PL.criarPelotao(NPC_TOTAL, estado.paceBase || R.PACE_BASE) : [];
  const n = npcModelos.length ? NPC_POR_NIVEL[nivel] || 3 : 0;
  while (npcPool.length < n) npcPool.push(criarNpc(npcPool.length));
  for (const p of npcPool) { p.npc = null; p.holder.visible = false; }
  estado.posicao = null;
}
function desenharPelotao(dt) {
  const s = estado, n = Math.min(npcPool.length, NPC_POR_NIVEL[nivel] || 3);
  // os mais perto do corredor (um pouco atrás até bem à frente) ganham um boneco
  // quem vem à frente ganha boneco primeiro e de longe (até ~170 m), para não "brotar" perto; atrás, só os colados
  const atras = pelotao.filter((c) => c.s <= s.s && c.s > s.s - 12).sort((a, b) => b.s - a.s).slice(0, Math.max(1, Math.floor(n / 4)));
  const frente = pelotao.filter((c) => c.s > s.s && c.s < s.s + 170).sort((a, b) => a.s - b.s).slice(0, n - atras.length);
  const perto = [...frente, ...atras];
  const usados = new Set(perto);
  for (const p of npcPool) if (p.npc && !usados.has(p.npc)) { p.npc = null; p.holder.visible = false; }
  for (const c of perto) {
    let p = npcPool.find((q) => q.npc === c);
    if (!p) { p = npcPool.slice(0, n).find((q) => !q.npc); if (!p) continue; p.npc = c; }
    const e = emEst(c.s), [rx, rz] = direita(e.ang);
    p.holder.position.set(e.x + rx * c.d, e.y, e.z + rz * c.d);
    p.holder.rotation.y = -e.ang;
    p.holder.visible = true;
    p.mixer.update(s.modo === 'jogando' ? dt * (s.paceBase / c.pace) : 0);
  }
  desenharLideres();
}

// moto batedora com giroflex e carro líder com o cronômetro da prova, abrindo caminho para quem lidera
const lideres = (() => {
  const moto = new THREE.Group();
  const preto = mat(0x1d1f24), branco = mat(0xf2f2f2);
  for (const z of [-0.75, 0.75]) { const r = malha(G.cilindro, preto, 0, 0.34, z); r.scale.set(0.34, 0.12, 0.34); r.rotation.z = Math.PI / 2; moto.add(r); }
  const tanque = malha(G.caixa, branco, 0, 0.72, 0); tanque.scale.set(0.34, 0.32, 1.3); moto.add(tanque);
  const piloto = malha(G.caixa, mat(0x1356c9), 0, 1.25, -0.1); piloto.scale.set(0.45, 0.7, 0.35); moto.add(piloto);
  const capacete = malha(G.esfera, branco, 0, 1.75, -0.05); capacete.scale.setScalar(0.2); moto.add(capacete);
  const luzes = [0xff2a2a, 0x2a6bff].map((cor, i) => { const l = malha(G.esfera, new THREE.MeshStandardMaterial({ color: cor, emissive: cor, emissiveIntensity: 2 }), (i ? 0.12 : -0.12), 1.05, -0.75); l.scale.setScalar(0.08); moto.add(l); return l; });
  moto.visible = false; scene.add(moto);
  const carro = new THREE.Group(); carro.visible = false; scene.add(carro);
  const c = document.createElement('canvas'); c.width = 256; c.height = 96;
  const texCrono = new THREE.CanvasTexture(c);
  return { moto, luzes, carro, c, texCrono, montado: false, seg: -1 };
})();
function desenharLideres() {
  const s = estado, L = lideres;
  const ativo = !!prova && (s.modo === 'jogando' || s.modo === 'contagem');
  const frente = ativo ? PL.lider(pelotao, s.s) : 0;
  if (ativo && !L.montado && PROPS['carro-picape']?.modelo) {
    const m = prop('carro-picape');
    const painel = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.56), new THREE.MeshBasicMaterial({ map: L.texCrono }));
    painel.position.set(-1.2 / m.scale.x, 2.1 / m.scale.x, 0); painel.rotation.y = -Math.PI / 2; painel.scale.setScalar(1 / m.scale.x);
    m.add(painel);
    const suporte = malha(G.caixa, mat(0x222222), -1.2 / m.scale.x, 1.75 / m.scale.x, 0); suporte.scale.set(0.1 / m.scale.x, 0.5 / m.scale.x, 1.6 / m.scale.x); m.add(suporte);
    L.carro.add(m); L.montado = true;
  }
  const pos = (obj, sAlvo, giro) => {
    const e = emEst(sAlvo), [rx, rz] = direita(e.ang);
    obj.position.set(e.x + rx * 0.6, e.y, e.z + rz * 0.6); obj.rotation.y = -e.ang + giro;
    obj.visible = ativo && sAlvo > s.s - 15 && sAlvo < s.s + 220;
  };
  // a moto batedora abre caminho bem na sua frente (ou na frente do líder, se você estiver lá na ponta)
  pos(L.moto, Math.min(frente + 28, s.s + 38), 0);
  pos(L.carro, frente + 52, Math.PI / 2);
  const pisca = Math.floor(s.t * 6) % 2;
  L.luzes[0].visible = !!pisca; L.luzes[1].visible = !pisca;
  // cronômetro da prova no carro (atualiza uma vez por segundo)
  const seg = Math.floor(s.tempoReal || 0);
  if (L.carro.visible && seg !== L.seg) {
    L.seg = seg;
    const g = L.c.getContext('2d');
    g.fillStyle = '#0b0b0b'; g.fillRect(0, 0, 256, 96);
    g.fillStyle = '#ffde3b'; g.font = 'bold 62px monospace'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(R.formatarTempo(seg), 128, 50);
    L.texCrono.needsUpdate = true;
  }
}

function animarAtleta(c, dt, { anim, ritmo = 1, noAr = false, agachado = false }) {
  const a = c.atleta;
  if (!a?.atual && !a?.partes.correr) return false;
  trocarAnimacao(c, anim);
  const parte = a.atual;
  if (!parte) return false;
  parte.acao.timeScale = anim === 'pular' && a.partes.pular ? (SALTO_ANIM.ate - SALTO_ANIM.de) / SALTO_ANIM.duracao : noAr ? 0.25 : ritmo;
  parte.mixer.update(dt);
  a.holder.scale.y = agachado ? 0.62 : 1;
  a.holder.rotation.x = agachado ? 0.35 : noAr && !(anim === 'pular' && a.partes.pular) ? -0.15 : 0;
  return true;
}

function animarCorredor(c, fase, { noAr = false, agachado = false, parado = false } = {}) {
  c.corpo.scale.y = agachado ? 0.58 : 1;
  if (noAr) {
    c.pernas[0].rotation.x = 1.0; c.joelhos[0].rotation.x = -1.6;
    c.pernas[1].rotation.x = -0.5; c.joelhos[1].rotation.x = -1.1;
    c.bracos[0].rotation.x = -1.1; c.bracos[1].rotation.x = 0.9;
    c.cotovelos[0].rotation.x = c.cotovelos[1].rotation.x = 1.0;
    c.corpo.position.y = 0;
    return;
  }
  const s = parado ? 0 : Math.sin(fase);
  for (let i = 0; i < 2; i++) {
    const lado = i === 0 ? 1 : -1;
    c.pernas[i].rotation.x = s * 0.85 * lado;
    c.joelhos[i].rotation.x = -Math.max(0, -s * lado) * 1.5 - 0.15;
    c.bracos[i].rotation.x = -s * 0.75 * lado;
    c.cotovelos[i].rotation.x = 1.25;
  }
  c.corpo.position.y = parado ? 0 : Math.abs(Math.cos(fase)) * 0.12;
  c.corpo.rotation.x = agachado ? 0.5 : 0.12;
}

// ─── CENÁRIO ──────────────────────────────────────────────────────────────────

function torcedor() {
  const g = new THREE.Group();
  const pele = mat(escolher(PELES));
  const corpo = malha(G.capsula, mat(escolher(CAMISAS)), 0, 1.0, 0); corpo.scale.set(0.5, 0.5, 0.4); g.add(corpo);
  const cabeca = malha(G.esfera, pele, 0, 1.68, 0); cabeca.scale.setScalar(0.22); g.add(cabeca);
  if (Math.random() < 0.55) {
    for (const lado of [-1, 1]) {
      const b = malha(G.capsula, pele, lado * 0.42, 1.62, 0); b.scale.set(0.11, 0.3, 0.11); b.rotation.z = -lado * 0.75; g.add(b);
    }
  }
  if (Math.random() < 0.25) { const bone = malha(G.esfera, mat(escolher(CAMISAS)), 0, 1.8, 0); bone.scale.set(0.24, 0.12, 0.24); g.add(bone); }
  return g;
}

// grade da torcida no limite da calçada; o grupo fica na borda (d = ±7,7) e as pessoas atrás
function segmentoTorcida(lado) {
  const g = new THREE.Group();
  const placa = new THREE.Mesh(new THREE.PlaneGeometry(6.6, 0.9), escolher(matsFaixa));
  placa.position.set(0, 0.7, 0); placa.rotation.y = -lado * Math.PI / 2; g.add(placa);
  const topo = malha(G.caixa, mat(0xdfe6ee), 0, 1.2, 0); topo.scale.set(0.08, 0.08, 6.6); g.add(topo);
  const modelo = prop('torcedor');
  if (modelo) {
    modelo.position.set(lado * aleat(0.7, 1.2), 0, aleat(-1.5, 1.5));
    modelo.rotation.y = (lado > 0 ? Math.PI : 0) + aleat(-0.4, 0.4);
    g.add(modelo);
  }
  for (let i = modelo ? 1 : 0; i < (modelo ? 3 : 4); i++) {
    const p = torcedor();
    p.position.set(lado * aleat(0.7, 2.2), 0, -2.6 + i * 1.7 + aleat(0, 0.4));
    p.rotation.y = -lado * Math.PI / 2 + aleat(-0.3, 0.3);
    g.add(p);
  }
  return g;
}

const VERDES = [0x2f9e44, 0x3cb371, 0x4caf50, 0x2e7d32, 0x5bbf4a];
function arvore(escala = 1) {
  const g = new THREE.Group();
  const madeira = mat(0x8a5a2b);
  const tronco = malha(G.tronco, madeira, 0, 1.3, 0); tronco.scale.set(1, 2.6, 1); g.add(tronco);
  for (const lado of [-1, 1]) {
    const ramo = malha(G.tronco, madeira, lado * 0.32, 2.35, 0); ramo.scale.set(0.5, 0.9, 0.5); ramo.rotation.z = -lado * 0.7; g.add(ramo);
  }
  const base = escolher(VERDES);
  for (const [x, y, z, r] of [[0, 3.0, 0, 1.2], [0.75, 2.65, 0.2, 0.82], [-0.7, 2.7, -0.15, 0.88], [0.1, 3.65, 0.1, 0.8], [0, 2.55, -0.65, 0.75], [-0.15, 2.6, 0.7, 0.72]]) {
    const c = malha(G.copa, mat(Math.random() < 0.6 ? base : escolher(VERDES)), x, y, z);
    c.scale.setScalar(r * aleat(0.9, 1.1)); c.rotation.set(aleat(0, 3), aleat(0, 3), 0); g.add(c);
  }
  g.scale.setScalar(escala);
  g.userData.balanca = true;
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
  g.userData.balanca = true;
  return g;
}

function predio(baixo = false) {
  const h = baixo ? aleat(5, 10) : aleat(7, 22), w = aleat(6, 10), d = aleat(6, 9);
  const cores = [0xf4d7b5, 0xd6e4f0, 0xf7f1e3, 0xe8c4a0, 0xcfe8d5, 0xf0d0d8];
  const map = texJanelas.clone(); map.needsUpdate = true; map.repeat.set(Math.round(w / 2), Math.round(h / 4));
  const o = new THREE.Mesh(G.caixa, new THREE.MeshStandardMaterial({ color: escolher(cores), map, roughness: 0.9 }));
  o.scale.set(d, h, w); o.position.y = h / 2;
  const g = new THREE.Group(); g.add(o);
  return g;
}

// ─── PISTA (FITAS DE RUA, CALÇADA E GRAMA SEGUINDO O PERCURSO) ────────────────

let pista = new PistaReta();
let prova = null; // { nome, rotulo, total } quando é percurso real
let visual = new THREE.Group();
scene.add(visual);
const fundo = new THREE.Group();
scene.add(fundo);
{
  const morroMat = new THREE.MeshStandardMaterial({ color: 0x5f8f5a, roughness: 1, fog: false });
  for (const [x, z, sx, sy, sz] of [[-34, -330, 9, 30, 9], [-20, -350, 14, 16, 12], [38, -340, 11, 34, 10], [52, -360, 20, 18, 14]]) {
    const m = new THREE.Mesh(G.esfera, morroMat); m.position.set(x, 0, z); m.scale.set(sx, sy, sz); fundo.add(m);
  }
  const cristo = malha(G.caixa, new THREE.MeshStandardMaterial({ color: 0xf2f2f2, fog: false }), 38, 35.5, -340);
  cristo.scale.set(0.6, 3, 0.6); fundo.add(cristo);
  const bracos = malha(G.caixa, cristo.material, 38, 36.4, -340); bracos.scale.set(3.4, 0.45, 0.5); fundo.add(bracos);
}

// posição da pista também antes da largada e depois da chegada (segue reto)
const emEst = (s) => posicaoEstendida(pista, s);

// quanto o percurso vira (rad) de um pouco atrás até alguns metros à frente de s: mede curvas fechadas e retornos.
// Guardado a cada 4 m (o pelotão inteiro consulta a cada quadro); zera quando a pista muda.
let cacheCurva = new Map(), pistaDaCurva = null;
function curvaEm(s) {
  if (pistaDaCurva !== pista) { cacheCurva = new Map(); pistaDaCurva = pista; }
  const k = Math.round(s / 4);
  let c = cacheCurva.get(k);
  if (c === undefined) {
    const s0 = k * 4, atras = emEst(s0 - R.CURVA.atras).ang, aqui = emEst(s0).ang;
    c = 0;
    for (const m of R.CURVA.olhar) {
      const a = emEst(s0 + m).ang;
      c = Math.max(c, Math.abs(difAngulo(a, atras)), Math.abs(difAngulo(a, aqui)));
    }
    cacheCurva.set(k, c);
  }
  return c;
}

const corInclinacao = (inc, out) => {
  if (inc > 0.01) { const f = Math.min(1, (inc - 0.01) / 0.06); out.setRGB(1, 1 - f * 0.48, 1 - f * 0.6); }
  else if (inc < -0.01) { const f = Math.min(1, (-inc - 0.01) / 0.06); out.setRGB(1 - f * 0.5, 1 - f * 0.25, 1); }
  else out.setRGB(1, 1, 1);
  return out;
};

// faixa (rua, calçada, grama...) entre os afastamentos d0..d1 ao longo das amostras; a planta (com os limites que
// evitam invadir outro trecho do percurso) vem de planoFita em src/faixas.js, a mesma que o checador usa
function fita(amostras, d0, d1, material, { vCada = 8, dy = 0, inclinacao = false, semLimite = false, uDe = null } = {}) {
  const n = amostras.length;
  const { xz, u, ativo } = planoFita(amostras, d0, d1, { semLimite });
  const pos = new Float32Array(n * 2 * 3), uv = new Float32Array(n * 2 * 2), cor = inclinacao ? new Float32Array(n * 2 * 3) : null;
  const c = new THREE.Color();
  for (let i = 0; i < n; i++) {
    const a = amostras[i];
    if (cor) corInclinacao(a.inclinacao, c);
    for (let k = 0; k < 2; k++) {
      const j = i * 2 + k;
      pos[j * 3] = xz[i * 4 + k * 2]; pos[j * 3 + 1] = a.y + dy; pos[j * 3 + 2] = xz[i * 4 + k * 2 + 1];
      // uDe = [a, b]: a textura vai de a até b (rua desenhada em partes continua com o tracejado no lugar)
      uv[j * 2] = uDe && typeof d0 === 'number' && typeof d1 === 'number' ? (d0 + u[j] * (d1 - d0) - uDe[0]) / (uDe[1] - uDe[0]) : u[j];
      uv[j * 2 + 1] = a.s / vCada;
      if (cor) { cor[j * 3] = c.r; cor[j * 3 + 1] = c.g; cor[j * 3 + 2] = c.b; }
    }
  }
  const idx = [];
  for (let i = 0; i < n - 1; i++) { if (!ativo[i]) continue; const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  if (cor) geo.setAttribute('color', new THREE.BufferAttribute(cor, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, material);
  m.receiveShadow = true;
  return m;
}

// nos zigue-zagues a grama de um trecho cobre a rua de outro: rua e calçada sempre por cima
// o polygonOffset com fator alto cobria a parte de baixo dos carros e do corredor (pareciam afundados no asfalto)
const matRua = new THREE.MeshStandardMaterial({ map: texAsfalto, roughness: 0.95, vertexColors: true, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4 });
// linha azul da prova: faixa própria logo por baixo do asfalto (polygonOffset menor que o da rua). A rua é desenhada
// em partes que deixam livre a faixa da borda; onde a rua de outra passagem do percurso passa por cima (retornos,
// largada dentro de um retorno, ida e volta encostadas), o asfalto dela cobre a linha e não sobra "borda no meio da rua"
const BORDA_AZUL = [3.48, 3.72];
const matBordaAzul = new THREE.MeshStandardMaterial({ color: 0x1e88ff, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -3 });
function ruaComBorda(amostras, grupo, opts) {
  const [b0, b1] = BORDA_AZUL, M = R.MEIA_RUA, o = { ...opts, uDe: [-M, M] };
  const partes = [[-b0, b0, matRua, o], [b1, M, matRua, o], [-M, -b1, matRua, o], [b0, b1, matBordaAzul, {}], [-b1, -b0, matBordaAzul, {}]];
  for (const [d0, d1, m, op] of partes) grupo.add(fita(amostras, d0, d1, m, op));
}
const matCalcada = new THREE.MeshStandardMaterial({ map: texCalcada, roughness: 1, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 });
const matGrama = new THREE.MeshStandardMaterial({ map: texGrama, roughness: 1, depthWrite: false });
const texChao = texGramado.clone(); texChao.repeat.set(9000 / 9, 9000 / 9);
const matChao = new THREE.MeshStandardMaterial({ color: 0x7fc062, map: texChao, roughness: 1, depthWrite: false });
// a grama repete a textura a cada 4 m nos dois sentidos
texGrama.repeat.set(6, 1);
// manchas naturais (mais verde / mais seca) calculadas na placa de vídeo: some o "papel de parede" repetido
manchasDeGrama(matGrama); manchasDeGrama(matChao);

// tufos de grama balançando na beira da pista, perto do corredor (menos no gráfico médio, nenhum no baixo)
const TUFOS_POR_NIVEL = [1500, 700, 0];
const tufos = criarTufos(TUFOS_POR_NIVEL[0]);
scene.add(tufos.malha);
function ondeTufo(s, d) {
  const fora = Number.isFinite(pista.total) && (s > pista.total + 60 || s < -40);
  if (fora) return { ok: false };
  const p = emEst(s);
  const [rx, rz] = direita(p.ang);
  const x = p.x + rx * d, z = p.z + rz * d;
  // nada de grama nas ruas que cruzam nem em cima de outro trecho do percurso
  if (travessas.some((t) => Math.abs(t.s - s) < 5 + (t.vao || 0) / 2 && t.lados.includes(Math.sign(d)))) return { ok: false };
  if (Number.isFinite(pista.total) && pista.pertoDe(x, z, 20).dist < R.LIMITE_CALCADA + 0.3) return { ok: false };
  if (pista.elevacao?.(s) > 0.3) return { ok: false };
  const du = duplaEm(duplas, s);
  if (du && Math.sign(d) === du.lado && Math.abs(d) > du.dist - 4.8 && Math.abs(d) < du.dist + 7) return { ok: false };
  return { ok: true, x, y: p.y - 0.02, z };
}
function montarTufos() { tufos.montar(TUFOS_POR_NIVEL[nivel] || 0, estado?.s || 0, ondeTufo); }

function construirVisual() {
  scene.remove(visual);
  visual = new THREE.Group();
  // amostras a cada 4 m (sem o pedaço extra depois da chegada num circuito, que caía em cima da largada)
  const amostras = amostrasDoPercurso(pista);
  const MATS = { rua: matRua, calcada: matCalcada, grama: matGrama };
  visual.userData.amostras = amostras;
  visual.userData.grama = [];
  const desenharFita = (amo) => {
    for (const [d0, d1, tipo, opts] of faixasComuns(false)) {
      if (tipo === 'rua') { ruaComBorda(amo, visual, opts); continue; }
      const f = fita(amo, d0, d1, MATS[tipo], opts);
      if (tipo === 'grama') { f.renderOrder = -1; visual.userData.grama.push(f); }
      visual.add(f);
    }
  };
  if (prova?.ruasOSM) {
    // ruas do mapa (etapa 4, ?ruas=osm): a fita de sempre só nas zonas listadas no arquivo (fallback, alturas que não
    // batem, cruzamento torto do mapa); a ponte (4d) usa o desenho novo, com a estrutura de src/viaduto.js
    for (const [a, b] of prova.ruasOSM.zonasFita) { const amo = amostras.filter((q) => q.s >= a && q.s <= b); if (amo.length > 1) desenharFita(amo); }
    visual.add(malhasRuasOSM(prova.ruasOSM));
  } else desenharFita(amostras);
  construirViadutos(amostras);
  let minY = 0, cx = 0, cz = 0;
  for (const a of amostras) { minY = Math.min(minY, a.y); cx += a.x; cz += a.z; }
  const chao = new THREE.Mesh(new THREE.PlaneGeometry(9000, 9000), matChao);
  chao.rotation.x = -Math.PI / 2;
  chao.position.set(cx / amostras.length, minY - 1.5, cz / amostras.length);
  chao.renderOrder = -2;
  visual.add(chao);
  // morros ao fundo (Pão de Açúcar e Corcovado) só no treino
  fundo.visible = !Number.isFinite(pista.total);
  scene.add(visual);
}

// ─── RUAS DO MAPA (etapa 4b, só com ?ruas=osm e o percurso ajustado) ─────────
// triângulos de src/ruasOSM.js (montarRuas) em duas malhas: asfalto (ruas do mapa e remendos D1) e calçada. Textura
// presa ao chão (u, v = x, z) para os pedaços que se sobrepõem ficarem iguais. O asfalto fica 1 cm acima da calçada.
// asfalto liso (sem o tracejado da textura da fita: a pintura das ruas do mapa vem na etapa 4e)
const texAsfaltoLiso = textura(512, 512, (g, w, h) => {
  g.fillStyle = '#4a4e55'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 6; i++) manchaAsfalto(g, w, h);
  for (let i = 0; i < 4000; i++) { const c = 55 + Math.random() * 50; g.fillStyle = `rgba(${c},${c},${c + 6},0.5)`; g.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
});
const matRuaOSM = new THREE.MeshStandardMaterial({ map: texAsfaltoLiso, roughness: 0.95, vertexColors: true, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4 });
const matCalcadaOSM = new THREE.MeshStandardMaterial({ map: texCalcada, roughness: 1, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 });
const ACIMA_RUA = 0.06; // = ACIMA em src/ruasOSM.js
// 4e: acostamento (o asfalto que a regra D1 pôs além da largura real) um tom mais claro; pintura viária
const matAcostamentoOSM = new THREE.MeshStandardMaterial({ map: texAsfaltoLiso, color: 0xc4c6ca, roughness: 1, vertexColors: true, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4 });
const matPinturaBranca = new THREE.MeshStandardMaterial({ color: 0xf2f2f0, roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -8 });
const matPinturaAmarela = new THREE.MeshStandardMaterial({ color: 0xf0c22a, roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -8 });
const matRuaOSMToco = new THREE.MeshStandardMaterial({ map: texAsfaltoLiso, roughness: 0.95, vertexColors: true, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -3 });
const matCalcadaOSMToco = new THREE.MeshStandardMaterial({ map: texCalcada, roughness: 1, vertexColors: true, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
function malhasRuasOSM(dados) {
  const grupo = new THREE.Group();
  // asfalto ACIMA (6 cm) acima da calçada: pequenas diferenças de altura numa rampa não deixam a calçada aparecer por
  // cima do asfalto; as ruas que cruzam (4c) somem no fim (alfa por vértice) e ficam numa malha transparente própria
  // (4e) asfalto e acostamento com a cor da inclinação (avermelhado na subida, azulado na descida, como a fita de
  // sempre: corInclinacao); pintura, linha azul e cones são só enfeite, sem colisão
  const porMat = [[['asfalto', 'alargamento', 'cruzamento'], matRuaOSM, ACIMA_RUA, 8, 'inclinacao'], [['acostamento'], matAcostamentoOSM, ACIMA_RUA, 8, 'inclinacao'],
    [['calcada', 'alargamentoCalcada'], matCalcadaOSM, 0, 4, null],
    [['toco'], matRuaOSMToco, ACIMA_RUA - 0.01, 8, 'alfa'], [['tocoCalcada'], matCalcadaOSMToco, -0.01, 4, 'alfa'],
    [['pinturaBranca'], matPinturaBranca, ACIMA_RUA + 0.015, 1, null], [['pinturaAmarela'], matPinturaAmarela, ACIMA_RUA + 0.015, 1, null], [['azul'], matBordaAzul, ACIMA_RUA + 0.012, 1, null]];
  const E = eixoDaPista(pista), tris = montarRuas(pista, dados, { eixo: E });
  tris.push(...pinturaRuas(pista, dados, tris, { eixo: E }));
  const c = new THREE.Color();
  for (const [tipos, material, dy, rep, modoCor] of porMat) {
    const lista = tris.filter((q) => tipos.includes(q.tipo));
    if (!lista.length) continue;
    const n = modoCor === 'alfa' ? 4 : 3;
    const pos = new Float32Array(lista.length * 9), uv = new Float32Array(lista.length * 6), cor = modoCor ? new Float32Array(lista.length * 3 * n) : null;
    lista.forEach((q, i) => {
      let [a, b, cc] = q.t, [ya, yb, yc] = q.y, [aa, ab, ac] = q.a || [1, 1, 1], [sa, sb, sc] = q.s || [0, 0, 0];
      // face para cima (normal +y): senão o triângulo some com o corte de faces de trás
      if ((b[1] - a[1]) * (cc[0] - a[0]) - (b[0] - a[0]) * (cc[1] - a[1]) < 0) { [b, cc] = [cc, b]; [yb, yc] = [yc, yb]; [ab, ac] = [ac, ab]; [sb, sc] = [sc, sb]; }
      [[a, ya, aa, sa], [b, yb, ab, sb], [cc, yc, ac, sc]].forEach(([p, y, al, s], k) => {
        pos.set([p[0], y + dy, p[1]], i * 9 + k * 3); uv.set([p[0] / rep, p[1] / rep], i * 6 + k * 2);
        if (modoCor === 'alfa') cor.set([1, 1, 1, al], (i * 3 + k) * 4);
        else if (modoCor === 'inclinacao') { corInclinacao(s >= 0 ? pista.em(s).inclinacao : 0, c); cor.set([c.r, c.g, c.b], (i * 3 + k) * 3); }
      });
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    if (cor) geo.setAttribute('color', new THREE.BufferAttribute(cor, n));
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, material); m.receiveShadow = true; m.name = 'ruasOSM';
    grupo.add(m);
  }
  // cones dos retornos (enfeite, sem colisão), numa instância só
  const cones = conesDosRetornos(pista, dados);
  if (cones.length) {
    const inst = new THREE.InstancedMesh(G.cone, mat(0xff6a00), cones.length), o = new THREE.Object3D();
    cones.forEach(([x, y, z], k) => { o.position.set(x, y + ACIMA_RUA + 0.36, z); o.scale.set(0.24, 0.72, 0.24); o.updateMatrix(); inst.setMatrixAt(k, o.matrix); });
    inst.name = 'ruasOSM'; grupo.add(inst);
  }
  return grupo;
}

// ─── VIADUTO / PONTE (estrutura em src/viaduto.js) ───────────────────────────
function construirViadutos(amostras) {
  if (!pista.elev) { montarViadutos({ pista }); return; } // sem viaduto (limpa o da prova anterior)
  // ruas do mapa (4e): juntas de dilatação por cima do asfalto novo (6 cm acima) e da calçada nova
  const g = montarViadutos({ pista, amostras, osm, matAgua: matRio, ...(prova?.ruasOSM ? { alturaJunta: { rua: ACIMA_RUA + 0.02, calcada: 0.02 } } : {}) });
  if (g) visual.add(g);
}

// cenário reciclado numa janela à frente do corredor
const JANELA = 300;
let cenario = [];
let areasSemArvore = [];
let vistasLivres = []; // [s0, s1, lado]: trecho da beira sem árvores para ver um prédio marcante que vem chegando
const naVistaLivre = (s, lado) => vistasLivres.some(([a, b, l]) => s >= a && s <= b && l === lado); // [x, z, raio] dos marcos da cidade: sem árvores nem enfeites em volta
let zonas = null; // zonas do percurso (parque, cidade, livre) quando há dados do OpenStreetMap
let duplas = []; // trechos de avenida com canteiro e outra pista ao lado (ver pistasDuplas)
const giroAleatorio = () => aleat(0, Math.PI * 2);
const arvoreDaBeira = () => {
  const r = Math.random();
  const m = r < 0.35 ? prop('ipe') : r < 0.75 ? prop('arvoreGrande') : null;
  if (m) { m.scale.multiplyScalar(aleat(0.85, 1.1)); m.rotation.y = giroAleatorio(); return m; }
  return Math.random() < 0.3 ? palmeira() : arvore(aleat(0.75, 0.95));
};
const MOLDES = [
  { passo: 7, d: 7.75, criar: (lado) => segmentoTorcida(lado), folga: 7.4, vao: 8, densidade: { parque: 0.3, livre: 0.75, cidade: 1 } },
  { passo: 15, d: () => aleat(10.5, 12.5), criar: arvoreDaBeira, folga: 9.5, vao: 7, densidade: { parque: 1, livre: 0.9, cidade: 0.6 } },
  { passo: 17, d: () => aleat(19, 24), criar: () => predio(!!prova), folga: 14, vao: 13, densidade: { parque: 0, livre: 0.12, cidade: 0.6 } },
  { passo: 30, d: 8.6, criar: () => prop('poste'), folga: 8, vao: 4, densidade: { parque: 1, livre: 0.4, cidade: 0 }, rot: (lado) => lado * Math.PI / 2 },
  { passo: 44, d: 9.8, criar: () => prop('banco'), folga: 9, vao: 4, densidade: { parque: 1, livre: 0.3, cidade: 0 }, rot: (lado) => lado * Math.PI / 2 }
];
// sorteio fixo por posição: o mesmo trecho mostra sempre a mesma coisa
const sorteio = (s, k) => { const v = Math.sin(s * 12.9898 + k * 78.233) * 43758.5453; return v - Math.floor(v); };

function posicionarCenario(item, s) {
  item.s = s;
  const fora = Number.isFinite(pista.total) && (s > pista.total + 60 || s < -40);
  const p = emEst(s);
  const [rx, rz] = direita(p.ang);
  const x = p.x + rx * item.d, z = p.z + rz * item.d;
  // nas esquinas o objeto pode cair em cima de outro trecho da rua: esconde
  let invade = false;
  // (confere o percurso inteiro: ida e volta e voltas passam de novo perto do mesmo lugar)
  if (!fora && Number.isFinite(pista.total)) invade = pista.pertoDe(x, z, item.folga + 40).dist < item.folga;
  // abre espaço na grade, nas árvores e nos prédios onde chega uma travessa
  const naTravessa = travessas.some((t) => Math.abs(t.s - s) < item.vao + (t.vao || 0) / 2 && t.lados.includes(Math.sign(item.d)));
  // sem dados do mapa (treino) vale "cidade"; com dados, cada trecho mostra o que combina com ele
  const zona = zonas ? zonaEm(zonas, s, Math.sign(item.d)) : (item.molde.densidade.cidade ? 'cidade' : 'nenhuma');
  const combina = sorteio(s, item.k) < (item.molde.densidade[zona] ?? 0);
  // nada de enfeite (árvore, poste, banco) na frente dos marcos da cidade
  const naFrenteDeMarco = areasSemArvore.some(([ax, az, r]) => (x - ax) ** 2 + (z - az) ** 2 < (r + 6) * (r + 6));
  // avenida dupla: nada de torcida, árvore ou prédio no canteiro e na outra pista
  const du = duplaEm(duplas, s);
  const naAvenida = du && Math.sign(item.d) === du.lado && Math.abs(item.d) < du.dist + 7;
  const tampaVista = item.molde.criar === arvoreDaBeira && naVistaLivre(s, Math.sign(item.d));
  const noViaduto = pista.elevacao?.(s) > 0.3;
  item.obj.visible = !fora && !invade && !naTravessa && combina && !naFrenteDeMarco && !naAvenida && !tampaVista && !noViaduto;
  item.obj.position.set(x, p.y, z);
  item.obj.rotation.y = -p.ang + (item.rot || 0);
}

function construirCenario() {
  for (const it of cenario) scene.remove(it.obj);
  cenario = [];
  MOLDES.forEach((m, k) => {
    const n = Math.ceil(JANELA / m.passo);
    for (const lado of [-1, 1]) {
      for (let i = 0; i < n; i++) {
        const criado = m.criar(lado);
        if (!criado) return; // modelo 3D ainda não carregou: esse tipo fica de fora desta vez
        const obj = achatar(criado);
        scene.add(obj);
        const it = { obj, molde: m, k, d: lado * (typeof m.d === 'function' ? m.d() : m.d), rot: m.rot?.(lado), folga: m.folga, vao: m.vao, ciclo: n * m.passo };
        posicionarCenario(it, -30 + i * m.passo + aleat(0, m.passo * 0.3));
        cenario.push(it);
      }
    }
  });
}

function atualizarCenario(sCorredor) {
  for (const it of cenario) if (it.s < sCorredor - 30) posicionarCenario(it, it.s + it.ciclo);
}

// ─── OBSTÁCULOS E ITENS (EM COORDENADAS DA PISTA: s AO LONGO, d PARA OS LADOS) ─

let entidades = [];
if (import.meta.env.DEV) window.__dbg = { pista: () => pista, prova: () => prova, renderer: () => renderer, passo: (dt) => passo(dt), curva: (s) => curvaEm(s), ents: () => entidades, carro: (...a) => carro(...a), estado: () => estado, cena: () => scene, em: (s) => emEst(s), clima: (id) => { estado.clima = { ...CL.CLIMAS.find((c) => c.id === id), ventoDe: 0 }; aplicarClima(estado.clima); }, desafio: (d) => { desafio = d; abrirDesafioQuandoPronto(); }, festa: (modo) => { estado.festaEm = estado.s + 1; estado.festaModo = modo; }, trav: () => travessas, chao: (x, z) => { const r = new THREE.Raycaster(new THREE.Vector3(x, 500, z), new THREE.Vector3(0, -1, 0)); return r.intersectObjects(scene.children, true).filter((h) => h.object.isMesh).slice(0, 6).map((h) => [+h.point.y.toFixed(2), h.object.name || h.object.material?.name || h.object.material?.color?.getHexString()]); } }; // só no modo de desenvolvimento, para testes
let postos = [];
let travessas = [];

function addEntidade(e) {
  e.rot = e.rot || 0;
  if (e.tipo !== 'decor') e.obj.traverse((o) => { if (o.isMesh && !o.material.transparent) o.castShadow = true; });
  scene.add(e.obj);
  entidades.push(e);
  colocar(e);
  return e;
}

function colocar(e) {
  const p = emEst(e.s);
  const [rx, rz] = direita(p.ang);
  e.obj.position.set(p.x + rx * e.d, p.y + (e.dy || 0), p.z + rz * e.d);
  e.obj.rotation.y = -p.ang + e.rot;
  // em cima do viaduto não há nada fora da beira (ficaria flutuando)
  if (Math.abs(e.d) > R.LIMITE_CALCADA && pista.elevacao?.(e.s) > 0.3) e.obj.visible = false;
}

function cone(s, d) {
  const g = new THREE.Group();
  const base = malha(G.caixa, mat(0xff6a00), 0, 0.04, 0); base.scale.set(0.8, 0.08, 0.8); g.add(base);
  const c = malha(G.cone, mat(0xff6a00), 0, 0.5, 0); c.scale.set(0.32, 0.9, 0.32); g.add(c);
  const listra = malha(G.cilindro, mat(0xffffff), 0, 0.55, 0); listra.scale.set(0.2, 0.14, 0.2); g.add(listra);
  return addEntidade({ tipo: 'cone', motivo: 'Tropeçou no cone', obj: achatar(g), s, d, larg: 0.8, prof: 0.8, h: 0.95 });
}

function barreira(s, d) {
  const g = new THREE.Group();
  const placa = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.38, 0.08), [mat(0xffffff), mat(0xffffff), mat(0xffffff), mat(0xffffff), new THREE.MeshStandardMaterial({ map: texListras }), new THREE.MeshStandardMaterial({ map: texListras })]);
  placa.position.y = 0.85; g.add(placa);
  for (const lado of [-1, 1]) {
    const perna = malha(G.caixa, mat(0xc98a4b), lado * 1.6, 0.5, 0); perna.scale.set(0.1, 1, 0.1); perna.rotation.x = 0.2; g.add(perna);
    const perna2 = perna.clone(); perna2.rotation.x = -0.2; g.add(perna2);
  }
  // com o modelo 3D, cavaletes lado a lado fecham os mesmos 3,6 m
  let obj = g;
  const unico = prop('barreira');
  if (unico) {
    const larg = PROPS.barreira.tamanho.x, n = Math.max(1, Math.round(3.6 / larg));
    obj = new THREE.Group();
    for (let i = 0; i < n; i++) { const c = i ? prop('barreira') : unico; c.position.x = (i - (n - 1) / 2) * (3.6 / n); obj.add(c); }
  }
  return addEntidade({ tipo: 'barreira', motivo: 'Bateu na barreira', obj, s, d, larg: 3.6, prof: 0.5, h: 1.08 });
}


// border collie 3D (Higgsfield) com esqueleto montado pelo jogo; enquanto não carrega, o caramelo de blocos
let caoModelo = null;
// o do Meshy (feito a partir das fotos) é o principal; o do Higgsfield fica de reserva
gltfLoader.loadAsync('/modelos/cao-meshy.glb').catch(() => gltfLoader.loadAsync('/modelos/border-collie.glb')).then((g) => {
  prepararMalhaAtleta(g.scene); // tira o brilho de metal que vira mancha branca
  caoModelo = rigarQuadrupede(g.scene, 0.95);
}).catch(() => {});

// vira-lata caramelo atravessando a rua em galope (frente do cachorro para +x)
function cachorro(s) {
  if (caoModelo) {
    const malha = clonarComOssos(caoModelo);
    const g = new THREE.Group(); g.add(malha);
    const lado = Math.random() < 0.5 ? -1 : 1;
    return addEntidade({
      tipo: 'cachorro', motivo: 'Esbarrou no cachorro', obj: g, s, d: lado * 6.2, rot: lado > 0 ? Math.PI : 0,
      larg: 1.5, prof: 0.6, h: 0.95, malha, gatilho: 34,
      anima(t) { animarQuadrupede(this.malha, t, !!this.vd); }
    });
  }
  const g = new THREE.Group();
  const caramelo = mat(0xc98a3f), claro = mat(0xf0d2a0), escuro = mat(0x7a4a1e), preto = mat(0x151515);
  const corpo = new THREE.Group(); corpo.position.y = 0.62; g.add(corpo);
  // tronco: peito mais largo na frente, barriga clara
  const tronco = malha(G.capsula, caramelo, 0, 0, 0); tronco.scale.set(0.36, 0.62, 0.34); tronco.rotation.z = Math.PI / 2; corpo.add(tronco);
  const peito = malha(G.esfera, claro, 0.26, -0.06, 0); peito.scale.set(0.2, 0.2, 0.17); corpo.add(peito);
  const barriga = malha(G.esfera, claro, -0.02, -0.12, 0); barriga.scale.set(0.34, 0.1, 0.15); corpo.add(barriga);
  // pescoço, cabeça, focinho, nariz, língua, olhos, orelhas caídas e coleira
  const cabeca = new THREE.Group(); cabeca.position.set(0.44, 0.24, 0); corpo.add(cabeca);
  const pescoco = malha(G.capsula, caramelo, -0.08, -0.1, 0); pescoco.scale.set(0.2, 0.22, 0.18); pescoco.rotation.z = -0.7; cabeca.add(pescoco);
  const cranio = malha(G.esfera, caramelo, 0.04, 0.04, 0); cranio.scale.set(0.2, 0.18, 0.17); cabeca.add(cranio);
  const focinho = malha(G.caixa, claro, 0.2, -0.02, 0); focinho.scale.set(0.18, 0.1, 0.12); cabeca.add(focinho);
  const nariz = malha(G.esfera, preto, 0.3, 0.01, 0); nariz.scale.set(0.035, 0.03, 0.045); cabeca.add(nariz);
  const lingua = malha(G.caixa, mat(0xe86a7a), 0.2, -0.08, 0); lingua.scale.set(0.1, 0.02, 0.06); lingua.rotation.z = -0.5; cabeca.add(lingua);
  const orelhas = [];
  for (const lado of [-1, 1]) {
    const olho = malha(G.esfera, preto, 0.15, 0.08, lado * 0.075); olho.scale.setScalar(0.024); cabeca.add(olho);
    const orelha = new THREE.Group(); orelha.position.set(-0.02, 0.15, lado * 0.12); cabeca.add(orelha);
    const aba = malha(G.caixa, escuro, 0, -0.08, 0); aba.scale.set(0.1, 0.16, 0.03); orelha.add(aba);
    orelha.rotation.x = lado * 0.5; orelhas.push(orelha);
  }
  const coleira = malha(G.cilindro, mat(0xd32f2f), -0.06, -0.08, 0); coleira.scale.set(0.15, 0.04, 0.15); coleira.rotation.z = -0.7; cabeca.add(coleira);
  // rabo
  const rabo = new THREE.Group(); rabo.position.set(-0.5, 0.1, 0); corpo.add(rabo);
  const raboM = malha(G.capsula, caramelo, -0.1, 0.12, 0); raboM.scale.set(0.07, 0.17, 0.07); raboM.rotation.z = 0.7; rabo.add(raboM);
  // patas com coxa e canela (pivô no ombro/quadril)
  const patas = [];
  for (const [px, pz, frente] of [[0.3, 0.13, 1], [0.3, -0.13, 1], [-0.32, 0.13, 0], [-0.32, -0.13, 0]]) {
    const coxa = membro(0.24, 0.065, caramelo); coxa.position.set(px, -0.08, pz); corpo.add(coxa);
    const canela = membro(0.24, 0.045, caramelo); canela.position.y = -0.24; coxa.add(canela);
    const pe = malha(G.esfera, claro, 0.03, -0.25, 0); pe.scale.set(0.07, 0.04, 0.06); canela.add(pe);
    patas.push({ coxa, canela, frente });
  }
  const lado = Math.random() < 0.5 ? -1 : 1;
  return addEntidade({
    tipo: 'cachorro', motivo: 'Esbarrou no cachorro', obj: g, s, d: lado * 6.2, rot: lado > 0 ? Math.PI : 0,
    larg: 1.5, prof: 0.6, h: 0.95, corpo, cabeca, rabo, orelhas, patas, gatilho: 34,
    anima(t) {
      const corre = !!this.vd;
      const f = corre ? 14 : 3, a = t * f;
      // galope: patas da frente juntas, de trás meio passo depois; corpo sobe e balança
      this.patas.forEach((p, i) => {
        const fase = a + (p.frente ? 0 : Math.PI * 0.9) + (i % 2) * 0.35;
        const amp = corre ? 0.8 : 0.08;
        p.coxa.rotation.z = Math.sin(fase) * amp;
        p.canela.rotation.z = (p.frente ? -1 : 1) * Math.max(0, Math.sin(fase + 1.2)) * amp * 0.9;
      });
      this.corpo.position.y = 0.62 + (corre ? Math.abs(Math.sin(a)) * 0.07 : 0);
      this.corpo.rotation.z = corre ? Math.sin(a) * 0.1 : 0;
      this.cabeca.rotation.z = corre ? Math.sin(a + 0.6) * 0.12 : Math.sin(t * 2) * 0.05;
      this.rabo.rotation.x = Math.sin(t * 16) * 0.7;
      this.orelhas.forEach((o, i) => { o.rotation.z = corre ? Math.sin(a + i) * 0.4 : 0; });
    }
  });
}

function ciclista(s, d) {
  const g = new THREE.Group();
  const quadro = mat(0x111111);
  for (const pz of [-0.55, 0.55]) { const r = malha(G.roda, quadro, 0, 0.48, pz); r.rotation.y = Math.PI / 2; g.add(r); }
  const barra = malha(G.caixa, mat(0xff3b30), 0, 0.85, 0); barra.scale.set(0.07, 0.07, 1.1); barra.rotation.x = -0.15; g.add(barra);
  const banco = malha(G.caixa, quadro, 0, 1.12, 0.38); banco.scale.set(0.15, 0.06, 0.3); g.add(banco);
  const guidao = malha(G.caixa, quadro, 0, 1.15, -0.5); guidao.scale.set(0.6, 0.05, 0.05); g.add(guidao);
  const roupa = mat(escolher([0x1e88ff, 0xff8c1a, 0x2ecc71]));
  const tronco = malha(G.capsula, roupa, 0, 1.55, 0.05); tronco.scale.set(0.5, 0.45, 0.4); tronco.rotation.x = -0.55; g.add(tronco);
  const cabeca = malha(G.esfera, mat(escolher(PELES)), 0, 2.05, -0.3); cabeca.scale.setScalar(0.2); g.add(cabeca);
  const capacete = malha(G.esfera, mat(0xffffff), 0, 2.12, -0.3); capacete.scale.set(0.23, 0.15, 0.27); g.add(capacete);
  const pernas = [];
  for (const lado of [-1, 1]) { const p = membro(0.75, 0.09, mat(0x161616)); p.position.set(lado * 0.17, 1.15, 0.3); g.add(p); pernas.push(p); }
  // pedala mais devagar que o corredor: é preciso ultrapassar
  return addEntidade({
    tipo: 'ciclista', motivo: 'Bateu na bicicleta', obj: g, s, d, larg: 0.9, prof: 1.8, h: 2.3,
    vs: R.mps(estado.paceBase || R.PACE_BASE) * R.ESCALA_TEMPO * 0.45, pernas,
    anima(t) { this.pernas.forEach((p, i) => { p.rotation.x = Math.sin(t * 9 + i * Math.PI) * 0.6 - 0.3; }); }
  });
}

// rodas do carro-festa no espaço do modelo (medidas na malha): centro x, centro y, lado (z), raio
const PROVA_DO_CARRO = '9-maratona-sorocaba-novembro-azul-2026-11-21'; // o carro desgovernado só aparece nas provas de Sorocaba
// um carro por km, num ponto sorteado dentro do km (nada na largada nem colado na chegada)
function proximoCarroKm(sAtual, inicio = false) {
  const s = inicio ? aleat(350, 850) : (Math.floor(sAtual / 1000) + 1) * 1000 + aleat(150, 850); // sempre no km seguinte
  return s < pista.total - 120 ? s : 0;
}
const RODAS_FESTA = { raio: 0.15, zMin: 0.24, lista: [[-0.59, -0.274, 1], [0.61, -0.274, 1], [-0.59, -0.274, -1], [0.61, -0.274, -1]] };
// recorta da malha única os triângulos de cada roda e põe cada uma num grupo próprio, centrado no eixo
function separarRodas(model, cfg) {
  let malha = null; model.traverse((o) => { if (o.isMesh && !malha) malha = o; });
  if (!malha?.geometry.index) return;
  const g = malha.geometry, pos = g.attributes.position, idx = g.index.array, R = cfg.raio * 1.08;
  const resto = [], porRoda = cfg.lista.map(() => []);
  const daRoda = (v) => {
    const x = pos.getX(v), y = pos.getY(v), z = pos.getZ(v);
    return cfg.lista.findIndex(([cx, cy, lado]) => Math.sign(z) === lado && Math.abs(z) > cfg.zMin && Math.hypot(x - cx, y - cy) < R);
  };
  for (let i = 0; i < idx.length; i += 3) {
    const a = daRoda(idx[i]);
    if (a >= 0 && daRoda(idx[i + 1]) === a && daRoda(idx[i + 2]) === a) porRoda[a].push(idx[i], idx[i + 1], idx[i + 2]);
    else resto.push(idx[i], idx[i + 1], idx[i + 2]);
  }
  const comIndice = (lista) => { const n = new THREE.BufferGeometry(); for (const [k, at] of Object.entries(g.attributes)) n.setAttribute(k, at); n.setIndex(lista); return n; };
  malha.geometry = comIndice(resto);
  cfg.lista.forEach(([cx, cy, lado], k) => {
    if (!porRoda[k].length) return;
    const roda = new THREE.Group(); roda.name = `roda_festa_${k}`;
    roda.position.set(cx, cy, 0);
    const m = new THREE.Mesh(comIndice(porRoda[k]), malha.material); m.position.set(-cx, -cy, 0); m.castShadow = true;
    roda.add(m); (malha.parent || model).add(roda);
  });
}

const CARROS = ['carro-sedan', 'carro-sedan', 'carro-hatch', 'carro-hatch', 'carro-suv', 'carro-suv', 'carro-picape', 'carro-taxi', 'carro-van', 'carro-classico', 'carro-esporte', 'carro-policia'];
// cores de carro de rua para variar a pintura (táxi e polícia ficam com as cores deles)
const PINTURAS = [0xf2f2f2, 0xc9ced6, 0x8a929c, 0x2b2f36, 0x1f3f8f, 0xb3202a, 0x2f6b3a, 0xd9c7a1, 0x5a2a7a, 0xe07b24];
const PINTA = new Set(['carro-sedan', 'carro-hatch', 'carro-suv', 'carro-picape', 'carro-van', 'carro-classico', 'carro-esporte']);
function carro(s, lado) {
  const g = new THREE.Group();
  const cor = mat(escolher([0xd9d9d9, 0xe63946, 0x1d4ed8, 0xfacc15, 0x111827]), { roughness: 0.35, metalness: 0.3 });
  const base = malha(G.caixa, cor, 0, 0.6, 0); base.scale.set(3.1, 0.7, 1.6); g.add(base);
  const cabine = malha(G.caixa, cor, -0.15, 1.2, 0); cabine.scale.set(1.7, 0.6, 1.45); g.add(cabine);
  const vidro = malha(G.caixa, mat(0x9ad0ff, { roughness: 0.1 }), -0.15, 1.22, 0); vidro.scale.set(1.72, 0.42, 1.47); g.add(vidro);
  for (const px of [-0.95, 0.95]) for (const pz of [-0.78, 0.78]) {
    const r = malha(G.cilindro, mat(0x111111), px, 0.36, pz); r.scale.set(0.36, 0.22, 0.36); r.rotation.x = Math.PI / 2; g.add(r);
  }
  // sorteia um dos carros que já carregaram (a polícia aparece menos)
  const prontos = CARROS.filter((n) => PROPS[n].modelo);
  const nome = prontos.length ? escolher(prontos) : 'carro';
  const modelo = prop(nome) || prop('carro');
  const rodas = [];
  modelo?.traverse((o) => { if (/^wheel_(front|rear)_(left|right)$/.test(o.name)) rodas.push(o); });
  // raio da roda em metros, já com a escala do carro (sem isso o giro saía ~100× mais lento)
  modelo?.updateMatrixWorld(true);
  const raioRoda = rodas.length ? new THREE.Box3().setFromObject(rodas[0]).getSize(new THREE.Vector3()).y / 2 : 0.35;
  if (modelo && PINTA.has(nome)) {
    // a pintura principal (o material "body" de cor) ganha uma cor sorteada, só neste carro
    const cor = escolher(PINTURAS);
    modelo.traverse((o) => {
      if (!o.isMesh) return;
      const ms = [].concat(o.material).map((m) => {
        if (!/^body(?!.*(white|black))/i.test(m.name)) return m;
        const n = m.clone(); n.color.setHex(cor); return n;
      });
      o.material = Array.isArray(o.material) ? ms : ms[0];
    });
  }
  return addEntidade({ tipo: 'carro', motivo: 'Bateu no carro', obj: modelo || achatar(g), s, d: lado * 16, rot: lado > 0 ? Math.PI : 0, larg: 3.4, prof: 1.7, h: 2.2, gatilho: 55, rodas, raioRoda });
}

// ─── CARRO DESGOVERNADO: invade a prova na contramão, ziguezagueando; o pelotão desvia; a guarda vem atrás ──
let festa = null;
function carroDesgovernado(s) {
  const modelo = prop('carro-festa');
  if (!modelo) return null;
  const rodasZ = [];
  modelo.traverse((o) => { if (/^roda_festa_/.test(o.name)) rodasZ.push(o); });
  const esc = modelo.scale.x;
  const e = addEntidade({ tipo: 'carro', motivo: 'O carro desgovernado te pegou', obj: modelo, s, d: 0, rot: Math.PI / 2,
    larg: 1.9, prof: 4.2, h: 1.6, vs: -9.5, rodasZ, raioRoda: RODAS_FESTA.raio * esc, fase: Math.random() * 6,
    anima(t) {
      // ziguezague de bêbado: volta e meia cruza a rua inteira
      const alvo = Math.sin(t * 0.9 + this.fase) * 2.6 + Math.sin(t * 2.3) * 0.5;
      this.rot = Math.PI / 2 + Math.max(-0.35, Math.min(0.35, (alvo - this.d) * 0.5));
      this.d += (alvo - this.d) * Math.min(1, 1.6 * (1 / 60));
    } });
  // moto da guarda municipal vem atrás, com o giroflex
  const moto = lideres.moto.clone();
  moto.visible = true;
  const gcm = addEntidade({ tipo: 'decor', obj: moto, s: s + 16, d: 0, rot: Math.PI, vs: -9.5,
    anima(t) { this.d = e.d * 0.6; const k = Math.floor(t * 6) % 2; this.obj.children.at(-2).visible = !!k; this.obj.children.at(-1).visible = !k; } });
  return { carro: e, moto: gcm, avisado: false, passou: false };
}
// último km: a polícia vem colada atrás do carro desgovernado, com sirene
function viaturaAtras(festa) {
  const m = prop('carro-policia');
  if (!m || !festa?.carro) return;
  const ce = festa.carro;
  const rodas = [];
  m.traverse((o) => { if (/^wheel_(front|rear)_(left|right)$/.test(o.name)) rodas.push(o); });
  m.updateMatrixWorld(true);
  const raio = rodas.length ? new THREE.Box3().setFromObject(rodas[0]).getSize(new THREE.Vector3()).y / 2 : 0.35;
  festa.policia = addEntidade({ tipo: 'carro', motivo: 'A viatura te pegou', obj: m, s: ce.s + 22, d: 0, rot: -Math.PI / 2, vs: ce.vs,
    larg: 1.9, prof: 4.4, h: 1.6, rodasVs: rodas, raioRoda: raio,
    anima() { this.d += (ce.d - this.d) * 0.03; this.rot = -Math.PI / 2 + Math.max(-0.3, Math.min(0.3, (ce.d - this.d) * 0.3)); } });
}
// mesma turma furando o bloqueio numa travessa: cruza a pista na frente do corredor
function carroDesgovernadoTravessa(t) {
  const modelo = prop('carro-festa');
  if (!modelo) return null;
  const rodasZ = [];
  modelo.traverse((o) => { if (/^roda_festa_/.test(o.name)) rodasZ.push(o); });
  const lado = escolher(t.lados);
  const sCarro = t.vao ? t.s + (Math.random() < 0.5 ? -1 : 1) * t.vao / 2 : t.s;
  const e = addEntidade({ tipo: 'carro', motivo: 'O carro desgovernado te pegou', obj: modelo, s: sCarro, d: lado * 16, rot: lado > 0 ? 0 : Math.PI,
    frenteNegX: true, larg: 4.2, prof: 1.9, h: 1.6, gatilho: 60, rodasZ, raioRoda: RODAS_FESTA.raio * modelo.scale.x });
  return { carro: e, travessa: true, avisado: false, passou: false };
}

function moeda(s, d) {
  const o = malha(G.moeda, mat(0xffc400, { metalness: 0.6, roughness: 0.3, emissive: 0x6b4a00 }), 0, 0, 0);
  const g = new THREE.Group(); g.add(o); o.position.y = 1; o.rotation.x = Math.PI / 2;
  return addEntidade({ tipo: 'moeda', item: true, pontos: 10, obj: g, s, d, gira: o, anima(t) { this.gira.rotation.z = t * 4; } });
}

function gel(s, d) {
  const g = new THREE.Group();
  const sache = malha(G.caixa, mat(0xffd21f, { emissive: 0x6b5500 }), 0, 1.05, 0); sache.scale.set(0.5, 0.7, 0.12); g.add(sache);
  const raio = malha(G.caixa, mat(0x1e88ff), 0, 1.05, 0.07); raio.scale.set(0.12, 0.38, 0.02); raio.rotation.z = 0.5; g.add(raio);
  const brilho = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.66, 32), new THREE.MeshBasicMaterial({ color: 0xffe066, transparent: true, opacity: 0.8, side: THREE.DoubleSide }));
  brilho.rotation.x = -Math.PI / 2; brilho.position.y = 0.05; g.add(brilho);
  return addEntidade({ tipo: 'gel', item: true, pontos: 50, obj: g, s, d, anima(t) { this.obj.children[0].rotation.y = t * 3; } });
}

// posto como nas provas: mesas com copos dentro da rua, encostadas numa lateral
function postoHidratacao(s, lado) {
  const g = new THREE.Group();
  for (let i = 0; i < 3; i++) {
    const v = torcedor(); v.children[0].material = mat(0xff8c1a);
    v.position.set(lado * 4.6, 0, -2 - i * 5); v.rotation.y = -lado * Math.PI / 2; g.add(v);
  }
  const haste = malha(G.cilindro, mat(0xdddddd), lado * 5.6, 1.4, 4); haste.scale.set(0.06, 2.8, 0.06); g.add(haste);
  const placa = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.65), new THREE.MeshBasicMaterial({ map: texHidratacao, side: THREE.DoubleSide }));
  placa.position.set(lado * 5.6, 2.9, 4); g.add(placa);
  addEntidade({ tipo: 'decor', fixo: !!prova, obj: achatar(g), s, d: 0 });
  for (const ds of [0, 9]) mesaAgua(s + ds, lado);
  postos.push({ s, lado, avisado: false });
  coposNoChao(s + 12, lado);
}

// ─── DETALHES DE PROVA: copos no chão, fotógrafo, ambulância, tapete do chip, fiscais nas esquinas ──
// copos amassados espalhados depois do posto (mais perto do lado da mesa)
function coposNoChao(s, lado) {
  const g = new THREE.Group(), branco = mat(0xf3f6fa), azul = mat(0x2a7de1);
  for (let i = 0; i < 26; i++) {
    const c = malha(G.cilindro, Math.random() < 0.8 ? branco : azul, 0, 0.04, 0);
    c.scale.set(0.07, 0.11, 0.07);
    c.rotation.set(Math.PI / 2, 0, Math.random() * Math.PI);
    const d = lado * Math.min(3.6, Math.abs(aleat(-1.5, 3.8))) * (Math.random() < 0.25 ? -0.6 : 1);
    c.position.set(d, 0.04, -aleat(0, 34));
    c.scale.y *= aleat(0.5, 1); // uns mais amassados
    g.add(c);
  }
  addEntidade({ tipo: 'decor', fixo: !!prova, obj: achatar(g), s, d: 0 });
}

// fotógrafo agachado na beira, com flash de vez em quando
function fotografo(s, lado) {
  const g = new THREE.Group();
  const p = torcedor(); p.scale.y = 0.72; p.rotation.y = -lado * Math.PI / 2; g.add(p);
  const camera3d = malha(G.caixa, mat(0x111111), -lado * 0.25, 1.15, 0); camera3d.scale.set(0.22, 0.16, 0.14); g.add(camera3d);
  const flash = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95 }));
  flash.position.set(-lado * 0.38, 1.2, 0); flash.visible = false; g.add(flash);
  return addEntidade({ tipo: 'decor', fixo: !!prova, obj: g, s, d: lado * (R.LIMITE_CALCADA - 0.4), flash, anima(t) { this.flash.visible = (t * 1.3 + s) % 3 < 0.08; } });
}

// ambulância parada na beira com o giroflex ligado
function ambulancia(s, lado) {
  const m = prop('ambulancia');
  if (!m) return;
  const luzes = [0xff2a2a, 0x2a6bff].map((cor, i) => {
    const l = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), new THREE.MeshBasicMaterial({ color: cor }));
    l.position.set((i ? 0.3 : -0.3), 2.95, 0.5); return l;
  });
  const g = new THREE.Group(); g.add(m); for (const l of luzes) g.add(l);
  return addEntidade({ tipo: 'decor', fixo: !!prova, obj: g, s, d: lado * (R.LIMITE_CALCADA + 3.6), rot: 0, luzes, anima(t) { const k = Math.floor(t * 5) % 2; this.luzes[0].visible = !!k; this.luzes[1].visible = !k; } });
}

// tapete do chip atravessando a rua (largada e chegada)
const texTapete = textura(512, 64, (g, w, h) => {
  g.fillStyle = '#0e2a5c'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#1e88ff'; for (let x = 0; x < w; x += 64) g.fillRect(x, 0, 30, h);
  g.fillStyle = '#ffffff'; g.font = 'bold 34px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  for (let x = 64; x < w; x += 128) g.fillText('CHIP', x, h / 2);
});
function tapeteChip(s) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(8.4, 1.4), new THREE.MeshStandardMaterial({ map: texTapete, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -8 }));
  m.rotation.x = -Math.PI / 2; m.position.y = 0.06;
  const g = new THREE.Group(); g.add(m);
  return addEntidade({ tipo: 'decor', fixo: true, obj: g, s, d: 0 });
}

function mesaAgua(s, lado) {
  const g = new THREE.Group();
  const azul = mat(0x2a7de1), branco = mat(0xf5f9ff);
  const tina = malha(G.caixa, azul, 0, 0.72, 0); tina.scale.set(1.1, 0.42, 3.6); g.add(tina);
  for (const px of [-0.45, 0.45]) for (const pz of [-1.6, 1.6]) { const p = malha(G.caixa, mat(0x9aa4b2), px, 0.25, pz); p.scale.set(0.06, 0.5, 0.06); g.add(p); }
  for (let i = 0; i < 18; i++) {
    const c = malha(G.cilindro, i % 3 ? branco : mat(0x8fd3ff), aleat(-0.4, 0.4), 0.98, -1.6 + (i / 17) * 3.2);
    c.scale.set(0.11, 0.14, 0.11); g.add(c);
  }
  const modelo = prop('mesa');
  const prof = modelo ? PROPS.mesa.tamanho.z : 3.7, larg = modelo ? PROPS.mesa.tamanho.x : 1.15;
  return addEntidade({ tipo: 'mesa', mesa: true, motivo: 'Bateu na mesa de água', obj: modelo || achatar(g), s, d: lado * (4 - larg / 2 - 0.1), lado, larg, prof, h: 1.0, fixo: !!prova, tentada: false });
}

function portico(s, texto, { cor = '#ffd21f', corTexto = '#0b1d3a' } = {}) {
  const g = new THREE.Group();
  const azul = mat(0x1356c9);
  for (const lado of [-1, 1]) { const p = malha(G.caixa, azul, lado * 4.4, 2.6, 0); p.scale.set(0.5, 5.2, 0.5); g.add(p); }
  const tex = texTexto(texto, { w: 512, h: 96, fundo: cor, cor: corTexto, tam: texto.length > 10 ? 44 : 72 });
  const topo = new THREE.Mesh(new THREE.BoxGeometry(9.4, 1.1, 0.5), [azul, azul, azul, azul, new THREE.MeshStandardMaterial({ map: tex }), new THREE.MeshStandardMaterial({ map: tex })]);
  topo.position.y = 5.5; g.add(topo);
  return addEntidade({ tipo: 'decor', fixo: true, obj: achatar(g), s, d: 0 });
}

// ─── GERAÇÃO DE OBSTÁCULOS AO LONGO DO CAMINHO ────────────────────────────────

const livre = (s, margem) => !postos.some((p) => Math.abs(p.s - s) < margem);

function gerarPadrao(s, nivel) {
  const r = Math.random();
  const ladoQualquer = () => (Math.random() < 0.5 ? -1 : 1);
  if (r < 0.2) {
    const n = Math.random() < 0.3 + nivel * 0.3 ? 2 : 1;
    const usados = [];
    for (let i = 0; i < n; i++) {
      let d; do { d = aleat(-3.2, 3.2); } while (usados.some((u) => Math.abs(u - d) < 2.2));
      usados.push(d); cone(s + i * aleat(0, 3), d);
    }
  } else if (r < 0.35) barreira(s, ladoQualquer() * 1.9);
  else if (r < 0.5) { const d = aleat(-2.8, 2.8); for (let i = 0; i < 5; i++) moeda(s + i * 2.6, d); } // nada de obstáculo na altura da cabeça: no lugar, moedas
  else if (r < 0.65) cachorro(s);
  else if (r < 0.78) ciclista(s, aleat(-2.6, 2.6));
  else if (r < 0.9) { const d = aleat(-2.8, 2.8); for (let i = 0; i < 6; i++) moeda(s + i * 2.6, d); }
  else {
    // trecho difícil: obstáculos em sequência com um gel de prêmio no meio
    const lado = ladoQualquer();
    barreira(s, lado * 1.9);
    cone(s + 9, -lado * 2.6);
    barreira(s + 18, -lado * 1.9);
    gel(s + 13, lado * 2.4);
    cone(s + 26, aleat(-1, 1));
    return 40;
  }
  return 0;
}

// ─── TRAVESSAS (RUAS QUE CRUZAM O PERCURSO) ───────────────────────────────────

const matTravessa = new THREE.MeshStandardMaterial({ color: 0x6a6e76, roughness: 0.95, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -5 });
const matZebra = new THREE.MeshBasicMaterial({ map: texFaixaPedestre, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -8 });
let grupoTravessas = new THREE.Group();
scene.add(grupoTravessas);

// plano deitado no chão; o grupo de fora gira (rumo) e inclina (subida) sem o plano "levantar"
function planoChao(w, h, material) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), material);
  m.rotation.x = -Math.PI / 2;
  const g = new THREE.Group(); g.rotation.order = 'YXZ'; g.add(m);
  return g;
}

function inclinacaoVisual(s) {
  return Math.atan2(emEst(s + 2).y - emEst(s - 2).y, 4);
}

function adicionarTravessa(t) {
  t.objs = [];
  // avenida com canteiro: uma pista de cada lado do canteiro central
  const meios = t.vao ? [t.s - t.vao / 2, t.s + t.vao / 2] : [t.s];
  for (const sPista of meios) adicionarPistaTravessa(t, sPista);
  for (const o of t.objs) grupoTravessas.add(o);
}

function adicionarPistaTravessa(t, sPista) {
  const p = emEst(sPista);
  const [rx, rz] = direita(p.ang);
  for (const lado of t.lados) {
    if (prova?.ruasOSM?.cruzamentos) continue; // ruas do mapa (4c): a rua que cruza de verdade já está desenhada
    const rua = planoChao(7, 34, matTravessa);
    rua.position.set(p.x + rx * lado * 21, p.y + 0.02, p.z + rz * lado * 21);
    rua.rotation.y = Math.PI / 2 - p.ang;
    const zebra = planoChao(7, 2.6, matZebra);
    zebra.position.set(p.x + rx * lado * 9.2, p.y + 0.05, p.z + rz * lado * 9.2);
    zebra.rotation.y = Math.PI / 2 - p.ang;
    t.objs.push(rua, zebra);
  }
  if (t.principal) {
    // rua fechada para a prova: cones na boca da travessa e um fiscal de colete laranja
    for (const lado of t.lados) {
      for (let k = -2; k <= 2; k++) {
        const c = new THREE.Group();
        const base = malha(G.caixa, mat(0xff6a00), 0, 0.04, 0); base.scale.set(0.6, 0.08, 0.6); c.add(base);
        const cone3d = malha(G.cone, mat(0xff6a00), 0, 0.4, 0); cone3d.scale.set(0.24, 0.72, 0.24); c.add(cone3d);
        const q = emEst(sPista + k * 1.4), [qx, qz] = direita(q.ang);
        c.position.set(q.x + qx * lado * (R.LIMITE_CALCADA + 1.2), q.y, q.z + qz * lado * (R.LIMITE_CALCADA + 1.2));
        t.objs.push(c);
      }
      const fiscal = torcedor(); fiscal.children[0].material = mat(0xff8c1a);
      const q = emEst(sPista + 4.2), [qx, qz] = direita(q.ang);
      fiscal.position.set(q.x + qx * lado * (R.LIMITE_CALCADA + 0.4), q.y, q.z + qz * lado * (R.LIMITE_CALCADA + 0.4));
      fiscal.rotation.y = -q.ang + (lado > 0 ? -Math.PI / 2 : Math.PI / 2);
      t.objs.push(fiscal);
    }
    // faixa de pedestre atravessando a rua da prova, colada no asfalto (no modo ruas do mapa ela vem do OSM)
    if (prova?.ruasOSM?.cruzamentos) return;
    const zebra = planoChao(8, 2.6, matZebra);
    zebra.position.set(p.x, p.y + 0.05, p.z);
    zebra.rotation.y = -p.ang;
    zebra.rotation.x = inclinacaoVisual(sPista);
    t.objs.push(zebra);
  }
}

function definirTravessas(lista) {
  scene.remove(grupoTravessas);
  grupoTravessas = new THREE.Group();
  scene.add(grupoTravessas);
  travessas = lista;
  for (const t of travessas) adicionarTravessa(t);
  for (const it of cenario) posicionarCenario(it, it.s);
  montarTufos();
}

async function carregarTravessas(distancia, pistaAlvo) {
  const chave = `mapmove-travessas-v1-${PROVA_SLUG}-${distancia.rotulo}${sufixo(distancia)}`; // posições s dependem da pista
  let lista = lerRecorde(chave);
  if (!lista) {
    const vias = await buscarVias(distancia.percurso);
    if (vias) { lista = encontrarTravessas(pistaAlvo, vias); salvarRecorde(chave, lista); }
  }
  if (pista !== pistaAlvo) return;
  definirTravessas((lista || travessasGenericas(pistaAlvo.total)).map((t) => ({ ...t, carro: false })));
}

// ─── CENÁRIO REAL (OPENSTREETMAP), NO ESTILO CLARO DO MAPBOX STANDARD ─────────

const CORES_AREA = { bairro: 0xd9d3c6, esporte: 0x8fcf6c, grama: 0xa9dc84, parque: 0x9bd577, mata: 0x67ad50, agua: 0x3f9fd6 };
const ORDEM_AREA = { bairro: -2.6, esporte: -2.4, grama: -2.4, parque: -2.4, mata: -2.3, agua: -2.2 };
const matsArea = Object.fromEntries(Object.entries(CORES_AREA).map(([k, cor]) => [k, k === 'agua'
  ? new THREE.MeshStandardMaterial({ color: 0x3f9fd6, roughness: 0.14, metalness: 0.25, envMapIntensity: 1.4, normalMap: texAguaNormal, normalScale: new THREE.Vector2(0.55, 0.55), depthWrite: false })
  : new THREE.MeshStandardMaterial({ color: cor, map: k === 'bairro' ? null : texGramado, roughness: 1, depthWrite: false })]));
for (const k of ['esporte', 'grama', 'parque', 'mata']) manchasDeGrama(matsArea[k], 0.8);
const matMargem = new THREE.MeshStandardMaterial({ color: 0xcdbf98, roughness: 1, depthWrite: false });
const matCaminho = new THREE.MeshStandardMaterial({ color: 0xeee4cf, roughness: 1, depthWrite: false });
const matRio = matsArea.agua;
const CORES_PAREDE = [0xf6f1e9, 0xece5da, 0xf1e4d4, 0xe3e8ee, 0xefe6ef, 0xf3ead0];
const matPredioOSM = new THREE.MeshStandardMaterial({ vertexColors: true, map: texJanelas, roughness: 0.9 });

let osm = null;
let grupoOSM = new THREE.Group();
scene.add(grupoOSM);
let chunksArvores = [];
let pedalinhos = [];

const alturaChao = (x, z) => pista.pertoDe(x, z).y;

function malhaDePoligono(listas, material, dy, ordem) {
  const pos = [], uv = [];
  for (const pts of listas) {
    const contorno = pts.slice();
    if (contorno.length > 3 && contorno[0][0] === contorno.at(-1)[0] && contorno[0][1] === contorno.at(-1)[1]) contorno.pop();
    if (contorno.length < 3) continue;
    const v2 = contorno.map(([x, z]) => new THREE.Vector2(x, z));
    const faces = THREE.ShapeUtils.triangulateShape(v2, []);
    // área grande pega alturas de trechos distantes e vira um plano inclinado no céu: fica quase plana, embaixo
    const ys0 = contorno.map(([x, z]) => alturaChao(x, z) + dy), base = Math.min(...ys0);
    const ys = ys0.map((v) => Math.min(v, base + 1.2));
    for (const f of faces) for (const i of [f[0], f[2], f[1]]) { pos.push(contorno[i][0], ys[i], contorno[i][1]); uv.push(contorno[i][0] / 9, contorno[i][1] / 9); }
  }
  if (!pos.length) return null;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, material);
  m.renderOrder = ordem;
  m.receiveShadow = true;
  return m;
}

function malhaDeLinhas(linhas, largura, material, dy, ordem) {
  const pos = [];
  for (const l of linhas) {
    const ys = l.map(([x, z]) => alturaChao(x, z) + dy);
    for (let i = 0; i < l.length - 1; i++) {
      const [ax, az] = l[i], [bx, bz] = l[i + 1];
      const len = Math.hypot(bx - ax, bz - az) || 1;
      const nx = (-(bz - az) / len) * largura / 2, nz = ((bx - ax) / len) * largura / 2;
      const a1 = [ax + nx, ys[i], az + nz], a2 = [ax - nx, ys[i], az - nz], b1 = [bx + nx, ys[i + 1], bz + nz], b2 = [bx - nx, ys[i + 1], bz - nz];
      pos.push(...a1, ...b1, ...a2, ...a2, ...b1, ...b2);
    }
  }
  if (!pos.length) return null;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, material);
  m.material.side = THREE.DoubleSide;
  m.renderOrder = ordem;
  return m;
}

function alturaPredio(b) {
  if (b.h) return b.h;
  if (b.n) return b.n * 3.2;
  const t = b.t || 'yes';
  if (/apartments|hotel|office/.test(t)) return 15;
  if (/commercial|retail|school|hospital|public|civic|church/.test(t)) return 8;
  if (/industrial|warehouse|hangar/.test(t)) return 9;
  if (/roof|shed|garage|kiosk/.test(t)) return 3.5;
  return 5.5;
}

// prédios reais levantados a partir do contorno; paredes com janelas, telhado liso
function malhaDePredios(predios) {
  const pos = [], cor = [], uv = [];
  const c = new THREE.Color(), cTelhado = new THREE.Color();
  for (const b of predios) {
    const pts = b.pts.slice();
    if (pts.length > 3 && pts[0][0] === pts.at(-1)[0] && pts[0][1] === pts.at(-1)[1]) pts.pop();
    if (pts.length < 3) continue;
    let cx = 0, cz = 0;
    for (const [x, z] of pts) { cx += x; cz += z; }
    cx /= pts.length; cz /= pts.length;
    const perto = pista.pertoDe(cx, cz);
    if (perto.dist < 12 || pts.some(([x, z]) => pista.pertoDe(x, z).dist < 9)) continue; // nada em cima da rua
    const H = alturaPredio(b), y0 = perto.y - 0.6, y1 = perto.y + H;
    c.setHex(CORES_PAREDE[Math.abs(Math.round(cx * 7 + cz * 13)) % CORES_PAREDE.length]);
    cTelhado.setHex(H < 7 ? 0xc9744e : 0xb9b4ac);
    let area2 = 0;
    for (let i = 0; i < pts.length; i++) { const [x0, z0] = pts[i], [x1, z1] = pts[(i + 1) % pts.length]; area2 += x0 * z1 - x1 * z0; }
    const sentido = area2 > 0 ? 1 : -1;
    let u = 0;
    for (let i = 0; i < pts.length; i++) {
      let [ax, az] = pts[i], [bx, bz] = pts[(i + 1) % pts.length];
      if (sentido < 0) [ax, az, bx, bz] = [bx, bz, ax, az];
      const len = Math.hypot(bx - ax, bz - az);
      const u0 = u / 12, u1 = (u + len) / 12, v0 = 0, v1 = H / 24;
      u += len;
      const q = [[ax, y0, az, u0, v0], [bx, y0, bz, u1, v0], [bx, y1, bz, u1, v1], [ax, y1, az, u0, v1]];
      for (const k of [0, 2, 1, 0, 3, 2]) { pos.push(q[k][0], q[k][1], q[k][2]); uv.push(q[k][3], q[k][4]); cor.push(c.r, c.g, c.b); }
    }
    const faces = THREE.ShapeUtils.triangulateShape(pts.map(([x, z]) => new THREE.Vector2(x, z)), []);
    for (const f of faces) for (const i of [f[0], f[2], f[1]]) { pos.push(pts[i][0], y1, pts[i][1]); uv.push(0.01, 0.01); cor.push(cTelhado.r, cTelhado.g, cTelhado.b); }
  }
  if (!pos.length) return null;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(cor, 3));
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, matPredioOSM);
  m.castShadow = true; m.receiveShadow = true;
  m.material.side = THREE.DoubleSide;
  return m;
}

// árvores espalhadas nas áreas verdes: instanciadas em blocos de 120 m que somem de longe
function plantarArvores() {
  const DENS = { mata: 1 / 90, parque: 1 / 200, grama: 1 / 700 };
  const pontos = [];
  let semente = 1;
  const rnd = () => { semente = (semente * 16807) % 2147483647; return semente / 2147483647; };
  // parque que avança sobre o rio (o mapa às vezes desenha o parque por cima da água): nada de árvore na água
  const aguas = osm.areas.filter((a) => a.tipo === 'agua');
  const naAgua = (x, z) => aguas.some(({ caixa: [x0, z0, x1, z1], pts }) => x >= x0 && x <= x1 && z >= z0 && z <= z1 && pontoNoPoligono(x, z, pts));
  for (const a of osm.areas) {
    const dens = DENS[a.tipo];
    if (!dens) continue;
    const [x0, z0, x1, z1] = a.caixa;
    const n = Math.min(1500, Math.round(a.area * dens));
    for (let i = 0, plantadas = 0; i < n * 3 && plantadas < n && pontos.length < 4000; i++) {
      const x = x0 + rnd() * (x1 - x0), z = z0 + rnd() * (z1 - z0);
      if (!pontoNoPoligono(x, z, a.pts)) continue;
      const perto = pista.pertoDe(x, z, 200);
      if (perto.dist < 13 || perto.dist > 170) continue;
      if (areasSemArvore.some(([ax, az, r]) => (x - ax) ** 2 + (z - az) ** 2 < r * r)) continue;
      if (perto.dist < 45 && vistasLivres.length) { const q = pista.em(perto.s), [rx, rz] = direita(q.ang); if (naVistaLivre(perto.s, Math.sign((x - q.x) * rx + (z - q.z) * rz))) continue; }
      const aqui = areaEm(osm, x, z);
      if ((aqui && (aqui.tipo === 'agua' || aqui.tipo === 'esporte')) || naAgua(x, z)) continue;
      pontos.push([x, perto.y, z]);
      plantadas++;
    }
  }
  for (const [x, z] of osm.arvores) {
    const perto = pista.pertoDe(x, z);
    if (perto.dist > 12 && !naAgua(x, z) && !areasSemArvore.some(([ax, az, r]) => (x - ax) ** 2 + (z - az) ** 2 < r * r)) pontos.push([x, perto.y, z]);
  }
  const variantes = [0, 1, 2].map(() => {
    const g = achatar(arvore(1)).children[0].geometry;
    return g;
  });
  const blocos = new Map();
  pontos.forEach((p, i) => {
    const k = `${Math.floor(p[0] / 120)},${Math.floor(p[2] / 120)},${i % 3}`;
    if (!blocos.has(k)) blocos.set(k, []);
    blocos.get(k).push(p);
  });
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), sc = new THREE.Vector3(), v = new THREE.Vector3();
  for (const [k, lista] of blocos) {
    const variante = Number(k.split(',')[2]);
    const im = new THREE.InstancedMesh(variantes[variante], matArvore, lista.length);
    let cx = 0, cz = 0;
    lista.forEach(([x, y, z], i) => {
      const esc = 0.8 + rnd() * 0.6;
      m4.compose(v.set(x, y, z), q.setFromEuler(e.set(0, rnd() * 6.28, 0)), sc.set(esc, esc * (0.9 + rnd() * 0.3), esc));
      im.setMatrixAt(i, m4);
      cx += x; cz += z;
    });
    im.castShadow = true;
    im.computeBoundingSphere();
    im.userData.centro = [cx / lista.length, cz / lista.length];
    grupoOSM.add(im);
    chunksArvores.push(im);
  }
  return pontos.length;
}

function colocarPedalinhos() {
  const lagos = osm.areas.filter((a) => a.tipo === 'agua' && a.area > 2500);
  for (const lago of lagos) {
    const [x0, z0, x1, z1] = lago.caixa;
    const n = Math.min(4, Math.max(1, Math.round(lago.area / 6000)));
    for (let i = 0, tent = 0; i < n && tent < 60; tent++) {
      const x = x0 + Math.random() * (x1 - x0), z = z0 + Math.random() * (z1 - z0);
      if (!pontoNoPoligono(x, z, lago.pts) || pista.pertoDe(x, z).dist < 15) continue;
      const b = prop('pedalinho');
      if (!b) return;
      b.position.set(x, alturaChao(x, z) - 0.05, z);
      b.rotation.y = Math.random() * 6.28;
      b.userData.base = b.position.y; b.userData.fase = Math.random() * 6;
      grupoOSM.add(b); pedalinhos.push(b);
      i++;
    }
  }
}

function construirOSM() {
  scene.remove(grupoOSM);
  grupoOSM = new THREE.Group();
  chunksArvores = []; pedalinhos = [];
  scene.add(grupoOSM);
  if (!osm) return;
  const porTipo = {};
  for (const a of osm.areas) (porTipo[a.tipo] ||= []).push(a.pts);
  for (const [tipo, listas] of Object.entries(porTipo)) {
    const m = malhaDePoligono(listas, matsArea[tipo], tipo === 'agua' ? -0.05 : -0.08, ORDEM_AREA[tipo]);
    if (m) grupoOSM.add(m);
  }
  // margem de terra clara em volta dos lagos
  const margens = osm.areas.filter((a) => a.tipo === 'agua').map((a) => [...a.pts, a.pts[0]]);
  const margem = malhaDeLinhas(margens, 1.8, matMargem, -0.055, -2.25);
  if (margem) grupoOSM.add(margem);
  const rios = malhaDeLinhas(osm.rios, 5, matRio, -0.06, -2.1);
  if (rios) grupoOSM.add(rios);
  const trilhas = malhaDeLinhas(osm.caminhos, 2.2, matCaminho, -0.03, -0.9);
  if (trilhas) grupoOSM.add(trilhas);
  // igrejas, escolas e comércios do mapa ganham fachada própria no lugar do prédio genérico
  const locais = colocarLocais();
  const predios = malhaDePredios(osm.predios.filter((b) => !locais.some((l) => pontoNoPoligono(l.x, l.z, b.pts))));
  colocarMarcos();
  if (predios) grupoOSM.add(predios);
  plantarArvores();
  colocarPedalinhos();
  // com o mapa real, a faixa de grama da beira fica estreita para os parques e lagos aparecerem
  for (const gr of visual.userData.grama || []) visual.remove(gr);
  const amostras = visual.userData.amostras;
  if (amostras) for (const [a, b, , opts] of faixasComuns(true).filter((f) => f[2] === 'grama')) {
    const gr = fita(amostras, a, b, matGrama, opts);
    gr.renderOrder = -1;
    visual.add(gr);
  }
  construirAvenidas();
}

// ─── AVENIDAS DE PISTA DUPLA: 3 FAIXAS, CANTEIRO DE GRAMA COM GUIAS E POSTES, A OUTRA PISTA AO LADO ──
const matRuaFaixas = new THREE.MeshStandardMaterial({ map: texAsfaltoFaixas(true), roughness: 0.95, vertexColors: true, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -6 });
const matRuaOutra = new THREE.MeshStandardMaterial({ map: texAsfaltoFaixas(false), roughness: 0.95, vertexColors: true, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -5 });
const matCanteiro = manchasDeGrama(new THREE.MeshStandardMaterial({ map: texGrama, color: 0xd8ecc8, roughness: 1, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -3 }));
const matGuia = new THREE.MeshStandardMaterial({ color: 0xc9c6bd, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -7 });
const matCalcadaLisa = new THREE.MeshStandardMaterial({ color: 0xcfcac0, roughness: 1, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -3 });
function construirAvenidas() {
  if (visual.userData.avenidas) visual.remove(visual.userData.avenidas);
  if (prova?.ruasOSM) return; // ruas do mapa (teste): as duas pistas da avenida já vêm do OpenStreetMap
  const grupo = new THREE.Group();
  visual.userData.avenidas = grupo;
  visual.add(grupo);
  const amostras = visual.userData.amostras || [];
  const MATS = { ruaFaixas: matRuaFaixas, ruaOutra: matRuaOutra, guia: matGuia, canteiro: matCanteiro, calcadaLisa: matCalcadaLisa };
  // a geometria das faixas (e os limites que não deixam invadir outro trecho do percurso) vem de src/faixas.js
  const ocupado = new Map();
  for (const t of duplas) for (const sub of amostrasAvenida(t, amostras)) {
    const { lista, okMeio } = faixasAvenida(t, sub, pista, ocupado);
    for (const [f0, f1, tipo, opts] of lista) {
      if (tipo === 'ruaFaixas') { // mesma fresta da borda azul da rua comum
        const [b0, b1] = BORDA_AZUL, M = R.MEIA_RUA, o = { ...opts, uDe: [-M, M] };
        for (const [d0, d1] of [[-b0, b0], [b1, M], [-M, -b1]]) grupo.add(fita(sub, d0, d1, matRuaFaixas, o));
        continue;
      }
      grupo.add(fita(sub, f0, f1, MATS[tipo], opts));
    }
    const L = t.lado, M = R.MEIA_RUA, OUTRA = 4.2;
    // postes de luz no meio do canteiro, a cada ~40 m
    const modelo = PROPS.poste?.modelo;
    for (let s = Math.max(t.s0, sub[0].s) + 15; s < Math.min(t.s1, sub[sub.length - 1].s) - 10; s += 40) {
      const p = emEst(s), du = duplaEm([t], s);
      if (!du || du.dist - OUTRA - M < 2.5) continue;
      const meio = L * (M + 0.3 + (du.dist - OUTRA - 0.3)) / 2;
      // canteiro encolhido (outro trecho do percurso ao lado): sem poste
      { const a0 = sub.reduce((m, a) => (Math.abs(a.s - s) < Math.abs(m.s - s) ? a : m), sub[0]); if (!okMeio.get(a0) || (a0.lat && Math.abs(meio) > (L > 0 ? a0.lat.limD : a0.lat.limE) - 0.5)) continue; }
      const [rx, rz] = direita(p.ang);
      const poste = modelo ? modelo.clone() : (() => { const g = new THREE.Group(); const h = malha(G.cilindro, mat(0x9aa3ad), 0, 4, 0); h.scale.set(0.12, 8, 0.12); g.add(h); return g; })();
      poste.position.set(p.x + rx * meio, p.y + 0.12, p.z + rz * meio);
      poste.rotation.y = -p.ang + Math.PI / 2;
      grupo.add(poste);
    }
  }
}

// ─── FACHADAS (IGREJA, ESCOLA, COMÉRCIO, POSTO) E MARCOS DA CIDADE ────────────
// a frente de cada peça olha para +z; quem posiciona gira para a frente ficar virada para o percurso

function bloco(g, cor, x, y, z, sx, sy, sz, extra) {
  const m = malha(G.caixa, mat(cor, extra), x, y, z); m.scale.set(sx, sy, sz); g.add(m); return m;
}
const VIDRO = 0x7fb6d6;
const PAREDES = [0xf7efe1, 0xf2dfc4, 0xe9f0f2, 0xf6e3e8, 0xfff2c8, 0xdfeedd];
const TOLDOS = [[0xd83a3a, 0xffffff], [0x2a7de1, 0xffffff], [0x1f9d55, 0xfff6d5], [0xf29b1b, 0xffffff]];

function fachadaIgreja() {
  const g = new THREE.Group();
  const branco = 0xf4efe6;
  bloco(g, branco, 0, 3.6, -3, 9, 7.2, 14);
  for (const lado of [-1, 1]) {
    const t = bloco(g, 0xb5523b, lado * 2.35, 8.5, -3, 5.6, 0.3, 14.8); t.rotation.z = -lado * 0.62;
  }
  // torre na frente com cúpula e cruz
  bloco(g, branco, 0, 7, 4.6, 3.4, 14, 3.4);
  bloco(g, 0x6e8fb8, 0, 11.6, 6.32, 1.2, 1.8, 0.1);
  const cupula = malha(new THREE.ConeGeometry(2.3, 3.6, 4), mat(0xb5523b), 0, 15.8, 4.6); cupula.rotation.y = Math.PI / 4; g.add(cupula);
  bloco(g, 0xd9c27a, 0, 18.6, 4.6, 0.22, 2.2, 0.22);
  bloco(g, 0xd9c27a, 0, 18.9, 4.6, 1.2, 0.22, 0.22);
  // porta e janelas compridas
  bloco(g, 0x6b3f22, 0, 1.6, 6.32, 1.6, 3.2, 0.1);
  for (const z of [-8, -4.5, -1]) for (const lado of [-1, 1]) bloco(g, VIDRO, lado * 4.52, 4, z, 0.1, 2.6, 1);
  bloco(g, 0xd8d2c4, 0, 0.15, 7.6, 6, 0.3, 3);
  return g;
}

function fachadaEscola() {
  const g = new THREE.Group();
  const larg = 22, alt = 7.4;
  bloco(g, 0xf6d55c, 0, alt / 2, -3, larg, alt, 9);
  bloco(g, 0x2f6fc0, 0, 0.9, 1.53, larg + 0.02, 1.8, 0.08);
  bloco(g, 0xffffff, 0, alt + 0.2, -3, larg + 0.6, 0.4, 9.6);
  for (const y of [2.9, 5.6]) for (let x = -larg / 2 + 2; x <= larg / 2 - 2; x += 3) bloco(g, VIDRO, x, y, 1.55, 1.9, 1.3, 0.1);
  // entrada com marquise e muro baixo com grade
  bloco(g, 0x2f6fc0, 0, 3.2, 2.6, 5, 0.3, 2.4);
  bloco(g, 0x6b3f22, 0, 1.2, 1.56, 2.2, 2.4, 0.1);
  for (const lado of [-1, 1]) {
    bloco(g, 0xe8e1d0, lado * (larg / 4 + 2), 0.6, 7, larg / 2 - 4, 1.2, 0.3);
    for (let x = 3; x < larg / 2 + 1; x += 0.6) bloco(g, 0x2b2f36, lado * x, 1.6, 7, 0.06, 0.9, 0.06);
  }
  // mastro com bandeira
  bloco(g, 0xd0d4da, larg / 2 - 1, 4, 5.5, 0.12, 8, 0.12);
  bloco(g, 0x1f9d55, larg / 2 - 0.3, 7.3, 5.5, 1.4, 0.9, 0.05);
  return g;
}

function fachadaComercio() {
  const g = new THREE.Group();
  const larg = aleat(8, 12), alt = aleat(4.2, 5.4), [c1, c2] = escolher(TOLDOS);
  bloco(g, escolher(PAREDES), 0, alt / 2, -4, larg, alt, 8);
  bloco(g, 0x4a4f57, 0, 1.4, 0.03, larg - 1.2, 2.8, 0.06);
  bloco(g, VIDRO, 0, 1.45, 0.07, larg - 1.6, 2.5, 0.05, { roughness: 0.15, metalness: 0.3 });
  // faixa do letreiro (sem nome) e toldo listrado
  bloco(g, c1, 0, alt - 0.6, 0.06, larg - 0.4, 0.9, 0.12);
  const n = Math.round(larg / 0.8);
  for (let i = 0; i < n; i++) {
    const t = bloco(g, i % 2 ? c2 : c1, -larg / 2 + (i + 0.5) * (larg / n), 3.1, 0.75, larg / n + 0.01, 0.08, 1.6);
    t.rotation.x = 0.35;
  }
  bloco(g, 0xd8d2c4, 0, 0.1, 2.2, larg + 1, 0.2, 3);
  return g;
}

function fachadaPosto() {
  const g = new THREE.Group();
  bloco(g, 0xffffff, 0, 5.4, 4, 14, 0.9, 9);
  bloco(g, 0xd83a3a, 0, 5.2, 8.52, 14.02, 0.45, 0.05);
  for (const x of [-4.5, 4.5]) for (const z of [1.5, 6.5]) bloco(g, 0xe6e6e6, x, 2.5, z, 0.45, 5, 0.45);
  for (const x of [-2.2, 2.2]) {
    bloco(g, 0x2b2f36, x, 0.85, 4, 0.9, 1.7, 0.5);
    bloco(g, 0xd83a3a, x, 1.4, 4.26, 0.7, 0.5, 0.05);
    bloco(g, 0xb0b5bb, x, 0.08, 4, 2.2, 0.16, 5);
  }
  bloco(g, escolher(PAREDES), 0, 2, -4.5, 10, 4, 6);
  bloco(g, VIDRO, 0, 1.5, -1.47, 7, 2.2, 0.06);
  return g;
}

const FACHADAS = { igreja: fachadaIgreja, escola: fachadaEscola, comercio: fachadaComercio, posto: fachadaPosto };
// modelo do Higgsfield quando carregou; senão a fachada feita em blocos
function fachada(tipo, i) {
  const nome = tipo === 'comercio' ? (i % 2 ? 'padaria' : 'mercado') : tipo;
  const m = prop(nome);
  return m || achatar(FACHADAS[tipo]());
}

// gira o objeto para a frente (+z) olhar para o ponto do percurso mais próximo
function virarParaPercurso(obj, x, z) {
  const perto = pista.pertoDe(x, z, 300);
  const p = pista.em(perto.s);
  obj.rotation.y = Math.atan2(p.x - x, p.z - z);
  return perto;
}

function colocarLocais() {
  const usados = [];
  for (const [i, l] of (osm.locais || []).entries()) {
    const perto = pista.pertoDe(l.x, l.z, 200);
    if (perto.dist > 130 || perto.dist < 16) continue;
    if (areaEm(osm, l.x, l.z)?.tipo === 'agua') continue;
    const g = fachada(l.tipo, i);
    g.position.set(l.x, perto.y - 0.05, l.z);
    virarParaPercurso(g, l.x, l.z);
    g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    grupoOSM.add(g);
    usados.push(l);
  }
  return usados;
}

// letreiro "EU ♥ INDAIATUBA": letras em blocos coloridos com a letra na frente e em cima
// Centro Cultural Hermenegildo Pinto, o "Piano": paredão branco com faixas pretas (teclas), telhado ondulado
// e o bloco preto da ponta com o nome. A frente (+z) olha para o percurso.
function centroPiano() {
  // com o modelo 3D carregado, usa ele; senão, a versão montada no código
  const modelo = prop('piano');
  if (modelo) {
    const tam = PROPS.piano.tamanho;
    modelo.userData = { prof: tam.z, raio: tam.x / 2 + 8, vista: tam.x / 2 + 6 };
    return modelo;
  }
  const g = new THREE.Group();
  const L = 46, H = 8, PROF = 16, ONDA = 1.4;
  const topo = (x) => H + ONDA * Math.sin(((x + L / 2) / L) * Math.PI * 3.5);
  const forma = new THREE.Shape();
  forma.moveTo(-L / 2, 0); forma.lineTo(L / 2, 0);
  for (let i = 40; i >= 0; i--) { const x = -L / 2 + (i / 40) * L; forma.lineTo(x, topo(x)); }
  forma.closePath();
  // fachada com as teclas: pretas em grupos de 2 e 3, como no teclado, mais estreitas que as brancas
  const c = document.createElement('canvas'); c.width = 1024; c.height = 256;
  const k = c.getContext('2d');
  k.fillStyle = '#f4f4f2'; k.fillRect(0, 0, 1024, 256);
  const teclas = 23, lw = 1024 / teclas;
  k.fillStyle = '#1c1c1e';
  for (let i = 0; i < teclas; i++) { const n = i % 7; if (n === 2 || n === 6) continue; k.fillRect((i + 0.68) * lw, 0, lw * 0.5, 210); }
  k.fillStyle = '#2a2a2c'; k.fillRect(0, 214, 1024, 42); // muro escuro embaixo
  k.fillStyle = 'rgba(120,130,140,0.55)';
  for (let x = 30; x < 1024; x += 64) k.fillRect(x, 150, 34, 34); // janelinhas
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const geoFrente = new THREE.ShapeGeometry(forma);
  const uv = geoFrente.attributes.uv, pos = geoFrente.attributes.position;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (pos.getX(i) + L / 2) / L, pos.getY(i) / (H + ONDA));
  const frente = new THREE.Mesh(geoFrente, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85 }));
  frente.position.z = PROF / 2 + 0.02; g.add(frente);
  const corpo = new THREE.Mesh(new THREE.ExtrudeGeometry(forma, { depth: PROF, bevelEnabled: false }), new THREE.MeshStandardMaterial({ color: 0xeeeeec, roughness: 0.9 }));
  corpo.position.z = -PROF / 2; g.add(corpo);
  // bloco preto da ponta, com o nome
  const cn = document.createElement('canvas'); cn.width = 512; cn.height = 256;
  const t = cn.getContext('2d');
  t.fillStyle = '#18181a'; t.fillRect(0, 0, 512, 256);
  t.fillStyle = '#ffffff'; t.textAlign = 'center'; t.font = 'bold 44px sans-serif';
  t.fillText('CENTRO CULTURAL', 256, 110); t.font = 'bold 40px sans-serif'; t.fillText('"PIANO"', 256, 165);
  const texNome = new THREE.CanvasTexture(cn); texNome.colorSpace = THREE.SRGBColorSpace;
  const preto = new THREE.MeshStandardMaterial({ color: 0x18181a, roughness: 0.8 });
  const bloco = new THREE.Mesh(new THREE.BoxGeometry(9, H + 2.2, PROF + 1), [preto, preto, preto, preto, new THREE.MeshStandardMaterial({ map: texNome, roughness: 0.8 }), preto]);
  bloco.position.set(-L / 2 - 4.5, (H + 2.2) / 2, 0); g.add(bloco);
  g.userData.prof = PROF; g.userData.raio = L / 2 + 8; g.userData.vista = L / 2 + 6;
  g.traverse((o) => { if (o.isMesh) o.receiveShadow = true; });
  return g;
}

function letreiro() {
  const g = new THREE.Group();
  const texto = ['E', 'U', '♥', 'I', 'N', 'D', 'A', 'I', 'A', 'T', 'U', 'B', 'A'];
  const cores = ['#e63946', '#f4a261', '#ff2d55', '#2a9d8f', '#1d6fd8', '#8e44ad', '#f1c40f', '#e67e22', '#27ae60', '#e63946', '#1d6fd8', '#f39c12', '#16a085'];
  const L = 1.5, H = 2.1, P = 0.7;
  let x = -((texto.length - 1) * (L + 0.12)) / 2;
  texto.forEach((ch, i) => {
    const cor = ch === '♥' ? '#ffffff' : cores[i];
    const tex = textura(128, 180, (c, w, h) => {
      c.fillStyle = cor; c.fillRect(0, 0, w, h);
      c.fillStyle = ch === '♥' ? '#ff2d55' : '#ffffff';
      c.font = `800 ${ch === '♥' ? 150 : 160}px "Baloo 2", system-ui, sans-serif`;
      c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(ch, w / 2, h / 2 + 12);
    });
    const lateral = new THREE.MeshStandardMaterial({ color: new THREE.Color(cor).multiplyScalar(0.8), roughness: 0.5 });
    const frente = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.5 });
    const m = new THREE.Mesh(G.caixa, [lateral, lateral, lateral, lateral, frente, frente]);
    const alto = ch === '♥' ? H * 1.15 : H;
    m.scale.set(L, alto, P); m.position.set(x, 0.5 + alto / 2, 0); m.castShadow = true;
    g.add(m);
    x += L + 0.12;
  });
  bloco(g, 0xd8d2c4, 0, 0.25, 0, texto.length * (L + 0.12) + 1.2, 0.5, 2.2);
  return g;
}

// Escultura da Árvore (nome do mapa): torre de treliça que se abre numa copa hexagonal, com luzes de Natal
function arvoreEspacial() {
  const g = new THREE.Group();
  const aco = mat(0xd9dde2, { metalness: 0.6, roughness: 0.35 });
  const tubo = (a, b, r = 0.07, m = aco) => {
    const va = new THREE.Vector3(...a), vb = new THREE.Vector3(...b), len = va.distanceTo(vb);
    const t = malha(G.cilindro, m); t.scale.set(r, len, r);
    t.position.copy(va).add(vb).multiplyScalar(0.5);
    t.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), vb.sub(va).normalize());
    g.add(t);
  };
  const luzes = [];
  const N = 12, R0 = 1.7, H0 = 0.6, H1 = 9.5, R2 = 6.5, H2 = 13.2;
  const ponto = (r, y, i) => [Math.cos((i / N) * Math.PI * 2) * r, y, Math.sin((i / N) * Math.PI * 2) * r];
  // base redonda
  const base = malha(G.cilindro, mat(0xcfcac0), 0, 0.3, 0); base.scale.set(3.2, 0.6, 3.2); g.add(base);
  for (let i = 0; i < N; i++) {
    // montantes da torre e hastes que se abrem até a copa
    tubo(ponto(R0, H0, i), ponto(R0, H1, i));
    tubo(ponto(R0, H1, i), ponto(R2, H2, i));
    tubo(ponto(R0 * 0.3, H1 - 0.5, i), ponto(R2, H2, i), 0.05);
    for (let k = 0; k <= 10; k++) luzes.push(ponto(R0 + 0.08, H0 + ((H1 - H0) * k) / 10, i));
    for (let k = 1; k <= 8; k++) luzes.push(ponto(R0 + ((R2 - R0) * k) / 8, H1 + ((H2 - H1) * k) / 8, i));
  }
  // anéis da torre e aro hexagonal da copa
  for (const y of [H0, 3.4, 6.4, H1]) for (let i = 0; i < N; i++) tubo(ponto(R0, y, i), ponto(R0, y, i + 1), 0.05);
  for (let i = 0; i < 6; i++) {
    const a = ponto(R2, H2, i * 2), b = ponto(R2, H2, i * 2 + 2);
    tubo(a, b, 0.09);
    for (let k = 0; k < 10; k++) luzes.push(a.map((v, j) => v + ((b[j] - v) * k) / 10));
  }
  // guirlanda em espiral na torre
  const verde = mat(0x1f6b3a, { roughness: 0.9 });
  let ant = null;
  for (let k = 0; k <= 72; k++) {
    const a = (k / 72) * Math.PI * 2 * 3, y = H0 + 0.8 + (k / 72) * (H1 - H0 - 1.2);
    const p = [Math.cos(a) * (R0 + 0.25), y, Math.sin(a) * (R0 + 0.25)];
    if (ant) tubo(ant, p, 0.22, verde);
    ant = p;
  }
  // bolas vermelhas e douradas penduradas na copa
  for (let i = 0; i < N; i++) {
    const p = ponto(R2 * 0.75, H1 + (H2 - H1) * 0.6 - 0.6, i + 0.5);
    const b = malha(G.esfera, mat(i % 2 ? 0xc0392b : 0xd4a72c, { metalness: 0.4, roughness: 0.3 }), ...p); b.scale.setScalar(0.32); g.add(b);
  }
  const corpo = achatar(g);
  // luzinhas quentes: uma malha instanciada que brilha sem depender da luz da cena
  const lamp = new THREE.InstancedMesh(new THREE.SphereGeometry(0.09, 6, 4), new THREE.MeshBasicMaterial({ color: 0xffd27a }), luzes.length);
  const m4 = new THREE.Matrix4();
  luzes.forEach((p, i) => lamp.setMatrixAt(i, m4.makeTranslation(...p)));
  corpo.add(lamp);
  return corpo;
}

// Barco da Raia de Remo: navio-monumento de tábuas marrons, proa pontuda, escotilhas, duas cabines,
// guarda-corpo e dois mastros (montado a partir de foto do Street View). Comprido em x, lateral virada para z.
function barcoRaia() {
  const g = new THREE.Group();
  const C = 26, A = 4.2, Lg = 6.5; // comprimento, altura do casco, largura
  const tabuas = textura(256, 256, (c, w, h) => {
    c.fillStyle = '#8a5a3b'; c.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 16) { c.fillStyle = y % 32 ? '#7d5034' : '#93613f'; c.fillRect(0, y, w, 15); c.fillStyle = 'rgba(0,0,0,0.25)'; c.fillRect(0, y + 15, w, 1); }
  }, [C / 4, A / 1.2]);
  // casco: perfil lateral com fundo reto atrás e proa subindo em ponta
  const perfil = new THREE.Shape();
  perfil.moveTo(-C / 2, 0.3); perfil.lineTo(C * 0.18, 0.3); perfil.lineTo(C / 2, A); perfil.lineTo(-C / 2, A); perfil.closePath();
  const casco = new THREE.Mesh(new THREE.ExtrudeGeometry(perfil, { depth: Lg, bevelEnabled: false }), new THREE.MeshStandardMaterial({ map: tabuas, roughness: 0.85 }));
  casco.position.z = -Lg / 2; g.add(casco);
  // proa afinando: cunha na frente para não ficar "caixote"
  const madeira = mat(0x7d5034), branco = mat(0xf2f2f2), vidro = mat(0x2e3a44);
  // base de concreto
  const base = malha(G.caixa, mat(0xb9b4aa), -1, 0.15, 0); base.scale.set(C * 0.75, 0.3, Lg + 0.6); g.add(base);
  // convés
  const conves = malha(G.caixa, mat(0x6e4a32), 0, A + 0.05, 0); conves.scale.set(C, 0.1, Lg); g.add(conves);
  // escotilhas dos dois lados do casco
  for (const lado of [-1, 1]) for (let i = 0; i < 8; i++) {
    const x = -C / 2 + 4 + i * 2.4;
    const aro = malha(G.cilindro, branco, x, A * 0.6, lado * (Lg / 2 + 0.02)); aro.scale.set(0.42, 0.06, 0.42); aro.rotation.x = Math.PI / 2; g.add(aro);
    const vid = malha(G.cilindro, vidro, x, A * 0.6, lado * (Lg / 2 + 0.05)); vid.scale.set(0.3, 0.04, 0.3); vid.rotation.x = Math.PI / 2; g.add(vid);
  }
  // duas cabines com escotilhas e grade em cima
  for (const [cx, cl, ch] of [[-C * 0.05, 6, 2.2], [-C * 0.36, 4.5, 1.8]]) {
    const cab = malha(G.caixa, madeira, cx, A + ch / 2, 0); cab.scale.set(cl, ch, Lg * 0.7); g.add(cab);
    for (const lado of [-1, 1]) for (let i = 0; i < 2; i++) {
      const aro = malha(G.cilindro, branco, cx - cl / 4 + i * cl / 2, A + ch * 0.55, lado * (Lg * 0.35 + 0.02)); aro.scale.set(0.38, 0.06, 0.38); aro.rotation.x = Math.PI / 2; g.add(aro);
    }
    for (const lado of [-1, 1]) { const r = malha(G.caixa, branco, cx, A + ch + 0.55, lado * Lg * 0.33); r.scale.set(cl, 0.06, 0.06); g.add(r); }
    for (let i = 0; i <= 4; i++) for (const lado of [-1, 1]) { const p = malha(G.caixa, branco, cx - cl / 2 + (i * cl) / 4, A + ch + 0.28, lado * Lg * 0.33); p.scale.set(0.06, 0.55, 0.06); g.add(p); }
  }
  // guarda-corpo em volta do convés
  for (const lado of [-1, 1]) {
    const r = malha(G.caixa, branco, 0, A + 1.05, lado * (Lg / 2 - 0.05)); r.scale.set(C * 0.98, 0.07, 0.07); g.add(r);
    const r2 = malha(G.caixa, branco, 0, A + 0.6, lado * (Lg / 2 - 0.05)); r2.scale.set(C * 0.98, 0.05, 0.05); g.add(r2);
    for (let x = -C / 2 + 0.3; x <= C / 2 - 0.3; x += 1.6) { const p = malha(G.caixa, branco, x, A + 0.55, lado * (Lg / 2 - 0.05)); p.scale.set(0.07, 1.0, 0.07); g.add(p); }
  }
  // mastros
  for (const [mx, mh] of [[C * 0.08, 13], [-C * 0.28, 11]]) { const m = malha(G.cilindro, mat(0xcfd3d6), mx, A + mh / 2, 0); m.scale.set(0.12, mh, 0.12); g.add(m); }
  // plaquinha clara na lateral (como na foto)
  for (const lado of [-1, 1]) { const pl = malha(G.caixa, mat(0xd9c7b8), C * 0.1, A * 0.72, lado * (Lg / 2 + 0.03)); pl.scale.set(1.6, 1.0, 0.04); g.add(pl); }
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}

function colocarMarcos() {
  areasSemArvore = []; vistasLivres = [];
  const marcos = [
    [/escultura da árvore/i, () => arvoreEspacial(), null, 13],
    [/letreiro/i, () => letreiro(), null, 13],
    [/barco da raia/i, () => barcoRaia(), 'proaContraOCorredor', 15], // marcos ficam colados na rua para o corredor ver (não é a distância real)
    [/centro cultural hermenegildo/i, () => centroPiano(), null, 22]
  ];
  for (const [nome, criar, giro, distRua] of marcos) {
    const p = osm.pontos.find((q) => nome.test(q.nome));
    if (!p) continue;
    const perto = pista.pertoDe(p.x, p.z, 400);
    if (perto.dist > 250) continue;
    const obj = criar();
    if (!obj) continue;
    // marco colado na rua da prova vai um pouco para trás, para não ficar em cima da calçada
    let { x, z } = p;
    if (distRua) {
      const q = pista.em(perto.s), dx = x - q.x, dz = z - q.z, d = Math.hypot(dx, dz) || 1;
      // do lado da outra pista de uma avenida dupla, o marco vai para além dela
      const [rx, rz] = direita(q.ang), lado = Math.sign(dx * rx + dz * rz) || 1, du = duplaEm(duplas, perto.s);
      const dist = du && du.lado === lado ? Math.max(distRua, du.dist + 7 + (obj.userData.prof || 6) / 2) : distRua;
      x = q.x + (dx / d) * dist; z = q.z + (dz / d) * dist;
    } else if (perto.dist < 14) {
      const q = pista.em(perto.s), dx = x - q.x, dz = z - q.z, d = Math.hypot(dx, dz) || 1;
      const lado = d > 0.5 ? 1 : 1;
      x = q.x + (dx / d) * 14 * lado; z = q.z + (dz / d) * 14 * lado;
    }
    obj.position.set(x, pista.pertoDe(x, z).y - 0.05, z);
    areasSemArvore.push([x, z, obj.userData.raio || (distRua ? 16 : 6)]); // nenhuma árvore nasce dentro do marco
    if (obj.userData.vista) {
      // prédio comprido: nada de árvore na beira desse lado desde uns 70 m antes até o fim dele
      const q = pista.em(perto.s), [rx, rz] = direita(q.ang), lado = Math.sign((x - q.x) * rx + (z - q.z) * rz) || 1;
      vistasLivres.push([perto.s - obj.userData.vista - 70, perto.s + obj.userData.vista, lado]);
    }
    const pertoFinal = virarParaPercurso(obj, x, z);
    if (giro === 'proaContraOCorredor') {
      // como no monumento real: a proa (+x do barco) aponta para quem vem correndo, isto é, contra o sentido da prova
      const ang = pista.em(pertoFinal.s).ang;
      obj.rotation.y = Math.atan2(-Math.cos(ang), -Math.sin(ang));
    }
    obj.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    grupoOSM.add(obj);
  }
}

const cacheOSM = new Map();
async function carregarOSM(distancia, pistaAlvo) {
  if (!cacheOSM.has(PROVA_SLUG)) {
    cacheOSM.set(PROVA_SLUG, fetch(`/osm/${PROVA_SLUG}.json`).then((r) => (r.ok ? r.json() : null)).catch(() => null));
  }
  const dados = await cacheOSM.get(PROVA_SLUG);
  if (pista !== pistaAlvo) return;
  if (!dados) return carregarTravessas(distancia, pistaAlvo);
  osm = prepararOSM(dados, pistaAlvo.paraLocal);
  // viaduto: o trecho que passa por cima de outro trecho do percurso sobe (rampas suaves); o resto fica no chão
  // percurso ajustado (modo de teste): sem o viaduto falso de duas voltas sobrepostas (ver viadutosDoPercurso)
  const viadutos = viadutosDoPercurso(osm, pistaAlvo, { mesmaPassagem: !!distancia.ajustado });
  if (viadutos.length) {
    pistaAlvo.elevar(viadutos, { altura: 7 });
    construirVisual();
    for (const e of entidades) colocar(e);
  }
  zonas = zonasDoPercurso(osm, pistaAlvo);
  duplas = pistasDuplas(osm, pistaAlvo);
  construirOSM();
  // sem rua transversal em cima do viaduto nem onde o percurso passa por baixo dele
  const sob = viadutos.flatMap((v) => v.sob);
  const cruzamentos = encontrarTravessas(pistaAlvo, osm.vias).map((t) => ({ ...t, carro: false }))
    .filter((t) => pistaAlvo.elevacao(t.s) < 0.3 && !sob.some((v) => Math.abs(v - t.s) < 25));
  definirTravessas(cruzamentos);
  definirPlacas(placasDoPercurso(osm, pistaAlvo, cruzamentos), semaforosDoPercurso());
}

function atualizarOSM(dt, t) {
  const lim = [300, 220, 160][nivel];
  for (const c of chunksArvores) c.visible = Math.hypot(c.userData.centro[0] - estado.x, c.userData.centro[1] - estado.z) < lim;
  texAguaNormal.offset.set(t * 0.012, t * 0.007);
  for (const b of pedalinhos) { b.position.y = b.userData.base + Math.sin(t * 1.6 + b.userData.fase) * 0.05; b.rotation.y += dt * 0.05; }
}

// ─── PLACAS DE RUA, PONTOS DE REFERÊNCIA E SEMÁFOROS ──────────────────────────
// só existem perto do corredor: cada placa tem a própria textura com o nome, criada e descartada sob demanda

let placas = [], semaforos = [];
const grupoPlacas = new THREE.Group();
scene.add(grupoPlacas);
const ICONE_PONTO = { parque: '🌳', lago: '🦆', monumento: '🗿', cultura: '🏛️', compras: '🛍️', pier: '🚣' };

// divide o nome em até 2 linhas equilibradas
function linhasDoNome(txt, max = 20) {
  if (txt.length <= max) return [txt];
  const p = txt.split(' ');
  let melhor = null;
  for (let i = 1; i < p.length; i++) {
    const a = p.slice(0, i).join(' '), b = p.slice(i).join(' ');
    const pior = Math.max(a.length, b.length);
    if (!melhor || pior < melhor.pior) melhor = { pior, l: [a, b] };
  }
  return melhor.l;
}

function texPlaca(linhas, fundo, rodape) {
  // 1024 px de largura e filtro anisotrópico no máximo: dá para ler de longe e de lado
  const t = textura(1024, 512, (g, w, h) => {
    g.fillStyle = fundo; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#fff'; g.lineWidth = 16;
    g.beginPath(); g.roundRect(26, 26, w - 52, h - 52, 34); g.stroke();
    g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle';
    const area = rodape ? h - 190 : h - 110, y0 = 55;
    let tam = linhas.length > 1 ? 160 : 200;
    const fonte = () => `800 ${tam}px "Baloo 2", "Arial Black", system-ui, sans-serif`;
    g.font = fonte();
    while (tam > 60 && Math.max(...linhas.map((l) => g.measureText(l).width)) > w - 120) { tam -= 6; g.font = fonte(); }
    const passo = Math.min(tam * 1.0, area / linhas.length);
    linhas.forEach((l, i) => g.fillText(l, w / 2, y0 + area / 2 + (i - (linhas.length - 1) / 2) * passo + 8));
    if (rodape) { g.font = `700 84px "Baloo 2", "Arial Black", system-ui, sans-serif`; g.fillText(rodape, w / 2, h - 112); }
  });
  return t;
}

// cartão marrom no pé da tela (como a placa do parque): não se confunde com os avisos do meio
let pontoTimer;
function mostrarPonto(p) {
  const el = $('#ponto');
  el.querySelector('.ico').textContent = ICONE_PONTO[p.categoria] || '📍';
  el.querySelector('b').textContent = p.nome;
  el.hidden = false;
  el.classList.remove('entra'); void el.offsetWidth; el.classList.add('entra');
  clearTimeout(pontoTimer);
  pontoTimer = setTimeout(() => { el.hidden = true; }, 4000);
}

function criarPlaca(p) {
  const g = new THREE.Group();
  const rua = p.tipo === 'rua';
  const linhas = rua ? linhasDoNome(abreviarRua(p.nome)) : linhasDoNome(`${ICONE_PONTO[p.categoria] || '📍'} ${p.nome}`, 22);
  const rodape = rua ? null : `${p.lado > 0 ? '➜' : '⬅'} ${Math.max(10, Math.round(p.dist / 10) * 10)} m`;
  const tex = texPlaca(linhas, rua ? '#1552b0' : '#7a4a22', rodape);
  const matTexto = new THREE.MeshBasicMaterial({ map: tex });
  let W, H, yc, meia;
  const modelo = rua && prop('placa');
  if (modelo) {
    // placa azul feita no Higgsfield: a chapa ocupa o alto do poste, de frente para o eixo x
    g.add(modelo);
    const tam = PROPS.placa.tamanho;
    W = tam.z * 0.9; H = tam.y * 0.38; yc = tam.y * 0.785; meia = tam.x / 2 + 0.015;
  } else {
    // placa de parque: dois mourões de madeira e chapa marrom (ou azul, se o modelo não carregou)
    W = rua ? 2.6 : 3.4; H = rua ? 1.3 : 1.8; yc = rua ? 3.0 : 2.0; meia = 0.06;
    const madeira = mat(rua ? 0x8d949c : 0x6b4423);
    for (const z of rua ? [0] : [-W / 2 + 0.2, W / 2 - 0.2]) {
      const poste = malha(G.caixa, madeira, 0, yc / 2, z); poste.scale.set(0.12, yc + H / 2, 0.12); g.add(poste);
    }
    const chapa = malha(G.caixa, mat(rua ? 0x1552b0 : 0x7a4a22), 0, yc, 0); chapa.scale.set(0.1, H + 0.12, W + 0.12); g.add(chapa);
  }
  for (const lado of [-1, 1]) {
    const t = new THREE.Mesh(new THREE.PlaneGeometry(W, H), matTexto);
    t.position.set(lado * meia, yc, 0); t.rotation.y = lado * Math.PI / 2;
    g.add(t);
  }
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}

function criarSemaforo() {
  const g = new THREE.Group();
  const cinza = mat(0x3b4048);
  const poste = malha(G.cilindro, cinza, 0, 2.6, 0); poste.scale.set(0.09, 5.2, 0.09); g.add(poste);
  const braco = malha(G.cilindro, cinza, -1.6, 5.05, 0); braco.scale.set(0.06, 3.2, 0.06); braco.rotation.z = Math.PI / 2; g.add(braco);
  for (const [x, y] of [[-2.9, 4.45], [0.16, 2.75]]) {
    const caixa = malha(G.caixa, mat(0x1d1f24), x, y, 0); caixa.scale.set(0.34, 1.0, 0.3); g.add(caixa);
    [[0xff3b30, 0.3, 0.25], [0xffcc00, 0, 0.25], [0x34ff6a, -0.3, 2.4]].forEach(([cor, dy, brilho]) => {
      const luz = malha(G.esfera, new THREE.MeshStandardMaterial({ color: cor, emissive: cor, emissiveIntensity: brilho }), x, y + dy, 0.16);
      luz.scale.setScalar(0.11); g.add(luz);
    });
  }
  return g;
}

function semaforosDoPercurso() {
  const lista = [];
  for (const [x, z] of osm.semaforos || []) {
    const perto = pista.pertoDe(x, z, 60);
    if (perto.dist > 25 || lista.some((o) => Math.abs(o.s - perto.s) < 30)) continue;
    lista.push({ s: perto.s, lado: 1 });
  }
  return lista;
}

function definirPlacas(lista, listaSemaforos = []) {
  limparPlacas();
  placas = lista;
  semaforos = listaSemaforos;
}

function limparPlacas() {
  for (const p of [...placas, ...semaforos]) if (p.obj) soltarPlaca(p);
  placas = []; semaforos = [];
}

function soltarPlaca(p) {
  grupoPlacas.remove(p.obj);
  p.obj.traverse((o) => { if (o.isMesh && o.material.map && o.material.isMeshBasicMaterial) { o.material.map.dispose(); o.material.dispose(); } });
  p.obj = null;
}

function posicionarNaBeira(obj, s, lado, d) {
  const p = emEst(s);
  const [rx, rz] = direita(p.ang);
  obj.position.set(p.x + rx * lado * d, p.y, p.z + rz * lado * d);
  return p;
}

function atualizarPlacas(sCorredor) {
  for (const p of placas) {
    const perto = p.s > sCorredor - 30 && p.s < sCorredor + 260;
    if (perto && !p.obj) {
      p.obj = criarPlaca(p);
      const e = posicionarNaBeira(p.obj, p.s, p.lado, R.LIMITE_CALCADA + 1.1);
      // de frente para quem vem correndo, um pouco virada para o meio da rua
      p.obj.rotation.y = -e.ang + Math.PI / 2 - p.lado * 0.35;
      // nas esquinas fechadas a placa cairia em cima de outro trecho da rua
      p.obj.visible = pista.pertoDe(p.obj.position.x, p.obj.position.z, 20).dist > R.LIMITE_CALCADA && !(pista.elevacao?.(p.s) > 0.3);
      grupoPlacas.add(p.obj);
    } else if (!perto && p.obj) soltarPlaca(p);
    if (p.tipo === 'ponto' && !p.avisado && sCorredor > (p.sPonto ?? p.s) - 5 && sCorredor < (p.sPonto ?? p.s) + 40) {
      p.avisado = true;
      mostrarPonto(p);
    }
  }
  for (const m of semaforos) {
    const perto = m.s > sCorredor - 30 && m.s < sCorredor + 260;
    if (perto && !m.obj) {
      m.obj = criarSemaforo();
      const e = posicionarNaBeira(m.obj, m.s, m.lado, R.MEIA_RUA + 0.6);
      m.obj.rotation.y = -e.ang;
      grupoPlacas.add(m.obj);
    } else if (!perto && m.obj) { grupoPlacas.remove(m.obj); m.obj = null; }
  }
}

// ─── ESTADO ───────────────────────────────────────────────────────────────────

const corredor = criarCorredor();
const estado = {
  modo: 'inicio', t: 0, tempoReal: 0, x: 0, z: 0, ang: 0, camAng: 0, s: 0, sMax: 0, d: 0, v: 0,
  y: 0, vy: 0, agachado: 0, geis: 0, gelAtivo: 0, giroPend: 0, parado: 0, voltar: false, fase: 0,
  agua: 100, pontos: 0, penal: 0, proximoSpawn: 70, proximoPosto: 1000, proximoKm: 1000,
  proximaTravessa: 140, tremor: 0, contagem: 0, kmAvisado: 0
};
let ultimaEscolha = { tipo: 'treino' };
let dadosProva = null;

function limparEntidades() {
  for (const e of entidades) scene.remove(e.obj);
  entidades = [];
  postos = [];
}

// pontos de hidratação marcados no KML/GPX da prova (H1, H2…); sem marcação, a cada 2 km
function postosDaProva(rotulo) {
  const marcados = (dadosProva?.marcadores?.[rotulo] || [])
    .filter((m) => /^H\d+/i.test(m.orig || '') || /hidrat/i.test(m.name || ''))
    .map((m, i) => { const q = pista.localizar(m.la, m.lo); return { s: q.s, lado: Math.abs(q.d) > 2 ? Math.sign(q.d) : (i % 2 ? -1 : 1) }; })
    .filter((m) => m.s > 60 && m.s < pista.total - 60)
    .sort((a, b) => a.s - b.s);
  if (marcados.length) return marcados;
  const lista = [];
  for (let s = R.POSTO_PADRAO_M, i = 0; s < pista.total - 300; s += R.POSTO_PADRAO_M, i++) lista.push({ s, lado: i % 2 ? -1 : 1 });
  return lista;
}

function prepararPercurso(escolha) {
  ultimaEscolha = escolha;
  limparEntidades();
  limparPlacas();
  if (escolha.tipo === 'prova') {
    pista = new PistaReal(escolha.distancia.percurso, { exagero: PROVAS.find((p) => p.slug === PROVA_SLUG)?.relevo ?? 1.6,
      janela: escolha.distancia.ajustado ? JANELA_AJUSTADO : null }); // percurso ajustado (teste): projeção com janela curta
    const ruas = escolha.distancia.ruas;
    prova = { nome: dadosProva.nome, rotulo: escolha.distancia.rotulo, total: pista.total, ajustado: !!escolha.distancia.ajustado,
      // desenho das ruas do mapa (teste): só se o arquivo foi feito para esta mesma pista
      ruasOSM: ruas && Math.abs(ruas.pistaTotal - pista.total) < 0.5 ? ruas : null };
  } else {
    pista = new PistaReta();
    prova = null;
  }
  definirFaixas(prova ? prova.nome : 'CORRIDA DE RUA');
  osm = null; zonas = null; duplas = [];
  construirVisual();
  construirOSM();
  definirTravessas([]);
  construirCenario();
  if (prova) {
    // percurso em circuito (chegada no mesmo lugar da largada): um pórtico só, "LARGADA · CHEGADA"
    const ini = emEst(6), fim = emEst(pista.total), mesmoLugar = Math.hypot(ini.x - fim.x, ini.z - fim.z) < 40;
    if (mesmoLugar) portico(6, 'LARGADA · CHEGADA', { cor: '#1fae5b', corTexto: '#ffffff' }).sAlt = [pista.total];
    else portico(6, 'LARGADA', { cor: '#1fae5b', corTexto: '#ffffff' });
    for (let km = 1; km * 1000 < pista.total - 150; km++) portico(km * 1000, `${km} KM`);
    if (!mesmoLugar) portico(pista.total, 'CHEGADA', { cor: '#e63946', corTexto: '#ffffff' });
    const tapete = tapeteChip(6); if (!mesmoLugar) tapeteChip(pista.total); else if (tapete) tapete.sAlt = [pista.total];
    for (let km = 1; km * 1000 < pista.total - 300; km += 2) fotografo(km * 1000 + 18, Math.random() < 0.5 ? -1 : 1);
    { const sa = pista.total * 0.5, du = duplaEm(duplas, sa); ambulancia(sa, du ? -du.lado : (Math.random() < 0.5 ? -1 : 1)); }
    for (const p of postosDaProva(prova.rotulo)) postoHidratacao(p.s, p.lado);
    desenharMapaBase();
    carregarOSM(escolha.distancia, pista);
  }
  $('#mapa').hidden = !prova;
}

function reiniciar() {
  prepararPercurso(ultimaEscolha);
  const p = emEst(0);
  Object.assign(estado, {
    t: 0, tempoReal: 0, x: p.x, z: p.z, ang: p.ang, camAng: p.ang, s: 0, sMax: 0, d: 0, v: 0, y: 0, vy: 0,
    agachado: 0, geis: 0, geisComprados: 0, gelAtivo: 0, giroPend: 0, parado: 0, voltar: false, fase: 0, agua: 100, pontos: 0,
    energia: 100, energiaAvisada: false, passoIdx: 0, tropecos: 0, coposPegos: 0, paceBase: paceDoPerfil(),
    fatorTenis: 1, gelMax: R.GEL_MAX, relogio: false, isotonicos: 0, saltoAnim: 0, saltandoCarro: false, freio: 0,
    penal: 0, proximoSpawn: 70, proximoPosto: 1000, proximoKm: 1000, proximaTravessa: 140, tremor: 0, kmAvisado: 0
  });
  fundo.position.z = 0;
  controles.reset();
}

// ─── SOM (BIPES DA LARGADA) ───────────────────────────────────────────────────

let audio = null;
function bip(freq, dur, volume = 0.18) {
  if (!musica.ligada) return;
  try {
    audio = audio || new (window.AudioContext || window.webkitAudioContext)();
    if (audio.state === 'suspended') audio.resume();
    const o = audio.createOscillator(), g = audio.createGain();
    o.type = 'square'; o.frequency.value = freq;
    g.gain.setValueAtTime(volume, audio.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + dur);
    o.connect(g).connect(audio.destination);
    o.start(); o.stop(audio.currentTime + dur);
  } catch { /* sem áudio */ }
}

// ─── HUD, MINIMAPA E TELAS ────────────────────────────────────────────────────

const hud = {
  km: $('#hudKm'), kmTotal: $('#hudKmTotal'), tempo: $('#hudTempo'), pace: $('#hudPace'),
  agua: $('#hudAgua'), aguaTxt: $('#hudAguaTxt'), aguaBox: $('#hudAguaBox'),
  relogio: $('#hudRelogio'), relogioTxt: $('#hudRelogioTxt'),
  energia: $('#hudEnergia'), energiaTxt: $('#hudEnergiaTxt'), energiaBox: $('#hudEnergiaBox'), pontos: $('#hudPontos'),
  inc: $('#hudInc'), incTxt: $('#hudIncTxt'), penal: $('#hudPenalTxt'),
  gel: $('#btnGel'), gelQtd: $('#gelQtd'), gota: $('#btnAgua'), dica: $('#dicaGestos'), contagem: $('#contagem')
};

// ─── MINIMAPA DE NAVEGAÇÃO ─────────────────────────────────────────────────────
// Só a vizinhança do corredor, com a rota real (pista.em): frente da corrida para cima, corredor um pouco abaixo do
// centro, zoom pelo formato dos próximos 320 m (perto nas curvas, longe nas retas), trecho percorrido em amarelo,
// postos de água e chegada quando entram na área. Só visual: não mexe em posição, GPS ou distância.
function desenharMapaBase() { radar.esc = null; }
const radar = { esc: null };
function desenharMinimapa() {
  if (!prova) return;
  const cv = $('#minimapa'), g = cv.getContext('2d'), W = cv.width, C = W / 2, R = C - 6, CY = C + 36;
  const total = pista.total, s = Math.min(Math.max(estado.s, 0), total);
  const p = emEst(s), f = emEst(s + 12), b = emEst(s - 12);
  const dir = Math.atan2(f.x - b.x, f.z - b.z), cs = Math.cos(dir), sn = Math.sin(dir);
  // frente da corrida para cima; a direita do corredor no 3D (vetor (-fz, fx) no plano x,z) fica à direita no mapa
  const loc = (q) => { const dx = q.x - p.x, dz = q.z - p.z; return [dz * sn - dx * cs, -(dx * sn + dz * cs)]; };
  let alcance = 60;
  for (let d = 20; d <= 320 && s + d <= total + 30; d += 20) { const [x, y] = loc(emEst(s + d)); alcance = Math.max(alcance, Math.hypot(x, y)); }
  const alvo = Math.min(Math.max(118 / alcance, 0.18), 0.9); // px por metro
  radar.esc = radar.esc == null ? alvo : radar.esc + (alvo - radar.esc) * 0.06;
  const k = radar.esc;
  const tela = (q) => { const [x, y] = loc(q); return [C + x * k, CY + y * k]; };
  g.clearRect(0, 0, W, W);
  g.save(); g.beginPath(); g.arc(C, C, R, 0, Math.PI * 2); g.clip();
  const fundo = g.createRadialGradient(C, CY, 10, C, C, R); fundo.addColorStop(0, '#16408f'); fundo.addColorStop(1, '#0a1f5e');
  g.fillStyle = fundo; g.fillRect(0, 0, W, W);
  // grade que corre junto (dá noção de movimento e escala)
  g.strokeStyle = 'rgba(255,255,255,0.06)'; g.lineWidth = 2;
  const pg = 40 * k, off = (s * k) % pg;
  for (let y = off - pg * 3; y < W + pg; y += pg) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
  for (let x = C % pg; x < W; x += pg) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, W); g.stroke(); }
  const linha = (a, z) => { g.beginPath(); let i = 0; for (let d = a; d <= z; d += 6, i++) { const [x, y] = tela(emEst(d)); i ? g.lineTo(x, y) : g.moveTo(x, y); } };
  g.lineJoin = g.lineCap = 'round';
  linha(Math.max(0, s - 150), s); g.strokeStyle = 'rgba(255,210,31,0.95)'; g.lineWidth = 10; g.stroke();
  const fim = Math.min(total, s + 900);
  if (fim > s) {
    linha(s, fim); g.strokeStyle = 'rgba(79,180,255,0.45)'; g.lineWidth = 22; g.stroke();
    linha(s, fim); g.strokeStyle = '#ffffff'; g.lineWidth = 10; g.stroke();
  }
  for (let d = Math.ceil(s / 100) * 100; d < fim; d += 100) { const [x, y] = tela(emEst(d)); g.beginPath(); g.arc(x, y, 3.2, 0, Math.PI * 2); g.fillStyle = '#1e6bff'; g.fill(); }
  for (const q of postos) if (q.s > s && q.s < fim) { const [x, y] = tela(emEst(q.s)); g.beginPath(); g.arc(x, y, 7, 0, Math.PI * 2); g.fillStyle = '#4fc3ff'; g.fill(); g.lineWidth = 3; g.strokeStyle = '#061440'; g.stroke(); }
  if (total - s < 900) {
    const [x, y] = tela(emEst(total));
    g.fillStyle = '#fff'; g.fillRect(x - 13, y - 13, 26, 26); g.fillStyle = '#061440';
    for (let a = 0; a < 4; a++) for (let c = 0; c < 4; c++) if ((a + c) % 2 === 0) g.fillRect(x - 13 + a * 6.5, y - 13 + c * 6.5, 6.5, 6.5);
    g.strokeStyle = '#061440'; g.lineWidth = 3; g.strokeRect(x - 13, y - 13, 26, 26);
  }
  g.restore();
  g.save(); g.translate(C, CY);
  g.beginPath(); g.moveTo(0, -16); g.lineTo(12, 12); g.lineTo(0, 6); g.lineTo(-12, 12); g.closePath();
  g.fillStyle = '#ff3b30'; g.fill(); g.lineWidth = 4; g.strokeStyle = '#fff'; g.stroke();
  g.restore();
  g.beginPath(); g.arc(C, C, R, 0, Math.PI * 2); g.lineWidth = 4; g.strokeStyle = 'rgba(255,255,255,0.35)'; g.stroke();
  const falta = Math.max(0, total - s), rot = $('#hudFaltam');
  const txt = falta < 1000 ? `chegada ${Math.round(falta / 10) * 10} m` : `faltam ${(falta / 1000).toFixed(1).replace('.', ',')} km`;
  if (rot.textContent !== txt) rot.textContent = txt;
}

let hudTimer = 0;
// cartão do jogador no HUD: foto da conta (ou o personagem), primeiro nome, nível e barra de XP
// engrenagem do HUD: abre e fecha o som e a câmera (fecha sozinha depois de alguns segundos)
{
  const menu = $('#menuConfig'), btn = $('#btnConfig');
  let timer = 0;
  const fechar = () => { menu.hidden = true; btn.setAttribute('aria-expanded', 'false'); };
  btn.addEventListener('pointerdown', (e) => {
    e.stopPropagation(); e.preventDefault();
    menu.hidden = !menu.hidden; btn.setAttribute('aria-expanded', String(!menu.hidden));
    clearTimeout(timer); if (!menu.hidden) timer = setTimeout(fechar, 4000);
  });
}

function preencherJogadorHud() {
  const d = usuario ? Conta.dadosDoUsuario(usuario) : null, st = P.situacao(formaAtual().xp);
  // foto da conta Google; sem foto (ou se não carregar), o boneco desenhado no estilo dos ícones do jogo
  const av = $('#hudAvatar'), boneco = '<svg class="pessoa"><use href="#i-pessoa"/></svg>';
  av.innerHTML = boneco;
  if (d?.foto) {
    const img = document.createElement('img');
    img.src = d.foto; img.alt = ''; img.referrerPolicy = 'no-referrer';
    img.onerror = () => { av.innerHTML = boneco; };
    av.replaceChildren(img);
  }
  $('#hudNome').textContent = d ? d.nome.split(' ')[0] : 'Você';
  $('#hudJogador')?.classList.remove('subiu');
  xpHud.base = formaAtual().xp; xpHud.degrau = st.indice; xpHud.ganho = -1;
  atualizarXpHud(0);
}

// XP no HUD: a barra amarela é o que já tinha, a verde cresce com o que a corrida está rendendo (km corridos);
// os bônus de prova, clima e missões entram no fim
const xpHud = { base: 0, degrau: 0, ganho: -1 };
function atualizarXpHud(metros) {
  const ganho = Math.round((Math.max(0, metros) / 1000) * P.XP_POR_KM);
  if (ganho === xpHud.ganho) return;
  xpHud.ganho = ganho;
  const inicio = P.situacao(xpHud.base), agora = P.situacao(xpHud.base + ganho);
  $('#hudNivel').textContent = agora.rotulo;
  // depois de subir de nível na corrida, o que tinha antes ficou no nível anterior: a barra é toda verde
  $('#hudXp').style.width = agora.indice === inicio.indice ? `${Math.round(inicio.progresso * 100)}%` : '0%';
  $('#hudXpCorrida').style.width = `${Math.round(agora.progresso * 100)}%`;
  $('#hudXpGanho').textContent = `+${ganho} XP`;
  $('#hudXpTxt').textContent = agora.completo ? 'nível máximo' : `${agora.xpNoDegrau} / ${agora.xpDoDegrau} XP`;
  if (agora.indice > xpHud.degrau) { xpHud.degrau = agora.indice; $('#hudJogador').classList.add('subiu'); aviso(`🎉 Subiu para ${agora.rotulo}!`, 'km', 2200); }
}

// +pontos: só quando o ganho é de uma vez (ultrapassagem, água, carro, item); a soma contínua da distância não pisca
const pontosHud = { ultimo: 0, timer: 0 }, penalHud = { n: 0, ate: 0 };
function mostrarGanhoPontos(pontos) {
  const ganho = Math.floor(pontos) - pontosHud.ultimo;
  pontosHud.ultimo = Math.floor(pontos);
  if (ganho < 4 || ganho > 5000) return; // 5000+: recomeço de corrida
  const el = $('#hudPontosGanho');
  el.textContent = `+${ganho}`;
  el.hidden = false;
  el.classList.remove('sobe'); void el.offsetWidth; el.classList.add('sobe');
  clearTimeout(pontosHud.timer);
  pontosHud.timer = setTimeout(() => { el.hidden = true; }, 900);
}

function atualizarHud() {
  {
    const el = $('#hudFantasma'), on = estado.desafioAtivo && (estado.modo === 'jogando' || estado.modo === 'fim');
    el.hidden = !on;
    if (on) $('#hudFantasmaTxt').textContent = FT.textoDiferenca(desafio.nome, FT.diferenca(desafio, estado.s, estado.tempoReal));
  }
  {
    const p = estado.posicao, el = $('#hudPos');
    el.hidden = !p;
    if (p) $('#hudPosTxt').textContent = `${p.posicao}º`;
  }
  // clima: temperatura e de onde vem o vento em relação ao corredor
  const clima = estado.clima;
  const ventoContra = clima && clima.vento >= 3 ? CL.ventoRelativo(clima, estado.ang) : 0;
  // clima num selo pequeno junto do mapa: ícone, temperatura e, com vento contra, uma seta de vento laranja
  $('#hudClima').hidden = !clima;
  if (clima) {
    $('#hudClimaIco').setAttribute('href', `#c-${{ sol: 'sol', nublado: 'nuvem', calor: 'calor', abafado: 'abafado', chuva: 'chuva', vento: 'vento', frio: 'frio' }[clima.id] || 'sol'}`);
    $('#hudClimaTxt').textContent = `${clima.temp}°`;
    $('#hudVentoContra').hidden = !(ventoContra > 0.5);
  }
  const s = estado;
  // até 1 km em metros (670 m), depois em km (1,34 km); o total da prova vem pequeno ao lado
  const feito = prova ? Math.min(s.sMax, pista.total) : s.sMax;
  hud.km.textContent = feito < 1000 ? `${Math.floor(feito)} m` : `${R.formatarKm(feito)} km`;
  hud.kmTotal.textContent = prova ? `/${R.formatarKm(pista.total)} km` : '';
  atualizarXpHud(feito);
  hud.tempo.textContent = R.formatarTempo(s.tempoReal);
  hud.pace.textContent = R.formatarPace(s.v);
  const inc = emEst(s.s).inclinacao;
  // anéis: o traço vai de 0 a 100 (pathLength) e esvazia conforme o consumo
  hud.agua.style.strokeDashoffset = `${100 - Math.max(0, Math.min(100, s.agua))}`;
  hud.aguaTxt.textContent = `${Math.round(s.agua)}%`;
  hud.aguaBox.classList.toggle('baixa', s.agua < 25);
  hud.aguaBox.classList.toggle('medio', s.agua >= 25 && s.agua < 50);
  hud.energia.style.strokeDashoffset = `${100 - Math.max(0, Math.min(100, s.energia))}`;
  hud.energiaTxt.textContent = `${Math.round(s.energia)}%`;
  hud.energiaBox.classList.toggle('baixa', s.energia < R.ENERGIA_BAIXA);
  hud.energiaBox.classList.toggle('medio', s.energia >= R.ENERGIA_BAIXA && s.energia < 55);
  // relógio GPS: distância até o próximo posto de água
  const proxPosto = s.relogio && prova ? postos.find((q) => q.s > s.s + 1) : null;
  if (proxPosto) hud.relogioTxt.textContent = `Água em ${Math.round((proxPosto.s - s.s) / 10) * 10} m`;
  hud.pontos.textContent = Math.floor(s.pontos).toLocaleString('pt-BR');
  mostrarGanhoPontos(s.pontos);
  const pct = Math.round(inc * 100);
  hud.inc.classList.toggle('sobe', pct >= 1);
  hud.inc.classList.toggle('desce', pct <= -1);
  hud.incTxt.textContent = pct >= 1 ? `Subida ${pct}%` : pct <= -1 ? `Descida ${-pct}%` : '';
  // penalidade: alerta vermelho só nos 4 s depois de levar (o aviso grande "Saiu do percurso!" continua)
  hud.penal.textContent = `${s.penal}/${R.PENALIDADES_MAX}`;
  if (s.penal > penalHud.n) penalHud.ate = performance.now() + 4000;
  penalHud.n = s.penal;
  $('#hudPenal').hidden = !(s.penal > 0 && performance.now() < penalHud.ate);
  // um aviso do momento por vez, por prioridade: posto de água perto, subida/descida forte, vento contra,
  // clima nos primeiros segundos, próximo posto, relevo leve. O resto do tempo a tela fica livre.
  const avisos = [
    [hud.relogio, !!proxPosto && proxPosto.s - s.s < 400],
    [hud.inc, Math.abs(pct) >= 3],
    [hud.relogio, !!proxPosto],
    [hud.inc, Math.abs(pct) >= 1]
  ];
  const mostrado = avisos.find(([, on]) => on)?.[0];
  for (const el of [hud.relogio, hud.inc]) el.hidden = el !== mostrado;
  hud.gelQtd.textContent = s.geis;
  $('#btnIso').hidden = !s.isotonicos;
  $('#isoQtd').textContent = s.isotonicos;
  hud.gel.disabled = !s.geis || s.gelAtivo > 0;
  hud.gel.style.setProperty('--gel', `${(s.gelAtivo / R.GEL_DURACAO) * 360}deg`);
  hud.dica.classList.toggle('some', s.t > 7);
}

// gota de água: aparece perto da mesa; anel vermelho piscando e verde na hora certa
function mesaDaVez() {
  let melhor = null;
  for (const e of entidades) {
    if (!e.mesa || e.tentada) continue;
    const dist = e.s - estado.s;
    if (dist > -R.janelaAgua(estado.paceBase) - 1 && dist < 50 && (!melhor || e.s < melhor.s)) melhor = e;
  }
  return melhor;
}

let gotaFeedback = 0;
function atualizarGota(dt) {
  const g = hud.gota;
  if (gotaFeedback > 0) { gotaFeedback -= dt; if (gotaFeedback > 0) return; g.className = 'botao-jogo gota'; }
  const m = estado.modo === 'jogando' ? mesaDaVez() : null;
  if (!m) { g.hidden = true; return; }
  const dist = m.s - estado.s;
  g.hidden = false;
  g.classList.toggle('esq', m.lado < 0);
  g.classList.toggle('dir', m.lado > 0);
  g.classList.toggle('verde', Math.abs(dist) <= R.janelaAgua(estado.paceBase));
  g.style.setProperty('--pisca', `${Math.max(0.12, Math.min(0.6, dist / 70))}s`);
}

let avisoTimer;
function aviso(txt, classe = '', ms = 1500) {
  const el = $('#aviso');
  el.hidden = true; void el.offsetWidth;
  el.className = classe; el.textContent = txt; el.hidden = false;
  // fora da corrida (telas por cima do jogo) o aviso sobe para o topo
  if (document.querySelector('.tela:not([hidden])')) el.classList.add('sobre-tela');
  else if (estado.modo === 'jogando' || estado.modo === 'contagem') el.classList.add('na-corrida');
  el.style.animationDuration = `${Math.max(1500, ms)}ms`;
  clearTimeout(avisoTimer);
  avisoTimer = setTimeout(() => { el.hidden = true; }, ms);
}

function mostrar(tela) {
  if (tela !== 'telaLoja' && tela !== 'telaInicio') vitrine?.desligar();
  for (const id of ['telaInicio', 'telaPausa', 'telaFim', 'telaTreino', 'telaLoja', 'telaClima', 'telaRanking']) $('#' + id).hidden = id !== tela;
  $('#hud').hidden = ['telaInicio', 'telaFim', 'telaTreino', 'telaLoja', 'telaClima', 'telaRanking'].includes(tela);
  $('#controles').hidden = tela !== null;
}

// ─── MÚSICA DE FUNDO (as mesmas faixas do simulador de percurso do Portal) ───
const som = criarSom();
const MUSICAS = (() => { const a = ['musica-2', 'musica-3', 'musica-4']; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; })();
const musica = { el: null, faixa: 0, ligada: (() => { try { return localStorage.getItem('mapmove-musica') !== '0'; } catch { return true; } })() };
som.ligar(musica.ligada);
function iconeSom() { $('#btnMusica use').setAttribute('href', musica.ligada ? '#i-som' : '#i-mudo'); }
function tocarMusica(tocar) {
  if (!musica.el) {
    const a = new Audio(); a.preload = 'none'; a.setAttribute('playsinline', ''); a.volume = 0.4;
    a.src = `/som/${MUSICAS[0]}.mp3`;
    a.addEventListener('ended', () => { musica.faixa = (musica.faixa + 1) % MUSICAS.length; a.src = `/som/${MUSICAS[musica.faixa]}.mp3`; a.play().catch(() => {}); });
    musica.el = a;
  }
  if (tocar && musica.ligada) musica.el.play().catch(() => {}); else musica.el.pause();
}
function alternarMusica() {
  musica.ligada = !musica.ligada;
  try { localStorage.setItem('mapmove-musica', musica.ligada ? '1' : '0'); } catch { /* sem storage */ }
  iconeSom();
  som.ligar(musica.ligada);
  tocarMusica(musica.ligada && estado.modo !== 'pausa');
}

// efeitos do que está vestido e consumíveis da mochila, aplicados na largada
function aplicarEquipamento() {
  const ef = L.efeitos(perfil);
  const r = L.usarConsumiveis(perfil, { gelMax: R.GEL_MAX + ef.gelMax });
  perfil = r.perfil; salvarPerfil();
  // geis = total no bolso; geisComprados = quantos deles vieram da mochila (os demais são da pista e somem no fim)
  Object.assign(estado, { fatorTenis: ef.velocidade, gelMax: R.GEL_MAX + ef.gelMax, relogio: ef.distanciaAgua, geis: r.geis, geisComprados: r.geis, isotonicos: r.isotonicos });
  const extras = [r.geis ? `⚡ ${r.geis} ${r.geis > 1 ? 'géis' : 'gel'} no bolso` : '', r.isotonicos ? `🥤 ${r.isotonicos} ${r.isotonicos > 1 ? 'isotônicos' : 'isotônico'}` : '', ef.velocidade > 1 ? '👟 placa de carbono +3%' : ''].filter(Boolean);
  if (extras.length) setTimeout(() => aviso(extras.join(' · '), 'km', 2200), 5300);
}

// previsão do tempo antes da largada: sorteia o clima, mostra os efeitos e os cuidados, e o céu já muda atrás
let climaDaLargada = null, escolhaDaLargada = null;
// tela de clima: frase curta de cada condição e os 4 indicadores (valores lidos das mesmas funções que a corrida
// usa; nada aqui muda cálculo). Tons: ruim (vermelho), medio (laranja), bom (verde).
const DESCRICAO_CLIMA = {
  sol: 'Céu aberto e sol suave', calor: 'Sol forte e pouco vento', abafado: 'Calor com ar úmido', nublado: 'Céu encoberto e temperatura amena',
  chuva: 'Pista molhada e vento moderado', vento: 'Rajadas fortes no percurso', frio: 'Ar gelado e céu claro'
};
function indicadoresClima(c) {
  const pct = (f) => Math.round(Math.abs(f - 1) * 100);
  const sede = CL.fatorSede(c), energia = CL.fatorEnergiaClima(c);
  const hid = sede >= 1.15 ? ['i-gota', 'Hidratação', `+${pct(sede)}%`, 'água acaba mais rápido', sede >= 1.25 ? 'ruim' : 'medio']
    : sede <= 0.95 ? ['i-gota', 'Hidratação', `−${pct(sede)}%`, 'a água dura mais', 'bom']
    : ['i-gota', 'Hidratação', 'Normal', 'quase sem efeito', 'bom'];
  const ene = energia > 1 ? ['i-raio', 'Energia', `+${pct(energia)}%`, 'o calor cansa mais', energia >= 1.3 ? 'ruim' : 'medio'] : ['i-raio', 'Energia', 'Normal', 'sem gasto extra', 'bom'];
  const ven = c.vento >= 3 ? ['i-vento', 'Vento', `${c.vento} m/s`, `contra: até ${Math.round(c.vento * 1.1)}% mais lento`, c.vento >= 6 ? 'ruim' : 'medio'] : ['i-vento', 'Vento', 'Fraco', 'sem efeito no ritmo', 'bom'];
  const pis = c.chuva ? ['i-pista-molhada', 'Pista', 'Molhada', 'curvas e pulo menores', 'ruim'] : ['i-pista', 'Pista', 'Seca', 'aderência normal', 'bom'];
  return [hid, ene, ven, pis];
}
function abrirClima(escolha) {
  escolhaDaLargada = escolha;
  climaDaLargada = CL.sortearClima();
  aplicarClima(climaDaLargada);
  const c = climaDaLargada, x = CL.explicarClima(c, perfil.consumiveis || {});
  const alvo = escolha || ultimaEscolha;
  const ehProva = alvo?.tipo === 'prova' && alvo.distancia;
  $('#climaTitulo').textContent = ehProva ? (PROVAS.find((p) => p.slug === PROVA_SLUG)?.curto || dadosProva?.nome || 'Prova') : 'Treino de reta';
  $('#climaProva').textContent = ehProva ? `Previsão para a largada · ${alvo.distancia.rotulo}` : 'Previsão para o treino';
  $('#climaCeu').innerHTML = CEUS[c.id] || CEUS.sol;
  $('#climaNome').textContent = c.nome;
  $('#climaDesc').textContent = DESCRICAO_CLIMA[c.id] || '';
  $('#climaTemp').textContent = c.temp;
  $('#climaUmid').textContent = `${c.umidade}% umidade`;
  $('#climaVento').textContent = `${c.vento} m/s`;
  $('#climaXp').textContent = x.bonus ? `+${Math.round(x.bonus * 100)}% XP` : 'Bom p/ recorde';
  $('#climaIndicadores').innerHTML = indicadoresClima(c).map(([ico, rot, valor, sub, tom]) =>
    `<div class="clima-ind ${tom}"><span class="ic"><svg><use href="#${ico}"/></svg></span><span class="tx"><span class="lab">${rot}</span><b>${valor}</b><small>${sub}</small></span></div>`).join('');
  $('#climaCuidados').innerHTML = x.cuidados.map((t, i) => `<li><span class="n">${i + 1}</span><span>${t}</span></li>`).join('');
  mostrar('telaClima');
}
$('#btnLargar').addEventListener('click', () => iniciar(escolhaDaLargada, climaDaLargada));
$('#btnClimaVoltar').addEventListener('click', () => {
  // voltou da previsão no meio da corrida (pausa): o céu volta a ser o da corrida em andamento
  if (estado.modo === 'pausa') { aplicarClima(estado.clima); mostrar('telaPausa'); } else mostrarInicio();
});

function iniciar(escolha, clima) {
  som.iniciar();
  som.pararLoops();
  som.pausar(false);
  tocarMusica(true);
  if (escolha) ultimaEscolha = escolha;
  reiniciar();
  preencherJogadorHud();
  estado.clima = clima || CL.sortearClima();
  aplicarClima(estado.clima);
  prepararPelotao();
  // carro desgovernado em ~1 a cada 3 provas, entre 30% e 70% do percurso
  festa = null;
  // só nas provas de Sorocaba, e em todas elas: num ponto sorteado, na contramão ou furando uma travessa
  estado.festaEm = prova && PROVA_SLUG === PROVA_DO_CARRO ? proximoCarroKm(0, true) : 0;
  // grava o ritmo da prova (posição a cada 10 s de prova) para virar fantasma num desafio
  estado.gravacao = prova ? { passo: 10, amostras: [0], prox: 10 } : null;
  // desafio fantasma só no mesmo percurso em que foi gravado (os fantasmas são do percurso de sempre)
  estado.desafioAtivo = !!(desafio && prova && !prova.ajustado && desafio.prova === PROVA_SLUG && desafio.rotulo === prova.rotulo);
  if (desafio && prova && prova.ajustado && desafio.prova === PROVA_SLUG && desafio.rotulo === prova.rotulo)
    setTimeout(() => aviso('👻 Desafio desligado no percurso ajustado (teste): o fantasma é do percurso de sempre', 'alerta', 3200), 5200);
  if (estado.desafioAtivo) setTimeout(() => aviso(`👻 Desafio: ${desafio.nome} fez ${R.formatarTempo(desafio.tempo)}. Bata o fantasma!`, 'km', 3000), 5200);
  aplicarEquipamento();
  atualizarHud();
  estado.modo = 'contagem';
  estado.chegada = CHEGADA.tempo;
  { const p = emEst(-CHEGADA.metros); Object.assign(estado, { x: p.x, z: p.z, ang: p.ang, camAng: p.ang }); }
  estado.contagem = 3.999;
  estado.ultimoNumero = 4;
  mostrar(null);
  atualizarHud();
  aviso(prova ? `${prova.rotulo} · ${prova.nome}` : 'Treino de reta', 'km', 2400);
  const bonus = CL.bonusClima(estado.clima);
  setTimeout(() => aviso(`${CL.resumoClima(estado.clima)}${bonus ? ` · +${Math.round(bonus * 100)}% XP` : ''}`, 'km', 2600), 2500);
}

// antes da largada: o corredor chega caminhando até a linha, aquece no 3-2-1 e sai correndo no VAI!
const CHEGADA = { tempo: 1.6, metros: 6 };
function passoContagem(dt) {
  const s = estado;
  if (s.chegada > 0) {
    s.chegada = Math.max(0, s.chegada - dt);
    const p = emEst(-CHEGADA.metros * (s.chegada / CHEGADA.tempo));
    Object.assign(s, { x: p.x, z: p.z, ang: p.ang, s: 0, d: 0 });
    return;
  }
  s.contagem -= dt;
  const n = Math.ceil(s.contagem);
  if (n !== s.ultimoNumero) {
    s.ultimoNumero = n;
    if (n > 0) { hud.contagem.textContent = n; hud.contagem.className = ''; bip(520, 0.18); }
    else {
      hud.contagem.textContent = 'VAI!'; hud.contagem.className = 'vai'; som.largada();
      setTimeout(() => { hud.contagem.hidden = true; }, 700);
      s.modo = 'jogando';
    }
    hud.contagem.hidden = false;
  }
}

function pausar() {
  if (estado.modo !== 'jogando') return;
  estado.modo = 'pausa';
  tocarMusica(false);
  som.pausar(true);
  mostrar('telaPausa');
}

function continuar() {
  if (estado.modo !== 'pausa') return;
  estado.modo = 'jogando';
  tocarMusica(true);
  som.pausar(false);
  mostrar(null);
}

function lerRecorde(chave) { try { return JSON.parse(localStorage.getItem(chave) || 'null'); } catch { return null; } }
function salvarRecorde(chave, v) { try { localStorage.setItem(chave, JSON.stringify(v)); } catch { /* sem storage */ } }

// torcida de fundo: cheia na largada e na chegada, maior na cidade que no parque
function nivelTorcida(sAtual) {
  if (!Number.isFinite(pista.total)) return 0.45;
  if (sAtual < 200 || sAtual > pista.total - 300) return 1;
  const z = zonas ? zonaEm(zonas, sAtual, 1) : 'cidade';
  return z === 'cidade' ? 0.55 : z === 'parque' ? 0.3 : 0.2;
}

let ultimoResultado = null;

// ─── DESAFIO COM FANTASMA ─────────────────────────────────────────────────────
let desafio = null; // { id, nome, prova, rotulo, tempo, passo, amostras }
{
  const id = new URLSearchParams(location.search).get('desafio');
  if (id) {
    history.replaceState(null, '', location.pathname);
    Conta.lerFantasma(id).then((f) => {
      if (!f) { aviso('Desafio não encontrado', 'alerta', 2200); return; }
      desafio = { id, nome: f.nome, prova: f.prova, rotulo: f.rotulo, tempo: f.tempo_s, passo: f.passo_s, amostras: f.amostras };
      abrirDesafioQuandoPronto();
    }).catch(() => aviso('Não deu para abrir o desafio', 'alerta', 2200));
  }
}
function abrirDesafioQuandoPronto() {
  if (!desafio) return;
  if (desafio.prova !== PROVA_SLUG) {
    if (!PROVAS.some((p) => p.slug === desafio.prova)) { aviso('Esse desafio é de uma prova que não está no jogo', 'alerta', 2400); desafio = null; return; }
    PROVA_SLUG = desafio.prova; dadosProva = null; carregarProva();
  }
  const d = dadosProva?.distancias?.find((x) => x.rotulo === desafio.rotulo);
  if (!d) { setTimeout(abrirDesafioQuandoPronto, 600); return; }
  aviso(`👻 ${desafio.nome} te desafiou no ${desafio.rotulo}: ${R.formatarTempo(desafio.tempo)}`, 'km', 3200);
  abrirClima({ tipo: 'prova', distancia: d });
}
// boneco do fantasma: um corredor do pelotão, translúcido e azulado
let fantasma3d = null;
function desenharFantasma(dt) {
  const s = estado;
  const ativo = s.desafioAtivo && (s.modo === 'jogando' || s.modo === 'contagem');
  if (!ativo) { if (fantasma3d) fantasma3d.holder.visible = false; return; }
  if (!fantasma3d && npcModelos.length) {
    fantasma3d = criarNpc(1);
    fantasma3d.holder.traverse((o) => {
      if (!o.isMesh) return;
      o.material = new THREE.MeshStandardMaterial({ color: 0x9fc4ff, emissive: 0x3a5cff, emissiveIntensity: 0.5, transparent: true, opacity: 0.45, depthWrite: false });
      o.castShadow = false;
    });
  }
  if (!fantasma3d) return;
  const sf = s.modo === 'jogando' ? FT.posicaoFantasma(desafio, s.tempoReal) : 0;
  const e = emEst(sf), [rx, rz] = direita(e.ang);
  fantasma3d.holder.position.set(e.x + rx * 1.4, e.y, e.z + rz * 1.4);
  fantasma3d.holder.rotation.y = -e.ang;
  fantasma3d.holder.visible = true;
  const correndo = s.modo === 'jogando' && sf < (Number.isFinite(pista.total) ? pista.total : Infinity);
  fantasma3d.mixer.update(correndo ? dt * 1.1 : 0);
}
$('#btnDesafiar').addEventListener('click', async () => {
  const s = estado;
  if (!usuario) { aviso('Entre com o Google (tela inicial) para desafiar seus amigos', 'alerta', 2600); return; }
  if (!s.gravacao || !prova || prova.ajustado) return; // percurso ajustado (teste) não grava fantasma
  const b = $('#btnDesafiar'); b.disabled = true;
  try {
    s.fantasmaSalvo ||= await Conta.salvarFantasma(usuario, { prova: PROVA_SLUG, rotulo: prova.rotulo, tempo: s.tempoReal, passo: s.gravacao.passo, amostras: s.gravacao.amostras });
    const link = Conta.linkDesafio(s.fantasmaSalvo);
    const texto = `👻 Te desafio no ${prova.rotulo} da ${prova.nome} no Mapmove Run! Fiz ${R.formatarTempo(s.tempoReal)}. Corre contra o meu fantasma: ${link}`;
    if (navigator.share) { try { await navigator.share({ text: texto }); } catch { /* cancelou */ } }
    else window.open(`https://wa.me/?text=${encodeURIComponent(texto)}`, '_blank');
  } catch (e) { aviso(`Não deu para criar o desafio: ${e.message}`, 'alerta', 2600); }
  b.disabled = false;
});
$('#btnCompartilhar').addEventListener('click', async () => {
  if (!ultimoResultado) return;
  const b = $('#btnCompartilhar'); b.disabled = true;
  try {
    const blob = await gerarCartao(ultimoResultado);
    const arq = new File([blob], 'mapmove-run.png', { type: 'image/png' });
    const texto = `${ultimoResultado.prova}: ${ultimoResultado.tempo} (${ultimoResultado.pace}) no Mapmove Run 🏃 Corre também: https://jogo.mapmove.com.br`;
    if (navigator.canShare?.({ files: [arq] })) await navigator.share({ files: [arq], text: texto });
    else {
      // sem compartilhar nativo: baixa a imagem e abre o WhatsApp com o texto
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'mapmove-run.png'; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      window.open(`https://wa.me/?text=${encodeURIComponent(texto)}`, '_blank');
    }
  } catch (e) { if (e?.name !== 'AbortError') aviso('Não deu para compartilhar agora', 'alerta', 2000); }
  b.disabled = false;
});

function terminar(titulo, concluiu = false) {
  if (concluiu) som.chegada(); else som.pararLoops();
  const s = estado;
  s.modo = 'fim';
  s.concluiu = concluiu;
  s.tremor = concluiu ? 0 : 0.4;
  hud.gota.hidden = true;
  const pontos = Math.floor(s.pontos);
  const dist = prova ? Math.min(s.sMax, pista.total) : s.sMax;
  const paceMedio = dist > 10 ? s.tempoReal / (dist / 1000) : 0;
  const cel = (rot, val) => `<div><small>${rot}</small><b>${val}</b></div>`;
  $('#fimMotivo').textContent = titulo;
  // colocação final (geral e na faixa etária virtual) e frase motivacional
  s.resultado = null;
  if (prova && concluiu && pelotao.length) {
    if (perfil.faixa == null) { perfil = { ...perfil, faixa: Math.floor(Math.random() * PL.FAIXAS) }; salvarPerfil(); }
    s.resultado = PL.resultadoFinal(pelotao, s.s, perfil.faixa);
    s.posicao = { posicao: s.resultado.geral, total: s.resultado.total };
  }
  const mot = $('#fimMotivacao');
  const linhasMot = s.resultado ? PL.mensagemFinal(s.resultado) : [];
  if (s.desafioAtivo) {
    const dif = s.tempoReal - desafio.tempo, seg = Math.round(Math.abs(dif));
    linhasMot.unshift(!concluiu ? `👻 ${desafio.nome} venceu desta vez. Tente de novo!`
      : dif < 0 ? `👻 Você venceu o desafio de ${desafio.nome} por ${R.formatarTempo(seg)}!` : `👻 ${desafio.nome} ainda está ${R.formatarTempo(seg)} na frente. Tente de novo!`);
  }
  mot.hidden = !linhasMot.length;
  mot.innerHTML = linhasMot.map((t) => `<span>${t}</span>`).join('');
  if (s.gravacao && concluiu) s.gravacao.amostras.push(pista.total);
  $('#btnDesafiar').hidden = !(prova && concluiu && s.gravacao) || !!prova?.ajustado; // modo de teste: sem desafio fantasma
  s.fantasmaSalvo = null;
  $('#fimPlacar').innerHTML = [
    cel('Distância', `${R.formatarKm(dist)} km`), cel('Tempo', R.formatarTempo(s.tempoReal)),
    cel('Pace médio', paceMedio ? R.formatarPace(1000 / paceMedio) : '--:--'),
    cel('Pontos', pontos.toLocaleString('pt-BR')), cel('Penalidades', `${s.penal}/${R.PENALIDADES_MAX}`),
    cel('Água', `${Math.round(s.agua)}%`),
    ...(s.posicao ? [cel('Colocação', `${s.posicao.posicao}º de ${s.posicao.total}`)] : [])
  ].join('');
  let rec = '';
  if (prova) {
    const chave = `mapmove-recorde-${PROVA_SLUG}-${prova.rotulo}${prova.ajustado ? '-ajustado' : ''}`;
    const anterior = lerRecorde(chave);
    if (concluiu && (!anterior || s.tempoReal < anterior)) { salvarRecorde(chave, s.tempoReal); rec = '🏅 Novo recorde neste percurso!'; }
    else if (anterior) rec = `Seu recorde no ${prova.rotulo}: ${R.formatarTempo(anterior)}`;
  } else {
    const anterior = lerRecorde('mapmove-recorde') || 0;
    if (pontos > anterior) { salvarRecorde('mapmove-recorde', pontos); rec = '🏅 Novo recorde de pontos!'; }
    else rec = `Recorde do treino: ${anterior.toLocaleString('pt-BR')} pontos`;
  }
  $('#fimRecorde').textContent = rec;
  // dados para o cartão de compartilhar
  ultimoResultado = {
    titulo: concluiu ? (prova ? `${prova.rotulo} concluído!` : 'Treino concluído!') : titulo.replace(/[^\p{L}\p{N} !.,º°-]/gu, '').trim(),
    prova: prova ? `${prova.nome} · ${prova.rotulo}` : 'Treino de reta',
    tempo: R.formatarTempo(s.tempoReal), pace: paceMedio ? R.formatarPace(1000 / paceMedio) + '/km' : '--:--',
    distancia: `${R.formatarKm(dist)} km`, pontos: pontos.toLocaleString('pt-BR'),
    colocacao: s.resultado?.geral || null, total: s.resultado?.total || null,
    medalha: s.resultado ? (s.resultado.geral <= 3 ? ['🥇', '🥈', '🥉'][s.resultado.geral - 1] : concluiu ? '🏅' : '') : (concluiu ? '🏅' : ''),
    frase: s.resultado ? PL.mensagemFinal(s.resultado)[0].replace(/^\S+\s/, '') : (concluiu ? 'Mais um treino na conta!' : ''),
    pista: Number.isFinite(pista.total) ? pista : null, sAte: dist
  };
  mostrarEvolucao(dist, concluiu);
  // corrida vale para o ranking de pontos (só com conta Google)
  if (usuario && pontos > 0 && dist > 50 && !prova?.ajustado) { // modo de teste do percurso ajustado fica fora do ranking
    Conta.registrarCorridaNuvem(usuario, { modo: prova ? prova.rotulo : 'treino', pontos, km: dist / 1000, tempo: s.tempoReal, concluiu })
      .catch((e) => console.warn('ranking', e));
  }
  setTimeout(() => { if (estado.modo === 'fim') mostrar('telaFim'); }, concluiu ? 300 : 800);
}

// ─── AÇÕES ────────────────────────────────────────────────────────────────────

function beber() {
  const s = estado;
  const m = mesaDaVez();
  if (!m || m.s - s.s > 50) return;
  const res = R.resultadoAgua(s.s, s.d, m, R.janelaAgua(s.paceBase));
  const g = hud.gota;
  if (res === 'longe') return aviso(`Encoste do lado ${m.lado > 0 ? 'direito' : 'esquerdo'}, perto da mesa!`, '', 1100);
  m.tentada = true;
  gotaFeedback = 0.6;
  if (res === 'pegou') {
    s.coposPegos++;
    s.agua = R.hidratar(s.agua);
    s.energia = R.reporEnergia(s.energia, R.ENERGIA_AGUA);
    s.pontos += 20;
    g.className = `botao-jogo gota pegou ${m.lado > 0 ? 'dir' : 'esq'}`;
    aviso(`💧 +${R.AGUA_GOLE} de água`);
  } else {
    g.className = `botao-jogo gota errou ${m.lado > 0 ? 'dir' : 'esq'}`;
    aviso(res === 'cedo' ? 'Cedo demais! ⏳' : 'Tarde demais! 💨', 'alerta', 1000);
  }
}

function usarGel() {
  const s = estado;
  if (!s.geis || s.gelAtivo > 0) return;
  // gasta primeiro o gel pego na pista (ele sumiria no fim); o comprado só sai da mochila quando é usado
  const daPista = s.geis - (s.geisComprados || 0);
  if (daPista <= 0 && s.geisComprados > 0) {
    const r = L.gastarGel(perfil);
    if (r.ok) { perfil = r.perfil; salvarPerfil(); }
    s.geisComprados--;
  }
  s.geis--;
  s.gelAtivo = R.GEL_DURACAO;
  s.energia = R.reporEnergia(s.energia, R.ENERGIA_GEL);
  s.energiaAvisada = false;
  aviso(`⚡ Gel! ${R.formatarPace(R.mps(R.paceDoGel(s.paceBase)))}/km por 15 s · 🔋 +${R.ENERGIA_GEL}`);
  atualizarHud();
}

function tomarIsotonico() {
  const s = estado;
  const r = L.tomarIsotonico(perfil);
  if (!r.ok) return;
  perfil = r.perfil; salvarPerfil(); // sai da mochila na hora (o que não tomar continua guardado)
  s.isotonicos = perfil.consumiveis.isotonico || 0;
  s.agua = R.hidratar(s.agua, R.ISOTONICO_AGUA);
  s.energia = R.reporEnergia(s.energia, R.ISOTONICO_ENERGIA);
  s.energiaAvisada = false;
  aviso(`🥤 Isotônico! 💧 +${R.ISOTONICO_AGUA}% · 🔋 +${R.ISOTONICO_ENERGIA}%`);
  atualizarHud();
}

const CAMERAS = { normal: { tras: 7.6, alto: 4.3, olhar: 9 }, longe: { tras: 12, alto: 7.2, olhar: 15 } };
let modoCamera = lerRecorde('mapmove-camera') === 'longe' ? 'longe' : 'normal';
function trocarCamera() {
  modoCamera = modoCamera === 'normal' ? 'longe' : 'normal';
  salvarRecorde('mapmove-camera', modoCamera);
  aviso(modoCamera === 'longe' ? '🎥 Câmera afastada' : '🎥 Câmera normal', '', 900);
}

function acao(tipo) {
  const s = estado;
  if (tipo === 'pausa') return s.modo === 'pausa' ? continuar() : pausar();
  if (tipo === 'camera') return trocarCamera();
  if (s.modo !== 'jogando' || s.parado > 0) return;
  if (tipo === 'pular' && s.y > 0) s.puloPend = R.PULO_ANTECIPADO; // ainda no ar: pula assim que pousar
  else if (tipo === 'pular' && s.y === 0) {
    s.puloPend = 0;
    // carro da travessa logo à frente: salto alto com rolamento
    const carros = entidades.filter((e) => e.tipo === 'carro' && !e.atingido);
    const pulo = CL.fatorPulo(estado.clima || CL.CLIMAS[0]); // na chuva o pulo sai mais curto
    if (R.carroParaSaltar(s.s, carros)) { s.vy = R.SALTO_CARRO.velocidade * pulo; s.saltoAnim = SALTO_ANIM.duracao; s.saltandoCarro = true; }
    else s.vy = R.PULO.velocidade * pulo;
    s.agachado = 0;
  }
  else if (tipo === 'abaixar') {
    // deslizar para baixo: tira o pé por alguns segundos (mais lento, poupa energia)
    if (!(s.freio > 0)) aviso('🐢 Ritmo mais leve', '', 900);
    s.freio = R.FREIO.duracao;
  }
  else if (tipo === 'agua') beber();
  else if (tipo === 'gel') usarGel();
  else if (tipo === 'iso') tomarIsotonico();
}

const controles = criarControles({ area: palco, onAcao: acao });
for (const [id, tipo] of [['#btnGel', 'gel'], ['#btnIso', 'iso'], ['#btnAgua', 'agua'], ['#btnCamera', 'camera'], ['#btnPular', 'pular']]) {
  $(id).addEventListener('pointerdown', (e) => { e.stopPropagation(); e.preventDefault(); acao(tipo); });
}

function penalizar() {
  const s = estado;
  s.penal++;
  if (s.penal >= R.PENALIDADES_MAX) return terminar('Desclassificado! 🚩');
  s.parado = 1.4; s.voltar = true; s.v = 0;
  aviso(`⚠️ Saiu do percurso! Penalidade ${s.penal}/${R.PENALIDADES_MAX}`, 'alerta', 1800);
}

// ─── LOOP ─────────────────────────────────────────────────────────────────────

const GIRO_RAD_S = 1.8;
const GIRO_POR_TOQUE = 0.22;

function passo(dt) {
  const s = estado;
  s.t += dt;
  s.tempoReal += dt * R.ESCALA_TEMPO;
  const cl = s.clima || CL.CLIMAS[0];
  s.agua = R.desidratar(s.agua, dt * CL.fatorSede(cl)); // calor e umidade secam mais rápido
  // sem água o corredor vai perdendo força (não cai de uma vez); água ou isotônico a tempo e ele volta a correr
  s.semAgua = s.agua <= 0 ? (s.semAgua || 0) + dt : 0;
  if (s.agua < R.AGUA_BAIXA && s.agua > 0 && !s.aguaAvisada) {
    s.aguaAvisada = true;
    const prox = postos.find((p) => p.s > s.s);
    aviso(`💧 Água acabando!${prox ? ` Próximo posto em ${Math.round((prox.s - s.s) / 10) * 10} m` : ''}`, 'alerta', 2200);
  }
  if (s.agua >= R.AGUA_BAIXA) s.aguaAvisada = false;
  if (s.semAgua > 0 && !s.desidratadoAvisado) {
    s.desidratadoAvisado = true;
    aviso(s.isotonicos ? '🥵 Desidratado! Tome o isotônico 🥤 ou pegue água no posto' : '🥵 Desidratado! Você vai perdendo força: pegue água no próximo posto', 'alerta', 2600);
  }
  if (!s.semAgua) s.desidratadoAvisado = false;
  if (s.semAgua > 0 && R.fatorHidratacao(0, s.semAgua) === 0 && s.v < 0.3) return terminar('Desidratou! 💧 Parou antes do próximo posto');

  const p = emEst(s.s);
  if (s.parado > 0) {
    s.parado -= dt;
    if (s.parado <= 0 && s.voltar) {
      // volta para o meio da rua, virado no sentido da prova
      const q = emEst(s.s);
      s.x = q.x; s.z = q.z; s.d = 0; s.ang = q.ang; s.giroPend = 0; s.voltar = false;
    }
    controles.consumirToques();
  } else {
    const giro = controles.giro();
    s.giroPend += controles.consumirToques() * GIRO_POR_TOQUE;
    const ader = CL.aderencia(cl); // na chuva o tênis escorrega: a curva sai mais lenta
    s.ang += giro * GIRO_RAD_S * ader * dt;
    if (s.giroPend) {
      const passoGiro = Math.sign(s.giroPend) * Math.min(Math.abs(s.giroPend), GIRO_RAD_S * 1.2 * ader * dt);
      s.ang += passoGiro; s.giroPend -= passoGiro;
    }
    // sem comando, alinha sozinho só quando já está quase reto (as esquinas são com você)
    if (Math.abs(giro) < 0.1 && Math.abs(s.giroPend) < 0.01) {
      const dif = difAngulo(p.ang, s.ang);
      if (Math.abs(dif) < 0.35) s.ang += dif * Math.min(1, 2.5 * ader * dt);
    }
    s.gelAtivo = Math.max(0, s.gelAtivo - dt);
    s.freio = Math.max(0, (s.freio || 0) - dt);
    s.energia = R.gastarEnergia(s.energia, dt, { inclinacao: p.inclinacao, gel: s.gelAtivo > 0, sede: s.agua < 25, freando: s.freio > 0, calor: CL.fatorEnergiaClima(cl) });
    if (s.energia < R.ENERGIA_BAIXA && !s.energiaAvisada) {
      s.energiaAvisada = true;
      aviso(s.geis ? '🔋 Energia baixa! Use um gel ⚡' : '🔋 Energia baixa! Pegue um gel ⚡', 'alerta', 1800);
    }
    const alvo = R.velocidadeAlvo({ gel: s.gelAtivo > 0, inclinacao: p.inclinacao, naCalcada: Math.abs(s.d) > R.MEIA_RUA, energia: s.energia, pace: s.paceBase / s.fatorTenis, freando: s.freio > 0 });
    s.v = R.aproximarVelocidade(s.v, alvo * CL.fatorVento(cl, s.ang) * R.fatorHidratacao(s.agua, s.semAgua || 0), dt); // vento; sem água vai perdendo força
    // curva fechada ou retorno à frente (ou ainda virando): tira o pé sozinho, mais rápido do que o soltar normal
    const fCurva = R.fatorCurva(Math.max(curvaEm(s.s), Math.abs(difAngulo(p.ang, s.ang))));
    if (s.v > alvo * fCurva) s.v = Math.max(alvo * fCurva, s.v - R.CURVA.freio * dt);
    if (fCurva < 0.8 && !s.curvaAvisada) { s.curvaAvisada = true; aviso('↪️ Curva fechada: tirando o pé', '', 900); }
    if (fCurva > 0.97) s.curvaAvisada = false;
    const W = s.v * R.ESCALA_TEMPO;
    const [fx, fz] = frente(s.ang);
    s.x += fx * W * dt; s.z += fz * W * dt;
    const q = pista.projetar(s.x, s.z, s.s);
    s.s = Math.max(-20, q.s); s.d = q.d;
    s.sMax = Math.max(s.sMax, s.s);
    s.pontos += W * dt * 0.05;
    s.fase += dt * W * 0.6;
    // um passo a cada meia volta da passada, só com o pé no chão
    const idx = Math.floor(s.fase / Math.PI);
    if (idx !== s.passoIdx) { s.passoIdx = idx; if (s.y === 0) som.passo(Math.abs(s.d) > R.MEIA_RUA); }
    if (Math.abs(s.d) > R.LIMITE_CALCADA) penalizar();
    if (pelotao.length) {
      // calor, vento e curvas também valem para eles: na curva fechada reduzem antes e voltam a acelerar aos poucos
      PL.avancarPelotao(pelotao, dt, s.t, s, Math.random, (c) => {
        const alvoCurva = R.fatorCurva(curvaEm(c.s));
        c.fCurva = c.fCurva ?? 1;
        c.fCurva += (alvoCurva - c.fCurva) * Math.min(1, (alvoCurva < c.fCurva ? 2.5 : 0.8) * dt);
        return CL.fatorNpc(s.clima, emEst(c.s).ang) * c.fCurva;
      });
      const pos = PL.colocacao(pelotao, s.s);
      if (s.posicao && pos.posicao < s.posicao.posicao && s.s > 60) {
        // sobe de posição: avisa nos marcos (30º, 20º, 10º e no top 5)
        const marco = [30, 20, 10, 5, 3, 2, 1].find((m) => pos.posicao <= m && s.posicao.posicao > m);
        if (marco) aviso(marco === 1 ? '🏆 Você assumiu a liderança!' : marco <= 3 ? `🥇 Zona de pódio: ${pos.posicao}º!` : `📈 Subiu para ${pos.posicao}º`, 'km', 1800);
      }
      s.posicao = pos;
      if (pos.ultrapassagens) s.pontos += 5 * pos.ultrapassagens;
      // esbarrão: perde um pouco de velocidade, sem penalidade
      for (const c of pelotao) {
        if (s.s < 40 || c.esbarrou || Math.abs(c.s - s.s) > 0.7 || Math.abs(c.d - s.d) > 0.55 || s.y > 0.3) continue; // na largada todo mundo está junto
        c.esbarrou = true; s.v *= 0.85; aviso('😬 Esbarrou num corredor', 'alerta', 900);
      }
    }
    if (s.gravacao) while (s.tempoReal >= s.gravacao.prox) { s.gravacao.amostras.push(Math.min(s.s, pista.total)); s.gravacao.prox += s.gravacao.passo; }
    if (s.modo !== 'jogando') return;
    if (prova && s.s >= pista.total) return terminar(`🏁 Chegada! ${prova.rotulo} concluído`, true);
  }

  if (s.vy !== 0 || s.y > 0) {
    s.vy += R.PULO.gravidade * dt;
    s.y = Math.max(0, s.y + s.vy * dt);
    if (s.y === 0) {
      s.vy = 0;
      if (s.saltandoCarro) { s.saltandoCarro = false; s.pontos += 30; aviso('🚗 Pulou o carro! +30'); }
      if (s.puloPend > 0) acao('pular');
    }
  }
  s.puloPend = Math.max(0, (s.puloPend || 0) - dt);
  s.saltoAnim = Math.max(0, (s.saltoAnim || 0) - dt);
  s.agachado = Math.max(0, s.agachado - dt);

  // novos obstáculos à frente; no treino também postos, travessas e km
  const sFrente = s.sMax + 160;
  if (sFrente >= s.proximoSpawn) {
    const nivel = prova ? 0.5 : Math.min(1, s.t / 150);
    const dentro = !prova || (s.proximoSpawn > 60 && s.proximoSpawn < pista.total - 60);
    const longeDeTravessa = !travessas.some((t) => Math.abs(t.s - s.proximoSpawn) < 14 + (t.vao || 0) / 2);
    let extra = 0;
    if (dentro && livre(s.proximoSpawn, 40) && longeDeTravessa) extra = gerarPadrao(s.proximoSpawn, nivel);
    s.proximoSpawn += extra + aleat(75, 120) - nivel * 15;
  }
  if (!prova) {
    if (sFrente >= s.proximoPosto) { postoHidratacao(s.proximoPosto, (s.proximoPosto / 1000) % 2 ? 1 : -1); s.proximoPosto += 1000; }
    if (sFrente >= s.proximoKm) { portico(s.proximoKm, `${s.proximoKm / 1000} KM`); s.proximoKm += 1000; }
    if (sFrente >= s.proximaTravessa) {
      if (livre(s.proximaTravessa, 25)) {
        const [t] = travessasGenericas(s.proximaTravessa + 61, s.proximaTravessa);
        if (t) { t.carro = false; travessas.push(t); adicionarTravessa(t); for (const it of cenario) if (Math.abs(it.s - t.s) < 15) posicionarCenario(it, it.s); }
      }
      s.proximaTravessa += aleat(170, 330);
    }
    for (const t of travessas) if (t.s < s.s - 60 && t.objs) { for (const o of t.objs) grupoTravessas.remove(o); t.objs = null; }
    travessas = travessas.filter((t) => t.objs);
  }

  // carros saem das vias principais quando o corredor se aproxima
  for (const t of travessas) {
    if (!t.principal || t.carro || t.s - s.s > 130 || t.s - s.s < 70) continue;
    t.carro = true;
    // na avenida dupla o carro vem numa das duas pistas, nunca no canteiro
    const sCarro = t.vao ? t.s + (Math.random() < 0.5 ? -1 : 1) * t.vao / 2 : t.s;
    if (Math.random() < 0.7 && livre(sCarro, 30)) carro(sCarro, escolher(t.lados));
  }

  // dica ao chegar perto do posto
  for (const posto of postos) {
    if (!posto.avisado && posto.s - s.s < 70 && posto.s > s.s) {
      posto.avisado = true;
      aviso(posto.lado > 0 ? '💧 Água à direita ➡️' : '⬅️ Água à esquerda 💧', 'km', 2200);
    }
  }

  // carro desgovernado: aparece uma vez em algumas provas, no meio do percurso
  if (prova && s.festaEm && !festa && s.s > s.festaEm) {
    // metade das vezes tenta a travessa (uma rua principal entre 80 e 300 m à frente); sem travessa, vem na contramão
    const t = (s.festaModo ? s.festaModo === 'travessa' : Math.random() < 0.5) && travessas.find((x) => x.principal && !x.carro && x.s > s.s + 80 && x.s < s.s + 300);
    if (t) { t.carro = true; festa = carroDesgovernadoTravessa(t); } else festa = carroDesgovernado(s.s + 230);
    // último km: vem na contramão com a polícia atrás
    if (festa && !festa.travessa && pista.total - s.s < 1300) viaturaAtras(festa);
    s.festaEm = proximoCarroKm(s.s);
  }
  if (festa) {
    const ce = festa.carro, dist = ce.s - s.s;
    // som do carro: cresce enquanto ele se aproxima (a partir de ~220 m), máximo quando passa e cai depois
    const longe = dist >= 0 ? dist / 220 : -dist / 35;
    som.carro(Math.pow(Math.max(0, 1 - longe), 1.6) * 0.95);
    if (festa.policia) { const dp = festa.policia.s - s.s, lp = dp >= 0 ? dp / 260 : -dp / 45; som.sirene(Math.pow(Math.max(0, 1 - lp), 1.3)); }
    if (!festa.avisado && dist < (festa.travessa ? 70 : 150)) { festa.avisado = true; aviso(festa.travessa ? '⚠️ Carro na travessa!' : festa.policia ? '🚨 Perseguição na contramão!' : '⚠️ Carro na contramão!', 'alerta', 1800); }
    // o pelotão sai da frente
    for (const c of pelotao) {
      const ds = ce.s - c.s;
      if (ds > -3 && ds < 26 && Math.abs(c.d - ce.d) < 2.6) { const lado = c.d >= ce.d ? 1 : -1; c.alvoD = Math.max(-3.4, Math.min(3.4, ce.d + lado * 3.2)); c.d += lado * 4 * dt; c.d = Math.max(-3.6, Math.min(3.6, c.d)); }
    }
    if (!festa.passou && dist < -6) {
      festa.passou = true;
      if (!ce.atingido) { s.pontos += 50; aviso('😅 Escapou do carro desgovernado! +50', 'km', 1800); }
      if (festa.policia || Math.random() < 0.25) setTimeout(() => aviso('🚓 Rua interditada é dos corredores. Se beber, não dirija.', 'km', 3200), 2000);
    }
    const fim = festa.policia ? festa.policia.s - s.s : dist;
    if (fim < -24) { festa = null; som.carro(0); som.sirene(0); } // as entidades somem 25 m atrás do corredor
  }
  const c = { s: s.s, d: s.d, y: s.y, altura: s.agachado > 0 ? R.ALTURA_AGACHADO : R.ALTURA_EM_PE };
  const vCorredor = s.v * R.ESCALA_TEMPO;
  for (const e of entidades) {
    if (e.vs) e.s += e.vs * dt;
    // cachorro e carro esperam na lateral e cruzam quando o corredor chega perto
    if (e.gatilho && !e.vd && e.s - s.s < e.gatilho && e.s > s.s) {
      const tempo = (e.s - s.s) / Math.max(vCorredor, 4);
      const alvo = s.d + aleat(-1.2, 1.2);
      e.vd = (alvo - e.d) / tempo;
      e.rot = (e.vd > 0) !== !!e.frenteNegX ? 0 : Math.PI; // carro-festa tem a frente para -x
    }
    if (e.vd) e.d += e.vd * dt;
    // rodas girando conforme a velocidade do carro (frente para onde ele anda)
    if (e.rodas?.length && e.vd) for (const r of e.rodas) r.rotation.x += (Math.abs(e.vd) * dt) / e.raioRoda;
    if (e.rodasZ?.length && (e.vs || e.vd)) for (const r of e.rodasZ) r.rotation.z += (Math.abs(e.vs || e.vd) * dt) / e.raioRoda;
    if (e.rodasVs?.length && e.vs) for (const r of e.rodasVs) r.rotation.x += (Math.abs(e.vs) * dt) / e.raioRoda;
    if (e.anima) e.anima(s.t);
    colocar(e);
    // pórticos e enfeites fixos só aparecem para quem está naquele trecho: na 2ª volta (ou na volta de um vai e vem)
    // o pórtico de "13 KM" da outra passagem fica no mesmo lugar e confundia
    if (e.fixo) e.obj.visible = [e.s, ...(e.sAlt || [])].some((v) => v > s.s - 200 && v < s.s + 900) && !(Math.abs(e.d) > R.LIMITE_CALCADA && pista.elevacao?.(e.s) > 0.3);
    if (e.tipo === 'decor' || e.pego || e.atingido) continue;
    if (e.item) {
      if (R.coleta(c, e)) {
        e.pego = true;
        scene.remove(e.obj);
        s.pontos += e.pontos;
        if (e.tipo === 'gel') {
          if (s.geis < s.gelMax) { s.geis++; aviso(`⚡ Gel guardado (${s.geis})`); } else aviso('⚡ Bolso cheio de gel');
          atualizarHud();
        }
      }
    } else if (s.parado <= 0 && R.colide(c, e)) {
      // tropeça e perde velocidade, mas segue correndo
      e.atingido = true;
      s.v *= R.PERDA_TROPECO;
      s.tropecos++;
      s.tremor = 0.35;
      aviso(`💥 ${e.motivo}!`, 'alerta', 1100);
    }
  }
  entidades = entidades.filter((e) => {
    if (e.pego || (!e.fixo && e.s < s.s - 25) || Math.abs(e.d) > 30) { scene.remove(e.obj); return false; }
    return true;
  });

  // aviso de km
  const km = Math.floor(s.sMax / 1000);
  if (km > s.kmAvisado) { s.kmAvisado = km; aviso(`${km} KM · ${R.formatarTempo(s.tempoReal)}`, 'km'); }

  atualizarCenario(s.s);
  atualizarOSM(dt, s.t);
  som.atualizar({
    correndo: true,
    progresso: Math.min(1, Math.max(0, s.s / Math.min(1500, 0.3 * (Number.isFinite(pista.total) ? pista.total : 5000)))),
    inclinacao: p.inclinacao, energia: s.energia, velocidade: s.v, torcida: nivelTorcida(s.s)
  });
  atualizarPlacas(s.s);
  if (!prova) { visual.position.z = -Math.floor(s.s / 40) * 40; fundo.position.z = s.z; }

  hudTimer -= dt;
  if (hudTimer <= 0) { atualizarHud(); hudTimer = 0.15; }
}

function desenhar(dt) {
  const s = estado;
  tufos.atualizar(s.s, performance.now() / 1000, ondeTufo);
  const chao = emEst(s.s).y;
  corredor.g.position.set(s.x, chao + s.y, s.z);
  corredor.g.rotation.y = -s.ang;
  corredor.sombra.position.set(s.x, chao + 0.08, s.z);
  corredor.sombra.scale.setScalar(1 - Math.min(0.5, s.y / 4));
  const noAr = s.y > 0.05, agachado = s.agachado > 0;
  // desidratado e quase parando: anda (quem tem animação de caminhada)
  const andando = s.semAgua > 0 && s.v < R.mps(R.PACE_BASE) * 0.4 && corredor.atleta?.partes?.caminhar;
  const anim = s.modo === 'jogando' ? (s.saltoAnim > 0 ? 'pular' : s.parado > 0 ? 'parado' : andando ? 'caminhar' : 'correr')
    : s.modo === 'fim' ? (s.concluiu ? 'comemorar' : 'parado')
    : s.modo === 'contagem' && s.chegada > 0 ? 'caminhar'
    : s.modo === 'inicio' || s.modo === 'contagem' ? 'aquecer' : 'parado';
  // a passada acelera com o nível; quem não tem caminhada chega num trote lento
  const ritmo = s.modo === 'jogando' ? (andando ? Math.max(0.35, s.v / (R.mps(R.PACE_BASE) * 0.35)) : 1.25 * (s.v / R.mps(R.PACE_BASE))) : anim === 'caminhar' && !corredor.atleta?.partes?.caminhar ? 0.45 : 1;
  const comModelo = s.modo !== 'pausa' && animarAtleta(corredor, dt, { anim, ritmo, noAr, agachado });
  if (!comModelo) {
    if (s.modo === 'jogando') animarCorredor(corredor, s.fase, { noAr, agachado, parado: s.v < 0.2 });
    else if (s.modo === 'inicio') { s.fase += dt * 6; animarCorredor(corredor, s.fase); }
    else if (s.modo === 'contagem') animarCorredor(corredor, 0, { parado: true });
  }
  // sombra de verdade na qualidade alta/média; mancha redonda na baixa
  corredor.sombra.visible = !sol.castShadow;
  sol.target.position.set(s.x, chao, s.z);
  sol.position.copy(sol.target.position).add(SOL_OFFSET);

  // câmera atrás do corredor, acompanhando as viradas com suavidade
  const cam = CAMERAS[modoCamera];
  s.camAng += difAngulo(s.ang, s.camAng) * Math.min(1, dt * 4);
  const [fx, fz] = frente(s.camAng);
  camera.position.set(s.x - fx * cam.tras, chao + s.y * 0.25 + cam.alto, s.z - fz * cam.tras);
  if (s.tremor > 0) {
    s.tremor = Math.max(0, s.tremor - dt);
    camera.position.x += (Math.random() - 0.5) * s.tremor;
    camera.position.y += (Math.random() - 0.5) * s.tremor;
  }
  // passando por baixo (ou ao lado) do viaduto, a câmera desce para não atravessar o tabuleiro
  ajustarCameraViaduto(camera.position, s.x, chao + s.y + 1.6, s.z);
  const alvo = emEst(s.s + cam.olhar);
  camera.lookAt(s.x + fx * cam.olhar, (alvo.y + chao) / 2 + 1.4, s.z + fz * cam.olhar);
  // câmera livre só para os testes automáticos (fotos aéreas)
  if (s.camTeste) { camera.position.set(...s.camTeste.pos); camera.lookAt(...s.camTeste.alvo); scene.fog.far = 2000; }
  ceu.position.copy(camera.position);
  animarChuva(Math.min(dt || 0.016, 0.05));
  desenharPelotao(Math.min(dt || 0.016, 0.05));
  desenharFantasma(Math.min(dt || 0.016, 0.05));
  renderer.render(scene, camera);
}

const relogio = new THREE.Clock();
const medidor = { soma: 0, n: 0 };
function medirDesempenho(dtReal) {
  if (estado.modo !== 'jogando' || nivel >= NIVEIS.length - 1) { medidor.soma = medidor.n = 0; return; }
  medidor.soma += dtReal; medidor.n++;
  if (medidor.soma < 3) return;
  const fps = medidor.n / medidor.soma;
  medidor.soma = medidor.n = 0;
  if (fps < 40) { aplicarQualidade(nivel + 1); aviso(`Gráficos ajustados (${NIVEIS[nivel].nome}) para o seu celular`, '', 1600); }
}

// medidor de quadros por segundo para testes no celular (só com ?fps=1; não muda nada no jogo):
// média do último segundo, pior quadro, qualidade gráfica e triângulos desenhados
const mostradorFps = new URLSearchParams(location.search).get('fps') === '1' ? (() => {
  const el = document.createElement('div');
  el.style.cssText = 'position:fixed;left:6px;bottom:6px;z-index:99;font:12px monospace;color:#fff;background:rgba(0,0,0,.6);padding:3px 6px;border-radius:4px;pointer-events:none';
  document.body.appendChild(el);
  return { el, n: 0, soma: 0, pior: 0 };
})() : null;
function atualizarMostradorFps(dtReal) {
  const m = mostradorFps; m.n++; m.soma += dtReal; m.pior = Math.max(m.pior, dtReal);
  if (m.soma < 1) return;
  m.el.textContent = `${(m.n / m.soma).toFixed(0)} fps · pior ${(m.pior * 1000).toFixed(0)} ms · ${NIVEIS[nivel].nome} · ${(renderer.info.render.triangles / 1000).toFixed(0)}k tri${prova?.ruasOSM ? ' · ruas OSM' : ''}`;
  m.n = 0; m.soma = 0; m.pior = 0;
}

function loop() {
  const dtReal = relogio.getDelta();
  const dt = Math.min(0.05, dtReal);
  medirDesempenho(dtReal);
  if (mostradorFps) atualizarMostradorFps(dtReal);
  if (estado.modo === 'contagem') passoContagem(dt);
  if (estado.modo === 'jogando') passo(dt);
  if (estado.modo === 'jogando' || estado.modo === 'contagem') desenharMinimapa(); // gira junto: a cada quadro
  atualizarGota(dt);
  desenhar(dt);
  requestAnimationFrame(loop);
}

// ─── MENU E DADOS DA PROVA ────────────────────────────────────────────────────

// escolha em dois passos: cidade e, embaixo, as provas daquela cidade
let cidadeEscolhida = null;
function mostrarAbasProvas() {
  const box = $('#provasAbas');
  const atual = PROVAS.find((p) => p.slug === PROVA_SLUG);
  cidadeEscolhida ||= atual.cidade;
  const cidades = [...new Set(PROVAS.map((p) => p.cidade))];
  const daCidade = PROVAS.filter((p) => p.cidade === cidadeEscolhida);
  // cidades num seletor segmentado; a fila de provas só aparece quando a cidade tem mais de uma
  box.innerHTML = `<div class="seg-cidades">${cidades.map((c) => `<button data-cidade="${c}" class="${c === cidadeEscolhida ? 'ativa' : ''}"><svg><use href="#i-pino-simples"/></svg>${c}</button>`).join('')}</div>
    ${daCidade.length > 1 ? `<div class="linha-abas">${daCidade.map((p) => `<button data-slug="${p.slug}" class="${p.slug === PROVA_SLUG ? 'ativa' : ''}">${p.curto}</button>`).join('')}</div>` : ''}`;
  for (const b of box.querySelectorAll('button[data-cidade]')) b.addEventListener('click', () => {
    if (b.dataset.cidade === cidadeEscolhida) return;
    cidadeEscolhida = b.dataset.cidade;
    // ao trocar de cidade, abre a primeira prova dela
    const primeira = PROVAS.find((p) => p.cidade === cidadeEscolhida);
    trocarProva(primeira.slug);
  });
  for (const b of box.querySelectorAll('button[data-slug]')) b.addEventListener('click', () => trocarProva(b.dataset.slug));
}
function trocarProva(slug) {
  {
    if (slug === PROVA_SLUG) { mostrarAbasProvas(); return; }
    PROVA_SLUG = slug;
    try { localStorage.setItem('mapmove-prova', PROVA_SLUG); } catch { /* sem storage */ }
    dadosProva = null;
    $('#provaInfo').textContent = 'Carregando o percurso…';
    $('#provaDistancias').innerHTML = '';
    limparPreviaProva();
    carregarProva();
  }
}
async function carregarProva() {
  mostrarAbasProvas();
  const url = `${SUPABASE_URL}/rest/v1/corridas?slug=eq.${PROVA_SLUG}&select=nome,cidade,percurso_3d,corrida_distancias(rotulo,km,subida_m,percurso)`;
  const box = $('#provaDistancias');
  try {
    const r = await fetch(url, { headers: { apikey: SUPABASE_KEY } });
    const [c] = await r.json();
    // rótulos padronizados em maiúsculas (21k → 21K): XP, medalhas e recordes usam esse rótulo
    const brutas = (c?.corrida_distancias || []).filter((d) => Array.isArray(d.percurso) && d.percurso.length > 10).sort((a, b) => a.km - b.km).map((d) => ({ ...d, rotulo: d.rotulo.toUpperCase() }));
    // GPS espaçado (ex.: 42K = 2 voltas do 21K com metade dos pontos) é encaixado na distância mais detalhada da
    // mesma prova: voltas caem no mesmo lugar e as curvas não são cortadas (src/refino.js; nada muda no Portal)
    const refinadas = refinarDistancias(brutas);
    // modo de teste: troca o percurso pelo ajustado às ruas do OSM onde houver (as brutas do Portal não mudam)
    let dist = MODO_PERCURSO === 'ajustado' ? await aplicarPercursoAjustado(PROVA_SLUG, refinadas) : refinadas;
    if (MODO_PERCURSO === 'ajustado' && MODO_RUAS === 'osm') dist = await aplicarRuasOSM(PROVA_SLUG, dist);
    if (!dist.length) throw new Error('sem percurso');
    const marcadores = {};
    for (const [rot, v] of Object.entries(c.percurso_3d?.por || {})) marcadores[rot.toUpperCase()] = v.pontos || [];
    const nome = NOME_NO_JOGO[PROVA_SLUG] || c.nome;
    dadosProva = { nome, distancias: dist, marcadores };
    $('#provaNome').textContent = nome;
    $('#jogarProva').textContent = `${nome} · ${PROVAS.find((p) => p.slug === PROVA_SLUG)?.cidade}`;
    $('#provaInfo').textContent = `${c.cidade} · percurso e altimetria reais`
      + (dist.some((d) => d.ajustado) ? ' · percurso ajustado (teste: recordes à parte, fora do ranking)' : '')
      + (dist.some((d) => d.ruas) ? ' · ruas do mapa (teste)' : '');
    box.innerHTML = '';
    // distância selecionada: a última usada nesta prova (só neste aparelho) ou a mais longa
    let lembrada = null;
    try { lembrada = localStorage.getItem(`mapmove-dist-${PROVA_SLUG}`); } catch { /* sem storage */ }
    const inicial = dist.find((d) => d.rotulo === lembrada) || dist[dist.length - 1];
    for (const d of dist) {
      const b = document.createElement('button');
      b.dataset.rotulo = d.rotulo;
      const rec = lerRecorde(`mapmove-recorde-${PROVA_SLUG}-${d.rotulo}${sufixo(d)}`);
      const recValido = typeof rec === 'number' && rec > 0; // selo só com recorde de verdade nesta distância
      b.innerHTML = `${recValido ? `<span class="rec"><svg><use href="#i-estrela"/></svg>${R.formatarTempo(rec)}</span>` : ''}<span class="km">${d.rotulo}</span><span class="sobe"><svg><use href="#i-montanha"/></svg>${d.subida_m ?? '?'} m</span>`;
      b.addEventListener('click', () => selecionarDistancia(d));
      box.appendChild(b);
    }
    selecionarDistancia(inicial);
  } catch {
    $('#provaInfo').textContent = 'Não foi possível carregar o percurso agora. Tente de novo mais tarde.';
  }
}

// ─── PRÉVIA DA PROVA: traçado real (GPS) e altimetria da distância escolhida ───
let distSelecionada = null;
function selecionarDistancia(d) {
  distSelecionada = d;
  try { localStorage.setItem(`mapmove-dist-${PROVA_SLUG}`, d.rotulo); } catch { /* sem storage */ }
  for (const b of $('#provaDistancias').children) b.classList.toggle('sel', b.dataset.rotulo === d.rotulo);
  desenharMapaProva(dadosProva.distancias, d);
  desenharAltiProva(d);
  $('#provaAltiRot').textContent = `Altimetria · ${d.rotulo} · ↗ ${d.subida_m ?? '?'} m`;
  $('#correrTxt').textContent = `CORRER ${d.rotulo}`;
  $('#btnCorrer').hidden = false;
}
function limparPreviaProva() {
  distSelecionada = null;
  for (const id of ['#provaMapa', '#provaAlti']) { const c = $(id); c.getContext('2d').clearRect(0, 0, c.width, c.height); }
  $('#provaAltiRot').textContent = '';
  $('#btnCorrer').hidden = true;
}
// mapa: projeção simples (lon encolhida pelo cosseno da latitude), todas as distâncias no mesmo enquadramento;
// as outras em traço claro, a escolhida em branco com brilho azul, largada (verde) e chegada (xadrez)
function desenharMapaProva(todas, sel) {
  const cv = $('#provaMapa'), g = cv.getContext('2d'), W = cv.width, H = cv.height, pad = 30, padV = 52; // em cima o selo, embaixo a legenda
  g.clearRect(0, 0, W, H);
  const pts = todas.flatMap((d) => d.percurso);
  const lat0 = pts.reduce((a, p) => a + p[0], 0) / pts.length, k = Math.cos((lat0 * Math.PI) / 180);
  const xs = pts.map((p) => p[1] * k), ys = pts.map((p) => -p[0]);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const esc = Math.min((W - 2 * pad) / (maxX - minX || 1), (H - 2 * padV) / (maxY - minY || 1));
  const ox = (W - (maxX - minX) * esc) / 2, oy = (H - (maxY - minY) * esc) / 2;
  const pr = (p) => [(p[1] * k - minX) * esc + ox, (-p[0] - minY) * esc + oy];
  const linha = (d) => { g.beginPath(); d.percurso.forEach((p, i) => { const [x, y] = pr(p); i ? g.lineTo(x, y) : g.moveTo(x, y); }); };
  g.lineJoin = g.lineCap = 'round';
  for (const d of todas) if (d !== sel) { linha(d); g.strokeStyle = 'rgba(255,255,255,0.2)'; g.lineWidth = 5; g.stroke(); }
  linha(sel); g.strokeStyle = 'rgba(79,180,255,0.55)'; g.lineWidth = 16; g.filter = 'blur(5px)'; g.stroke(); g.filter = 'none';
  linha(sel); g.strokeStyle = '#fff'; g.lineWidth = 6; g.stroke();
  const [ix, iy] = pr(sel.percurso[0]), [fx, fy] = pr(sel.percurso[sel.percurso.length - 1]);
  const xadrez = (x, y) => {
    g.fillStyle = '#fff'; g.fillRect(x - 15, y - 15, 30, 30);
    g.fillStyle = '#061440'; for (let a = 0; a < 4; a++) for (let b = 0; b < 4; b++) if ((a + b) % 2 === 0) g.fillRect(x - 15 + a * 7.5, y - 15 + b * 7.5, 7.5, 7.5);
    g.strokeStyle = '#061440'; g.lineWidth = 3; g.strokeRect(x - 15, y - 15, 30, 30);
  };
  // circuito (largada e chegada no mesmo lugar): a bandeira fica ao lado da bolinha
  const junto = Math.hypot(fx - ix, fy - iy) < 30;
  xadrez(junto ? ix + 30 : fx, junto ? iy - 18 : fy);
  g.beginPath(); g.arc(ix, iy, 13, 0, Math.PI * 2); g.fillStyle = '#2fc15a'; g.fill(); g.lineWidth = 5; g.strokeStyle = '#fff'; g.stroke();
}
// altimetria da distância escolhida: área com degradê azul e linha clara
function desenharAltiProva(d) {
  const cv = $('#provaAlti'), g = cv.getContext('2d'), W = cv.width, H = cv.height;
  g.clearRect(0, 0, W, H);
  const alts = d.percurso.map((p) => p[2]).filter(Number.isFinite);
  if (alts.length < 2) return;
  const n = 90, vals = Array.from({ length: n }, (_, i) => alts[Math.floor((i / (n - 1)) * (alts.length - 1))]);
  const mn = Math.min(...vals), mx = Math.max(...vals), amp = Math.max(mx - mn, 8); // trecho plano não vira serrote
  const topo = 30, y = (v) => H - 6 - ((v - mn) / amp) * (H - topo - 6);
  g.beginPath(); g.moveTo(0, H);
  vals.forEach((v, i) => g.lineTo((i / (n - 1)) * W, y(v)));
  g.lineTo(W, H); g.closePath();
  const gr = g.createLinearGradient(0, topo, 0, H); gr.addColorStop(0, 'rgba(79,180,255,0.85)'); gr.addColorStop(1, 'rgba(30,107,255,0.15)');
  g.fillStyle = gr; g.fill();
  g.beginPath(); vals.forEach((v, i) => { const x = (i / (n - 1)) * W; i ? g.lineTo(x, y(v)) : g.moveTo(x, y(v)); });
  g.strokeStyle = '#bfe4ff'; g.lineWidth = 4; g.lineJoin = 'round'; g.stroke();
}
$('#btnCorrer').addEventListener('click', () => { if (distSelecionada) abrirClima({ tipo: 'prova', distancia: distSelecionada }); });
$('#btnProvasVoltar').addEventListener('click', () => abrirPainel(null));

// ─── PERFIL DO CORREDOR (salvo no aparelho; conta e ranking vêm depois) ────────
const CHAVE_PERFIL = 'mapmove-perfil-v1';
let perfil = (() => { try { return P.lerPerfil(localStorage.getItem(CHAVE_PERFIL)); } catch { return P.perfilNovo(); } })();
function salvarPerfil() {
  try { localStorage.setItem(CHAVE_PERFIL, JSON.stringify(perfil)); } catch { /* sem storage */ }
  agendarNuvem();
  // na tela inicial, saldo e treino do dia sempre atualizados (o botão de comprar depende dos Move$)
  if (typeof estado !== 'undefined' && estado.modo === 'inicio') queueMicrotask(() => { try { mostrarPerfil(); mostrarTreinoDoDia(); } catch { /* ainda carregando */ } });
}

// ─── CONTA (login Google) E PERFIL NA NUVEM ───────────────────────────────────
let usuario = null, timerNuvem = 0;
function agendarNuvem() {
  if (!usuario) return;
  clearTimeout(timerNuvem);
  $('#contaSync').textContent = '☁️ salvando…';
  timerNuvem = setTimeout(async () => {
    try { await Conta.salvarPerfilNuvem(usuario, perfil); $('#contaSync').textContent = '☁️ salvo'; }
    catch { $('#contaSync').textContent = '⚠️ sem conexão'; }
  }, 1500);
}
// ── Strava: corridas reais viram XP e Move$ ──
let stravaConectado = false, ultimaSyncStrava = 0;
function mostrarStrava(nome) {
  $('#strava').hidden = !usuario;
  $('#btnStrava').hidden = stravaConectado;
  $('#btnStravaSair').hidden = !stravaConectado;
  $('#stravaAcoes').hidden = !stravaConectado;
  if (!stravaConectado) $('#stravaLista').hidden = true;
  $('#stravaInfo').textContent = stravaConectado ? `🟠 Strava${nome ? ` de ${nome.split(' ')[0]}` : ''} conectado · corrida e caminhada viram XP` : 'Corrida e caminhada reais viram XP (10 por km)';
}
const ICONE_ATIV = { Run: '🏃', TrailRun: '⛰️', VirtualRun: '🏃', Walk: '🚶', Hike: '🥾' };
const escHtml = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
async function listarStrava() {
  const ul = $('#stravaLista');
  ul.hidden = false;
  ul.innerHTML = '<li class="vazia">Carregando…</li>';
  try {
    const { atividades } = await Conta.stravaLista();
    if (!atividades?.length) { ul.innerHTML = '<li class="vazia">Nenhuma atividade contada ainda. Vale corrida e caminhada de hoje em diante.</li>'; return; }
    ul.innerHTML = atividades.map((a) => {
      const [ano, mes, dia] = a.dia.split('-');
      const km = Number(a.km), kmv = Number(a.km_valido), xp = Math.round(kmv * Conta.XP_POR_KM_REAL);
      const limite = kmv < km ? ` · ${kmv.toFixed(1).replace('.', ',')} km valeram (limite do dia)` : '';
      return `<li><span>${ICONE_ATIV[a.tipo] || '🏃'}</span><span class="nome">${escHtml(a.nome || 'Atividade')}<small>${dia}/${mes} · ${km.toFixed(1).replace('.', ',')} km${limite}</small></span><span class="xp">+${xp} XP<br>+${Math.floor(kmv)} M$</span></li>`;
    }).join('');
  } catch (e) { ul.innerHTML = `<li class="vazia">Não deu para carregar: ${escHtml(e.message)}</li>`; }
}
async function sincronizarStrava(forcar = false, manual = false) {
  if (!usuario || !stravaConectado) return;
  if (!forcar && Date.now() - ultimaSyncStrava < 120000) return;
  ultimaSyncStrava = Date.now();
  try {
    const r = await Conta.stravaSincronizar();
    if (!$('#stravaLista').hidden) listarStrava();
    if (!r.novas?.length) { if (manual) aviso('🟠 Nenhuma atividade nova no Strava', 'km', 2500); return; }
    const g = Conta.ganhoStrava(r.novas);
    const antes = P.situacao(perfil.xp);
    perfil = { ...perfil, xp: perfil.xp + g.xp, moves: perfil.moves + g.moves, kmStrava: (perfil.kmStrava || 0) + g.km };
    salvarPerfil();
    const depois = P.situacao(perfil.xp);
    const premios = entregarPremios();
    const subiu = depois.indice > antes.indice ? ` · ⬆️ ${depois.rotulo}!` : '';
    aviso(`🟠 Strava: ${r.novas.length} ${r.novas.length > 1 ? 'atividades' : 'atividade'}, ${g.km.toFixed(1).replace('.', ',')} km · +${g.xp} XP +${g.moves} Move$${subiu}`, 'km', 4000);
    if (premios.length) setTimeout(() => aviso(premios[0], 'km', 3000), 4200);
    if (estado.modo === 'inicio') { mostrarPerfil(); mostrarTreinoDoDia(); }
  } catch (e) { console.warn('strava', e); if (manual) aviso(`Não deu para buscar no Strava: ${e.message}`, 'alerta', 3500); }
}
async function iniciarStrava() {
  if (!usuario) { stravaConectado = false; mostrarStrava(); return; }
  // voltando da autorização do Strava?
  const q = new URLSearchParams(window.location.search);
  if (q.get('state') === Conta.ESTADO_STRAVA) {
    history.replaceState(null, '', window.location.pathname);
    if (q.get('code')) {
      try { const r = await Conta.stravaConectar(q.get('code'), q.get('scope')); aviso('🟠 Strava conectado! Corridas e caminhadas de hoje em diante viram XP.', 'km', 3500); stravaConectado = true; mostrarStrava(r.nome); }
      catch (e) { aviso(`Não deu para conectar o Strava: ${e.message}`, 'alerta', 3500); }
    }
  }
  try { const s = await Conta.stravaStatus(); stravaConectado = !!s.conectado; mostrarStrava(s.nome); } catch { mostrarStrava(); }
  sincronizarStrava(true);
}

function mostrarConta() {
  const logado = !!usuario;
  if (!logado) { stravaConectado = false; mostrarStrava(); }
  $('#btnGoogle').hidden = logado; $('#contaDica').hidden = logado; $('#logado').hidden = !logado;
  if (logado) {
    const d = Conta.dadosDoUsuario(usuario);
    $('#contaNome').textContent = d.nome.split(' ')[0];
    if (d.foto) $('#contaFoto').src = d.foto; else $('#contaFoto').removeAttribute('src');
  }
  // chip da conta no cartão do perfil (atalho para o painel Conta e Strava)
  const d = logado ? Conta.dadosDoUsuario(usuario) : null;
  $('#chipNome').textContent = d ? d.nome.split(' ')[0] : 'Entrar';
  $('#chipFoto').hidden = !d?.foto;
  $('#chipInicial').style.display = d?.foto ? 'none' : ''; // sem foto: o boneco desenhado
  if (d?.foto) $('#chipFoto').src = d.foto;
}
async function entrouNaConta(u) {
  if (!u || usuario?.id === u.id) { usuario = u; mostrarConta(); return; }
  usuario = u; mostrarConta();
  iniciarStrava();
  try {
    const nuvem = await Conta.lerPerfilNuvem(u);
    perfil = Conta.mesclarPerfis(perfil, nuvem);
    salvarPerfil();
    if (estado.modo === 'inicio') mostrarInicio();
    if (perfil.personagem && corredor.atleta?.id !== perfil.personagem) carregarAtleta(corredor, perfil.personagem).catch(() => {});
  } catch (e) { console.warn('perfil na nuvem', e); $('#contaSync').textContent = '⚠️ sem conexão'; }
  aceitarConvitePendente();
  conferirTrofeuSemana();
}

// ─── RANKING DE PONTOS E AMIGOS ──────────────────────────────────────────────
// convite: jogo.mapmove.com.br/?amigo=CODIGO — guarda o código até a pessoa entrar com o Google
{
  const c = new URLSearchParams(location.search).get('amigo');
  if (c) {
    try { localStorage.setItem('mapmove-convite', c.toUpperCase()); } catch { /* sem storage */ }
    history.replaceState(null, '', location.pathname);
    setTimeout(() => { if (!usuario) aceitarConvitePendente(); }, 2500);
  }
}
// convite pendente: mostra quem convidou e a pessoa escolhe aceitar ou não a amizade
async function aceitarConvitePendente() {
  let c = null; try { c = localStorage.getItem('mapmove-convite'); } catch { /* sem storage */ }
  if (!c) return;
  if (!usuario) { mostrarConvite({ semConta: true }); return; }
  const esquecer = () => { try { localStorage.removeItem('mapmove-convite'); } catch { /* sem storage */ } };
  try {
    const q = await Conta.quemConvidou(c);
    if (!q || q.eu_mesmo) { esquecer(); return; }
    if (q.ja_amigos) { esquecer(); aviso(`👥 Você e ${q.nome} já são amigos`, 'km', 2200); return; }
    mostrarConvite({ nome: q.nome, foto: q.foto, codigo: c });
  } catch (e) { console.warn('convite', e); }
}
function mostrarConvite({ semConta, nome, foto, codigo }) {
  const el = $('#convite');
  $('#conviteFoto').hidden = !foto;
  if (foto) $('#conviteFoto').src = foto;
  $('#conviteTexto').textContent = semConta ? 'Você recebeu um convite de amizade! Entre com o Google para aceitar.' : `${nome} te convidou para ser amigo no Mapmove Run.`;
  $('#btnConviteAceitar').hidden = !!semConta;
  $('#btnConviteRecusar').textContent = semConta ? 'Depois' : 'Agora não';
  el.hidden = false;
  $('#btnConviteAceitar').onclick = async () => {
    el.hidden = true;
    try { const n = await Conta.adicionarAmigo(codigo); aviso(`👥 Agora você e ${n} são amigos!`, 'km', 3000); } catch (e) { aviso('Não deu para aceitar agora', 'alerta', 2000); return; }
    try { localStorage.removeItem('mapmove-convite'); } catch { /* sem storage */ }
  };
  $('#btnConviteRecusar').onclick = () => {
    el.hidden = true;
    if (!semConta) try { localStorage.removeItem('mapmove-convite'); } catch { /* sem storage */ }
  };
}
// top 3 da semana passada ganha o Troféu da semana (uma vez por semana)
async function conferirTrofeuSemana() {
  try {
    const r = await Conta.semanaPassada();
    if (!r || r.posicao > 3) return;
    const ja = perfil.trofeusSemana || [];
    if (ja.includes(r.semana)) return;
    perfil = { ...perfil, trofeusSemana: [...ja, r.semana], conquistas: { ...(perfil.conquistas || {}), trofeu: Date.now() } };
    salvarPerfil();
    aviso(`🏆 Você ficou em ${r.posicao}º no ranking da semana passada! Troféu da semana`, 'km', 3800);
  } catch (e) { console.warn('troféu da semana', e); }
}
let filtroRanking = { periodo: 'semana', amigos: false };
async function abrirRanking() {
  mostrar('telaRanking');
  if (!usuario) {
    $('#rankingDica').textContent = 'Entre com o Google (tela inicial) para aparecer no ranking e adicionar amigos.';
    $('#rankingLista').innerHTML = '';
    $('#amigosBox').hidden = true;
    return;
  }
  $('#amigosBox').hidden = false;
  carregarRanking();
  carregarAmigos();
}
const escapar = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
async function carregarRanking() {
  for (const b of document.querySelectorAll('.aba-r[data-periodo]')) b.classList.toggle('ativa', b.dataset.periodo === filtroRanking.periodo);
  for (const b of document.querySelectorAll('.aba-r[data-quem]')) b.classList.toggle('ativa', (b.dataset.quem === 'amigos') === filtroRanking.amigos);
  $('#rankingDica').textContent = filtroRanking.periodo === 'semana' ? 'Soma dos pontos desde segunda. Top 3 ganha o Troféu da semana.' : 'Soma dos pontos dos últimos 30 dias.';
  const ul = $('#rankingLista');
  ul.innerHTML = '<li class="vazio">Carregando…</li>';
  try {
    const lista = await Conta.ranking(filtroRanking.periodo, filtroRanking.amigos);
    if (!lista?.length) { ul.innerHTML = `<li class="vazio">${filtroRanking.amigos ? 'Nenhum amigo correu ainda. Convide alguém!' : 'Ninguém pontuou ainda. Seja o primeiro!'}</li>`; return; }
    const medalha = (p) => `<i class="num${p <= 3 ? ` p${p}` : ''}">${p}</i>`;
    ul.innerHTML = lista.map((r) => `<li class="${r.eu ? 'eu' : ''}${Number(r.posicao) === 1 && !r.eu ? ' top1' : ''}"><span class="pos">${medalha(Number(r.posicao))}</span>${r.foto ? `<img src="${escapar(r.foto)}" alt="" referrerpolicy="no-referrer">` : `<span class="sem-foto">${escapar((r.nome || '?')[0])}</span>`}<span class="nome">${r.eu ? 'Você' : escapar(r.nome)}<small>${r.corridas} ${Number(r.corridas) === 1 ? 'corrida' : 'corridas'}</small></span><span class="pts">⭐ ${Number(r.pontos).toLocaleString('pt-BR')}</span></li>`).join('');
  } catch (e) { ul.innerHTML = `<li class="vazio">Não deu para carregar o ranking: ${escapar(e.message)}</li>`; }
}
async function carregarAmigos() {
  try { $('#meuCodigo').textContent = await Conta.meuCodigo(); } catch { $('#meuCodigo').textContent = '—'; }
  const ul = $('#amigosLista');
  try {
    const lista = await Conta.meusAmigos();
    ul.innerHTML = lista?.length ? lista.map((a) => `<li><span>👤 ${escapar(a.nome)}</span><b>⭐ ${Number(a.pontos_semana).toLocaleString('pt-BR')} na semana</b></li>`).join('')
      : '<li>Você ainda não tem amigos no jogo. Mande seu convite!</li>';
  } catch { ul.innerHTML = ''; }
}
$('#btnRanking').addEventListener('click', abrirRanking);
$('#btnRankingVoltar').addEventListener('click', mostrarInicio);
for (const b of document.querySelectorAll('.aba-r')) b.addEventListener('click', () => {
  if (b.dataset.periodo) filtroRanking.periodo = b.dataset.periodo; else filtroRanking.amigos = b.dataset.quem === 'amigos';
  carregarRanking();
});
$('#btnConvidar').addEventListener('click', async () => {
  const codigo = $('#meuCodigo').textContent;
  if (!codigo || codigo.length !== 6) return;
  const texto = `Corre comigo no Mapmove Run! 🏃 Percursos reais de corrida no celular. Entra pelo meu convite (código ${codigo}): ${Conta.linkConvite(codigo)}`;
  if (navigator.share) { try { await navigator.share({ text: texto }); return; } catch { /* cancelou */ } }
  window.open(`https://wa.me/?text=${encodeURIComponent(texto)}`, '_blank');
});
$('#btnAddAmigo').addEventListener('click', async () => {
  const c = $('#codigoAmigo').value.trim().toUpperCase();
  if (c.length !== 6) { aviso('O código tem 6 letras/números', 'alerta', 1800); return; }
  try {
    const nome = await Conta.adicionarAmigo(c);
    $('#codigoAmigo').value = '';
    aviso(`👥 Agora você e ${nome} são amigos!`, 'km', 2600);
    carregarAmigos(); if (filtroRanking.amigos) carregarRanking();
  } catch (e) { aviso(/não encontrado/.test(e.message) ? 'Código não encontrado' : /seu código/.test(e.message) ? 'Esse é o seu código 😄' : e.message, 'alerta', 2200); }
});
Conta.aoMudarLogin((u) => { if (u) entrouNaConta(u); else { usuario = null; mostrarConta(); } });
Conta.usuarioAtual().then((u) => entrouNaConta(u));
if (Conta.PREVIA) { // prévia da Vercel: aviso fixo de que nada é gravado (em produção este bloco nem entra no build)
  const selo = document.createElement('div');
  selo.textContent = 'PRÉVIA DE TESTE · nada é gravado na conta';
  selo.style.cssText = 'position:fixed;left:50%;bottom:4px;transform:translateX(-50%);z-index:9999;pointer-events:none;font:600 10px/1.4 system-ui,sans-serif;color:#fff;background:#c0392bcc;padding:2px 8px;border-radius:8px';
  document.body.appendChild(selo);
}
$('#btnGoogle').addEventListener('click', () => Conta.entrarComGoogle().catch((e) => aviso(`Não foi possível entrar: ${e.message}`, 'alerta', 3000)));
$('#btnSairConta').addEventListener('click', async () => { await Conta.sair(); usuario = null; mostrarConta(); });
$('#btnStravaBuscar').addEventListener('click', async (ev) => {
  const b = ev.currentTarget; b.disabled = true; b.textContent = '🔄 Buscando…';
  await sincronizarStrava(true, true);
  b.disabled = false; b.textContent = '🔄 Buscar atividades';
});
$('#btnStravaLista').addEventListener('click', () => { if ($('#stravaLista').hidden) listarStrava(); else $('#stravaLista').hidden = true; });
$('#btnStrava').addEventListener('click', () => Conta.irParaStrava().catch((e) => aviso(e.message, 'alerta', 3000)));
$('#btnStravaSair').addEventListener('click', async () => { try { await Conta.stravaDesconectar(); stravaConectado = false; mostrarStrava(); } catch (e) { aviso(e.message, 'alerta', 2500); } });
// situação de hoje, já com a perda de forma de quem ficou parado
const formaAtual = () => P.xpComDestreino(perfil.xp, perfil.ultimaCorrida);
function paceDoPerfil() { return P.situacao(formaAtual().xp).pace; }

function mostrarPerfil() {
  const forma = formaAtual(), st = P.situacao(forma.xp);
  $('#chipNivel').textContent = st.rotulo;
  $('#perfilPace').textContent = R.formatarPace(R.mps(st.pace));
  $('#perfilBarra').style.width = `${Math.round(st.progresso * 100)}%`;
  $('#perfilXP').textContent = st.completo ? 'Nível máximo!' : `${st.xpNoDegrau} / ${st.xpDoDegrau} XP`;
  $('#perfilProximo').textContent = st.completo ? 'nível máximo' : `próximo nível ${R.formatarPace(R.mps(st.proximo?.pace || st.pace))}`;
  $('#perfilMoves').textContent = perfil.moves;
  const aviso = $('#perfilAviso');
  aviso.hidden = !(forma.dias > P.DIAS_SEM_PERDA - 1);
  if (forma.perdido > 0) aviso.textContent = `${forma.dias} dias sem correr: você perdeu ${forma.perdido} XP de forma. Corra para recuperar!`;
  else if (forma.dias >= P.DIAS_SEM_PERDA) aviso.textContent = 'Amanhã você começa a perder a forma. Corra hoje!';
}

function mostrarEvolucao(metros, concluiu) {
  const el = $('#fimEvolucao');
  if (metros < 50) { el.hidden = true; return; }
  const r = P.registrarCorrida(perfil, {
    metros, prova: prova ? prova.rotulo : null, concluiu, penalidades: estado.penal, tropecos: estado.tropecos,
    copos: prova ? postos.length : 0, coposPegos: estado.coposPegos, agua: estado.agua,
    premios: estado.resultado && prova ? PL.premioColocacao(estado.resultado, prova.rotulo) : [],
    clima: estado.clima ? { nome: estado.clima.nome, emoji: estado.clima.emoji, bonus: CL.bonusClima(estado.clima) } : null
  });
  perfil = r.perfil;
  salvarPerfil();
  const extras = entregarPremios();
  if (prova && concluiu && estado.resultado?.geral <= 3) {
    const m = MD.registrarMedalha(perfil, prova.rotulo, estado.resultado.geral);
    perfil = m.perfil; salvarPerfil(); vestirAtleta();
    extras.push(...m.linhas);
  }
  if (prova && concluiu) {
    const c = L.conquistasDaProva(perfil, prova.rotulo);
    perfil = c.perfil; salvarPerfil();
    for (const id of c.novas) extras.push(`🏅 Conquista: ${L.item(id).nome}`);
  }
  const linhas = r.ganho.itens.map((i) => `<li><span>${i.rotulo}</span><b>+${i.xp} XP</b></li>`);
  for (const t of extras) linhas.push(`<li><span>${t}</span></li>`);
  for (const m of r.ganho.missoes) if (!m.ok) linhas.push(`<li class="falhou"><span>Missão: ${m.nome}</span><b>✗</b></li>`);
  const pace = (st) => `${R.formatarPace(R.mps(st.pace))}/km`;
  const sobe = r.subiuNivel ? `🎉 Novo nível: ${r.depois.rotulo}! Agora você corre a ${pace(r.depois)}`
    : r.subiuDegrau ? `⬆️ Subiu para ${r.depois.rotulo}: ${pace(r.depois)}` : '';
  el.innerHTML = `${sobe ? `<div class="sobe">${sobe}</div>` : ''}<ul>${linhas.join('')}</ul>
    <div class="total"><span>Total</span><span>+${r.ganho.xp} XP · +${r.ganho.moves} Move$</span></div>
    <small>${r.depois.rotulo} · ${r.depois.completo ? 'nível máximo' : `${r.depois.xpNoDegrau}/${r.depois.xpDoDegrau} XP para ${pace({ pace: r.depois.proximo.pace })}`}</small>`;
  el.hidden = false;
}

// ─── TREINO DO DIA ─────────────────────────────────────────────────────────────
const fmtPace = (seg) => `${R.formatarPace(R.mps(seg))}/km`;

function mostrarTreinoDoDia() {
  const forma = formaAtual(), st = P.situacao(forma.xp), hoje = TR.diaLocal();
  const gratis = TR.treinoGratisDisponivel(perfil);
  $('#tileTreinoBadge').hidden = !gratis;
  const feitos = perfil.treinosHoje?.dia === hoje ? perfil.treinosHoje.n : 0;
  const t = TR.prescrever(st.nivel, hoje, feitos);
  $('#treinoNome').textContent = t.nome;
  const xpT = TR.xpTreino(st.indice);
  $('#treinoInfo').textContent = `${TR.LOCAIS[t.local]} · ${t.detalhe} · +${xpT} XP`;
  // deixa claro o que o treino faz: cada um aproxima o próximo degrau de pace
  const faltaXp = Math.max(0, st.xpDoDegrau - st.xpNoDegrau), nTreinos = Math.max(1, Math.ceil(faltaXp / xpT));
  $('#treinoPace').textContent = st.completo ? '📈 Você está no pace máximo: treinar mantém a forma.'
    : `📈 Cada treino melhora seu pace: ${nTreinos === 1 ? 'mais 1 treino' : `mais ${nTreinos} treinos`} e você passa de ${fmtPace(st.pace)} para ${fmtPace(st.proximo.pace)}`;
  $('#btnTreinoDia').hidden = !gratis;
  $('#btnTreinoDia').textContent = 'Fazer treino grátis';
  // comprar fica sempre à vista: com o grátis ainda disponível, é um treino extra
  const comprar = $('#btnComprarTreino'), temMoves = perfil.moves >= TR.PRECO_TREINO;
  comprar.hidden = false;
  comprar.disabled = !temMoves;
  // com saldo, comprar é a ação principal (amarelo) quando o grátis já foi feito; senão fica como secundário
  comprar.classList.toggle('secundario', gratis || !temMoves);
  comprar.textContent = temMoves
    ? `${gratis ? 'Treino extra' : 'Comprar treino'} · ${TR.PRECO_TREINO} Move$`
    : `${gratis ? 'Treino extra' : 'Próximo grátis à meia-noite'} · faltam ${TR.PRECO_TREINO - perfil.moves} Move$`;
  const seq = perfil.ultimoDiaTreino && (perfil.ultimoDiaTreino === hoje || perfil.ultimoDiaTreino === TR.diaLocal(Date.now() - 86400000)) ? perfil.sequencia || 0 : 0;
  const prox = Object.keys(TR.BONUS_SEQUENCIA).map(Number).find((d) => d > seq);
  $('#treinoSeq').textContent = `🔥 ${seq} ${seq === 1 ? 'dia seguido' : 'dias seguidos'}${prox ? ` · bônus de ${TR.BONUS_SEQUENCIA[prox]} Move$ com ${prox} dias` : ''}`;
}

function fazerTreino(comprado) {
  // a perda de forma vale antes de treinar
  perfil = { ...perfil, xp: formaAtual().xp };
  const r = TR.executarTreino(perfil, { comprado });
  if (r.erro) { mostrarTreinoDoDia(); return; }
  perfil = r.perfil;
  salvarPerfil();
  const premios = entregarPremios();
  const el = $('#resultadoTreino');
  el.innerHTML = `<div class="executando"><span>${TR.LOCAIS[r.treino.local]}</span><b>Executando: ${r.treino.nome}…</b><span class="barra"><i></i></span></div>`;
  $('#btnTreinoOk').hidden = true;
  mostrar('telaTreino');
  requestAnimationFrame(() => requestAnimationFrame(() => { el.querySelector('.barra i').style.width = '100%'; }));
  setTimeout(() => {
    const st = r.depois;
    const sobe = r.subiuNivel ? `🎉 Novo nível: ${st.rotulo}! Agora você corre a ${fmtPace(st.pace)}`
      : r.subiuDegrau ? `⬆️ Subiu para ${st.rotulo}: ${fmtPace(st.pace)}` : '';
    el.innerHTML = `
      <span class="local">${TR.LOCAIS[r.treino.local]}${r.comprado ? ' · treino comprado' : ' · treino do dia'}</span>
      <h2>✅ ${r.treino.nome}</h2>
      <span class="detalhe">${r.treino.detalhe}</span>
      <div class="bloco"><small>Pace executado</small><span class="grande">${fmtPace(r.paceExecutado)}</span></div>
      <div class="bloco"><small>Para que serve</small><span>${r.treino.serve}</span></div>
      <div class="bloco"><small>Evolução</small>
        ${sobe ? `<span class="sobe">${sobe}</span>` : ''}
        <span>+${r.xp} XP · ${st.rotulo} (${fmtPace(st.pace)})</span>
        <span class="barra xp"><i style="width:${Math.round(st.progresso * 100)}%"></i></span>
        <span>${st.completo ? 'Nível máximo!' : `${st.xpNoDegrau}/${st.xpDoDegrau} XP para ${fmtPace(st.proximo.pace)}`}</span>
        ${premios.map((t) => `<span class="sobe">${t}</span>`).join('')}
        <span>🔥 ${r.sequencia} ${r.sequencia === 1 ? 'dia seguido' : 'dias seguidos'}${r.bonus ? ` · bônus +${r.bonus} Move$!` : ''}${r.comprado ? ` · −${TR.PRECO_TREINO} Move$` : ''}</span>
      </div>`;
    $('#btnTreinoOk').hidden = false;
  }, 1700);
}

// ─── LOJA, VESTIÁRIO E PRÊMIOS ─────────────────────────────────────────────────
let abaLoja = 'equip';
const moedaImg = '<img src="/icones/moeda.webp" alt="">';

// prêmios dos níveis alcançados; devolve as linhas para mostrar ao jogador
function entregarPremios() {
  const r = L.receberPremios(perfil);
  if (!r.novos.length) return [];
  perfil = r.perfil; salvarPerfil(); vestirAtleta();
  return r.novos.map((n) => `🎁 Prêmio de nível: ${L.item(n.id).nome}${n.reembolso ? ` (seus ${n.reembolso} Move$ voltaram)` : ''}`);
}

function abrirLoja(cat = abaLoja) {
  abaLoja = cat;
  for (const b of document.querySelectorAll('.aba')) b.classList.toggle('ativa', b.dataset.cat === cat);
  $('#lojaSaldo').textContent = perfil.moves;
  if (cat === 'personagem') {
    // por enquanto (fase de testes) todos os personagens são livres
    if (!IDS_PERSONAGENS.includes(idVitrine)) idVitrine = perfil.personagem || 'portal';
    $('#lojaItens').innerHTML = `<div class="vitrine">
      <div class="vitrine-palco" id="vitrinePalco">
        <button class="vitrine-seta esq" data-passo="-1" aria-label="Personagem anterior">‹</button>
        <button class="vitrine-seta dir" data-passo="1" aria-label="Próximo personagem">›</button>
        <span class="vitrine-dica">↔ arraste para girar</span>
      </div>
      <div class="vitrine-pontos" id="vitrinePontos"></div>
      <b class="vitrine-nome" id="vitrineNome"></b>
      <small class="vitrine-desc" id="vitrineDesc"></small>
      <div id="vitrineBotao"></div>
    </div>`;
    mostrar('telaLoja');
    vitrine ||= criarVitrine({ loader: gltfLoader, preparar: prepararMalhaAtleta, personagens: PERSONAGENS });
    $('#vitrinePalco').prepend(vitrine.canvas);
    vitrine.ligar();
    mostrarNaVitrine();
    return;
  }
  vitrine?.desligar();
  const nivelNome = (n) => L.NOMES_NIVEL[n];
  const mochila = perfil.consumiveis || {};
  $('#lojaItens').innerHTML = (cat === 'conquista' ? painelMedalhas() : '') + L.ITENS.filter((it) => it.cat === cat).map((it) => {
    const est = L.estadoItem(perfil, it.id);
    let botao;
    if (est === 'usando') botao = `<button class="usando" data-acao="equipar" data-id="${it.id}">Usando ✓</button>`;
    else if (est === 'tenho') botao = `<button class="neutro" data-acao="equipar" data-id="${it.id}">Usar</button>`;
    else if (est === 'comprar') botao = `<button data-acao="comprar" data-id="${it.id}">${moedaImg}${it.preco}</button>`;
    else if (est === 'sem-moves') botao = `<button disabled>${moedaImg}${it.preco}</button>`;
    else if (est === 'nivel') botao = `<button class="neutro" disabled>🔒 ${nivelNome(it.nivelMin)}</button>`;
    else if (est === 'premio') botao = `<button class="neutro" disabled>${it.premioMedalhas ? `🏅 ${it.premioMedalhas} medalhas` : `🎁 Prêmio do ${nivelNome(it.premioNivel)}`}</button>`;
    else if (est === 'conquistado') botao = `<button class="usando" disabled>🏅 Conquistada</button>`;
    else botao = `<button class="neutro" disabled>🔒 Ainda não</button>`;
    const tag = it.cat === 'consumivel' && (it.consumo.gel ? mochila.gel : mochila.isotonico)
      ? `<span class="tag">Na mochila: ${it.consumo.gel ? `${mochila.gel} ${mochila.gel > 1 ? 'géis' : 'gel'}` : `${mochila.isotonico} isotônico`}</span>` : '';
    return `<div class="item ${est === 'bloqueado' ? 'bloqueado' : ''}"><img src="/icones/${it.icone || it.id}.webp" alt="" loading="lazy"${it.dourado ? ' class="dourado"' : ''}><b>${it.nome}</b><small>${it.desc}</small>${tag}${botao}</div>`;
  }).join('');
  mostrar('telaLoja');
}

// coleção de medalhas de pódio: estoque, por distância, próximo marco e troca por Move$
function painelMedalhas() {
  const e = MD.estoque(perfil), ganhas = perfil.medalhasGanhas || 0, prox = (Math.floor(ganhas / 5) + 1) * 5;
  const porDist = Object.entries(perfil.medalhas || {}).map(([rot, m]) => `${rot}: ${MD.TIPOS.map((t) => `${MD.EMOJI[t]}${m[t] || 0}`).join(' ')}`).join(' · ');
  const proxItem = Object.entries(MD.ITENS_COLECAO).find(([n]) => Number(n) > ganhas);
  return `<div class="medalhas">
    <b>🏅 Medalhas de pódio</b>
    <div class="estoque">${MD.TIPOS.map((t) => `<span>${MD.EMOJI[t]} ${e[t]}</span>`).join('')}</div>
    <small>${porDist || 'Termine uma prova entre os 3 primeiros para ganhar sua primeira medalha.'}</small>
    <small>${ganhas} ganhas · a cada 5: Move$ e kit${proxItem ? ` · com ${proxItem[0]}: ${L.item(proxItem[1]).nome}` : ''} · faltam ${prox - ganhas} para o próximo marco</small>
    <div class="trocas">${MD.TIPOS.slice().reverse().map((t) => `<button data-acao="trocar" data-tipo="${t}" ${e[t] < 5 ? 'disabled' : ''}>5 ${MD.EMOJI[t]} → ${MD.TROCA[t]} M$</button>`).join('')}</div>
  </div>`;
}

// vitrine de personagens: um de cada vez, no centro, com setas dos lados
const IDS_PERSONAGENS = Object.keys(PERSONAGENS);
let idVitrine = null;
function mostrarNaVitrine() {
  const p = PERSONAGENS[idVitrine], i = IDS_PERSONAGENS.indexOf(idVitrine), atual = perfil.personagem || 'portal';
  $('#vitrineNome').textContent = `${p.emoji} ${p.nome}`;
  $('#vitrineDesc').textContent = p.desc;
  $('#vitrinePontos').innerHTML = IDS_PERSONAGENS.map((id, k) => `<i class="${k === i ? 'ativo' : ''}${id === atual ? ' meu' : ''}"></i>`).join('');
  $('#vitrineBotao').innerHTML = idVitrine === atual
    ? '<button class="usando" disabled>Jogando com ele ✓</button>'
    : `<button data-acao="personagem" data-id="${idVitrine}">Escolher este</button>`;
  vitrine.mostrar(idVitrine);
  // já busca os vizinhos para a troca ser rápida
  for (const d of [-1, 1]) vitrine.preCarregar(IDS_PERSONAGENS[(i + d + IDS_PERSONAGENS.length) % IDS_PERSONAGENS.length]);
}
$('#lojaItens').addEventListener('click', (e) => {
  const seta = e.target.closest('.vitrine-seta');
  if (seta) {
    const n = IDS_PERSONAGENS.length, i = IDS_PERSONAGENS.indexOf(idVitrine);
    idVitrine = IDS_PERSONAGENS[(i + Number(seta.dataset.passo) + n) % n];
    mostrarNaVitrine();
    return;
  }
  const b = e.target.closest('button[data-acao]');
  if (!b) return;
  const id = b.dataset.id;
  if (b.dataset.acao === 'trocar') {
    const r = MD.trocarMedalhas(perfil, b.dataset.tipo);
    if (r.erro) return;
    perfil = r.perfil; salvarPerfil();
    aviso(`💰 Trocou 5 medalhas de ${b.dataset.tipo} por ${MD.TROCA[b.dataset.tipo]} Move$`, 'km', 2200);
    abrirLoja('conquista');
    return;
  }
  if (b.dataset.acao === 'personagem') {
    perfil = { ...perfil, personagem: id }; salvarPerfil();
    carregarAtleta(corredor, id).catch((err) => console.error('personagem', err));
    mostrarNaVitrine();
    return;
  }
  if (b.dataset.acao === 'comprar') {
    const r = L.comprar(perfil, id);
    if (r.erro) return;
    perfil = r.perfil;
  } else perfil = L.equipar(perfil, id);
  salvarPerfil(); vestirAtleta(); abrirLoja();
});
for (const b of document.querySelectorAll('.aba')) b.addEventListener('click', () => abrirLoja(b.dataset.cat));

// ─── ACESSÓRIOS NO CORREDOR 3D ─────────────────────────────────────────────────
// posição em frações da altura do corredor (x direita, y cima, z frente do modelo), giro em graus, tam = maior medida
const ACESSORIOS_3D = {
  bone: [{ osso: 'Head', pos: [0, 0.128, 0.03], rot: [-10, 0, 0], tam: 0.135 }],
  viseira: [{ osso: 'Head', pos: [0, 0.118, 0.04], rot: [-10, 0, 0], tam: 0.125 }],
  // bandana feita no código (faixa justa + nó atrás); tam = profundidade da faixa, largura = proporção lado/frente
  bandana: [{ osso: 'Head', pos: [0, 0.095, 0.015], rot: [-8, 0, 0], tam: 0.13, largura: 0.78 }],
  oculos: [{ osso: 'Head', pos: [0, 0.088, 0.066], rot: [0, -90, 0], tam: 0.088 }],
  get 'oculos-dourado'() { return this.oculos; },
  get 'viseira-dourada'() { return this.viseira; },
  relogio: [{ osso: 'LeftHand', pos: [0, -0.015, 0], rot: [90, 0, 0], tam: 0.05 }],
  pochete: [{ osso: 'Hips', pos: [0, -0.01, 0.02], rot: [0, -90, 0], tam: 0.21 }],
  'tenis-carbono': [{ osso: 'LeftFoot', pos: [0, 0.03, 0], rot: [-90, 0, 0], tam: 0.155 }, { osso: 'RightFoot', pos: [0, 0.03, 0], rot: [-90, 0, 0], tam: 0.155 }],
  'tenis-dourado': [{ osso: 'LeftFoot', pos: [0, 0.03, 0], rot: [-90, 0, 0], tam: 0.155 }, { osso: 'RightFoot', pos: [0, 0.03, 0], rot: [-90, 0, 0], tam: 0.155 }]
};
const cacheAcessorios = new Map();
const DOURADOS = { 'viseira-dourada': 'viseira', 'oculos-dourado': 'oculos' };
function carregarAcessorio(id) {
  if (!cacheAcessorios.has(id)) {
    cacheAcessorios.set(id, gltfLoader.loadAsync(`/modelos/acessorios/${DOURADOS[id] || id}.glb`).then((g) => {
      const m = g.scene;
      if (DOURADOS[id]) m.traverse((o) => { if (o.isMesh) o.material = new THREE.MeshStandardMaterial({ color: 0xffc83d, metalness: 0.85, roughness: 0.28, map: o.material.map || null }); });
      m.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(m, true), tam = box.getSize(new THREE.Vector3());
      m.position.sub(box.getCenter(new THREE.Vector3()));
      const unidade = new THREE.Group(); unidade.add(m);
      unidade.scale.setScalar(1 / Math.max(tam.x, tam.y, tam.z, 1e-6));
      m.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; } });
      return unidade;
    }).catch(() => null));
  }
  return cacheAcessorios.get(id);
}

// cada personagem tem a cabeça num ponto diferente do osso: desloca o que vai na cabeça
function ajustarNaCabeca(cfg, id, aj) {
  if (!aj || cfg.osso !== 'Head') return cfg;
  const chave = aj[id] ? id : DOURADOS[id];
  if (aj[chave]) return { ...cfg, ...aj[chave] };
  return { ...cfg, pos: [cfg.pos[0] + aj.dx, cfg.pos[1] + aj.dy, cfg.pos[2] + aj.dz], rot: [cfg.rot[0] + aj.rx, cfg.rot[1], cfg.rot[2]], tam: cfg.tam * aj.esc };
}
let versaoVestir = 0;
async function vestirAtleta() {
  const a = corredor.atleta;
  if (!a || !Object.keys(a.partes).length) return;
  const versao = ++versaoVestir;
  const ids = Object.values(perfil.usando || {}).filter((id) => ACESSORIOS_3D[id]);
  const modelos = await Promise.all(ids.map((id) => (id === 'bandana' ? true : carregarAcessorio(id))));
  if (versao !== versaoVestir) return;
  const v = new THREE.Vector3(), q = new THREE.Quaternion();
  // personagem de arquivo único: as partes dividem o mesmo boneco, veste uma vez só
  const partes = [...new Map(Object.values(a.partes).map((p) => [p.model, p])).values()];
  for (const parte of partes) {
    for (const o of parte.acessorios || []) o.parent?.remove(o);
    parte.acessorios = [];
    // cada acessório fica no sistema de eixos do osso (y ao longo do osso), compensando a escala do osso
    parte.model.updateMatrixWorld(true);
    const escModelo = parte.model.getWorldScale(new THREE.Vector3()).x;
    const ajuste = PERSONAGENS[a.id]?.cabeca;
    ids.forEach((id, k) => {
      if (!modelos[k]) return;
      for (const cfg0 of ACESSORIOS_3D[id]) {
        const cfg = ajustarNaCabeca(cfg0, id, ajuste);
        const osso = parte.model.getObjectByName(cfg.osso);
        if (!osso) continue;
        const u = parte.h * escModelo / osso.getWorldScale(v).x; // 1 altura do corredor em unidades do osso
        q.setFromEuler(new THREE.Euler(...cfg.rot.map((g) => (g * Math.PI) / 180)));
        const local = new THREE.Matrix4().compose(new THREE.Vector3(...cfg.pos).multiplyScalar(u), q, new THREE.Vector3(1, 1, 1).multiplyScalar(cfg.tam * u));
        const obj = id === 'bandana' ? criarBandana({ largura: cfg.largura }) : modelos[k].clone();
        const casca = new THREE.Group();
        casca.matrixAutoUpdate = false;
        casca.matrix.copy(local);
        casca.add(obj);
        osso.add(casca);
        parte.acessorios.push(casca);
      }
    });
  }
}

// tela inicial: painéis (provas, treino do dia, conta, ajuda) abrem por cima da home, sem rolar a página
function abrirPainel(nome) {
  const t = $('#telaInicio');
  if (nome) t.dataset.painel = nome; else delete t.dataset.painel;
  t.scrollTop = 0;
  if (nome) vitrine?.desligar(); else mostrarHeroi();
}
// tela inicial: o personagem escolhido aparece em 3D, correndo no lugar (arrastar gira)
function mostrarHeroi() {
  if ($('#telaInicio').hidden) return;
  vitrine ||= criarVitrine({ loader: gltfLoader, preparar: prepararMalhaAtleta, personagens: PERSONAGENS });
  if (vitrine.canvas.parentElement !== $('#homePalco')) $('#homePalco').append(vitrine.canvas);
  vitrine.mostrar(PERSONAGENS[perfil.personagem] ? perfil.personagem : 'portal', { anim: 'correr', angulo: 0.75 });
  vitrine.ligar();
}
$('#btnJogar').addEventListener('click', () => abrirPainel('provas'));
$('#btnTileTreino').addEventListener('click', () => abrirPainel('treino'));
$('#btnTileConta').addEventListener('click', () => abrirPainel('conta'));
$('#btnContaChip').addEventListener('click', () => abrirPainel('conta'));
$('#btnTileAjuda').addEventListener('click', () => abrirPainel('ajuda'));
$('#btnPainelVoltar').addEventListener('click', () => abrirPainel(null));
$('#btnPersonagem').addEventListener('click', () => abrirLoja('personagem'));

function mostrarInicio() {
  abrirPainel(null);
  estado.clima = null; aplicarClima(null); // tela inicial com o céu de sempre
  pelotao = []; estado.posicao = null;
  sincronizarStrava();
  entregarPremios(); // quem já tinha subido de nível antes da loja existir também ganha
  mostrarPerfil();
  mostrarTreinoDoDia();
  estado.modo = 'inicio';
  prepararPercurso({ tipo: 'treino' });
  const p = emEst(0);
  Object.assign(estado, { x: p.x, z: p.z, ang: p.ang, camAng: p.ang, s: 0, sMax: 0, d: 0, y: 0 });
  const rec = lerRecorde('mapmove-recorde');
  // recorde do treino de reta num selo sobre o atalho (some enquanto não houver recorde)
  $('#recordeTreino').hidden = !rec;
  if (rec) $('#recordeTreino').innerHTML = `<svg><use href="#i-estrela"/></svg>${rec.toLocaleString('pt-BR')}`;
  hud.contagem.hidden = true;
  mostrar('telaInicio');
  mostrarHeroi();
}

$('#btnTreino').addEventListener('click', () => abrirClima({ tipo: 'treino' }));
$('#btnDeNovo').addEventListener('click', () => abrirClima());
$('#btnTrocar').addEventListener('click', mostrarInicio);
$('#btnSair').addEventListener('click', mostrarInicio);
$('#btnPausa').addEventListener('click', pausar);
iconeSom();
$('#btnMusica').addEventListener('pointerdown', (e) => { e.stopPropagation(); e.preventDefault(); alternarMusica(); });
$('#btnTrocar').addEventListener('click', () => { tocarMusica(false); som.pararLoops(); });
$('#btnSair').addEventListener('click', () => { tocarMusica(false); som.pararLoops(); som.pausar(false); });
$('#btnContinuar').addEventListener('click', continuar);
$('#btnRecomecar').addEventListener('click', () => abrirClima());
$('#btnTreinoDia').addEventListener('click', () => fazerTreino(false));
$('#btnComprarTreino').addEventListener('click', () => fazerTreino(true));
$('#btnTreinoOk').addEventListener('click', mostrarInicio);
$('#btnLoja').addEventListener('click', () => abrirLoja());
$('#btnLojaVoltar').addEventListener('click', mostrarInicio);
document.addEventListener('visibilitychange', () => { if (document.hidden) pausar(); });

aplicarQualidade(nivel);
mostrarInicio();
carregarAtleta(corredor, perfil.personagem).catch((e) => console.error('atleta 3D', e));
for (const nome of Object.keys(PROPS)) carregarProp(nome).catch(() => { /* sem o arquivo, fica o desenho de blocos */ });
carregarProva();
loop();

// ganchos para testes automatizados
window.__jogo = { L, vestirAtleta, abrirLoja, ACESSORIOS_3D, corredor, camera, perfil: () => perfil, P, TR, fazerTreino, definirPerfil: (p) => { perfil = p; salvarPerfil(); mostrarInicio(); }, criar: { cone, barreira, cachorro }, osm: () => osm, zonas: () => zonas, chunks: () => chunksArvores.length, qualidade: () => NIVEIS[nivel].nome, aplicarQualidade, atleta: () => corredor.atleta, estado, entidades: () => entidades, postos: () => postos, travessas: () => travessas, placas: () => placas, semaforos: () => semaforos, atualizarPlacas, passo, acao, iniciar, dados: () => dadosProva, pista: () => pista, info: renderer.info, controles };

// voltou para o jogo (ex.: depois de abrir o Strava): busca corridas novas
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && estado.modo === 'inicio') sincronizarStrava(); });
