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
import { clone as clonarComOssos } from 'three/addons/utils/SkeletonUtils.js';
import { prepararOSM, zonasDoPercurso, zonaEm, areaEm, pontoNoPoligono, placasDoPercurso, abreviarRua } from './osm.js';

const SUPABASE_URL = 'https://ssfsxdmzbubvygctdjgf.supabase.co';
const SUPABASE_KEY = 'sb_publishable_s2yoUApfYl_ZvSUkqYYrVw_uXwKsybM';
const PROVA_SLUG = '1-meia-maratona-de-indaiatuba-2026-12-13';

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

// asfalto de 8 m de largura por 8 m de comprimento por repetição
const texAsfalto = textura(512, 512, (g, w, h) => {
  g.fillStyle = '#4a4e55'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 6; i++) {
    g.fillStyle = `rgba(${Math.random() < 0.5 ? '30,32,36' : '95,98,104'},0.35)`;
    g.fillRect(Math.random() * w, Math.random() * h, 40 + Math.random() * 120, 30 + Math.random() * 90);
  }
  for (let i = 0; i < 4000; i++) {
    const c = 55 + Math.random() * 50;
    g.fillStyle = `rgba(${c},${c},${c + 6},0.5)`;
    g.fillRect(Math.random() * w, Math.random() * h, 2, 2);
  }
  const px = (x) => ((x + 4) / 8) * w;
  g.fillStyle = '#1e88ff';
  for (const x of [-3.6, 3.6]) g.fillRect(px(x) - 7, 0, 14, h);
  g.fillStyle = 'rgba(255,255,255,0.85)';
  for (let y = 0; y < h; y += 256) g.fillRect(px(0) - 5, y + 30, 10, 140);
});

const texCalcada = textura(256, 256, (g, w, h) => {
  g.fillStyle = '#d9d4c7'; g.fillRect(0, 0, w, h);
  g.strokeStyle = '#2b2b2b';
  g.lineWidth = 14;
  for (let y = -64; y < h + 64; y += 64) {
    g.beginPath();
    for (let x = 0; x <= w; x += 8) g.lineTo(x, y + Math.sin((x / w) * Math.PI * 2) * 20);
    g.stroke();
  }
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
  if (geos.length) { const m = new THREE.Mesh(mergeGeometries(geos), matVertice); m.castShadow = true; novo.add(m); }
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
    cabeca: { dx: -0.006, dy: -0.034, dz: -0.018, rx: -4, esc: 0.93, oculos: { pos: [-0.006, 0.046, 0.048], tam: 0.08 }, bandana: { pos: [-0.006, 0.066, 0.004], rot: [-12, -90, 0], tam: 0.108 } }, desc: 'Feita no Meshy: aquece com polichinelos e pula os carros com rolamento.', emoji: '🏃🏾‍♀️',
    // um arquivo com várias animações: estado do jogo → nome da animação no arquivo
    arquivo: 'corredora.glb', clipes: { caminhar: 'Walking', correr: 'Run_02', parado: 'jumping_jacks', aquecer: 'jumping_jacks', comemorar: 'Cheer_with_Both_Hands_Up', pular: 'Run_Jump_and_Roll' } },
  maratonista: { nome: 'Maratonista',
    cabeca: { dx: 0, dy: -0.028, dz: -0.014, rx: -4, esc: 0.96, oculos: { pos: [0, 0.056, 0.05], tam: 0.085 }, bandana: { pos: [0, 0.07, 0.006], rot: [-12, -90, 0], tam: 0.112 } }, desc: 'Feito no Meshy a partir das fichas de 3 vistas.', emoji: '🏃🏾',
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
  // mesa e cavalete vão pela altura real; o comprimento sai da proporção do modelo
  mesa: { arquivo: 'mesa-agua.glb', altura: 1.0, eixo: 'z', giro: 0 },
  barreira: { arquivo: 'barreira.glb', altura: 1.12, eixo: 'x', giro: 0 },
  // cenário de parque
  ipe: { arquivo: 'ipe2.glb', altura: 6.5 },
  placa: { arquivo: 'placa.glb', altura: 4.2 },
  arvoreGrande: { arquivo: 'arvore.glb', altura: 8 },
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
};

async function carregarProp(nome) {
  const cfg = PROPS[nome];
  const gltf = await gltfLoader.loadAsync(`/modelos/${cfg.arquivo}`);
  const model = gltf.scene;
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
function emEst(s) {
  if (s >= 0 && s <= pista.total) return pista.em(s);
  const ref = s < 0 ? 0 : pista.total;
  const p = pista.em(ref);
  const [fx, fz] = frente(p.ang);
  return { ...p, x: p.x + fx * (s - ref), z: p.z + fz * (s - ref) };
}

const corInclinacao = (inc, out) => {
  if (inc > 0.01) { const f = Math.min(1, (inc - 0.01) / 0.06); out.setRGB(1, 1 - f * 0.48, 1 - f * 0.6); }
  else if (inc < -0.01) { const f = Math.min(1, (-inc - 0.01) / 0.06); out.setRGB(1 - f * 0.5, 1 - f * 0.25, 1); }
  else out.setRGB(1, 1, 1);
  return out;
};

function fita(amostras, d0, d1, material, { vCada = 8, dy = 0, inclinacao = false } = {}) {
  const n = amostras.length;
  const pos = new Float32Array(n * 2 * 3), uv = new Float32Array(n * 2 * 2), cor = inclinacao ? new Float32Array(n * 2 * 3) : null;
  const c = new THREE.Color();
  for (let i = 0; i < n; i++) {
    const a = amostras[i];
    const prev = amostras[Math.max(0, i - 1)], next = amostras[Math.min(n - 1, i + 1)];
    const ang = Math.atan2(next.x - prev.x, -(next.z - prev.z));
    const [rx, rz] = direita(ang);
    for (let k = 0; k < 2; k++) {
      const d = k === 0 ? d0 : d1, j = (i * 2 + k);
      pos[j * 3] = a.x + rx * d; pos[j * 3 + 1] = a.y + dy; pos[j * 3 + 2] = a.z + rz * d;
      uv[j * 2] = k; uv[j * 2 + 1] = a.s / vCada;
      if (cor) { corInclinacao(a.inclinacao, c); cor[j * 3] = c.r; cor[j * 3 + 1] = c.g; cor[j * 3 + 2] = c.b; }
    }
  }
  const idx = [];
  for (let i = 0; i < n - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
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
const matRua = new THREE.MeshStandardMaterial({ map: texAsfalto, roughness: 0.95, vertexColors: true, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
const matCalcada = new THREE.MeshStandardMaterial({ map: texCalcada, roughness: 1, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
const matGrama = new THREE.MeshStandardMaterial({ map: texGrama, roughness: 1, depthWrite: false });
const texChao = texGramado.clone(); texChao.repeat.set(9000 / 9, 9000 / 9);
const matChao = new THREE.MeshStandardMaterial({ color: 0x7fc062, map: texChao, roughness: 1, depthWrite: false });
// a grama repete a textura a cada 4 m nos dois sentidos
texGrama.repeat.set(6, 1);

function construirVisual() {
  scene.remove(visual);
  visual = new THREE.Group();
  const fim = Number.isFinite(pista.total) ? pista.total + 80 : 420;
  const amostras = [];
  for (let s = -60; s <= fim; s += 4) amostras.push({ s, ...emEst(s) });
  visual.add(fita(amostras, -R.MEIA_RUA, R.MEIA_RUA, matRua, { inclinacao: true }));
  visual.add(fita(amostras, -R.LIMITE_CALCADA, -R.MEIA_RUA, matCalcada, { vCada: 4, dy: 0.06 }));
  visual.add(fita(amostras, R.MEIA_RUA, R.LIMITE_CALCADA, matCalcada, { vCada: 4, dy: 0.06 }));
  visual.userData.amostras = amostras;
  visual.userData.grama = [];
  for (const [a, b] of [[-32, -R.LIMITE_CALCADA], [R.LIMITE_CALCADA, 32]]) {
    const gr = fita(amostras, a, b, matGrama, { vCada: 4, dy: -0.04 });
    gr.renderOrder = -1;
    visual.add(gr);
    visual.userData.grama.push(gr);
  }
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

// cenário reciclado numa janela à frente do corredor
const JANELA = 300;
let cenario = [];
let areasSemArvore = []; // [x, z, raio] dos marcos da cidade: sem árvores nem enfeites em volta
let zonas = null; // zonas do percurso (parque, cidade, livre) quando há dados do OpenStreetMap
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
  item.obj.visible = !fora && !invade && !naTravessa && combina && !naFrenteDeMarco;
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

function carro(s, lado) {
  const g = new THREE.Group();
  const cor = mat(escolher([0xd9d9d9, 0xe63946, 0x1d4ed8, 0xfacc15, 0x111827]), { roughness: 0.35, metalness: 0.3 });
  const base = malha(G.caixa, cor, 0, 0.6, 0); base.scale.set(3.1, 0.7, 1.6); g.add(base);
  const cabine = malha(G.caixa, cor, -0.15, 1.2, 0); cabine.scale.set(1.7, 0.6, 1.45); g.add(cabine);
  const vidro = malha(G.caixa, mat(0x9ad0ff, { roughness: 0.1 }), -0.15, 1.22, 0); vidro.scale.set(1.72, 0.42, 1.47); g.add(vidro);
  for (const px of [-0.95, 0.95]) for (const pz of [-0.78, 0.78]) {
    const r = malha(G.cilindro, mat(0x111111), px, 0.36, pz); r.scale.set(0.36, 0.22, 0.36); r.rotation.x = Math.PI / 2; g.add(r);
  }
  const modelo = prop('carro');
  return addEntidade({ tipo: 'carro', motivo: 'Bateu no carro', obj: modelo || achatar(g), s, d: lado * 16, rot: lado > 0 ? Math.PI : 0, larg: 3.4, prof: 1.7, h: 2.2, gatilho: 55 });
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
  const tex = texTexto(texto, { w: 512, h: 96, fundo: cor, cor: corTexto, tam: 72 });
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

const matTravessa = new THREE.MeshStandardMaterial({ color: 0x6a6e76, roughness: 0.95, polygonOffset: true, polygonOffsetFactor: -5, polygonOffsetUnits: -5 });
const matZebra = new THREE.MeshBasicMaterial({ map: texFaixaPedestre, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -8, polygonOffsetUnits: -8 });
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
    const rua = planoChao(7, 34, matTravessa);
    rua.position.set(p.x + rx * lado * 21, p.y + 0.02, p.z + rz * lado * 21);
    rua.rotation.y = Math.PI / 2 - p.ang;
    const zebra = planoChao(7, 2.6, matZebra);
    zebra.position.set(p.x + rx * lado * 9.2, p.y + 0.05, p.z + rz * lado * 9.2);
    zebra.rotation.y = Math.PI / 2 - p.ang;
    t.objs.push(rua, zebra);
  }
  if (t.principal) {
    // faixa de pedestre atravessando a rua da prova, colada no asfalto
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
}

async function carregarTravessas(distancia, pistaAlvo) {
  const chave = `mapmove-travessas-v1-${PROVA_SLUG}-${distancia.rotulo}`;
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
    const ys = contorno.map(([x, z]) => alturaChao(x, z) + dy);
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
      const aqui = areaEm(osm, x, z);
      if (aqui && (aqui.tipo === 'agua' || aqui.tipo === 'esporte')) continue;
      pontos.push([x, perto.y, z]);
      plantadas++;
    }
  }
  for (const [x, z] of osm.arvores) {
    const perto = pista.pertoDe(x, z);
    if (perto.dist > 12 && !areasSemArvore.some(([ax, az, r]) => (x - ax) ** 2 + (z - az) ** 2 < r * r)) pontos.push([x, perto.y, z]);
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
    const im = new THREE.InstancedMesh(variantes[variante], matVertice, lista.length);
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
  if (amostras) for (const [a, b] of [[-13, -R.LIMITE_CALCADA], [R.LIMITE_CALCADA, 13]]) {
    const gr = fita(amostras, a, b, matGrama, { vCada: 4, dy: -0.04 });
    gr.renderOrder = -1;
    visual.add(gr);
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
  areasSemArvore = [];
  const marcos = [
    [/escultura da árvore/i, () => arvoreEspacial(), null, 13],
    [/letreiro/i, () => letreiro(), null, 13],
    [/barco da raia/i, () => barcoRaia(), 'proaContraOCorredor', 15] // marcos ficam colados na rua para o corredor ver (não é a distância real)
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
      x = q.x + (dx / d) * distRua; z = q.z + (dz / d) * distRua;
    } else if (perto.dist < 14) {
      const q = pista.em(perto.s), dx = x - q.x, dz = z - q.z, d = Math.hypot(dx, dz) || 1;
      const lado = d > 0.5 ? 1 : 1;
      x = q.x + (dx / d) * 14 * lado; z = q.z + (dz / d) * 14 * lado;
    }
    obj.position.set(x, pista.pertoDe(x, z).y - 0.05, z);
    areasSemArvore.push([x, z, distRua ? 16 : 6]); // nenhuma árvore nasce dentro do marco
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
  zonas = zonasDoPercurso(osm, pistaAlvo);
  construirOSM();
  const cruzamentos = encontrarTravessas(pistaAlvo, osm.vias).map((t) => ({ ...t, carro: false }));
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
      p.obj.visible = pista.pertoDe(p.obj.position.x, p.obj.position.z, 20).dist > R.LIMITE_CALCADA;
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
    pista = new PistaReal(escolha.distancia.percurso);
    prova = { nome: dadosProva.nome, rotulo: escolha.distancia.rotulo, total: pista.total };
  } else {
    pista = new PistaReta();
    prova = null;
  }
  definirFaixas(prova ? prova.nome : 'CORRIDA DE RUA');
  osm = null; zonas = null;
  construirVisual();
  construirOSM();
  definirTravessas([]);
  construirCenario();
  if (prova) {
    portico(6, 'LARGADA', { cor: '#1fae5b', corTexto: '#ffffff' });
    for (let km = 1; km * 1000 < pista.total - 150; km++) portico(km * 1000, `${km} KM`);
    portico(pista.total, 'CHEGADA', { cor: '#e63946', corTexto: '#ffffff' });
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
    agachado: 0, geis: 0, gelAtivo: 0, giroPend: 0, parado: 0, voltar: false, fase: 0, agua: 100, pontos: 0,
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
  agua: $('#hudAgua'), aguaTxt: $('#hudAguaTxt'), aguaBox: $('.pilula.agua'),
  relogio: $('#hudRelogio'), relogioTxt: $('#hudRelogioTxt'),
  energia: $('#hudEnergia'), energiaTxt: $('#hudEnergiaTxt'), energiaBox: $('.pilula.energia'), pontos: $('#hudPontos'),
  inc: $('#hudInc'), incTxt: $('#hudIncTxt'), penal: $('#hudPenalTxt'),
  gel: $('#btnGel'), gelQtd: $('#gelQtd'), gota: $('#btnAgua'), dica: $('#dicaGestos'), contagem: $('#contagem')
};

const mapaBase = document.createElement('canvas');
mapaBase.width = 192; mapaBase.height = 192;
let mapaEscala = null;

function desenharMapaBase() {
  const g = mapaBase.getContext('2d');
  g.clearRect(0, 0, 192, 192);
  const xs = pista.x, zs = pista.z;
  const minX = Math.min(...xs), maxX = Math.max(...xs), minZ = Math.min(...zs), maxZ = Math.max(...zs);
  const esc = 170 / Math.max(maxX - minX, maxZ - minZ, 1);
  const ox = (192 - (maxX - minX) * esc) / 2, oz = (192 - (maxZ - minZ) * esc) / 2;
  mapaEscala = (x, z) => [ox + (x - minX) * esc, oz + (z - minZ) * esc];
  g.lineWidth = 7; g.lineCap = g.lineJoin = 'round'; g.strokeStyle = 'rgba(255,255,255,0.35)';
  g.beginPath();
  for (let i = 0; i < xs.length; i += 2) { const [a, b] = mapaEscala(xs[i], zs[i]); i ? g.lineTo(a, b) : g.moveTo(a, b); }
  g.stroke();
  // postos de hidratação
  g.fillStyle = '#4fc3ff';
  for (const p of postos) { const q = pista.em(p.s); const [a, b] = mapaEscala(q.x, q.z); g.beginPath(); g.arc(a, b, 7, 0, Math.PI * 2); g.fill(); }
}

function desenharMinimapa() {
  if (!prova) return;
  const c = $('#minimapa').getContext('2d');
  c.clearRect(0, 0, 192, 192);
  c.drawImage(mapaBase, 0, 0);
  c.lineWidth = 7; c.lineCap = c.lineJoin = 'round'; c.strokeStyle = '#ffd21f';
  c.beginPath();
  const iFim = pista.indice(estado.sMax);
  for (let i = 0; i <= iFim; i += 2) { const [a, b] = mapaEscala(pista.x[i], pista.z[i]); i ? c.lineTo(a, b) : c.moveTo(a, b); }
  c.stroke();
  const [cx, cz] = mapaEscala(estado.x, estado.z);
  c.fillStyle = '#e63946'; c.strokeStyle = '#fff'; c.lineWidth = 4;
  c.beginPath(); c.arc(cx, cz, 9, 0, Math.PI * 2); c.fill(); c.stroke();

  // altimetria: subidas em laranja, descidas em azul
  const pf = $('#perfil').getContext('2d');
  pf.clearRect(0, 0, 192, 56);
  const n = 96, ys = pista.y;
  const minY = Math.min(...ys), maxY = Math.max(...ys), alt = Math.max(1, maxY - minY);
  for (let k = 0; k < n; k++) {
    const s = (k / n) * pista.total, p = pista.em(s);
    const h = 8 + ((p.y - minY) / alt) * 44;
    pf.fillStyle = p.inclinacao > 0.01 ? '#ff7a45' : p.inclinacao < -0.01 ? '#4fa3ff' : '#d8e2ee';
    pf.globalAlpha = s > estado.sMax ? 0.45 : 1;
    pf.fillRect(k * 2, 56 - h, 2, h);
  }
  pf.globalAlpha = 1;
  pf.fillStyle = '#fff';
  pf.fillRect((estado.s / pista.total) * 192 - 1.5, 0, 3, 56);
}

let hudTimer = 0;
function atualizarHud() {
  const s = estado;
  hud.km.textContent = R.formatarKm(prova ? Math.min(s.sMax, pista.total) : s.sMax);
  hud.kmTotal.textContent = prova ? `/ ${R.formatarKm(pista.total)} km` : 'km';
  hud.tempo.textContent = R.formatarTempo(s.tempoReal);
  hud.pace.textContent = R.formatarPace(s.v);
  const inc = emEst(s.s).inclinacao;
  hud.agua.style.width = `${s.agua}%`;
  hud.aguaTxt.textContent = `${Math.round(s.agua)}%`;
  hud.aguaBox.classList.toggle('baixa', s.agua < 25);
  hud.energia.style.width = `${s.energia}%`;
  hud.energiaTxt.textContent = `${Math.round(s.energia)}%`;
  hud.energiaBox.classList.toggle('baixa', s.energia < R.ENERGIA_BAIXA);
  // relógio GPS: distância até o próximo posto de água
  const proxPosto = s.relogio && prova ? postos.find((q) => q.s > s.s + 1) : null;
  hud.relogio.hidden = !proxPosto;
  if (proxPosto) hud.relogioTxt.textContent = `💧 ${Math.round((proxPosto.s - s.s) / 10) * 10} m`;
  hud.pontos.textContent = Math.floor(s.pontos).toLocaleString('pt-BR');
  const pct = Math.round(inc * 100);
  hud.inc.classList.toggle('sobe', pct >= 1);
  hud.inc.classList.toggle('desce', pct <= -1);
  hud.incTxt.textContent = pct >= 1 ? `subida ${pct}%` : pct <= -1 ? `descida ${-pct}%` : 'plano';
  hud.penal.textContent = `${s.penal}/${R.PENALIDADES_MAX}`;
  hud.gelQtd.textContent = s.geis;
  $('#btnIso').hidden = !s.isotonicos;
  $('#isoQtd').textContent = s.isotonicos;
  hud.gel.disabled = !s.geis || s.gelAtivo > 0;
  hud.gel.style.setProperty('--gel', `${(s.gelAtivo / R.GEL_DURACAO) * 360}deg`);
  hud.dica.classList.toggle('some', s.t > 7);
  desenharMinimapa();
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
  el.style.animationDuration = `${Math.max(1500, ms)}ms`;
  clearTimeout(avisoTimer);
  avisoTimer = setTimeout(() => { el.hidden = true; }, ms);
}

function mostrar(tela) {
  if (tela !== 'telaLoja') vitrine?.desligar();
  for (const id of ['telaInicio', 'telaPausa', 'telaFim', 'telaTreino', 'telaLoja']) $('#' + id).hidden = id !== tela;
  $('#hud').hidden = ['telaInicio', 'telaFim', 'telaTreino', 'telaLoja'].includes(tela);
  $('#controles').hidden = tela !== null;
}

// ─── MÚSICA DE FUNDO (as mesmas faixas do simulador de percurso do Portal) ───
const som = criarSom();
const MUSICAS = (() => { const a = ['musica-2', 'musica-3', 'musica-4']; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; })();
const musica = { el: null, faixa: 0, ligada: (() => { try { return localStorage.getItem('mapmove-musica') !== '0'; } catch { return true; } })() };
som.ligar(musica.ligada);
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
  $('#btnMusica').textContent = musica.ligada ? '🔊' : '🔇';
  som.ligar(musica.ligada);
  tocarMusica(musica.ligada && estado.modo !== 'pausa');
}

// efeitos do que está vestido e consumíveis da mochila, aplicados na largada
function aplicarEquipamento() {
  const ef = L.efeitos(perfil);
  const r = L.usarConsumiveis(perfil, { gelMax: R.GEL_MAX + ef.gelMax });
  perfil = r.perfil; salvarPerfil();
  Object.assign(estado, { fatorTenis: ef.velocidade, gelMax: R.GEL_MAX + ef.gelMax, relogio: ef.distanciaAgua, geis: r.geis, isotonicos: r.isotonicos });
  const extras = [r.geis ? `⚡ ${r.geis} ${r.geis > 1 ? 'géis' : 'gel'} no bolso` : '', r.isotonicos ? `🥤 ${r.isotonicos} ${r.isotonicos > 1 ? 'isotônicos' : 'isotônico'}` : '', ef.velocidade > 1 ? '👟 placa de carbono +3%' : ''].filter(Boolean);
  if (extras.length) setTimeout(() => aviso(extras.join(' · '), 'km', 2200), 2600);
}

function iniciar(escolha) {
  som.iniciar();
  som.pararLoops();
  som.pausar(false);
  tocarMusica(true);
  if (escolha) ultimaEscolha = escolha;
  reiniciar();
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
  $('#fimPlacar').innerHTML = [
    cel('Distância', `${R.formatarKm(dist)} km`), cel('Tempo', R.formatarTempo(s.tempoReal)),
    cel('Pace médio', paceMedio ? R.formatarPace(1000 / paceMedio) : '--:--'),
    cel('Pontos', pontos.toLocaleString('pt-BR')), cel('Penalidades', `${s.penal}/${R.PENALIDADES_MAX}`),
    cel('Água', `${Math.round(s.agua)}%`)
  ].join('');
  let rec = '';
  if (prova) {
    const chave = `mapmove-recorde-${PROVA_SLUG}-${prova.rotulo}`;
    const anterior = lerRecorde(chave);
    if (concluiu && (!anterior || s.tempoReal < anterior)) { salvarRecorde(chave, s.tempoReal); rec = '🏅 Novo recorde neste percurso!'; }
    else if (anterior) rec = `Seu recorde no ${prova.rotulo}: ${R.formatarTempo(anterior)}`;
  } else {
    const anterior = lerRecorde('mapmove-recorde') || 0;
    if (pontos > anterior) { salvarRecorde('mapmove-recorde', pontos); rec = '🏅 Novo recorde de pontos!'; }
    else rec = `Recorde do treino: ${anterior.toLocaleString('pt-BR')} pontos`;
  }
  $('#fimRecorde').textContent = rec;
  mostrarEvolucao(dist, concluiu);
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
  if (tipo === 'pular' && s.y === 0) {
    // carro da travessa logo à frente: salto alto com rolamento
    const carros = entidades.filter((e) => e.tipo === 'carro' && !e.atingido);
    if (R.carroParaSaltar(s.s, carros)) { s.vy = R.SALTO_CARRO.velocidade; s.saltoAnim = SALTO_ANIM.duracao; s.saltandoCarro = true; }
    else s.vy = R.PULO.velocidade;
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
for (const [id, tipo] of [['#btnGel', 'gel'], ['#btnIso', 'iso'], ['#btnAgua', 'agua'], ['#btnCamera', 'camera']]) {
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
  s.agua = R.desidratar(s.agua, dt);
  if (s.agua <= 0) return terminar('Desidratou! 💧');

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
    s.ang += giro * GIRO_RAD_S * dt;
    if (s.giroPend) {
      const passoGiro = Math.sign(s.giroPend) * Math.min(Math.abs(s.giroPend), GIRO_RAD_S * 1.2 * dt);
      s.ang += passoGiro; s.giroPend -= passoGiro;
    }
    // sem comando, alinha sozinho só quando já está quase reto (as esquinas são com você)
    if (Math.abs(giro) < 0.1 && Math.abs(s.giroPend) < 0.01) {
      const dif = difAngulo(p.ang, s.ang);
      if (Math.abs(dif) < 0.35) s.ang += dif * Math.min(1, 2.5 * dt);
    }
    s.gelAtivo = Math.max(0, s.gelAtivo - dt);
    s.freio = Math.max(0, (s.freio || 0) - dt);
    s.energia = R.gastarEnergia(s.energia, dt, { inclinacao: p.inclinacao, gel: s.gelAtivo > 0, sede: s.agua < 25, freando: s.freio > 0 });
    if (s.energia < R.ENERGIA_BAIXA && !s.energiaAvisada) {
      s.energiaAvisada = true;
      aviso(s.geis ? '🔋 Energia baixa! Use um gel ⚡' : '🔋 Energia baixa! Pegue um gel ⚡', 'alerta', 1800);
    }
    const alvo = R.velocidadeAlvo({ gel: s.gelAtivo > 0, inclinacao: p.inclinacao, naCalcada: Math.abs(s.d) > R.MEIA_RUA, energia: s.energia, pace: s.paceBase / s.fatorTenis, freando: s.freio > 0 });
    s.v = R.aproximarVelocidade(s.v, alvo, dt);
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
    if (s.modo !== 'jogando') return;
    if (prova && s.s >= pista.total) return terminar(`🏁 Chegada! ${prova.rotulo} concluído`, true);
  }

  if (s.vy !== 0 || s.y > 0) {
    s.vy += R.PULO.gravidade * dt;
    s.y = Math.max(0, s.y + s.vy * dt);
    if (s.y === 0) {
      s.vy = 0;
      if (s.saltandoCarro) { s.saltandoCarro = false; s.pontos += 30; aviso('🚗 Pulou o carro! +30'); }
    }
  }
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
      aviso(`💧 Hidratação à ${posto.lado > 0 ? 'direita' : 'esquerda'}: encoste na mesa e toque na gota no verde`, 'km', 2600);
    }
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
      e.rot = e.vd > 0 ? 0 : Math.PI;
    }
    if (e.vd) e.d += e.vd * dt;
    if (e.anima) e.anima(s.t);
    colocar(e);
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
  const chao = emEst(s.s).y;
  corredor.g.position.set(s.x, chao + s.y, s.z);
  corredor.g.rotation.y = -s.ang;
  corredor.sombra.position.set(s.x, chao + 0.08, s.z);
  corredor.sombra.scale.setScalar(1 - Math.min(0.5, s.y / 4));
  const noAr = s.y > 0.05, agachado = s.agachado > 0;
  const anim = s.modo === 'jogando' ? (s.saltoAnim > 0 ? 'pular' : s.parado > 0 ? 'parado' : 'correr')
    : s.modo === 'fim' ? (s.concluiu ? 'comemorar' : 'parado')
    : s.modo === 'contagem' && s.chegada > 0 ? 'caminhar'
    : s.modo === 'inicio' || s.modo === 'contagem' ? 'aquecer' : 'parado';
  // a passada acelera com o nível; quem não tem caminhada chega num trote lento
  const ritmo = s.modo === 'jogando' ? 1.25 * (s.v / R.mps(R.PACE_BASE)) : anim === 'caminhar' && !corredor.atleta?.partes?.caminhar ? 0.45 : 1;
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
  const alvo = emEst(s.s + cam.olhar);
  camera.lookAt(s.x + fx * cam.olhar, (alvo.y + chao) / 2 + 1.4, s.z + fz * cam.olhar);
  // câmera livre só para os testes automáticos (fotos aéreas)
  if (s.camTeste) { camera.position.set(...s.camTeste.pos); camera.lookAt(...s.camTeste.alvo); scene.fog.far = 2000; }
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

function loop() {
  const dtReal = relogio.getDelta();
  const dt = Math.min(0.05, dtReal);
  medirDesempenho(dtReal);
  if (estado.modo === 'contagem') passoContagem(dt);
  if (estado.modo === 'jogando') passo(dt);
  atualizarGota(dt);
  desenhar(dt);
  requestAnimationFrame(loop);
}

// ─── MENU E DADOS DA PROVA ────────────────────────────────────────────────────

async function carregarProva() {
  const url = `${SUPABASE_URL}/rest/v1/corridas?slug=eq.${PROVA_SLUG}&select=nome,cidade,percurso_3d,corrida_distancias(rotulo,km,subida_m,percurso)`;
  const box = $('#provaDistancias');
  try {
    const r = await fetch(url, { headers: { apikey: SUPABASE_KEY } });
    const [c] = await r.json();
    const dist = (c?.corrida_distancias || []).filter((d) => Array.isArray(d.percurso) && d.percurso.length > 10).sort((a, b) => a.km - b.km);
    if (!dist.length) throw new Error('sem percurso');
    const marcadores = {};
    for (const [rot, v] of Object.entries(c.percurso_3d?.por || {})) marcadores[rot] = v.pontos || [];
    dadosProva = { nome: c.nome, distancias: dist, marcadores };
    $('#provaNome').textContent = `🏅 ${c.nome}`;
    $('#provaInfo').textContent = `Percurso e altimetria reais de ${c.cidade}. 1 km leva 1 minuto a 6:00/km.`;
    box.innerHTML = '';
    for (const d of dist) {
      const b = document.createElement('button');
      const rec = lerRecorde(`mapmove-recorde-${PROVA_SLUG}-${d.rotulo}`);
      b.innerHTML = `${d.rotulo}<small>↗ ${d.subida_m ?? '?'} m${rec ? ` · 🏅 ${R.formatarTempo(rec)}` : ''}</small>`;
      b.addEventListener('click', () => iniciar({ tipo: 'prova', distancia: d }));
      box.appendChild(b);
    }
  } catch {
    $('#provaInfo').textContent = 'Não foi possível carregar o percurso agora. Tente de novo mais tarde.';
  }
}

// ─── PERFIL DO CORREDOR (salvo no aparelho; conta e ranking vêm depois) ────────
const CHAVE_PERFIL = 'mapmove-perfil-v1';
let perfil = (() => { try { return P.lerPerfil(localStorage.getItem(CHAVE_PERFIL)); } catch { return P.perfilNovo(); } })();
function salvarPerfil() {
  try { localStorage.setItem(CHAVE_PERFIL, JSON.stringify(perfil)); } catch { /* sem storage */ }
  agendarNuvem();
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
}
Conta.aoMudarLogin((u) => { if (u) entrouNaConta(u); else { usuario = null; mostrarConta(); } });
Conta.usuarioAtual().then((u) => entrouNaConta(u));
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
  $('#perfilNivel').textContent = st.rotulo;
  $('#perfilPace').textContent = `${R.formatarPace(R.mps(st.pace))}/km`;
  $('#perfilBarra').style.width = `${Math.round(st.progresso * 100)}%`;
  $('#perfilXP').textContent = st.completo ? 'Nível máximo!' : `${st.xpNoDegrau} / ${st.xpDoDegrau} XP · próximo: ${R.formatarPace(R.mps(st.proximo?.pace || st.pace))}/km`;
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
    copos: prova ? postos.length : 0, coposPegos: estado.coposPegos, agua: estado.agua
  });
  perfil = r.perfil;
  salvarPerfil();
  const extras = entregarPremios();
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
  const feitos = perfil.treinosHoje?.dia === hoje ? perfil.treinosHoje.n : 0;
  const t = TR.prescrever(st.nivel, hoje, feitos);
  $('#treinoNome').textContent = t.nome;
  $('#treinoInfo').textContent = `${TR.LOCAIS[t.local]} · ${t.detalhe} · +${TR.xpTreino(st.indice)} XP`;
  $('#btnTreinoDia').hidden = !gratis;
  const comprar = $('#btnComprarTreino');
  comprar.hidden = gratis;
  comprar.disabled = perfil.moves < TR.PRECO_TREINO;
  comprar.textContent = perfil.moves < TR.PRECO_TREINO
    ? `Próximo grátis à meia-noite · faltam ${TR.PRECO_TREINO - perfil.moves} Move$ para comprar`
    : `Comprar treino agora · ${TR.PRECO_TREINO} Move$`;
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
  $('#lojaItens').innerHTML = L.ITENS.filter((it) => it.cat === cat).map((it) => {
    const est = L.estadoItem(perfil, it.id);
    let botao;
    if (est === 'usando') botao = `<button class="usando" data-acao="equipar" data-id="${it.id}">Usando ✓</button>`;
    else if (est === 'tenho') botao = `<button class="neutro" data-acao="equipar" data-id="${it.id}">Usar</button>`;
    else if (est === 'comprar') botao = `<button data-acao="comprar" data-id="${it.id}">${moedaImg}${it.preco}</button>`;
    else if (est === 'sem-moves') botao = `<button disabled>${moedaImg}${it.preco}</button>`;
    else if (est === 'nivel') botao = `<button class="neutro" disabled>🔒 ${nivelNome(it.nivelMin)}</button>`;
    else if (est === 'premio') botao = `<button class="neutro" disabled>🎁 Prêmio do ${nivelNome(it.premioNivel)}</button>`;
    else if (est === 'conquistado') botao = `<button class="usando" disabled>🏅 Conquistada</button>`;
    else botao = `<button class="neutro" disabled>🔒 Ainda não</button>`;
    const tag = it.cat === 'consumivel' && (it.consumo.gel ? mochila.gel : mochila.isotonico)
      ? `<span class="tag">Na mochila: ${it.consumo.gel ? `${mochila.gel} ${mochila.gel > 1 ? 'géis' : 'gel'}` : `${mochila.isotonico} isotônico`}</span>` : '';
    return `<div class="item ${est === 'bloqueado' ? 'bloqueado' : ''}"><img src="/icones/${it.id}.webp" alt="" loading="lazy"><b>${it.nome}</b><small>${it.desc}</small>${tag}${botao}</div>`;
  }).join('');
  mostrar('telaLoja');
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
  bandana: [{ osso: 'Head', pos: [0, 0.122, 0.008], rot: [-10, 0, 0], tam: 0.115 }],
  oculos: [{ osso: 'Head', pos: [0, 0.088, 0.066], rot: [0, -90, 0], tam: 0.088 }],
  relogio: [{ osso: 'LeftHand', pos: [0, -0.015, 0], rot: [90, 0, 0], tam: 0.05 }],
  pochete: [{ osso: 'Hips', pos: [0, -0.01, 0.02], rot: [0, -90, 0], tam: 0.21 }],
  'tenis-carbono': [{ osso: 'LeftFoot', pos: [0, 0.03, 0], rot: [-90, 0, 0], tam: 0.155 }, { osso: 'RightFoot', pos: [0, 0.03, 0], rot: [-90, 0, 0], tam: 0.155 }],
  'tenis-dourado': [{ osso: 'LeftFoot', pos: [0, 0.03, 0], rot: [-90, 0, 0], tam: 0.155 }, { osso: 'RightFoot', pos: [0, 0.03, 0], rot: [-90, 0, 0], tam: 0.155 }]
};
const cacheAcessorios = new Map();
function carregarAcessorio(id) {
  if (!cacheAcessorios.has(id)) {
    cacheAcessorios.set(id, gltfLoader.loadAsync(`/modelos/acessorios/${id}.glb`).then((g) => {
      const m = g.scene;
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
  if (aj[id]) return { ...cfg, ...aj[id] };
  return { ...cfg, pos: [cfg.pos[0] + aj.dx, cfg.pos[1] + aj.dy, cfg.pos[2] + aj.dz], rot: [cfg.rot[0] + aj.rx, cfg.rot[1], cfg.rot[2]], tam: cfg.tam * aj.esc };
}
let versaoVestir = 0;
async function vestirAtleta() {
  const a = corredor.atleta;
  if (!a || !Object.keys(a.partes).length) return;
  const versao = ++versaoVestir;
  const ids = Object.values(perfil.usando || {}).filter((id) => ACESSORIOS_3D[id]);
  const modelos = await Promise.all(ids.map(carregarAcessorio));
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
        const obj = modelos[k].clone();
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

function mostrarInicio() {
  sincronizarStrava();
  entregarPremios(); // quem já tinha subido de nível antes da loja existir também ganha
  mostrarPerfil();
  mostrarTreinoDoDia();
  estado.modo = 'inicio';
  prepararPercurso({ tipo: 'treino' });
  const p = emEst(0);
  Object.assign(estado, { x: p.x, z: p.z, ang: p.ang, camAng: p.ang, s: 0, sMax: 0, d: 0, y: 0 });
  const rec = lerRecorde('mapmove-recorde');
  $('#recordeTreino').textContent = rec ? `Recorde: ${rec.toLocaleString('pt-BR')} pontos` : '';
  hud.contagem.hidden = true;
  mostrar('telaInicio');
}

$('#btnTreino').addEventListener('click', () => iniciar({ tipo: 'treino' }));
$('#btnDeNovo').addEventListener('click', () => iniciar());
$('#btnTrocar').addEventListener('click', mostrarInicio);
$('#btnSair').addEventListener('click', mostrarInicio);
$('#btnPausa').addEventListener('click', pausar);
$('#btnMusica').textContent = musica.ligada ? '🔊' : '🔇';
$('#btnMusica').addEventListener('pointerdown', (e) => { e.stopPropagation(); e.preventDefault(); alternarMusica(); });
$('#btnTrocar').addEventListener('click', () => { tocarMusica(false); som.pararLoops(); });
$('#btnSair').addEventListener('click', () => { tocarMusica(false); som.pararLoops(); som.pausar(false); });
$('#btnContinuar').addEventListener('click', continuar);
$('#btnRecomecar').addEventListener('click', () => { som.pausar(false); iniciar(); });
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
