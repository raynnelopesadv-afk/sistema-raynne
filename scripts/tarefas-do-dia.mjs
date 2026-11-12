#!/usr/bin/env node
// Cria às 8h50 (dias úteis) as tarefas do plano diário de cada colaborador.
// Não duplica: se a tarefa do mesmo bloco/dia/pessoa já existe, pula.
//   node scripts/tarefas-do-dia.mjs [--data AAAA-MM-DD]
// Variáveis: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, EMAIL_BASE (padrão raynnelopes.adv@gmail.com)

import { createClient } from '@supabase/supabase-js';
import { PLANO_DIA, recadoDoDia, META_PROTOCOLOS_DIA } from './lib/plano-dia.mjs';

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const i = process.argv.indexOf('--data');
const hoje = i >= 0 ? process.argv[i + 1] : new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
const [usuario, dominio] = (process.env.EMAIL_BASE || 'raynnelopes.adv@gmail.com').split('@');

const usuarios = [];
for (let page = 1; page <= 20; page++) {
  const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 200 });
  if (error) throw error;
  usuarios.push(...data.users);
  if (data.users.length < 200) break;
}
const { data: setores } = await sb.from('setores').select('id, nome');
const { data: jaTem } = await sb.from('tarefas').select('titulo, responsavel_id').eq('prazo', hoje);
const existe = new Set((jaTem ?? []).map(t => `${t.responsavel_id}|${t.titulo}`));

let criadas = 0;
for (const [login, plano] of Object.entries(PLANO_DIA)) {
  const email = `${usuario}+${login}@${dominio}`.toLowerCase();
  const u = usuarios.find(x => (x.email ?? '').toLowerCase() === email);
  if (!u) { console.log(`- ${plano.nome}: login ${email} não encontrado, pulei`); continue; }
  const setorId = setores?.find(s => s.nome === plano.setor)?.id ?? null;
  const temMeta = login === 'juridico01' || login === 'juridico02';
  const recado = { hora: '08:55', ate: '09:00', titulo: temMeta ? `Recado do dia: meta de ${META_PROTOCOLOS_DIA} protocolos` : 'Recado do dia',
    detalhe: recadoDoDia(hoje) + (temMeta ? '' : ' (sua meta: cumprir todos os blocos de hoje).') };
  const novas = [recado, ...plano.blocos]
    .map(b => ({ titulo: `${b.hora} · ${b.titulo}`, b }))
    .filter(x => !existe.has(`${u.id}|${x.titulo}`))
    .map(({ titulo, b }) => ({
      titulo, descricao: `${b.detalhe}\n(${b.hora} às ${b.ate} · plano do dia)`, setor_id: setorId,
      responsavel_id: u.id, criado_por: u.id, criado_por_nome: 'Plano do dia', prioridade: 'normal',
      status: 'a_fazer', prazo: hoje, hora: b.hora, recorrencia: 'nenhuma',
    }));
  if (!novas.length) { console.log(`= ${plano.nome}: já tinha as tarefas de hoje`); continue; }
  const { error } = await sb.from('tarefas').insert(novas);
  if (error) { console.error(`✗ ${plano.nome}: ${error.message}`); process.exitCode = 1; continue; }
  criadas += novas.length;
  console.log(`✓ ${plano.nome}: ${novas.length} tarefas`);
}
console.log(`Total: ${criadas} tarefas criadas para ${hoje}`);
