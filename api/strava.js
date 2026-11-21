// Strava do Mapmove Run: conectar a conta e transformar corridas reais em XP.
// O jogador manda o token da sessão Google (Supabase); aqui confirmamos quem é, guardamos os tokens do Strava
// (só esta função lê, com a chave de serviço) e devolvemos as corridas novas, cada uma contada uma vez só.
// Variáveis na Vercel: STRAVA_CLIENT_ID, STRAVA_CLIENT_SECRET, SUPABASE_SERVICE_KEY.

const SUPABASE_URL = 'https://ssfsxdmzbubvygctdjgf.supabase.co';
const SUPABASE_PUBLICA = 'sb_publishable_s2yoUApfYl_ZvSUkqYYrVw_uXwKsybM';
const KM_DIA_MAX = 21;
const TIPOS_CORRIDA = new Set(['Run', 'TrailRun', 'VirtualRun']);

const db = (caminho, opcoes = {}) => fetch(`${SUPABASE_URL}/rest/v1/${caminho}`, {
  ...opcoes,
  headers: { apikey: process.env.SUPABASE_SERVICE_KEY, Authorization: `Bearer ${process.env.SUPABASE_SERVICE_KEY}`, 'Content-Type': 'application/json', ...(opcoes.headers || {}) }
});

async function quemE(req) {
  const token = (req.headers.authorization || '').replace(/^Bearer /, '');
  if (!token) return null;
  const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: SUPABASE_PUBLICA, Authorization: `Bearer ${token}` } });
  return r.ok ? r.json() : null;
}

async function stravaToken(corpo) {
  const r = await fetch('https://www.strava.com/oauth/token', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: process.env.STRAVA_CLIENT_ID, client_secret: process.env.STRAVA_CLIENT_SECRET, ...corpo })
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j.message || `Strava ${r.status}`);
  return j;
}

async function conexao(userId) {
  const r = await db(`jogo_strava?user_id=eq.${userId}&select=*`);
  const [c] = await r.json();
  return c || null;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const acao = (req.query.acao || '').toString();
    if (acao === 'config') return res.json({ clientId: process.env.STRAVA_CLIENT_ID || null });
    const u = await quemE(req);
    if (!u?.id) return res.status(401).json({ erro: 'Entre com o Google para usar o Strava.' });

    if (acao === 'status') {
      const c = await conexao(u.id);
      return res.json({ conectado: !!c, nome: c?.nome || null, desde: c?.conectado_em || null });
    }

    if (acao === 'conectar') {
      const code = (req.body?.code || '').toString();
      if (!code) return res.status(400).json({ erro: 'Código do Strava ausente.' });
      const t = await stravaToken({ code, grant_type: 'authorization_code' });
      if (!/activity:read/.test(t.scope || req.body?.scope || 'activity:read')) return res.status(400).json({ erro: 'Permita ver as atividades no Strava.' });
      const nome = [t.athlete?.firstname, t.athlete?.lastname].filter(Boolean).join(' ');
      await db('jogo_strava?on_conflict=user_id', {
        method: 'POST', headers: { Prefer: 'resolution=merge-duplicates' },
        body: JSON.stringify({ user_id: u.id, athlete_id: t.athlete?.id, nome, access_token: t.access_token, refresh_token: t.refresh_token, expires_at: t.expires_at, conectado_em: new Date().toISOString(), ultima_sync: null })
      });
      return res.json({ conectado: true, nome });
    }

    if (acao === 'desconectar') {
      await db(`jogo_strava?user_id=eq.${u.id}`, { method: 'DELETE' });
      return res.json({ conectado: false });
    }

    if (acao === 'sincronizar') {
      let c = await conexao(u.id);
      if (!c) return res.json({ conectado: false, novas: [] });
      if (c.expires_at < Date.now() / 1000 + 60) {
        const t = await stravaToken({ refresh_token: c.refresh_token, grant_type: 'refresh_token' });
        c = { ...c, access_token: t.access_token, refresh_token: t.refresh_token, expires_at: t.expires_at };
        await db(`jogo_strava?user_id=eq.${u.id}`, { method: 'PATCH', body: JSON.stringify({ access_token: c.access_token, refresh_token: c.refresh_token, expires_at: c.expires_at }) });
      }
      // só corridas feitas depois de conectar
      const depois = Math.floor(new Date(c.conectado_em).getTime() / 1000);
      const r = await fetch(`https://www.strava.com/api/v3/athlete/activities?after=${depois}&per_page=100`, { headers: { Authorization: `Bearer ${c.access_token}` } });
      if (!r.ok) throw new Error(`Strava ${r.status}`);
      const atividades = (await r.json()).filter((a) => TIPOS_CORRIDA.has(a.sport_type || a.type) && a.distance > 0);
      if (!atividades.length) return res.json({ conectado: true, novas: [] });
      // já contadas
      const ids = atividades.map((a) => a.id).join(',');
      const ja = await (await db(`jogo_strava_atividades?activity_id=in.(${ids})&select=activity_id`)).json();
      const contadas = new Set(ja.map((x) => Number(x.activity_id)));
      const novasAtiv = atividades.filter((a) => !contadas.has(a.id)).sort((a, b) => a.start_date.localeCompare(b.start_date));
      if (!novasAtiv.length) return res.json({ conectado: true, novas: [] });
      // limite de km por dia (somando o que já foi contado no dia)
      const dias = [...new Set(novasAtiv.map((a) => a.start_date_local.slice(0, 10)))];
      const usados = await (await db(`jogo_strava_atividades?user_id=eq.${u.id}&dia=in.(${dias.join(',')})&select=dia,km_valido`)).json();
      const porDia = {};
      for (const x of usados) porDia[x.dia] = (porDia[x.dia] || 0) + Number(x.km_valido);
      const novas = novasAtiv.map((a) => {
        const dia = a.start_date_local.slice(0, 10), km = a.distance / 1000;
        const valido = Math.max(0, Math.min(km, KM_DIA_MAX - (porDia[dia] || 0)));
        porDia[dia] = (porDia[dia] || 0) + valido;
        return { activity_id: a.id, user_id: u.id, dia, km: +km.toFixed(2), km_valido: +valido.toFixed(2), nome: a.name };
      });
      const ins = await db('jogo_strava_atividades?on_conflict=activity_id', {
        method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates,return=representation' },
        body: JSON.stringify(novas.map(({ nome, ...x }) => x))
      });
      const gravadas = new Set((await ins.json()).map((x) => Number(x.activity_id)));
      await db(`jogo_strava?user_id=eq.${u.id}`, { method: 'PATCH', body: JSON.stringify({ ultima_sync: new Date().toISOString() }) });
      return res.json({ conectado: true, novas: novas.filter((n) => gravadas.has(n.activity_id)).map(({ user_id, ...n }) => n) });
    }
    return res.status(400).json({ erro: 'Ação desconhecida.' });
  } catch (e) {
    return res.status(500).json({ erro: e.message || 'Erro no Strava.' });
  }
}
