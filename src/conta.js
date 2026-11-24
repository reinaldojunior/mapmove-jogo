// Conta Mapmove (Supabase do Portal): login com Google e perfil do jogo salvo na nuvem (tabela jogo_perfis).
// Sem login o jogo continua funcionando com o perfil salvo no aparelho.

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://ssfsxdmzbubvygctdjgf.supabase.co';
const SUPABASE_KEY = 'sb_publishable_s2yoUApfYl_ZvSUkqYYrVw_uXwKsybM'; // chave pública (a mesma do Portal)

let sb = null;
function cliente() {
  if (!sb) sb = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: true, detectSessionInUrl: true, flowType: 'pkce' } });
  return sb;
}

// junta o perfil do aparelho com o da nuvem sem perder progresso:
// fica a base de quem evoluiu mais e somam-se itens e conquistas dos dois
export function mesclarPerfis(local, nuvem) {
  if (!nuvem || typeof nuvem.xp !== 'number') return local;
  if (!local || typeof local.xp !== 'number') return nuvem;
  const peso = (p) => p.xp + (p.treinos || 0) + (p.corridas || 0);
  const [base, outro] = peso(local) >= peso(nuvem) ? [local, nuvem] : [nuvem, local];
  const consumiveis = { ...(outro.consumiveis || {}) };
  for (const [k, v] of Object.entries(base.consumiveis || {})) consumiveis[k] = Math.max(v, consumiveis[k] || 0);
  return {
    ...base,
    moves: Math.max(base.moves || 0, outro.moves || 0),
    inventario: { ...(outro.inventario || {}), ...(base.inventario || {}) },
    conquistas: { ...(outro.conquistas || {}), ...(base.conquistas || {}) },
    consumiveis,
    usando: { ...(outro.usando || {}), ...(base.usando || {}) },
    ultimaCorrida: Math.max(base.ultimaCorrida || 0, outro.ultimaCorrida || 0)
  };
}

export async function usuarioAtual() {
  try { const { data } = await cliente().auth.getSession(); return data.session?.user || null; } catch { return null; }
}

export function aoMudarLogin(fn) {
  try { cliente().auth.onAuthStateChange((_ev, sessao) => fn(sessao?.user || null)); } catch { /* sem rede */ }
}

export async function entrarComGoogle() {
  const { error } = await cliente().auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.origin + window.location.pathname }
  });
  if (error) throw error;
}

export async function sair() { await cliente().auth.signOut(); }

export function dadosDoUsuario(u) {
  const m = u?.user_metadata || {};
  return { nome: m.full_name || m.name || u?.email || 'Corredor', foto: m.avatar_url || m.picture || null };
}

export async function lerPerfilNuvem(u) {
  const { data, error } = await cliente().from('jogo_perfis').select('perfil').eq('user_id', u.id).maybeSingle();
  if (error) throw error;
  return data?.perfil || null;
}

export async function salvarPerfilNuvem(u, perfil) {
  const { nome, foto } = dadosDoUsuario(u);
  const { error } = await cliente().from('jogo_perfis')
    .upsert({ user_id: u.id, nome, foto, perfil, atualizado_em: new Date().toISOString() }, { onConflict: 'user_id' });
  if (error) throw error;
}

// ── Strava (via função do servidor api/strava.js) ──
async function tokenAtual() {
  const { data } = await cliente().auth.getSession();
  return data.session?.access_token || null;
}
async function api(acao, corpo) {
  const token = await tokenAtual();
  const r = await fetch(`/api/strava?acao=${acao}`, {
    method: corpo ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: corpo ? JSON.stringify(corpo) : undefined
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.erro || `Erro ${r.status}`);
  return j;
}
export const ESTADO_STRAVA = 'mapmove-jogo-strava';
export async function irParaStrava() {
  const { clientId } = await api('config');
  if (!clientId) throw new Error('Strava ainda não configurado no servidor.');
  const u = new URL('https://www.strava.com/oauth/authorize');
  u.search = new URLSearchParams({ client_id: clientId, redirect_uri: 'https://jogo.mapmove.com.br/', response_type: 'code', approval_prompt: 'auto', scope: 'activity:read', state: ESTADO_STRAVA }).toString();
  window.location.href = u.toString();
}
export const stravaStatus = () => api('status');
export const stravaConectar = (code, scope) => api('conectar', { code, scope });
export const stravaDesconectar = () => api('desconectar', {});
export const stravaSincronizar = () => api('sincronizar', {});
export const stravaLista = () => api('lista');

// XP e Move$ das corridas reais (10 XP e 1 Move$ por km válido; limite diário já aplicado no servidor)
export const XP_POR_KM_REAL = 10;
export function ganhoStrava(novas) {
  const km = novas.reduce((a, n) => a + Number(n.km_valido || 0), 0);
  return { km, xp: Math.round(km * XP_POR_KM_REAL), moves: Math.floor(km) };
}

// ── Ranking de pontos (soma da semana / 30 dias) e amigos ──
export async function registrarCorridaNuvem(u, { modo, pontos, km, tempo, concluiu }) {
  const { error } = await cliente().from('jogo_corridas').insert({
    user_id: u.id, modo, pontos: Math.max(0, Math.round(pontos)), km: Math.round(km * 100) / 100,
    tempo_s: Math.max(0, Math.round(tempo || 0)), concluiu: !!concluiu
  });
  if (error) throw error;
}
async function rpc(nome, args) {
  const { data, error } = await cliente().rpc(nome, args);
  if (error) throw error;
  return data;
}
export const ranking = (periodo = 'semana', amigos = false) => rpc('jogo_ranking', { p_periodo: periodo, p_amigos: amigos });
export const semanaPassada = async () => (await rpc('jogo_semana_passada'))?.[0] || null;
export const meuCodigo = () => rpc('jogo_meu_codigo');
export const adicionarAmigo = (codigo) => rpc('jogo_adicionar_amigo', { p_codigo: codigo });
export const meusAmigos = () => rpc('jogo_meus_amigos');
export const linkConvite = (codigo) => `https://jogo.mapmove.com.br/?amigo=${encodeURIComponent(codigo)}`;
