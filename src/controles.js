// Analógico da esquerda (virar e acelerar) e botão de ação da direita (pular, abaixar, pegar água).
// Também aceita teclado: ← → viram, ↑ acelera, espaço pula, ↓ abaixa, E pega água.

const ZONA_MORTA = 0.15;
const LIMIAR_GESTO = 22;

export function criarControles({ joy, botao, onAcao }) {
  const knob = joy.querySelector('.knob');
  const toque = { x: 0, acel: 0 };
  const teclas = { esq: false, dir: false, acel: false };
  let dedoJoy = null;
  let gesto = null;

  function moverJoy(e) {
    const r = joy.getBoundingClientRect();
    const raio = r.width / 2;
    let dx = e.clientX - (r.left + raio), dy = e.clientY - (r.top + raio);
    const len = Math.hypot(dx, dy);
    if (len > raio) { dx *= raio / len; dy *= raio / len; }
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
    const nx = dx / raio, ny = -dy / raio;
    toque.x = Math.abs(nx) < ZONA_MORTA ? 0 : nx;
    toque.acel = ny > ZONA_MORTA ? Math.min(1, (ny - ZONA_MORTA) / (1 - ZONA_MORTA)) : 0;
  }
  function soltarJoy(e) {
    if (dedoJoy !== e.pointerId) return;
    dedoJoy = null;
    toque.x = 0; toque.acel = 0;
    knob.style.transform = '';
    joy.classList.remove('ativo');
  }
  joy.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    dedoJoy = e.pointerId;
    joy.setPointerCapture(e.pointerId);
    joy.classList.add('ativo');
    moverJoy(e);
  });
  joy.addEventListener('pointermove', (e) => { if (dedoJoy === e.pointerId) moverJoy(e); });
  joy.addEventListener('pointerup', soltarJoy);
  joy.addEventListener('pointercancel', soltarJoy);

  // botão de ação: o gesto dispara assim que passa do limiar; um toque simples pula
  function disparar(acao, classe) {
    onAcao(acao);
    botao.dataset.gesto = classe;
    clearTimeout(disparar.t);
    disparar.t = setTimeout(() => { delete botao.dataset.gesto; }, 250);
  }
  botao.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    botao.setPointerCapture(e.pointerId);
    gesto = { id: e.pointerId, x: e.clientX, y: e.clientY, feito: false };
  });
  botao.addEventListener('pointermove', (e) => {
    if (!gesto || gesto.id !== e.pointerId || gesto.feito) return;
    const dx = e.clientX - gesto.x, dy = e.clientY - gesto.y;
    if (Math.hypot(dx, dy) < LIMIAR_GESTO) return;
    gesto.feito = true;
    if (Math.abs(dy) >= Math.abs(dx)) disparar(dy < 0 ? 'pular' : 'abaixar', dy < 0 ? 'cima' : 'baixo');
    else disparar('agua', dx < 0 ? 'esq' : 'dir');
  });
  const fimGesto = (e) => {
    if (!gesto || gesto.id !== e.pointerId) return;
    if (!gesto.feito && e.type === 'pointerup') disparar('pular', 'cima');
    gesto = null;
  };
  botao.addEventListener('pointerup', fimGesto);
  botao.addEventListener('pointercancel', fimGesto);

  const MAPA = {
    ArrowLeft: 'esq', a: 'esq', A: 'esq',
    ArrowRight: 'dir', d: 'dir', D: 'dir',
    ArrowUp: 'acel', w: 'acel', W: 'acel'
  };
  window.addEventListener('keydown', (e) => {
    if (MAPA[e.key]) { teclas[MAPA[e.key]] = true; e.preventDefault(); return; }
    if (e.repeat) return;
    if (e.key === ' ') { e.preventDefault(); onAcao('pular'); }
    else if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') { e.preventDefault(); onAcao('abaixar'); }
    else if (e.key === 'e' || e.key === 'E' || e.key === 'q' || e.key === 'Q') onAcao('agua');
    else if (e.key === 'p' || e.key === 'P' || e.key === 'Escape') onAcao('pausa');
  });
  window.addEventListener('keyup', (e) => { if (MAPA[e.key]) teclas[MAPA[e.key]] = false; });

  return {
    entrada() {
      const x = Math.max(-1, Math.min(1, toque.x + (teclas.dir ? 1 : 0) - (teclas.esq ? 1 : 0)));
      return { x, acel: Math.max(toque.acel, teclas.acel ? 1 : 0) };
    },
    reset() {
      toque.x = 0; toque.acel = 0; teclas.esq = teclas.dir = teclas.acel = false;
      knob.style.transform = '';
    }
  };
}
