// Geometria do percurso, sem Three.js (testada em test/pista.test.js).
// Convenção: ângulo `ang` 0 aponta para -z; frente = (sin ang, -cos ang); direita = (cos ang, sin ang).

const M_POR_GRAU_LAT = 110540;
const M_POR_GRAU_LNG = 111320;

export const frente = (ang) => [Math.sin(ang), -Math.cos(ang)];
export const direita = (ang) => [Math.cos(ang), Math.sin(ang)];
export const anguloDe = (dx, dz) => Math.atan2(dx, -dz);
export const difAngulo = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));

// lat/lng → metros locais (x leste, z sul) a partir de uma origem
export function conversorLocal(lat0, lng0) {
  const kx = M_POR_GRAU_LNG * Math.cos((lat0 * Math.PI) / 180);
  return (lat, lng) => ({ x: (lng - lng0) * kx, z: -(lat - lat0) * M_POR_GRAU_LAT });
}

export function projetarLatLng(pontos) {
  const local = conversorLocal(pontos[0][0], pontos[0][1]);
  return pontos.map(([lat, lng, e]) => ({ ...local(lat, lng), e: e ?? 0 }));
}

// arredonda as esquinas mantendo início e fim
export function chaikin(pts, iteracoes = 2) {
  let p = pts;
  for (let it = 0; it < iteracoes; it++) {
    const novo = [p[0]];
    for (let i = 0; i < p.length - 1; i++) {
      const a = p[i], b = p[i + 1];
      novo.push({ x: a.x * 0.75 + b.x * 0.25, z: a.z * 0.75 + b.z * 0.25, e: a.e * 0.75 + b.e * 0.25 });
      novo.push({ x: a.x * 0.25 + b.x * 0.75, z: a.z * 0.25 + b.z * 0.75, e: a.e * 0.25 + b.e * 0.75 });
    }
    novo.push(p[p.length - 1]);
    p = novo;
  }
  return p;
}

function mediaMovel(valores, raio) {
  return valores.map((_, i) => {
    let soma = 0, n = 0;
    for (let k = Math.max(0, i - raio); k <= Math.min(valores.length - 1, i + raio); k++) { soma += valores[k]; n++; }
    return soma / n;
  });
}

// onde dois trechos do percurso passam no mesmo lugar (ida e volta, chegada cruzando a largada), o GPS dá
// alturas um pouco diferentes e o relevo exagerado vira "degrau": rua, torcida e árvores flutuando. Aqui os pontos
// a menos de 14 m de outro trecho (mais de 80 m de distância no percurso) ficam com a mesma altura, com transição suave.
// tira picos isolados (mediana de ~45 m) e suaviza (média de ~120 m): GPS de relógio erra a altitude aos saltos
export function suavizarAltitude(e, meiaMediana = 4, meiaMedia = 12) {
  const n = e.length;
  const med = e.map((_, i) => {
    const j = e.slice(Math.max(0, i - meiaMediana), Math.min(n, i + meiaMediana + 1)).sort((a, b) => a - b);
    return j[j.length >> 1];
  });
  return med.map((_, i) => {
    let soma = 0, k = 0;
    for (let j = Math.max(0, i - meiaMedia); j <= Math.min(n - 1, i + meiaMedia); j++) { soma += med[j]; k++; }
    return soma / k;
  });
}

// nenhum trecho do desenho mais inclinado que `max` (ida e volta no array até estabilizar)
export function limitarInclinacao(s, y0, max = 0.12) {
  const y = y0.slice();
  for (let volta = 0; volta < 6; volta++) {
    for (let i = 1; i < y.length; i++) {
      const lim = max * (s[i] - s[i - 1]);
      if (y[i] - y[i - 1] > lim) y[i] = y[i - 1] + lim; else if (y[i - 1] - y[i] > lim) y[i] = y[i - 1] - lim;
    }
    for (let i = y.length - 2; i >= 0; i--) {
      const lim = max * (s[i + 1] - s[i]);
      if (y[i] - y[i + 1] > lim) y[i] = y[i + 1] + lim; else if (y[i + 1] - y[i] > lim) y[i] = y[i + 1] - lim;
    }
  }
  return y;
}

export function unificarAlturas(x, z, s, y0, raio = 14) {
  const n = y0.length, C = raio, grade = new Map();
  const chave = (cx, cz) => cx + ',' + cz;
  for (let i = 0; i < n; i++) { const k = chave(Math.floor(x[i] / C), Math.floor(z[i] / C)); if (!grade.has(k)) grade.set(k, []); grade.get(k).push(i); }
  const vizinhos = [];
  for (let i = 0; i < n; i++) {
    const cx = Math.floor(x[i] / C), cz = Math.floor(z[i] / C), lista = [];
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (const j of grade.get(chave(cx + a, cz + b)) || []) {
      if (Math.abs(s[i] - s[j]) > 80 && Math.hypot(x[i] - x[j], z[i] - z[j]) < raio) lista.push(j);
    }
    vizinhos.push(lista);
  }
  if (!vizinhos.some((l) => l.length)) return y0;
  let y = y0.slice();
  for (let volta = 0; volta < 10; volta++) {
    const delta = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const l = vizinhos[i]; if (!l.length) continue;
      let soma = y[i]; for (const j of l) soma += y[j];
      delta[i] = soma / (l.length + 1) - y[i];
    }
    // espalha a correção ±40 m para não virar degrau
    const k = 24, suave = new Float64Array(n); // ±120 m
    let acc = 0;
    for (let i = 0; i < Math.min(n, k); i++) acc += delta[i];
    for (let i = 0; i < n; i++) {
      if (i + k < n) acc += delta[i + k];
      if (i - k - 1 >= 0) acc -= delta[i - k - 1];
      const a = Math.max(0, i - k), b = Math.min(n - 1, i + k);
      suave[i] = acc / (b - a + 1);
    }
    y = y.map((v, i) => v + (vizinhos[i].length ? delta[i] : suave[i]));
  }
  return y;
}

// trechos que passam de novo pela mesma rua (voltas, ida e volta na mesma pista): o ponto é puxado para cima da
// passagem anterior (já na posição final dela) e marcado como repetido (dup) — o desenho é feito uma vez só.
// A colagem entra e sai aos poucos ao longo do caminho (rampa suave de ~50 m), nunca pela distância. Os pontos da
// rampa continuam desenhados; quem evita a rua "por cima" da outra é o corte lateral (folgaLateral / lateral).
export function colarVoltas(x, z, s, { raio = 12, alcance = 30, minDs = 100, rampa = 10 } = {}) {
  const n = x.length, C = 20, grade = new Map(), dup = new Uint8Array(n);
  const ch = (a, b) => a + ',' + b;
  const x0 = Float64Array.from(x), z0 = Float64Array.from(z);
  const alvo = new Array(n).fill(null), cola = new Uint8Array(n);
  let naGrade = 0; // segmentos j < naGrade já estão na posição final e na grade
  const passoS = s[1] - s[0] || 5;
  const suave = (w) => w * w * (3 - 2 * w);
  const finalizar = (k) => {
    // peso da colagem: o ponto colado mais próximo ao longo do caminho (até `rampa` amostras)
    let w = 0, fonte = -1;
    for (let q = -rampa; q <= rampa; q++) {
      const j = k + q;
      if (j < 0 || j >= n || !cola[j]) continue;
      const wj = 1 - Math.abs(q) / (rampa + 1);
      if (wj > w) { w = wj; fonte = j; }
    }
    if (!w) return;
    // ponto colado vai para cima da passagem anterior; os da rampa acompanham o deslocamento do colado mais próximo,
    // cada vez menos (translação suave: sem "salto" no caminho do corredor perto dos retornos)
    if (cola[k]) { x[k] = alvo[k].qx; z[k] = alvo[k].qz; dup[k] = 1; return; }
    const f = suave(w);
    x[k] = x0[k] + (alvo[fonte].qx - x0[fonte]) * f; z[k] = z0[k] + (alvo[fonte].qz - z0[fonte]) * f;
  };
  for (let i = 0; i < n; i++) {
    // segmentos que já têm as duas pontas na posição final entram na grade
    for (; naGrade < i - rampa - 1; naGrade++) {
      const j = naGrade;
      const k = ch(Math.floor((x[j] + x[j + 1]) / 2 / C), Math.floor((z[j] + z[j + 1]) / 2 / C));
      if (!grade.has(k)) grade.set(k, []);
      grade.get(k).push(j);
    }
    const procurar = (i, alinhMin) => {
      const cx = Math.floor(x0[i] / C), cz = Math.floor(z0[i] / C);
      const ex = x0[Math.min(n - 1, i + 1)] - x0[Math.max(0, i - 1)], ez = z0[Math.min(n - 1, i + 1)] - z0[Math.max(0, i - 1)];
      const ant = i > 0 ? alvo[i - 1] : null;
      let melhor = null;
      for (let a = -2; a <= 2; a++) for (let b = -2; b <= 2; b++) for (const j of grade.get(ch(cx + a, cz + b)) || []) {
        if (s[j + 1] > s[i] - minDs) continue;
        const dx = x[j + 1] - x[j], dz = z[j + 1] - z[j], l2 = dx * dx + dz * dz || 1;
        // só cola se as duas passagens andam na mesma direção ou na contrária (mesma rua), não num cruzamento
        const alinh = Math.abs(ex * dx + ez * dz) / (Math.hypot(ex, ez) * Math.sqrt(l2) || 1);
        if (alinh < alinhMin) continue;
        const tt = ((x0[i] - x[j]) * dx + (z0[i] - z[j]) * dz) / l2;
        if (j === 0 && tt < 0) continue; // antes da largada: não amontoa os pontos no começo do percurso
        const t = Math.max(0, Math.min(1, tt));
        const qx = x[j] + dx * t, qz = z[j] + dz * t, d = Math.hypot(x0[i] - qx, z0[i] - qz);
        // continuidade: perto de um cruzamento de duas passagens anteriores, segue na mesma em que o ponto de trás colou
        const sj = s[j] + (s[j + 1] - s[j]) * t, nota = d + (ant && Math.abs(sj - ant.sj) > 30 ? 8 : 0);
        if (!melhor || nota < melhor.nota) melhor = { d, qx, qz, sj, nota };
      }
      return melhor && melhor.d <= alcance ? melhor : null;
    };
    alvo[i] = procurar(i, 0.9);
    // seguindo a mesma passagem anterior que o ponto de trás: avança nela no mesmo ritmo (nem para, nem volta,
    // nem pula), corrigindo devagar para o ponto mais próximo
    const ant = i > 0 && cola[i - 1] ? alvo[i - 1] : null;
    if (alvo[i] && ant && Math.abs(alvo[i].sj - ant.sj) < 30) {
      const ds = s[i] - s[i - 1], jA = Math.min(n - 2, Math.floor(ant.sj / passoS));
      const ex = x0[Math.min(n - 1, i + 1)] - x0[Math.max(0, i - 1)], ez = z0[Math.min(n - 1, i + 1)] - z0[Math.max(0, i - 1)];
      const sg = ex * (x[jA + 1] - x[jA]) + ez * (z[jA + 1] - z[jA]) >= 0 ? 1 : -1;
      const a = ant.sj + sg * ds * 0.6, b = ant.sj + sg * ds * 1.4;
      const sj = Math.max(Math.min(a, b), Math.min(Math.max(a, b), alvo[i].sj, s[i] - minDs));
      const k = Math.max(0, Math.min(n - 2, Math.floor(sj / passoS))), f = Math.max(0, Math.min(1, (sj - s[k]) / (s[k + 1] - s[k] || 1)));
      const qx = x[k] + (x[k + 1] - x[k]) * f, qz = z[k] + (z[k + 1] - z[k]) * f;
      alvo[i] = { d: Math.hypot(x0[i] - qx, z0[i] - qz), qx, qz, sj, nota: 0 };
    }
    // as duas ruas (8 m cada) se encostariam ou ficariam uma por cima da outra: vira uma rua só
    if (alvo[i] && alvo[i].d < raio) {
      cola[i] = 1;
      // buraco curto entre dois pedaços colados (a passagem de agora "corta" a esquina da anterior): cola também,
      // no ponto mais próximo da passagem anterior, sem exigir a mesma direção — nada de ilhota de rua na esquina
      let p = i - 1;
      while (p >= Math.max(0, i - 8) && !cola[p]) p--;
      if (p >= 0 && p >= i - 8 && p < i - 1 && cola[p]) {
        for (let j = p + 1; j < i; j++) { const q = procurar(j, 0); if (q) { alvo[j] = q; cola[j] = 1; } }
      }
    }
    if (i - rampa >= 0) finalizar(i - rampa);
  }
  for (let k = Math.max(0, n - rampa); k < n; k++) finalizar(k);
  // passo maior que o normal entre dois pontos mexidos (colou em passagens diferentes, ou rampa curta demais):
  // alisa só ali, puxando o ponto para o meio dos vizinhos
  const passo = (i) => Math.hypot(x[i + 1] - x[i], z[i + 1] - z[i]) / Math.max(0.5, s[i + 1] - s[i]);
  const mexido = (i) => x[i] !== x0[i] || z[i] !== z0[i];
  for (let volta = 0; volta < 40; volta++) {
    let algum = false;
    for (let i = 1; i < n - 1; i++) {
      if (!mexido(i) || Math.max(passo(i - 1), passo(i)) < 1.25) continue;
      x[i] = (x[i - 1] + x[i + 1]) / 2; z[i] = (z[i - 1] + z[i + 1]) / 2; algum = true;
    }
    if (!algum) break;
  }
  // último ponto (pedaço curto no fim) segue a direção do penúltimo trecho
  if (n > 2 && mexido(n - 1)) {
    const k = (s[n - 1] - s[n - 2]) / Math.max(1e-6, s[n - 2] - s[n - 3]);
    x[n - 1] = x[n - 2] + (x[n - 2] - x[n - 3]) * k; z[n - 1] = z[n - 2] + (z[n - 2] - z[n - 3]) * k;
  }
  return dup;
}

// faixa coberta pela rua (meia largura `meiaRua`) do segmento a→b ao longo da reta p + t·r: intervalo [t0, t1] ou null
// (ponta arredondada só onde a rua continua no segmento vizinho: no começo/fim de um trecho desenhado ela é reta)
// faixa [b0, b1] = afastamentos (à direita do segmento) que a rua dele realmente ocupa; padrão ±meiaRua
function intervaloRua(px, pz, rx, rz, ax, az, bx, bz, meiaRua, pontaA = true, pontaB = true, b0 = -meiaRua, b1 = meiaRua) {
  const dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz);
  let t0 = Infinity, t1 = -Infinity;
  const disco = (cx, cz) => {
    const wx = cx - px, wz = cz - pz, tc = wx * rx + wz * rz, perp2 = wx * wx + wz * wz - tc * tc;
    if (perp2 < meiaRua * meiaRua) { const h = Math.sqrt(meiaRua * meiaRua - perp2); t0 = Math.min(t0, tc - h); t1 = Math.max(t1, tc + h); }
  };
  if (pontaA) disco(ax, az);
  if (pontaB) disco(bx, bz);
  if (L > 1e-6) {
    const ux = dx / L, uz = dz / L, nx = -uz, nz = ux;
    const al0 = (px - ax) * ux + (pz - az) * uz, ru = rx * ux + rz * uz;
    const be0 = (px - ax) * nx + (pz - az) * nz, rn = rx * nx + rz * nz;
    let lo = -Infinity, hi = Infinity;
    if (Math.abs(ru) > 1e-9) { const q0 = -al0 / ru, q1 = (L - al0) / ru; lo = Math.max(lo, Math.min(q0, q1)); hi = Math.min(hi, Math.max(q0, q1)); }
    else if (al0 < 0 || al0 > L) hi = -Infinity;
    if (Math.abs(rn) > 1e-9) { const q0 = (b0 - be0) / rn, q1 = (b1 - be0) / rn; lo = Math.max(lo, Math.min(q0, q1)); hi = Math.min(hi, Math.max(q0, q1)); }
    if (lo < hi) { t0 = Math.min(t0, lo); t1 = Math.max(t1, hi); }
  }
  return t0 < t1 ? [t0, t1] : null;
}

function unir(lista) {
  lista.sort((a, b) => a[0] - b[0]);
  const out = [];
  for (const iv of lista) { const u = out[out.length - 1]; if (u && iv[0] <= u[1]) u[1] = Math.max(u[1], iv[1]); else out.push([iv[0], iv[1]]); }
  return out;
}

// limites de desenho no ponto (px, pz) com direção `ang`, contra a rua dos OUTROS trechos desenhados do percurso
// (|Δs| > 60 m, quase paralelos — cruzamento de verdade fica como está; passagens repetidas não contam).
// Na reta lateral do ponto (t > 0 = direita) marca onde a rua de cada outro trecho passa:
// - rua: a rua deste ponto ocupa [-ruaE, ruaD] dentro de ±meiaRua, sem a parte já coberta pela rua de um trecho
//   desenhado ANTES (que tem a preferência): numa ida e volta que se aproxima, a rua de depois "encosta" na de antes;
// - lim: calçada, grama e avenida vão no máximo até o meio do vão entre a beira desta rua e a da outra.
const SEM = 1e6;
export function folgaEm(seg, x, z, s, px, pz, ang, sRef, { alcance = 40, meiaRua = 4, todosAntes = false, folga = 0.3, elev = null, elevRef = 0 } = {}) {
  const [rx, rz] = direita(ang), [fx, fz] = frente(ang);
  const C = seg.C, cx = Math.floor(px / C), cz = Math.floor(pz / C), viz = Math.ceil((alcance + meiaRua) / C);
  const ant = [], todos = [], marca = seg.marca, vez = ++seg.vez;
  for (let p = -viz; p <= viz; p++) for (let q = -viz; q <= viz; q++) for (const j of seg.grade.get((cx + p) + ',' + (cz + q)) || []) {
    if (marca[j] === vez) continue;
    marca[j] = vez;
    const perto = Math.min(Math.abs(s[j] - sRef), Math.abs(s[j + 1] - sRef));
    if (perto < 15) continue; // o próprio trecho
    if (elev && Math.abs((elev[j] + elev[j + 1]) / 2 - elevRef) > 2.5) continue; // viaduto: um passa por cima do outro
    const dx = x[j + 1] - x[j], dz = z[j + 1] - z[j], l = Math.hypot(dx, dz);
    if (l < 1e-6 || Math.abs(dx * fx + dz * fz) / l < 0.35) continue; // cruzamento (mais de ~70°)
    // logo antes/depois no percurso só conta se já voltou no sentido contrário (retorno fechado: a calçada dobraria)
    if (perto < 60 && (dx * fx + dz * fz) / l > -0.3) continue;
    const desenhado = (k) => k >= 0 && k < x.length - 1 && !seg.dup[k] && !seg.dup[k + 1];
    const iv = intervaloRua(px, pz, rx, rz, x[j], z[j], x[j + 1], z[j + 1], meiaRua, desenhado(j - 1), desenhado(j + 1));
    if (!iv || iv[1] < -alcance || iv[0] > alcance) continue;
    const ivf = [iv[0] - folga, iv[1] + folga];
    todos.push(ivf);
    if (!todosAntes && Math.min(s[j], s[j + 1]) >= sRef) continue;
    // o trecho de antes pode ter a rua encolhida por um terceiro ainda mais antigo: vale o que ele desenha de fato
    const b0 = seg.ruaE ? -Math.min(seg.ruaE[j], seg.ruaE[j + 1]) : -meiaRua, b1 = seg.ruaD ? Math.min(seg.ruaD[j], seg.ruaD[j + 1]) : meiaRua;
    if (b0 <= -meiaRua + 1e-3 && b1 >= meiaRua - 1e-3) { ant.push(ivf); continue; }
    if (b1 - b0 < 0.05) continue;
    const ivr = intervaloRua(px, pz, rx, rz, x[j], z[j], x[j + 1], z[j + 1], meiaRua, false, false, b0, b1);
    if (ivr) ant.push([ivr[0] - folga, ivr[1] + folga]);
  }
  // rua deste ponto: o maior pedaço livre de [-meiaRua, meiaRua] (de preferência o que contém o eixo)
  let lo = -meiaRua, hi = meiaRua;
  if (ant.length) {
    const livres = [];
    let ini = -meiaRua;
    for (const [a, b] of unir(ant)) {
      if (b <= ini) continue;
      if (a >= meiaRua) break;
      if (a > ini) livres.push([ini, a]);
      ini = Math.max(ini, b);
    }
    if (ini < meiaRua) livres.push([ini, meiaRua]);
    const comEixo = livres.find(([a, b]) => a <= 0 && b >= 0);
    const melhor = comEixo || livres.sort((a, b) => (b[1] - b[0]) - (a[1] - a[0]))[0];
    if (melhor && melhor[1] - melhor[0] > 0.05) [lo, hi] = melhor; else lo = hi = 0;
  }
  // até onde vai o resto de cada lado: metade do vão até a rua de outro trecho
  let limD = SEM, limE = SEM;
  for (const [a, b] of unir(todos)) {
    if (b > hi) limD = Math.min(limD, a <= hi ? hi : (a + Math.max(hi, meiaRua)) / 2 - 0.1);
    if (a < lo) limE = Math.min(limE, b >= lo ? -lo : (-b + Math.max(-lo, meiaRua)) / 2 - 0.1);
  }
  return { ruaD: hi, ruaE: -lo, limD, limE };
}

// grade dos segmentos desenhados (os dois pontos fora de trecho repetido)
export function gradeDesenhada(x, z, dup, C = 10) {
  const grade = new Map();
  for (let j = 0; j < x.length - 1; j++) {
    if (dup[j] || dup[j + 1]) continue;
    const x0 = Math.floor(Math.min(x[j], x[j + 1]) / C), x1 = Math.floor(Math.max(x[j], x[j + 1]) / C);
    const z0 = Math.floor(Math.min(z[j], z[j + 1]) / C), z1 = Math.floor(Math.max(z[j], z[j + 1]) / C);
    for (let a = x0; a <= x1; a++) for (let b = z0; b <= z1; b++) {
      const k = a + ',' + b;
      if (!grade.has(k)) grade.set(k, []);
      grade.get(k).push(j);
    }
  }
  return { grade, C, dup, marca: new Int32Array(x.length), vez: 0 };
}

// para cada ponto: folga de cada lado (folgaEm) e o raio da curva com sinal (+ = curva para a direita)
export function folgaLateral(x, z, s, dup, alcance = 40, elev = null) {
  const n = x.length, seg = gradeDesenhada(x, z, dup);
  const campos = ['ruaD', 'ruaE', 'limD', 'limE'];
  const out = Object.fromEntries(campos.map((c) => [c, new Float32Array(n).fill(4)]));
  // calculado em ordem: cada ponto já conhece a rua que os trechos de antes desenham de fato
  seg.ruaD = out.ruaD; seg.ruaE = out.ruaE;
  const raio = new Float32Array(n).fill(1e6);
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - 2), b = Math.min(n - 1, i + 2);
    const f = folgaEm(seg, x, z, s, x[i], z[i], anguloDe(x[b] - x[a], z[b] - z[a]), s[i], { alcance, elev, elevRef: elev ? elev[i] : 0 });
    for (const c of campos) out[c][i] = f[c];
    // curvatura: mudança de direção em ~12 m
    const i0 = Math.max(0, i - 3), i1 = Math.min(n - 1, i + 3);
    if (i0 + 1 < n && i1 - 1 >= 0) {
      const a1 = anguloDe(x[i0 + 1] - x[i0], z[i0 + 1] - z[i0]), a2 = anguloDe(x[i1] - x[i1 - 1], z[i1] - z[i1 - 1]);
      let da = a2 - a1; while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI;
      const L = s[i1] - s[i0];
      if (Math.abs(da) > 1e-3 && L > 0) raio[i] = L / da;
    }
  }
  return { ...out, raio, seg };
}

// limites de desenho com a curva: calçada e grama não dobram numa curva fechada (lado de dentro)
export function limitesLaterais(f, raio) {
  const curvaD = raio > 0 ? raio * 0.85 : Infinity, curvaE = raio < 0 ? -raio * 0.85 : Infinity;
  return { ruaD: f.ruaD, ruaE: f.ruaE, limD: Math.min(f.limD, curvaD), limE: Math.min(f.limE, curvaE) };
}

export class PistaReal {
  constructor(pontosLatLng, { passo = 5, exagero = 1.6 } = {}) {
    const validos = pontosLatLng.filter((p) => Array.isArray(p) && p.length >= 2);
    this.paraLocal = conversorLocal(validos[0][0], validos[0][1]);
    let pts = projetarLatLng(validos);
    const eSuave = mediaMovel(pts.map((p) => p.e), 1);
    pts = chaikin(pts.map((p, i) => ({ ...p, e: eSuave[i] })), 2);

    // reamostra em passos fixos ao longo do caminho
    const x = [pts[0].x], z = [pts[0].z], e = [pts[0].e], s = [0];
    let acumulado = 0, resto = 0;
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      const seg = Math.hypot(b.x - a.x, b.z - a.z);
      if (seg < 1e-6) continue;
      let t = passo - resto;
      while (t <= seg) {
        const f = t / seg;
        x.push(a.x + (b.x - a.x) * f); z.push(a.z + (b.z - a.z) * f); e.push(a.e + (b.e - a.e) * f);
        s.push(acumulado + t);
        t += passo;
      }
      resto = seg - (t - passo);
      acumulado += seg;
    }
    if (acumulado - s[s.length - 1] > 0.5) {
      const ult = pts[pts.length - 1];
      x.push(ult.x); z.push(ult.z); e.push(ult.e); s.push(acumulado);
    }

    // segunda volta / mesmo trecho de rua passado de novo: cola no desenho da primeira passagem (sem pista duplicada)
    this.dup = colarVoltas(x, z, s);
    this.x = x; this.z = z; this.e = e; this.s = s;
    // espaço livre de cada lado (até outro trecho do percurso) e raio das curvas: limitam o desenho de calçada e grama
    Object.assign(this, folgaLateral(x, z, s, this.dup));
    this.total = s[s.length - 1];
    // altura do desenho: sem os picos do GPS, suave e com inclinação limitada (a do jogo continua vindo de `inc`)
    const eDesenho = suavizarAltitude(e);
    let y = eDesenho.map((v) => (v - eDesenho[0]) * exagero);
    for (let i = 0; i < 4; i++) y = limitarInclinacao(s, unificarAlturas(x, z, s, y), 0.12); // as duas regras juntas
    this.y = y;
    this.yChao = y; // altura do terreno (sem viaduto)

    // inclinação real numa janela de ~40 m, limitada a ±12%
    const k = Math.max(1, Math.round(20 / passo));
    this.inc = e.map((_, i) => {
      const a = Math.max(0, i - k), b = Math.min(e.length - 1, i + k);
      const ds = s[b] - s[a];
      return ds > 0 ? Math.max(-0.12, Math.min(0.12, (e[b] - e[a]) / ds)) : 0;
    });
    this.subidaM = e.reduce((acc, v, i) => acc + (i && v > e[i - 1] ? v - e[i - 1] : 0), 0);
  }

  indice(s) {
    const arr = this.s;
    if (s <= 0) return 0;
    if (s >= this.total) return arr.length - 2;
    let lo = 0, hi = arr.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (arr[m] <= s) lo = m; else hi = m; }
    return lo;
  }

  // limites de desenho no ponto s (ver limitesLaterais); dup = trecho repetido (já desenhado na primeira passagem)
  // com (px, pz, ang) a folga é medida exatamente ali (amostras do desenho), senão vem da amostra de 5 m mais próxima
  lateral(s, px, pz, ang) {
    const i = Math.min(this.s.length - 1, Math.max(0, Math.round(s / Math.max(1e-6, this.s[1] - this.s[0]))));
    const f = px === undefined ? { ruaD: this.ruaD[i], ruaE: this.ruaE[i], limD: this.limD[i], limE: this.limE[i] }
      : folgaEm(this.seg, this.x, this.z, this.s, px, pz, ang, s, { elev: this.elev, elevRef: this.elevacao(s) });
    return { dup: !!this.dup[i], elev: this.elev ? this.elev[i] : 0, ...limitesLaterais(f, this.raio[i]) };
  }

  // altura extra do desenho no ponto s (viaduto); 0 no chão
  elevacao(s) {
    if (!this.elev || s < 0 || s > this.total) return 0;
    const i = this.indice(s), f = Math.max(0, Math.min(1, (s - this.s[i]) / (this.s[i + 1] - this.s[i] || 1)));
    return this.elev[i] + (this.elev[i + 1] - this.elev[i]) * f;
  }

  // trechos que passam por cima de outro trecho do percurso (viadutosDoPercurso): sobem `altura` metros no cruzamento,
  // com rampas suaves (até `rampaMax` m de cada lado) só onde não há outro trecho do percurso ao lado — a rampa nunca
  // começa em cima de uma avenida por onde o percurso também passa no chão. A altura do terreno (pertoDe) não muda.
  elevar(trechos, { altura = 6, rampaMax = 100, margem = 14 } = {}) {
    const n = this.s.length, elev = new Float32Array(n), passo = this.s[1] - this.s[0];
    const suave = (t) => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };
    const sobs = trechos.flatMap((t) => t.sob);
    // outro trecho desenhado (que não é o de baixo no cruzamento) a menos de 12 m do ponto i
    const vizinho = (i) => {
      for (const j of this.segmentosPerto(this.x[i], this.z[i])) {
        if (Math.abs(this.s[j] - this.s[i]) < 60 || this.dup[j] || this.dup[j + 1] || sobs.some((v) => Math.abs(v - this.s[j]) < 30)) continue;
        const dx = this.x[j + 1] - this.x[j], dz = this.z[j + 1] - this.z[j], l2 = dx * dx + dz * dz || 1;
        const t = Math.max(0, Math.min(1, ((this.x[i] - this.x[j]) * dx + (this.z[i] - this.z[j]) * dz) / l2));
        if (Math.hypot(this.x[i] - this.x[j] - dx * t, this.z[i] - this.z[j] - dz * t) < 12) return true;
      }
      return false;
    };
    this.rampas = [];
    for (const t of trechos) {
      // passagem repetida (2ª volta colada na 1ª) não tem rampa própria: copia a altura de baixo (logo abaixo)
      if (t.cruz.every((v) => this.dup[Math.round(v / passo)])) continue;
      const c0 = Math.min(...t.cruz) - margem, c1 = Math.max(...t.cruz) + margem;
      let i0 = this.indice(Math.max(0, c0)), i1 = Math.min(n - 1, this.indice(c1) + 1);
      let a = i0, b = i1;
      while (a > 0 && this.s[i0] - this.s[a - 1] <= rampaMax && !vizinho(a - 1)) a--;
      while (b < n - 1 && this.s[b + 1] - this.s[i1] <= rampaMax && !vizinho(b + 1)) b++;
      const antes = Math.max(passo, this.s[i0] - this.s[a]), depois = Math.max(passo, this.s[b] - this.s[i1]);
      this.rampas.push({ s0: this.s[a], topo0: this.s[i0], topo1: this.s[i1], s1: this.s[b] });
      for (let i = a; i <= b; i++) {
        const v = this.s[i];
        const h = i < i0 ? suave((v - this.s[a]) / antes) : i > i1 ? suave((this.s[b] - v) / depois) : 1;
        elev[i] = Math.max(elev[i], altura * h);
      }
    }
    // trecho repetido (colado em cima de outro): mesma altura do desenho embaixo dele
    for (let i = 0; i < n; i++) {
      if (!this.dup[i]) continue;
      let melhor = Infinity, h = 0;
      for (const j of this.segmentosPerto(this.x[i], this.z[i])) {
        if (this.dup[j] || this.dup[j + 1] || Math.abs(this.s[j] - this.s[i]) < 60) continue;
        const dx = this.x[j + 1] - this.x[j], dz = this.z[j + 1] - this.z[j], l2 = dx * dx + dz * dz || 1;
        const t = Math.max(0, Math.min(1, ((this.x[i] - this.x[j]) * dx + (this.z[i] - this.z[j]) * dz) / l2));
        const d = Math.hypot(this.x[i] - this.x[j] - dx * t, this.z[i] - this.z[j] - dz * t);
        // no cruzamento do viaduto há dois desenhos embaixo: fica com o que anda na mesma direção
        const al = Math.abs(dx * (this.x[Math.min(n - 1, i + 1)] - this.x[Math.max(0, i - 1)]) + dz * (this.z[Math.min(n - 1, i + 1)] - this.z[Math.max(0, i - 1)])) / (Math.sqrt(l2) * 10 || 1);
        const nota = d + (al < 0.7 ? 20 : 0);
        if (nota < melhor) { melhor = nota; h = elev[j] + (elev[j + 1] - elev[j]) * t; }
      }
      if (melhor < 25) elev[i] = h;
    }
    this.elev = elev;
    this.viadutos = trechos;
    this.y = this.yChao.map((v, i) => v + elev[i]);
    Object.assign(this, folgaLateral(this.x, this.z, this.s, this.dup, 40, elev));
  }

  // limites num ponto fora do percurso (rua antes da largada / depois da chegada): cede a vez a todos os trechos
  lateralEm(px, pz, ang, sRef) {
    const f = folgaEm(this.seg, this.x, this.z, this.s, px, pz, ang, sRef, { todosAntes: true, elev: this.elev });
    const l = limitesLaterais(f, 1e6);
    // outro trecho do percurso ali perto (num circuito, a chegada passa atrás da largada): não desenha
    return { dup: l.ruaD < 3.99 || l.ruaE < 3.99 || l.limD < 8 || l.limE < 8, fora: true, ...l };
  }

  em(s) {
    const i = this.indice(s), j = i + 1;
    const ds = this.s[j] - this.s[i] || 1;
    const f = Math.max(0, Math.min(1, (s - this.s[i]) / ds));
    const dx = this.x[j] - this.x[i], dz = this.z[j] - this.z[i];
    return {
      x: this.x[i] + dx * f, z: this.z[i] + dz * f,
      y: this.y[i] + (this.y[j] - this.y[i]) * f,
      ang: anguloDe(dx, dz),
      inclinacao: this.inc[i] + (this.inc[j] - this.inc[i]) * f
    };
  }

  // ponto da pista mais próximo de (px, pz), procurando perto de sDica para não "pular" para outro trecho
  projetar(px, pz, sDica = 0, atras = 40, frenteM = 80) {
    const i0 = this.indice(Math.max(0, sDica - atras)), i1 = Math.min(this.s.length - 2, this.indice(sDica + frenteM) + 1);
    let melhor = null;
    for (let i = i0; i <= i1; i++) {
      const ax = this.x[i], az = this.z[i], dx = this.x[i + 1] - ax, dz = this.z[i + 1] - az;
      const l2 = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / l2));
      const qx = ax + dx * t, qz = az + dz * t;
      const dist2 = (px - qx) ** 2 + (pz - qz) ** 2;
      if (!melhor || dist2 < melhor.dist2) {
        const [rx, rz] = direita(anguloDe(dx, dz));
        melhor = { dist2, s: this.s[i] + (this.s[i + 1] - this.s[i]) * t, d: (px - qx) * rx + (pz - qz) * rz };
      }
    }
    return { s: melhor.s, d: melhor.d };
  }

  // posição de um ponto lat/lng qualquer no percurso (busca no percurso inteiro)
  localizar(lat, lng) {
    const { x, z } = this.paraLocal(lat, lng);
    return this.projetar(x, z, this.total / 2, this.total, this.total);
  }

  // ponto do percurso mais próximo de (x, z) em qualquer trecho: altura visual e distância até a rua
  pertoDe(x, z, raioMax = 400) {
    const C = 40;
    this.segmentosPerto(x, z);
    const cx = Math.floor(x / C), cz = Math.floor(z / C);
    let melhor = null;
    for (let r = 1; r * C <= raioMax + C; r++) {
      for (let a = cx - r; a <= cx + r; a++) for (let b = cz - r; b <= cz + r; b++) {
        if (Math.max(Math.abs(a - cx), Math.abs(b - cz)) !== r && r > 1) continue;
        for (const i of this.grade.get(a + ',' + b) || []) {
          const ax = this.x[i], az = this.z[i], dx = this.x[i + 1] - ax, dz = this.z[i + 1] - az;
          const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1)));
          const dist = Math.hypot(x - ax - dx * t, z - az - dz * t);
          if (!melhor || dist < melhor.dist) melhor = { dist, y: this.yChao[i] + (this.yChao[i + 1] - this.yChao[i]) * t, s: this.s[i] + (this.s[i + 1] - this.s[i]) * t };
        }
      }
      if (melhor && melhor.dist <= (r - 1) * C) break;
    }
    return melhor || { dist: Infinity, y: 0, s: 0 };
  }

  // índices dos segmentos que passam perto de (x, z), via grade de 40 m
  segmentosPerto(x, z) {
    const C = 40;
    if (!this.grade) {
      this.grade = new Map();
      for (let i = 0; i < this.s.length - 1; i++) {
        const x0 = Math.floor(Math.min(this.x[i], this.x[i + 1]) / C), x1 = Math.floor(Math.max(this.x[i], this.x[i + 1]) / C);
        const z0 = Math.floor(Math.min(this.z[i], this.z[i + 1]) / C), z1 = Math.floor(Math.max(this.z[i], this.z[i + 1]) / C);
        for (let a = x0; a <= x1; a++) for (let b = z0; b <= z1; b++) {
          const k = a + ',' + b;
          if (!this.grade.has(k)) this.grade.set(k, []);
          this.grade.get(k).push(i);
        }
      }
    }
    const cx = Math.floor(x / C), cz = Math.floor(z / C), achados = new Set();
    for (let a = cx - 1; a <= cx + 1; a++) for (let b = cz - 1; b <= cz + 1; b++) for (const i of this.grade.get(a + ',' + b) || []) achados.add(i);
    return achados;
  }
}

// treino: reta infinita e plana
export class PistaReta {
  constructor() { this.total = Infinity; this.subidaM = 0; }
  em(s) { return { x: 0, z: -s, y: 0, ang: 0, inclinacao: 0 }; }
  projetar(px, pz) { return { s: -pz, d: px }; }
}
