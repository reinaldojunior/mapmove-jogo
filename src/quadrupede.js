// Esqueleto automático para um animal de quatro patas que veio sem rigging (ex.: cachorro do Tripo/Meshy).
// Descobre a frente (a cabeça é o lado mais alto), separa as quatro patas pela posição, cria ossos simples
// (corpo, cabeça, rabo, coxa e canela de cada pata) e liga cada pedaço da malha ao osso certo.

import * as THREE from 'three';

// junta as malhas do modelo numa geometria só, no espaço do modelo
function geometriaUnica(model) {
  model.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(model.matrixWorld).invert();
  const partes = [];
  let material = null;
  model.traverse((o) => {
    if (!o.isMesh) return;
    const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld));
    partes.push(g);
    material ||= o.material;
  });
  if (partes.length === 1) return { geo: partes[0], material };
  // várias malhas: concatena só posição, normal e uv
  const juntar = (nome, n) => {
    const total = partes.reduce((a, g) => a + g.attributes.position.count, 0), arr = new Float32Array(total * n);
    let off = 0;
    for (const g of partes) { const at = g.attributes[nome]; if (at) arr.set(at.array.subarray(0, at.count * n), off); off += g.attributes.position.count * n; }
    return new THREE.BufferAttribute(arr, n);
  };
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', juntar('position', 3));
  geo.setAttribute('normal', juntar('normal', 3));
  if (partes[0].attributes.uv) geo.setAttribute('uv', juntar('uv', 2));
  return { geo, material };
}

export function rigarQuadrupede(model, alturaFinal = 0.75) {
  const { geo, material } = geometriaUnica(model);
  geo.computeBoundingBox();
  let bb = geo.boundingBox;
  // o comprimento do animal fica no eixo x; se for o z, gira 90°
  if (bb.max.z - bb.min.z > bb.max.x - bb.min.x) { geo.rotateY(Math.PI / 2); geo.computeBoundingBox(); bb = geo.boundingBox; }
  const pos = geo.attributes.position;
  // a cabeça é a ponta mais alta: compara a altura máxima perto de cada ponta
  const L0 = bb.max.x - bb.min.x;
  let altMax = -Infinity, altMin = -Infinity;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i);
    if (x > bb.max.x - L0 * 0.25) altMax = Math.max(altMax, y);
    if (x < bb.min.x + L0 * 0.25) altMin = Math.max(altMin, y);
  }
  if (altMin > altMax) geo.rotateY(Math.PI);
  // centraliza: pés no chão, meio do corpo na origem, e escala para a altura pedida
  geo.computeBoundingBox(); bb = geo.boundingBox;
  geo.translate(-(bb.min.x + bb.max.x) / 2, -bb.min.y, -(bb.min.z + bb.max.z) / 2);
  const esc = alturaFinal / (bb.max.y - bb.min.y);
  geo.scale(esc, esc, esc);
  geo.computeBoundingBox(); bb = geo.boundingBox;
  const L = bb.max.x - bb.min.x, H = bb.max.y, meioX = 0;

  // patas: tudo abaixo da barriga; o centro de cada pata sai da média dos vértices do seu quadrante
  const barriga = H * 0.42;
  const quad = [[], [], [], []]; // 0 frente-esq, 1 frente-dir, 2 trás-esq, 3 trás-dir
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i); if (y > barriga * 0.8) continue;
    const x = pos.getX(i), z = pos.getZ(i);
    quad[(x > meioX ? 0 : 2) + (z > 0 ? 1 : 0)].push([x, z]);
  }
  const centro = quad.map((q, k) => {
    if (!q.length) return [k < 2 ? L * 0.3 : -L * 0.3, k % 2 ? 0.08 : -0.08];
    return [q.reduce((a, p) => a + p[0], 0) / q.length, q.reduce((a, p) => a + p[1], 0) / q.length];
  });

  // ossos
  const raiz = new THREE.Bone(); raiz.name = 'corpo'; raiz.position.set(0, barriga, 0);
  const cabeca = new THREE.Bone(); cabeca.name = 'cabeca'; cabeca.position.set(L * 0.3, H * 0.62 - barriga, 0); raiz.add(cabeca);
  const rabo = new THREE.Bone(); rabo.name = 'rabo'; rabo.position.set(-L * 0.4, H * 0.6 - barriga, 0); raiz.add(rabo);
  const coxas = [], canelas = [];
  centro.forEach(([cx, cz], k) => {
    const coxa = new THREE.Bone(); coxa.name = `coxa${k}`; coxa.position.set(cx, 0, cz); raiz.add(coxa);
    const canela = new THREE.Bone(); canela.name = `canela${k}`; canela.position.set(0, -barriga * 0.5, 0); coxa.add(canela);
    coxas.push(coxa); canelas.push(canela);
  });
  const ossos = [raiz, cabeca, rabo, ...coxas, ...canelas];
  const idx = (o) => ossos.indexOf(o);

  // pesos: cada vértice segue o osso da sua região, com transição suave nas emendas
  const n = pos.count, si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
  const suave = (v, a, b) => Math.max(0, Math.min(1, (v - a) / (b - a)));
  for (let i = 0; i < n; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const pesos = new Map();
    const add = (o, w) => { if (w > 0) pesos.set(idx(o), (pesos.get(idx(o)) || 0) + w); };
    if (y < barriga) {
      const k = (x > meioX ? 0 : 2) + (z > 0 ? 1 : 0);
      const fCorpo = suave(y, barriga * 0.75, barriga); // perto da barriga, mistura com o corpo
      const fCanela = 1 - suave(y, barriga * 0.35, barriga * 0.6);
      add(raiz, fCorpo);
      add(canelas[k], (1 - fCorpo) * fCanela);
      add(coxas[k], (1 - fCorpo) * (1 - fCanela));
    } else if (x > L * 0.22) {
      const f = suave(x, L * 0.22, L * 0.34);
      add(cabeca, f); add(raiz, 1 - f);
    } else if (x < -L * 0.34) {
      const f = suave(-x, L * 0.34, L * 0.44);
      add(rabo, f); add(raiz, 1 - f);
    } else add(raiz, 1);
    const lista = [...pesos.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
    const soma = lista.reduce((a, [, w]) => a + w, 0) || 1;
    lista.forEach(([o, w], j) => { si[i * 4 + j] = o; sw[i * 4 + j] = w / soma; });
  }
  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
  geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));

  const mat = Array.isArray(material) ? material[0] : material;
  const malha = new THREE.SkinnedMesh(geo, mat);
  malha.add(raiz);
  malha.bind(new THREE.Skeleton(ossos));
  malha.castShadow = true;
  malha.frustumCulled = false;
  return malha;
}

// galope (corre = true) ou parado; a frente do animal é +x
export function animarQuadrupede(malha, t, corre) {
  const s = malha.skeleton, b = (nome) => s.getBoneByName(nome);
  const f = corre ? 13 : 2.5, a = t * f, amp = corre ? 0.75 : 0.04;
  for (let k = 0; k < 4; k++) {
    const frente = k < 2, fase = a + (frente ? 0 : Math.PI * 0.85) + (k % 2) * 0.3;
    b(`coxa${k}`).rotation.z = Math.sin(fase) * amp;
    b(`canela${k}`).rotation.z = (frente ? -1 : 1) * Math.max(0, Math.sin(fase + 1.2)) * amp * 0.9;
  }
  const raiz = b('corpo');
  raiz.position.y = raiz.userData.y0 ??= raiz.position.y;
  raiz.position.y = raiz.userData.y0 + (corre ? Math.abs(Math.sin(a)) * 0.05 : 0);
  raiz.rotation.z = corre ? Math.sin(a) * 0.08 : 0;
  b('cabeca').rotation.z = corre ? Math.sin(a + 0.6) * 0.1 : Math.sin(t * 2) * 0.05;
  b('rabo').rotation.y = Math.sin(t * 14) * 0.5;
}
