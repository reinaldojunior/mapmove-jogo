// Sons da corrida (Web Audio): os mesmos arquivos do simulador de percurso do Portal,
// mais os passos sintetizados aqui. Tudo só começa depois de um toque, como exigem os navegadores.

const ARQUIVOS = { largada: 'corneta-largada', voz: 'voz-conseguimos', torcida: 'torcida', fogos: 'fogos', resp: 'respiracao', carro: 'carro-drift' };

export function criarSom() {
  const S = { ctx: null, master: null, buf: {}, carregando: null, resp: null, respGain: null, torc: null, torcGain: null, ruido: null, ligado: true };

  function iniciar() {
    if (!S.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      // iPhone (Safari 17+): toca como mídia mesmo com a chave de silencioso
      try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch { /* sem suporte */ }
      S.ctx = new AC();
      S.master = S.ctx.createGain(); S.master.gain.value = S.ligado ? 1 : 0; S.master.connect(S.ctx.destination);
      S.respGain = S.ctx.createGain(); S.respGain.gain.value = 0; S.respGain.connect(S.master);
      S.torcGain = S.ctx.createGain(); S.torcGain.gain.value = 0; S.torcGain.connect(S.master);
      S.carroGain = S.ctx.createGain(); S.carroGain.gain.value = 0; S.carroGain.connect(S.master);
      // ruído curto para os passos
      const n = Math.floor(S.ctx.sampleRate * 0.09);
      S.ruido = S.ctx.createBuffer(1, n, S.ctx.sampleRate);
      const d = S.ruido.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 3);
      // iPhone: destrava o áudio tocando algo ainda dentro do toque
      const z = S.ctx.createBufferSource(); z.buffer = S.ctx.createBuffer(1, 1, 22050); z.connect(S.ctx.destination); z.start(0);
    }
    if (S.ctx.state !== 'running') S.ctx.resume().catch(() => {});
    S.carregando ??= Promise.all(Object.entries(ARQUIVOS).map(async ([k, f]) => {
      try { const r = await fetch(`/som/${f}.mp3`); S.buf[k] = await S.ctx.decodeAudioData(await r.arrayBuffer()); } catch { /* sem o arquivo */ }
    }));
  }

  function tocar(k, vol = 1, depois = 0) {
    const b = S.buf[k];
    if (!S.ctx || !b) return;
    const src = S.ctx.createBufferSource(), g = S.ctx.createGain();
    g.gain.value = vol; src.buffer = b;
    src.connect(g).connect(S.master); src.start(S.ctx.currentTime + depois);
  }

  // loop sem emenda (os MP3 têm ~50 ms de silêncio nas pontas)
  function loop(k, destino) {
    const b = S.buf[k];
    if (!b) return null;
    const src = S.ctx.createBufferSource();
    src.buffer = b; src.loop = true; src.loopStart = 0.05; src.loopEnd = b.duration - 0.05;
    src.connect(destino); src.start(S.ctx.currentTime, 0.05);
    return src;
  }

  // um passo: estalo de ruído filtrado; na calçada soa mais grave
  function passo(calcada = false) {
    if (!S.ctx || !S.ruido || S.ctx.state !== 'running') return;
    const t = S.ctx.currentTime;
    const src = S.ctx.createBufferSource(), f = S.ctx.createBiquadFilter(), g = S.ctx.createGain();
    src.buffer = S.ruido; src.playbackRate.value = 0.9 + Math.random() * 0.2;
    f.type = 'bandpass'; f.frequency.value = calcada ? 520 : 900 + Math.random() * 200; f.Q.value = 1.1;
    g.gain.value = 0.16 + Math.random() * 0.05;
    src.connect(f).connect(g).connect(S.master); src.start(t);
  }

  // a cada quadro: respiração (volume e ritmo) e torcida de fundo
  function atualizar({ correndo, progresso = 1, inclinacao = 0, energia = 100, velocidade = 2.2, torcida = 0 }) {
    if (!S.ctx || S.ctx.state !== 'running') return;
    const t = S.ctx.currentTime;
    if (correndo && !S.resp) S.resp = loop('resp', S.respGain);
    if (correndo && !S.torc) S.torc = loop('torcida', S.torcGain);
    // ninguém larga ofegante: cresce no começo, pesa na subida e com pouca energia
    const aquece = progresso * progresso * (3 - 2 * progresso);
    const sobe = Math.max(0, Math.min(0.1, inclinacao));
    const cansado = 1 + (1 - energia / 100) * 0.7;
    const volResp = correndo ? 0.8 * (0.08 + 0.92 * aquece) * (0.45 + sobe * 3) * cansado : 0;
    S.respGain.gain.setTargetAtTime(Math.min(1.1, volResp), t, 0.5);
    if (S.resp) S.resp.playbackRate.value = Math.max(0.85, Math.min(1.25, 0.9 + (velocidade - 2.2) * 0.25 + (1 - energia / 100) * 0.12));
    S.torcGain.gain.setTargetAtTime(correndo ? 0.32 * torcida : 0, t, 0.8);
  }

  // carro desgovernado: o som de pneu cantando em loop; o volume segue a distância (0 = some, 1 = colado)
  function carro(vol) {
    if (!S.ctx || S.ctx.state !== 'running') return;
    if (vol > 0.001 && !S.carro) S.carro = loop('carro', S.carroGain);
    S.carroGain.gain.setTargetAtTime(Math.max(0, Math.min(1, vol)), S.ctx.currentTime, 0.12);
    if (vol <= 0.001 && S.carro) { const src = S.carro; S.carro = null; setTimeout(() => { try { src.stop(); } catch { /* já parou */ } }, 800); }
  }

  function pararLoops() {
    if (S.carro) carro(0);
    for (const k of ['resp', 'torc']) {
      const src = S[k];
      if (!src) continue;
      S[k] = null;
      setTimeout(() => { try { src.stop(); } catch { /* já parou */ } }, 1500);
    }
    if (S.ctx) { S.respGain.gain.setTargetAtTime(0, S.ctx.currentTime, 0.3); S.torcGain.gain.setTargetAtTime(0, S.ctx.currentTime, 0.3); }
  }

  // largada: corneta e a torcida explodindo
  function largada() { tocar('largada', 0.8); tocar('torcida', 0.7, 0.2); }

  // chegada: torcida, "Yes! Conseguimos!" e fogos
  function chegada() { pararLoops(); tocar('torcida', 0.8); tocar('voz', 1, 0.5); tocar('fogos', 0.8, 1.2); }

  function pausar(sim) {
    if (!S.ctx) return;
    if (sim) S.ctx.suspend().catch(() => {}); else S.ctx.resume().catch(() => {});
  }

  function ligar(sim) {
    S.ligado = sim;
    if (S.master) S.master.gain.setTargetAtTime(sim ? 1 : 0, S.ctx.currentTime, 0.05);
  }

  return { iniciar, tocar, passo, atualizar, pararLoops, largada, chegada, pausar, ligar, carro, get ligado() { return S.ligado; } };
}
