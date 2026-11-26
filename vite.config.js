// Única opção: marca as prévias da Vercel (VERCEL_ENV=preview) para o jogo não gravar nada na conta/Supabase.
// Em produção (VERCEL_ENV=production) e no computador, a marca é false e o jogo é o de sempre.
// MAPMOVE_PREVIA=1 simula a prévia localmente.
import { defineConfig } from 'vite';

export default defineConfig({
  define: {
    __MAPMOVE_PREVIA__: JSON.stringify(process.env.VERCEL_ENV === 'preview' || process.env.MAPMOVE_PREVIA === '1')
  }
});
