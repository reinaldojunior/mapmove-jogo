// Preenche as bordas entre as peças de uma textura de atlas (Meshy, Tripo...).
// O atlas cola pele, roupa e pelo lado a lado com uma borda vazia (branca) entre eles; quando a textura é
// reduzida (mipmaps, celular) essa borda vaza e vira riscos/manchas brancas no modelo. Aqui desenhamos onde
// ficam as peças (pelas coordenadas UV da malha) e estendemos a cor de cada peça por cima da borda.

const LADO_MASCARA = 1024;

function mascaraUV(geometrias, w, h) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.fillStyle = '#fff'; g.strokeStyle = '#fff'; g.lineWidth = 1.5;
  for (const geo of geometrias) {
    const uv = geo.attributes.uv; if (!uv) continue;
    const idx = geo.index ? geo.index.array : null;
    const n = idx ? idx.length : uv.count;
    g.beginPath();
    for (let i = 0; i < n; i += 3) {
      const a = idx ? idx[i] : i, b = idx ? idx[i + 1] : i + 1, d = idx ? idx[i + 2] : i + 2;
      // glTF: uv (0,0) é o canto de cima da imagem (flipY = false)
      g.moveTo(uv.getX(a) * w, uv.getY(a) * h);
      g.lineTo(uv.getX(b) * w, uv.getY(b) * h);
      g.lineTo(uv.getX(d) * w, uv.getY(d) * h);
      g.closePath();
    }
    g.fill(); g.stroke();
  }
  const dados = g.getImageData(0, 0, w, h).data, m = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) m[i] = dados[i * 4 + 3] > 0 ? 1 : 0;
  return m;
}

// estende as peças para fora, `passos` pixels, usando a média dos vizinhos que já têm cor. Cada passo só olha a
// "beirada" (pixels vazios encostados numa peça), em vez da imagem inteira: o resultado é o mesmo, bem mais rápido
function dilatar(px, mascara, w, h, passos) {
  let m = mascara;
  const marcado = new Uint8Array(w * h);
  let beirada = [];
  const vizinhosVazios = (i, lista) => {
    const x = i % w, y = (i - x) / w;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const xx = x + dx, yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
      const j = yy * w + xx;
      if (!m[j] && !marcado[j]) { marcado[j] = 1; lista.push(j); }
    }
  };
  for (let i = 0; i < w * h; i++) if (m[i]) vizinhosVazios(i, beirada);
  for (let p = 0; p < passos && beirada.length; p++) {
    beirada.sort((a, b) => a - b);
    const nova = m.slice(), pintados = [];
    for (const i of beirada) {
      const x = i % w, y = (i - x) / w;
      let r = 0, g = 0, b = 0, n = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
        const j = yy * w + xx;
        if (!m[j]) continue;
        r += px[j * 4]; g += px[j * 4 + 1]; b += px[j * 4 + 2]; n++;
      }
      if (!n) continue;
      px[i * 4] = r / n; px[i * 4 + 1] = g / n; px[i * 4 + 2] = b / n; px[i * 4 + 3] = 255;
      nova[i] = 1; pintados.push(i);
    }
    m = nova;
    beirada = [];
    for (const i of pintados) vizinhosVazios(i, beirada);
  }
}

const feitas = new WeakMap();
// corrige as texturas de um material (cor, relevo, brilho) usando as UVs das geometrias que o usam
export function preencherBordas(texturas, geometrias, passos = 12) {
  const mascaras = new Map(); // cor, relevo e brilho do mesmo material usam as mesmas UVs: desenha a máscara uma vez
  for (const t of texturas) {
    if (!t?.image || feitas.has(t)) continue;
    const img = t.image, W = img.width, H = img.height;
    if (!W || !H) continue;
    const w = Math.min(W, LADO_MASCARA), h = Math.min(H, LADO_MASCARA);
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(img, 0, 0, w, h);
    const dados = g.getImageData(0, 0, w, h);
    const chave = w + 'x' + h;
    if (!mascaras.has(chave)) mascaras.set(chave, mascaraUV(geometrias, w, h));
    dilatar(dados.data, mascaras.get(chave), w, h, passos);
    g.putImageData(dados, 0, 0);
    t.image = c;
    t.needsUpdate = true;
    feitas.set(t, true);
  }
}
