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
// primeira passagem e marcado como repetido (dup) — o desenho é feito uma vez só
export function colarVoltas(x, z, s, raio = 9, minDs = 300) {
  const n = x.length, C = 20, grade = new Map(), dup = new Uint8Array(n);
  const ch = (a, b) => a + ',' + b;
  for (let i = 0; i < n - 1; i++) {
    const k = ch(Math.floor(x[i] / C), Math.floor(z[i] / C));
    if (!grade.has(k)) grade.set(k, []);
    grade.get(k).push(i);
  }
  const x0 = Float64Array.from(x), z0 = Float64Array.from(z);
  for (let i = 0; i < n; i++) {
    const cx = Math.floor(x0[i] / C), cz = Math.floor(z0[i] / C);
    let melhor = null;
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (const j of grade.get(ch(cx + a, cz + b)) || []) {
      if (s[j] > s[i] - minDs) continue;
      const dx = x0[j + 1] - x0[j], dz = z0[j + 1] - z0[j], l2 = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((x0[i] - x0[j]) * dx + (z0[i] - z0[j]) * dz) / l2));
      const qx = x0[j] + dx * t, qz = z0[j] + dz * t, d = Math.hypot(x0[i] - qx, z0[i] - qz);
      // só cola se as duas passagens andam na mesma direção ou na contrária (mesma rua), não num cruzamento
      const ex = x0[Math.min(n - 1, i + 1)] - x0[Math.max(0, i - 1)], ez = z0[Math.min(n - 1, i + 1)] - z0[Math.max(0, i - 1)];
      const alinh = Math.abs(ex * dx + ez * dz) / (Math.hypot(ex, ez) * Math.sqrt(l2) || 1);
      if (alinh < 0.9) continue;
      if (!melhor || d < melhor.d) melhor = { d, qx, qz };
    }
    if (!melhor || melhor.d > raio) continue;
    const w = Math.max(0, Math.min(1, (raio - melhor.d) / 3));
    x[i] = x0[i] + (melhor.qx - x0[i]) * w; z[i] = z0[i] + (melhor.qz - z0[i]) * w;
    if (melhor.d < raio - 3) dup[i] = 1;
  }
  return dup;
}

// para cada ponto: distância livre à direita e à esquerda até outro trecho do percurso (passagens repetidas não contam)
// e o raio da curva com sinal (+ = curva para a direita)
export function folgaLateral(x, z, s, dup, alcance = 30) {
  const n = x.length, C = 15, grade = new Map(), ch = (a, b) => a + ',' + b;
  for (let i = 0; i < n; i++) { const k = ch(Math.floor(x[i] / C), Math.floor(z[i] / C)); if (!grade.has(k)) grade.set(k, []); grade.get(k).push(i); }
  const livreD = new Float32Array(n).fill(1e6), livreE = new Float32Array(n).fill(1e6), raio = new Float32Array(n).fill(1e6);
  const viz = Math.ceil(alcance / C);
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - 2), b = Math.min(n - 1, i + 2);
    const fx = x[b] - x[a], fz = z[b] - z[a], fl = Math.hypot(fx, fz) || 1;
    const [dx, dz] = direita(anguloDe(fx, fz));
    const cx = Math.floor(x[i] / C), cz = Math.floor(z[i] / C);
    for (let p = -viz; p <= viz; p++) for (let q = -viz; q <= viz; q++) for (const j of grade.get(ch(cx + p, cz + q)) || []) {
      if (Math.abs(s[j] - s[i]) < 80) continue;
      const vx = x[j] - x[i], vz = z[j] - z[i], d = Math.hypot(vx, vz);
      if (d < 3 || d > alcance) continue; // passagem repetida (colada) não limita
      const lat = vx * dx + vz * dz;
      if (Math.abs(lat) < d * 0.7) continue; // só o que está de lado
      if (lat > 0) livreD[i] = Math.min(livreD[i], lat); else livreE[i] = Math.min(livreE[i], -lat);
    }
    // curvatura: mudança de direção em ~12 m
    const i0 = Math.max(0, i - 3), i1 = Math.min(n - 1, i + 3);
    if (i0 + 1 < n && i1 - 1 >= 0) {
      const a1 = anguloDe(x[i0 + 1] - x[i0], z[i0 + 1] - z[i0]), a2 = anguloDe(x[i1] - x[i1 - 1], z[i1] - z[i1 - 1]);
      let da = a2 - a1; while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI;
      const L = s[i1] - s[i0];
      if (Math.abs(da) > 1e-3 && L > 0) raio[i] = L / da;
    }
  }
  return { livreD, livreE, raio };
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

  // limites de desenho no ponto s: o quanto a calçada/grama pode ir para cada lado sem invadir outro trecho
  // nem dobrar numa curva fechada; dup = trecho repetido (já desenhado na primeira passagem)
  lateral(s) {
    const i = Math.min(this.s.length - 1, Math.round(s / Math.max(1e-6, this.s[1] - this.s[0])));
    const r = this.raio[i], curvaD = r > 0 ? r * 0.85 : Infinity, curvaE = r < 0 ? -r * 0.85 : Infinity;
    return { dup: !!this.dup[i], limD: Math.min(this.livreD[i] / 2 - 0.2, curvaD), limE: Math.min(this.livreE[i] / 2 - 0.2, curvaE) };
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
          if (!melhor || dist < melhor.dist) melhor = { dist, y: this.y[i] + (this.y[i + 1] - this.y[i]) * t, s: this.s[i] + (this.s[i + 1] - this.s[i]) * t };
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
