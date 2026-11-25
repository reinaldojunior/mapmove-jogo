// Percurso ajustado às ruas do OpenStreetMap (projeto de percursos, etapa 3) — MODO DE TESTE, desligado por padrão.
//
// Liga:    abrir o jogo com ?percurso=ajustado (fica lembrado neste aparelho)
// Desliga: abrir com ?percurso=gps (volta ao sistema anterior; nada é apagado)
//
// Ligado, cada distância que tiver public/percursos/<slug>.json usa o traçado do map matching (etapa 2) no lugar do
// GPS do Portal; a pista continua sendo a mesma PistaReal (mesma interface: em, projetar, total…) e o desenho das
// ruas continua o atual. Qualquer problema no arquivo (faltando, inválido, descontínuo) = aquela distância fica com o
// percurso de antes. O Portal não é alterado.
// Para não misturar resultados: recordes locais e cache de travessas usam chaves próprias (sufixo "-ajustado"), e a
// corrida não vai para o ranking nem grava desafio fantasma enquanto o modo de teste estiver ligado.
export const CHAVE_MODO = 'mapmove-percurso';
export const SUFIXO = '-ajustado';

// 'ajustado' ou 'gps' (padrão). O parâmetro da URL vale e fica guardado; sem parâmetro, vale o guardado.
export function modoPercurso(busca = globalThis.location?.search || '', armazenamento = globalThis.localStorage) {
  const pedido = new URLSearchParams(busca).get('percurso');
  if (pedido === 'ajustado' || pedido === 'gps') {
    try { armazenamento?.setItem(CHAVE_MODO, pedido); } catch { /* sem storage */ }
    return pedido;
  }
  try { return armazenamento?.getItem(CHAVE_MODO) === 'ajustado' ? 'ajustado' : 'gps'; } catch { return 'gps'; }
}

// confere o percurso antes de usar: pontos válidos e sem buraco maior que `maxSalto` metros entre pontos seguidos
export function percursoValido(p, { maxSalto = 120 } = {}) {
  if (!Array.isArray(p) || p.length < 10) return false;
  const k = 111320 * Math.cos((p[0][0] * Math.PI) / 180);
  for (let i = 0; i < p.length; i++) {
    const q = p[i];
    if (!Array.isArray(q) || q.length < 3 || !q.every(Number.isFinite)) return false;
    if (i && Math.hypot((q[0] - p[i - 1][0]) * 110540, (q[1] - p[i - 1][1]) * k) > maxSalto) return false;
  }
  return true;
}

// devolve as distâncias com o percurso ajustado onde houver (o de antes fica em `percursoGps`); sem arquivo ou com
// erro, devolve as distâncias como vieram
export async function aplicarPercursoAjustado(slug, distancias, buscar = globalThis.fetch) {
  let dados;
  try {
    const r = await buscar(`/percursos/${slug}.json`);
    if (!r.ok) return distancias;
    dados = await r.json();
  } catch { return distancias; }
  return distancias.map((d) => {
    const a = dados?.distancias?.[d.rotulo];
    if (!a || !percursoValido(a.percurso)) return d;
    return { ...d, percurso: a.percurso, percursoGps: d.percurso,
      ajustado: { versao: dados.versao, kmGeometrico: a.kmGeometrico, kmOficial: a.kmOficial, fallbackKm: a.fallbackKm || [] } };
  });
}

// janela de projeção da PistaReal no percurso ajustado (ver PistaReal): o corredor anda menos de 1 m por quadro
export const JANELA = { atras: 15, frente: 15 };

// sufixo das chaves locais (recorde, travessas) da distância
export const sufixo = (d) => (d?.ajustado ? SUFIXO : '');
