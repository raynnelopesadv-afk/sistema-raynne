#!/usr/bin/env node
// Diagnóstico (só leitura, sem dados de clientes): por que os fechamentos do mês não aparecem por vendedor.
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const ini = process.env.DESDE || new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date()).slice(0, 8) + '01';
const conta = (rows, f) => rows.reduce((m, r) => { const k = f(r); m[k] = (m[k] || 0) + 1; return m; }, {});

const { data: closers } = await sb.from('closers').select('*');
const nome = Object.fromEntries((closers ?? []).map(c => [c.id, `${c.nome} [${c.divisao ?? 'sem divisão'}${c.ativo ? '' : ', inativo'}]`]));
console.log('== Vendedores cadastrados (closers) ==');
for (const c of closers ?? []) console.log(`- ${c.nome} | divisao=${c.divisao ?? 'null'} | ativo=${c.ativo} | tem login=${!!(c.user_id ?? c.email)}`);

const { data: f1, error } = await sb.from('clientes_fechados')
  .select('closer_id, divisao, data_fechamento, fechado_em, criado_em:created_at, status_qualificacao').gte('created_at', `${ini}T00:00:00-03:00`).limit(20000);
if (error) console.log('erro clientes_fechados (created_at):', error.message);
const rows = f1 ?? [];
console.log(`\n== clientes_fechados criados desde ${ini}: ${rows.length} ==`);
console.log('por divisao:', conta(rows, r => r.divisao ?? 'null'));
console.log('por vendedor:', conta(rows, r => r.closer_id ? (nome[r.closer_id] ?? 'id desconhecido') : 'SEM VENDEDOR'));
console.log('por mês de data_fechamento:', conta(rows, r => (r.data_fechamento ?? 'null').slice(0, 7)));
console.log('status_qualificacao:', conta(rows, r => r.status_qualificacao ?? 'null'));

const { data: f2 } = await sb.from('clientes_fechados').select('closer_id, divisao, data_fechamento')
  .gte('data_fechamento', ini).limit(20000);
console.log(`\n== clientes_fechados com data_fechamento >= ${ini}: ${(f2 ?? []).length} ==`);
console.log('por divisao:', conta(f2 ?? [], r => r.divisao ?? 'null'));
console.log('por vendedor:', conta(f2 ?? [], r => r.closer_id ? (nome[r.closer_id] ?? 'id desconhecido') : 'SEM VENDEDOR'));

const { data: p } = await sb.from('protocolos_operacional').select('tipo, area, colaborador_nome, data').gte('data', ini).limit(20000);
console.log(`\n== protocolos_operacional desde ${ini}: ${(p ?? []).length} ==`);
console.log('por tipo:', conta(p ?? [], r => r.tipo));
console.log('por colaborador:', conta(p ?? [], r => r.colaborador_nome ?? 'null'));
console.log('por dia:', conta(p ?? [], r => r.data));
