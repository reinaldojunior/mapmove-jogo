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

    this.x = x; this.z = z; this.e = e; this.s = s;
    this.total = s[s.length - 1];
    this.y = e.map((v) => (v - e[0]) * exagero);

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
