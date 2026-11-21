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

// estende as peças para fora, `passos` pixels, usando a média dos vizinhos que já têm cor
function dilatar(px, mascara, w, h, passos) {
  let m = mascara;
  for (let p = 0; p < passos; p++) {
    const nova = m.slice();
    let mudou = false;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (m[i]) continue;
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
      nova[i] = 1; mudou = true;
    }
    m = nova;
    if (!mudou) break;
  }
}

const feitas = new WeakMap();
// corrige as texturas de um material (cor, relevo, brilho) usando as UVs das geometrias que o usam
export function preencherBordas(texturas, geometrias, passos = 12) {
  for (const t of texturas) {
    if (!t?.image || feitas.has(t)) continue;
    const img = t.image, W = img.width, H = img.height;
    if (!W || !H) continue;
    const w = Math.min(W, LADO_MASCARA), h = Math.min(H, LADO_MASCARA);
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(img, 0, 0, w, h);
    const dados = g.getImageData(0, 0, w, h);
    dilatar(dados.data, mascaraUV(geometrias, w, h), w, h, passos);
    g.putImageData(dados, 0, 0);
    t.image = c;
    t.needsUpdate = true;
    feitas.set(t, true);
  }
}
