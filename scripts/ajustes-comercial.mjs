#!/usr/bin/env node
// Ajustes do comercial (rodado pelo GitHub Actions):
//  1) coloca a líder (Dra. Anielle) na lista de closers do Novo Fechamento;
//  2) cadastra os produtos padrão quando a divisão ainda não tem nenhum.
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) { console.error('Faltam SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY.'); process.exit(1); }
const sb = createClient(url, key, { auth: { persistSession: false } });
const sem = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// 1) Líder como closer
const usuarios = [];
for (let page = 1; page <= 20; page++) {
  const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 200 });
  if (error) throw error;
  usuarios.push(...data.users);
  if (data.users.length < 200) break;
}
const { data: papeis } = await sb.from('user_roles').select('user_id, role');
const lideres = usuarios.filter(u => {
  const txt = sem(`${u.email} ${u.user_metadata?.display_name ?? ''}`);
  return txt.includes('lider') || txt.includes('anielle') || (papeis ?? []).some(p => p.user_id === u.id && sem(p.role).includes('lider'));
});
if (!lideres.length) console.log(`aviso: não achei o login da líder. Logins: ${usuarios.map(u => u.email).join(', ')}`);
for (const u of lideres) {
  const { error } = await sb.from('closers').upsert({ id: u.id, nome: 'Dra. Anielle', divisao: 'advogados', ativo: true, email: (u.email ?? '').toLowerCase() }, { onConflict: 'id' });
  console.log(error ? `aviso: líder não incluída (${error.message})` : `Líder incluída como closer: ${u.email}`);
}

// 2) Produtos padrão
const PADRAO = {
  advogados: ['BPC/LOAS', 'Auxílio-acidente', 'Aposentadoria por incapacidade', 'Auxílio por incapacidade temporária (auxílio-doença)', 'Salário-maternidade', 'Aposentadoria por idade', 'Pensão por morte'],
  educacao: ['Atraso de voo', 'Cancelamento de voo', 'Extravio de bagagem', 'Overbooking'],
};
for (const [divisao, nomes] of Object.entries(PADRAO)) {
  const { data: atuais, error } = await sb.from('products').select('id, nome, ativo').eq('divisao', divisao);
  if (error) { console.log(`aviso: produtos (${error.message})`); continue; }
  if ((atuais ?? []).some(p => p.ativo)) { console.log(`${divisao}: já tem ${atuais.length} produtos ativos.`); continue; }
  const { error: e2 } = await sb.from('products').insert(nomes.map(nome => ({ nome, divisao, ativo: true, valor: 0 })));
  console.log(e2 ? `aviso: produtos não cadastrados (${e2.message})` : `${divisao}: ${nomes.length} produtos cadastrados.`);
}
