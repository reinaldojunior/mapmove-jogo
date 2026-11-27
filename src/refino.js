// Refino do percurso: quando uma distância da prova vem com GPS espaçado (ex.: 42K com um ponto a cada ~77 m) e outra
// distância da mesma prova passa pelo mesmo caminho com GPS mais denso (ex.: 21K, um ponto a cada ~37 m), o traçado
// espaçado é encaixado no detalhado. Assim voltas e trechos repetidos caem exatamente no mesmo lugar (a pista os junta
// numa rua só) e as curvas deixam de ser cortadas. Vale para qualquer prova: sem uma fonte que cubra o percurso,
// a distância fica como veio. Só geometria no aparelho: nada é gravado no Portal/Supabase.
// Pontos no formato do Portal: [lat, lon, alt].

const M_LAT = 110540, M_LON = 111320;

function plano(pontos, lat0, lon0) {
  const k = Math.cos((lat0 * Math.PI) / 180);
  return pontos.map(([la, lo]) => ({ x: (lo - lon0) * k * M_LON, y: (la - lat0) * M_LAT }));
}
const comp = (pts) => { let t = 0; for (let i = 1; i < pts.length; i++) t += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y); return t; };

// polilinha com distância acumulada e projeção (devolve todas as projeções a até `raio` metros, com direção do trecho)
function linha(pts) {
  const s = [0];
  for (let i = 1; i < pts.length; i++) s.push(s[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
  return {
    pts, s, total: s[s.length - 1],
    candidatos(q, raio) {
      const out = [];
      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i], b = pts[i + 1], vx = b.x - a.x, vy = b.y - a.y, l2 = vx * vx + vy * vy;
        if (!l2) continue;
        const t = Math.max(0, Math.min(1, ((q.x - a.x) * vx + (q.y - a.y) * vy) / l2));
        const d = Math.hypot(q.x - a.x - t * vx, q.y - a.y - t * vy);
        if (d <= raio) { const l = Math.sqrt(l2); out.push({ sB: s[i] + t * l, d, dx: vx / l, dy: vy / l }); }
      }
      return out;
    },
    // ponto (e índice do vértice anterior) a uma distância sB ao longo da linha
    em(sB) {
      let i = 1; while (i < s.length - 1 && s[i] < sB) i++;
      const f = (sB - s[i - 1]) / ((s[i] - s[i - 1]) || 1);
      return { x: pts[i - 1].x + (pts[i].x - pts[i - 1].x) * f, y: pts[i - 1].y + (pts[i].y - pts[i - 1].y) * f, i };
    }
  };
}

// fração dos pontos de `alvo` a até `raio` m da linha `fonte`
function cobertura(alvoPl, fonteL, raio) {
  let ok = 0;
  for (const q of alvoPl) if (fonteL.candidatos(q, raio).length) ok++;
  return ok / alvoPl.length;
}

// encaixa um percurso espaçado (alvo) no traçado detalhado (fonte); devolve a nova lista de pontos [lat, lon, alt]
export function encaixar(alvo, fonte, { raio = 20 } = {}) {
  const lat0 = alvo[0][0], lon0 = alvo[0][1], k = Math.cos((lat0 * Math.PI) / 180);
  const A = plano(alvo, lat0, lon0), F = linha(plano(fonte, lat0, lon0));
  const fechada = Math.hypot(F.pts[0].x - F.pts[F.pts.length - 1].x, F.pts[0].y - F.pts[F.pts.length - 1].y) < 60; // circuito
  const volta = (de, ate) => { let d = ate - de; if (fechada && d < -F.total / 2) d += F.total; return d; }; // avanço ao longo da fonte
  // projeção de cada ponto do alvo: o candidato que anda no mesmo sentido do alvo (ida e volta em pistas lado a lado
  // têm sentidos opostos) e que continua de onde o anterior parou
  const proj = [];
  let ant = null;
  for (let i = 0; i < A.length; i++) {
    const a = A[Math.max(0, i - 1)], b = A[Math.min(A.length - 1, i + 1)];
    const l = Math.hypot(b.x - a.x, b.y - a.y) || 1, dx = (b.x - a.x) / l, dy = (b.y - a.y) / l;
    const cand = F.candidatos(A[i], raio).filter((c) => c.dx * dx + c.dy * dy > 0.3);
    let melhor = null, nota = Infinity;
    for (const c of cand) {
      const av = ant ? volta(ant.sB, c.sB) : 0;
      const esperado = ant ? Math.hypot(A[i].x - A[i - 1].x, A[i].y - A[i - 1].y) : 0;
      const n = c.d + (ant ? Math.abs(av - esperado) * 0.5 + (av < -5 ? 1000 : 0) : 0);
      if (n < nota) { nota = n; melhor = c; }
    }
    proj.push(melhor);
    if (melhor) ant = melhor;
  }
  // monta o novo traçado: entre duas projeções seguidas, segue os vértices da fonte (se o caminho pela fonte tiver
  // tamanho parecido com o trecho do alvo); onde não dá para encaixar, mantém o ponto original
  const alt = (i) => alvo[i][2];
  const out = [];
  const empurra = (x, y, h) => { out.push([lat0 + y / M_LAT, lon0 + x / (k * M_LON), h]); };
  const altFonte = (sB) => { const p = F.em(sB), j = p.i; return fonte[j - 1]?.[2] ?? fonte[j]?.[2]; };
  // pontos sem encaixe isolados (ex.: a ponta de um retorno, onde o sentido inverte) são pulados: liga-se o anterior
  // ao próximo encaixado pelo traçado detalhado, se o caminho tiver tamanho coerente; senão o ponto original fica
  const encaixados = proj.map((p, i) => (p ? i : -1)).filter((i) => i >= 0);
  if (!encaixados.length) return alvo;
  const ligaPelaFonte = (i, j) => {
    const p = proj[i], prox = proj[j];
    let reto = 0;
    for (let k = i; k < j; k++) reto += Math.hypot(A[k + 1].x - A[k].x, A[k + 1].y - A[k].y);
    const av = volta(p.sB, prox.sB);
    return av > 0 && av < Math.max(400, reto * 2) && av > reto * 0.7 && av < reto * 1.8 + 30 ? av : null;
  };
  for (let n = 0; n < encaixados.length; n++) {
    const i = encaixados[n], j = encaixados[n + 1];
    if (n === 0) for (let k = 0; k < i; k++) empurra(A[k].x, A[k].y, alt(k)); // começo sem encaixe
    const p = proj[i];
    const q = F.em(p.sB);
    empurra(q.x, q.y, altFonte(p.sB) ?? alt(i));
    if (j === undefined) { for (let k = i + 1; k < A.length; k++) empurra(A[k].x, A[k].y, alt(k)); continue; } // fim sem encaixe
    const av = ligaPelaFonte(i, j);
    if (av == null) { for (let k = i + 1; k < j; k++) empurra(A[k].x, A[k].y, alt(k)); continue; } // não dá: mantém os originais
    // vértices da fonte entre as duas projeções (no circuito, passa do fim para o começo)
    const fim = p.sB + av;
    const faixas = fim <= F.total ? [[p.sB, fim]] : [[p.sB, F.total], [0, fim - F.total]];
    for (const [de, ate] of faixas) {
      for (let j = 0; j < F.pts.length; j++) {
        if (F.s[j] > de + 0.5 && F.s[j] < ate - 0.5) empurra(F.pts[j].x, F.pts[j].y, fonte[j][2] ?? alt(i));
      }
    }
  }
  return out;
}

// refina todas as distâncias de uma prova: cada uma é encaixada na distância mais detalhada que cubra ao menos 90%
// dos seus pontos (a até 20 m). `distancias` = [{ rotulo, km, percurso }, ...]; devolve cópias (as sem fonte ficam iguais)
export function refinarDistancias(distancias, { raio = 20, coberturaMin = 0.9 } = {}) {
  const info = distancias.map((d) => {
    const lat0 = d.percurso[0][0], lon0 = d.percurso[0][1];
    const pl = plano(d.percurso, lat0, lon0), total = comp(pl);
    return { d, espaco: total / Math.max(1, d.percurso.length - 1) };
  });
  return distancias.map((d, idx) => {
    const eu = info[idx];
    const fontes = info.filter((o, j) => j !== idx && o.espaco < eu.espaco * 0.75).sort((a, b) => a.espaco - b.espaco);
    for (const f of fontes) {
      const lat0 = d.percurso[0][0], lon0 = d.percurso[0][1];
      const cob = cobertura(plano(d.percurso, lat0, lon0), linha(plano(f.d.percurso, lat0, lon0)), raio);
      if (cob < coberturaMin) continue;
      return { ...d, percurso: encaixar(d.percurso, f.d.percurso, { raio }), refinadoCom: f.d.rotulo };
    }
    return d;
  });
}

// Percurso de N voltas de um circuito (ex.: 10K = 2 voltas do 5K). O GPS de uma volta costuma passar um pouco da
// largada antes de terminar: cada volta é cortada no ponto em que passa mais perto da largada (no fim do traçado) e a
// seguinte começa dali, sem meia-volta na emenda; a última termina nesse mesmo ponto. Pontos: [lat, lon, alt].
export function repetirVolta(volta, n) {
  if (!Array.isArray(volta) || volta.length < 2 || !(n >= 1)) return volta;
  const pts = plano(volta, volta[0][0], volta[0][1]), m = pts.length;
  let corte = m - 1, melhor = Infinity;
  for (let i = Math.floor(m * 0.8); i < m; i++) { const d = Math.hypot(pts[i].x - pts[0].x, pts[i].y - pts[0].y); if (d < melhor) { melhor = d; corte = i; } }
  const uma = volta.slice(0, corte + 1);
  const out = [];
  for (let k = 0; k < n; k++) out.push(...uma.map((p) => [...p]));
  return out;
}
