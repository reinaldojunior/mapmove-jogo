// Controles por gestos na tela inteira (o corredor corre sozinho):
// - arrastar o dedo para os lados vira enquanto segura
// - toques rápidos na metade esquerda/direita viram um pouco a cada toque
// - deslizar para cima pula, para baixo abaixa
// Teclado: ← → viram, ↑/espaço pula, ↓ abaixa, G gel, E água, C câmera, P pausa.

const LIMIAR_DESLIZE = 30;
const LIMIAR_ARRASTO = 12;
const ARRASTO_CHEIO_PX = 70;
const TOQUE_MAX_MS = 260;

export function criarControles({ area, onAcao }) {
  const dedos = new Map();
  const teclas = { esq: false, dir: false };
  let giro = 0;
  let toques = 0;

  area.addEventListener('pointerdown', (e) => {
    if (e.target.closest('button, .botao-jogo')) return;
    dedos.set(e.pointerId, { x0: e.clientX, y0: e.clientY, t0: performance.now(), modo: null });
    area.setPointerCapture?.(e.pointerId);
  });
  area.addEventListener('pointermove', (e) => {
    const d = dedos.get(e.pointerId);
    if (!d) return;
    const dx = e.clientX - d.x0, dy = e.clientY - d.y0;
    if (!d.modo) {
      if (Math.abs(dy) > LIMIAR_DESLIZE && Math.abs(dy) > Math.abs(dx) * 1.3) {
        d.modo = 'deslize';
        onAcao(dy < 0 ? 'pular' : 'abaixar');
      } else if (Math.abs(dx) > LIMIAR_ARRASTO) d.modo = 'arrasto';
    }
    if (d.modo === 'arrasto') giro = Math.max(-1, Math.min(1, dx / ARRASTO_CHEIO_PX));
  });
  const soltar = (e) => {
    const d = dedos.get(e.pointerId);
    if (!d) return;
    dedos.delete(e.pointerId);
    if (d.modo === 'arrasto') giro = 0;
    if (!d.modo && e.type === 'pointerup' && performance.now() - d.t0 < TOQUE_MAX_MS) {
      const r = area.getBoundingClientRect();
      toques += e.clientX < r.left + r.width / 2 ? -1 : 1;
    }
  };
  area.addEventListener('pointerup', soltar);
  area.addEventListener('pointercancel', soltar);

  const MAPA = { ArrowLeft: 'esq', a: 'esq', A: 'esq', ArrowRight: 'dir', d: 'dir', D: 'dir' };
  const ACOES = {
    ' ': 'pular', ArrowUp: 'pular', w: 'pular', W: 'pular',
    ArrowDown: 'abaixar', s: 'abaixar', S: 'abaixar',
    g: 'gel', G: 'gel', e: 'agua', E: 'agua', c: 'camera', C: 'camera',
    p: 'pausa', P: 'pausa', Escape: 'pausa'
  };
  window.addEventListener('keydown', (e) => {
    if (MAPA[e.key]) { teclas[MAPA[e.key]] = true; e.preventDefault(); return; }
    if (e.repeat || !ACOES[e.key]) return;
    e.preventDefault();
    onAcao(ACOES[e.key]);
  });
  window.addEventListener('keyup', (e) => { if (MAPA[e.key]) teclas[MAPA[e.key]] = false; });

  return {
    // giro contínuo de -1 a 1 (arrasto ou teclado)
    giro: () => Math.max(-1, Math.min(1, giro + (teclas.dir ? 1 : 0) - (teclas.esq ? 1 : 0))),
    // toques rápidos acumulados desde a última leitura (negativo = esquerda)
    consumirToques() { const t = toques; toques = 0; return t; },
    reset() { dedos.clear(); giro = 0; toques = 0; teclas.esq = teclas.dir = false; }
  };
}
