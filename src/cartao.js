// Cartão de compartilhar da chegada (1080×1920, formato story): prova, tempo, pace, colocação, medalha,
// o desenho do percurso feito e o endereço do jogo. Gera uma imagem PNG (Blob).

const W = 1080, H = 1920;

function linhaPercurso(g, pista, sAte, caixa) {
  const xs = pista.x, zs = pista.z;
  const minX = Math.min(...xs), maxX = Math.max(...xs), minZ = Math.min(...zs), maxZ = Math.max(...zs);
  const [cx, cy, cw, ch] = caixa;
  const esc = Math.min(cw / Math.max(maxX - minX, 1), ch / Math.max(maxZ - minZ, 1));
  const ox = cx + (cw - (maxX - minX) * esc) / 2, oy = cy + (ch - (maxZ - minZ) * esc) / 2;
  const p = (i) => [ox + (xs[i] - minX) * esc, oy + (zs[i] - minZ) * esc];
  g.lineCap = g.lineJoin = 'round';
  // percurso inteiro, clarinho
  g.strokeStyle = 'rgba(255,255,255,0.22)'; g.lineWidth = 22;
  g.beginPath(); for (let i = 0; i < xs.length; i += 2) { const [a, b] = p(i); i ? g.lineTo(a, b) : g.moveTo(a, b); } g.stroke();
  // o que foi corrido, em amarelo
  g.strokeStyle = '#ffd21f'; g.lineWidth = 16;
  g.beginPath();
  for (let i = 0; i < xs.length && pista.s[i] <= sAte; i += 2) { const [a, b] = p(i); i ? g.lineTo(a, b) : g.moveTo(a, b); }
  g.stroke();
  const [lx, ly] = p(0);
  g.fillStyle = '#1fae5b'; g.beginPath(); g.arc(lx, ly, 20, 0, Math.PI * 2); g.fill();
  let fim = 0; while (fim < xs.length - 1 && pista.s[fim] < sAte) fim++;
  const [fx, fy] = p(fim);
  g.fillStyle = '#e63946'; g.beginPath(); g.arc(fx, fy, 20, 0, Math.PI * 2); g.fill();
}

// d = { titulo, prova, tempo, pace, distancia, colocacao, total, medalha, frase, pontos, clima, pista, sAte }
export async function gerarCartao(d) {
  try { await document.fonts?.load('800 80px "Baloo 2"'); } catch { /* usa a fonte do sistema */ }
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  const fundo = g.createLinearGradient(0, 0, 0, H);
  fundo.addColorStop(0, '#0d3b8a'); fundo.addColorStop(0.55, '#123a6e'); fundo.addColorStop(1, '#0a1d3a');
  g.fillStyle = fundo; g.fillRect(0, 0, W, H);
  const F = (peso, tam) => `${peso} ${tam}px "Baloo 2", system-ui, sans-serif`;
  g.textAlign = 'center'; g.textBaseline = 'alphabetic';
  // marca
  g.fillStyle = '#ffffff'; g.font = F(800, 96); g.fillText('Mapmove', W / 2, 170);
  g.fillStyle = '#ffd21f'; g.font = F(800, 96); g.fillText('Run', W / 2, 262);
  // prova
  g.fillStyle = 'rgba(255,255,255,0.85)'; g.font = F(600, 44);
  g.fillText(d.prova, W / 2, 350);
  // medalha / título
  if (d.medalha) { g.font = F(800, 150); g.fillText(d.medalha, W / 2, 530); }
  g.fillStyle = '#ffffff'; g.font = F(800, 64); g.fillText(d.titulo, W / 2, d.medalha ? 630 : 470);
  // percurso
  if (d.pista) linhaPercurso(g, d.pista, d.sAte, [140, 680, W - 280, 560]);
  // números
  const caixa = (x, y, rot, val) => {
    g.fillStyle = 'rgba(255,255,255,0.1)';
    const w = 440, h = 190, r = 34;
    g.beginPath(); g.roundRect(x - w / 2, y, w, h, r); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.75)'; g.font = F(600, 38); g.fillText(rot, x, y + 62);
    g.fillStyle = '#ffffff'; g.font = F(800, 76); g.fillText(val, x, y + 150);
  };
  caixa(W / 2 - 235, 1290, 'Tempo', d.tempo);
  caixa(W / 2 + 235, 1290, 'Pace médio', d.pace);
  caixa(W / 2 - 235, 1500, 'Distância', d.distancia);
  caixa(W / 2 + 235, 1500, d.colocacao ? 'Colocação' : 'Pontos', d.colocacao ? `${d.colocacao}º/${d.total}` : `⭐ ${d.pontos}`);
  if (d.frase) { g.fillStyle = '#ffd27a'; g.font = F(700, 40); g.fillText(d.frase, W / 2, 1765); }
  g.fillStyle = 'rgba(255,255,255,0.9)'; g.font = F(800, 44); g.fillText('jogo.mapmove.com.br', W / 2, 1855);
  return new Promise((ok) => c.toBlob((b) => ok(b), 'image/png'));
}
