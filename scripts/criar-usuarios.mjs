#!/usr/bin/env node
// Cria (ou atualiza a senha de) logins da equipe, com papel, setores e cadastro de vendedor.
//
//   USUARIOS='[{"email":"...","senha":"...","nome":"Jurídico 01","papel":"operador_tecnico","setores":["Protocolo"],"vendedor":false}]' \
//   node scripts/criar-usuarios.mjs
//
// Variáveis: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, USUARIOS (JSON)

import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) { console.error('Faltam SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY.'); process.exit(1); }
const lista = JSON.parse(process.env.USUARIOS || '[]');
const sb = createClient(url, key, { auth: { persistSession: false } });

async function acharUsuario(email) {
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const u = data.users.find(x => (x.email ?? '').toLowerCase() === email);
    if (u) return u;
    if (data.users.length < 200) return null;
  }
  return null;
}

let falhas = 0;
const { data: setores } = await sb.from('setores').select('id, nome');
for (const u of lista) {
  const email = String(u.email).trim().toLowerCase();
  try {
    let user = await acharUsuario(email);
    if (user) {
      const { error } = await sb.auth.admin.updateUserById(user.id, { password: u.senha, email_confirm: true, user_metadata: { display_name: u.nome } });
      if (error) throw error;
      console.log(`↻ ${u.nome}: já existia, senha atualizada`);
    } else {
      const { data, error } = await sb.auth.admin.createUser({ email, password: u.senha, email_confirm: true, user_metadata: { display_name: u.nome } });
      if (error) throw error;
      user = data.user;
      console.log(`✓ ${u.nome}: criado`);
    }
    await sb.from('profiles').upsert({ user_id: user.id, email, display_name: u.nome }, { onConflict: 'user_id' });
    await sb.from('user_roles').delete().eq('user_id', user.id);
    const papeis = Array.isArray(u.papel) ? u.papel : [u.papel];
    const { error: eRole } = await sb.from('user_roles').insert(papeis.map(role => ({ user_id: user.id, role })));
    if (eRole) throw eRole;

    if (u.vendedor) {
      const { error } = await sb.from('closers').upsert({ id: user.id, nome: u.nome, divisao: 'advogados', ativo: true }, { onConflict: 'id' });
      if (error) console.log(`  aviso: cadastro de vendedor não feito (${error.message})`);
    }
    if (setores && u.setores?.length) {
      const alvo = u.setores === 'todos' || u.setores.includes('todos') ? setores : setores.filter(s => u.setores.includes(s.nome));
      if (alvo.length) {
        const { error } = await sb.from('setor_membros').upsert(alvo.map(s => ({ setor_id: s.id, user_id: user.id })), { onConflict: 'setor_id,user_id' });
        if (error) console.log(`  aviso: setores não vinculados (${error.message})`);
        else console.log(`  setores: ${alvo.map(s => s.nome).join(', ')}`);
      }
    }
  } catch (e) {
    falhas++;
    console.error(`✗ ${u.nome}: ${e.message ?? e}`);
  }
}
if (!setores) console.log('aviso: tabela de setores ainda não existe; rode primeiro a migração das tarefas.');
process.exit(falhas ? 1 : 0);
