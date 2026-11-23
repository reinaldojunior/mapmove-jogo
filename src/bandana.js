// Bandana feita no código: faixa justa em volta da cabeça (elipse, um pouco mais estreita em cima),
// nó atrás e duas pontas caindo. Medida em "unidades": profundidade da faixa = 1 (o jogo escala pelo tamanho da cabeça).

import * as THREE from 'three';

function texturaBandana() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#e8590c'; g.fillRect(0, 0, 256, 64);
  g.fillStyle = '#c2410c'; g.fillRect(0, 0, 256, 7); g.fillRect(0, 57, 256, 7);
  // estampa clássica: gotas e pontinhos claros
  g.fillStyle = 'rgba(255,240,220,0.9)';
  for (let x = 10; x < 256; x += 32) {
    g.beginPath(); g.ellipse(x, 24, 5, 9, 0.6, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.ellipse(x + 16, 42, 5, 9, -0.6, 0, Math.PI * 2); g.fill();
    for (const [dx, dy] of [[8, 12], [24, 26], [4, 50], [20, 54]]) { g.beginPath(); g.arc(x + dx, dy, 1.8, 0, Math.PI * 2); g.fill(); }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.wrapS = THREE.RepeatWrapping; t.repeat.set(3, 1);
  return t;
}

let material = null;
export function criarBandana({ largura = 0.78, altura = 0.24 } = {}) {
  material ||= new THREE.MeshStandardMaterial({ map: texturaBandana(), roughness: 0.85, side: THREE.DoubleSide });
  const g = new THREE.Group();
  // faixa: cilindro aberto, achatado nos lados (cabeça é mais funda que larga)
  const faixa = new THREE.Mesh(new THREE.CylinderGeometry(0.47, 0.5, altura, 32, 1, true), material);
  faixa.scale.set(largura, 1, 1);
  g.add(faixa);
  // nó atrás (-z) e as duas pontas caindo
  const no = new THREE.Mesh(new THREE.SphereGeometry(0.075, 12, 8), material);
  no.scale.set(1.3, 1, 0.8); no.position.set(0, -0.02, -0.51); g.add(no);
  for (const lado of [-1, 1]) {
    const ponta = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.34, 0.025), material);
    ponta.geometry.translate(0, -0.17, 0);
    ponta.position.set(lado * 0.04, -0.03, -0.53);
    ponta.rotation.set(-0.35, 0, lado * 0.35);
    g.add(ponta);
  }
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; } });
  return g;
}
