// Diagnóstico: lista os nomes de documentos do ZapSign agrupados (sem dados pessoais).
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data, error } = await sb.from('zapsign_documentos').select('nome_documento,status,criado_em').limit(5000);
if (error) throw error;
const m = new Map();
for (const d of data) {
  const k = (d.nome_documento || '').toLowerCase().replace(/\d+/g, '#').replace(/\s+/g, ' ').trim();
  const x = m.get(k) || { n: 0, s: 0 }; x.n++; if (d.status === 'signed') x.s++; m.set(k, x);
}
console.log('TOTAL', data.length);
for (const [k, v] of [...m].sort((a, b) => b[1].n - a[1].n).slice(0, 150)) console.log(`${v.n}\t${v.s}\t${k}`);
