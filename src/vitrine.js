// Vitrine de personagens da loja: o boneco escolhido fica no centro, parado, e gira só em volta do próprio eixo
// (de pé, sem tombar) quando o jogador arrasta o dedo para os lados. Tem seu próprio canvas e renderizador.

import * as THREE from 'three';

// algumas animações andam (o quadril sai do lugar): na vitrine o boneco fica no mesmo ponto, só sobe e desce
function semAndar(clipe) {
  const c = clipe.clone();
  for (const tr of c.tracks) {
    if (!/Hips\.position$/.test(tr.name)) continue;
    const v = tr.values, x0 = v[0], z0 = v[2];
    for (let i = 0; i < v.length; i += 3) { v[i] = x0; v[i + 2] = z0; }
  }
  return c;
}

export function criarVitrine({ loader, preparar, personagens }) {
  const canvas = document.createElement('canvas');
  canvas.className = 'vitrine-canvas';
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x445566, 1.6));
  const sol = new THREE.DirectionalLight(0xffffff, 2.2); sol.position.set(2, 4, 3); scene.add(sol);
  const contra = new THREE.DirectionalLight(0x9fc8ff, 1.0); contra.position.set(-3, 2, -3); scene.add(contra);
  const chao = new THREE.Mesh(new THREE.CircleGeometry(0.55, 40), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.25, depthWrite: false }));
  chao.rotation.x = -Math.PI / 2; scene.add(chao);
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
  camera.position.set(0, 1.0, 4.4); camera.lookAt(0, 0.92, 0);

  const giro = new THREE.Group(); scene.add(giro); // só gira no eixo vertical
  const cache = new Map(); // id → Promise<{ grp, mixer }>
  let atual = null, idAtual = null, pedido = 0;
  let angulo = 0, velocidade = 0, arrastando = false, ultimoX = 0, ultimoT = 0;
  let ligado = false, relogio = new THREE.Clock(), aoCarregar = () => {};

  function montar(id) {
    if (cache.has(id)) return cache.get(id);
    const p = personagens[id];
    const arquivo = p.arquivo || (p.anims.find(([n]) => n === 'parado') || p.anims[0])[1];
    const yaw = p.arquivo ? 0 : (p.anims.find(([n]) => n === 'parado') || [0, 0, 0])[2];
    const pr = loader.loadAsync(`/modelos/${arquivo}`).then((gltf) => {
      const model = gltf.scene;
      model.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(model, true), h = (box.max.y - box.min.y) || 1;
      model.position.set(-(box.min.x + box.max.x) / 2, -box.min.y, -(box.min.z + box.max.z) / 2);
      preparar(model);
      const grp = new THREE.Group(); grp.add(model);
      grp.scale.setScalar(1.8 / h);
      grp.rotation.y = (yaw * Math.PI) / 180; // o modelo olha para +z, de frente para a câmera
      const mixer = new THREE.AnimationMixer(model);
      const nomeClipe = p.clipes?.parado;
      const clipe = (nomeClipe && gltf.animations.find((a) => a.name === nomeClipe)) || gltf.animations[0];
      if (clipe) mixer.clipAction(semAndar(clipe)).play();
      return { grp, mixer };
    });
    pr.catch(() => cache.delete(id));
    cache.set(id, pr);
    return pr;
  }

  async function mostrar(id) {
    if (id === idAtual && atual) return;
    idAtual = id;
    const vez = ++pedido;
    if (atual) { giro.remove(atual.grp); atual = null; }
    canvas.classList.add('carregando');
    try {
      const m = await montar(id);
      if (vez !== pedido) return;
      atual = m; giro.add(m.grp);
      angulo = 0; velocidade = 0; // cada personagem começa de frente
    } catch (e) { console.warn('vitrine', e); }
    finally { if (vez === pedido) { canvas.classList.remove('carregando'); aoCarregar(id); } }
  }

  // arrastar para os lados gira o boneco; ao soltar, continua um pouco e para sozinho
  canvas.addEventListener('pointerdown', (e) => {
    arrastando = true; ultimoX = e.clientX; ultimoT = performance.now(); velocidade = 0;
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!arrastando) return;
    const dx = e.clientX - ultimoX, agora = performance.now(), dt = Math.max(1, agora - ultimoT);
    const d = (dx / Math.max(canvas.clientWidth, 1)) * Math.PI * 2; // largura inteira = uma volta
    angulo += d;
    velocidade = (d / dt) * 1000;
    ultimoX = e.clientX; ultimoT = agora;
  });
  const soltar = () => { arrastando = false; };
  canvas.addEventListener('pointerup', soltar);
  canvas.addEventListener('pointercancel', soltar);

  function quadro() {
    if (!ligado) return;
    requestAnimationFrame(quadro);
    const dt = Math.min(relogio.getDelta(), 0.05);
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    if (canvas.width !== Math.round(w * renderer.getPixelRatio()) || canvas.height !== Math.round(h * renderer.getPixelRatio())) {
      renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
    }
    if (!arrastando) { angulo += velocidade * dt; velocidade *= Math.pow(0.04, dt); if (Math.abs(velocidade) < 0.02) velocidade = 0; }
    giro.rotation.y = angulo;
    atual?.mixer.update(dt);
    renderer.render(scene, camera);
  }

  return {
    canvas,
    mostrar,
    aoCarregar(fn) { aoCarregar = fn; },
    ligar() { if (ligado) return; ligado = true; relogio.getDelta(); quadro(); },
    desligar() { ligado = false; },
    preCarregar(id) { montar(id).catch(() => {}); }
  };
}
