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
