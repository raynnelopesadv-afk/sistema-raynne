#!/usr/bin/env node
// Entra com cada login da equipe (como o próprio colaborador faria no site) e confere se está tudo pronto:
// papel, setores, tarefas de hoje, leitura das telas e se consegue LANÇAR um protocolo (lança um teste e apaga).
//   LOGINS="juridico01,juridico02,..." SENHA="..." node scripts/testar-acessos.mjs
// Variáveis: SUPABASE_URL, SUPABASE_ANON_KEY, SENHA, LOGINS, EMAIL_BASE (padrão raynnelopes.adv@gmail.com)

import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL, anon = process.env.SUPABASE_ANON_KEY, senha = process.env.SENHA;
const [usuario, dominio] = (process.env.EMAIL_BASE || 'raynnelopes.adv@gmail.com').split('@');
const logins = (process.env.LOGINS || 'juridico01,juridico02,juridico03,lider,comercial01,comercial02').split(',');
const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
let falhas = 0;

for (const login of logins) {
  const email = `${usuario}+${login}@${dominio}`;
  const sb = createClient(url, anon, { auth: { persistSession: false } });
  const linhas = [];
  const ok = (cond, txt) => { linhas.push(`${cond ? '  ✓' : '  ✗'} ${txt}`); if (!cond) falhas++; };
  const { data: auth, error } = await sb.auth.signInWithPassword({ email, password: senha });
  if (error) { console.log(`✗ ${login}: NÃO ENTROU (${error.message})`); falhas++; continue; }
  const uid = auth.user.id;
  const { data: prof } = await sb.from('profiles').select('display_name').eq('user_id', uid).maybeSingle();
  const { data: roles } = await sb.from('user_roles').select('role').eq('user_id', uid);
  ok((roles ?? []).length > 0, `papel: ${(roles ?? []).map(r => r.role).join(', ') || 'nenhum'}`);
  const { data: setores, error: eS } = await sb.from('setor_membros').select('setores(nome)').eq('user_id', uid);
  ok(!eS && (setores ?? []).length > 0, `setores: ${(setores ?? []).map(s => s.setores?.nome).join(', ') || 'nenhum'}`);
  const { data: tarefas, error: eT } = await sb.from('tarefas').select('titulo').eq('prazo', hoje).eq('responsavel_id', uid);
  if (login.startsWith('comercial')) ok(!eT, `tarefas: tela abre (${(tarefas ?? []).length} para hoje)`);
  else ok(!eT && (tarefas ?? []).length > 0, `tarefas de hoje: ${(tarefas ?? []).length}`);
  for (const [tab, nome] of [['protocolos_operacional', 'Protocolos'], ['agenda_juridica', 'Prazos'], ['publicacoes', 'Publicações'], ['relatorios_ia', 'Plano da IA']]) {
    const { error: e } = await sb.from(tab).select('id', { head: true, count: 'exact' }).limit(1);
    ok(!e, `abre ${nome}${e ? ` (${e.message})` : ''}`);
  }
  // consegue lançar no Registro do dia? (lança um teste e apaga na hora)
  const { data: ins, error: eI } = await sb.from('protocolos_operacional')
    .insert({ tipo: 'outro', cliente_nome: 'TESTE DE ACESSO (apagado automaticamente)', descricao: 'teste' }).select('id').single();
  if (eI) ok(false, `lançar protocolo (${eI.message})`);
  else {
    const { error: eD } = await sb.from('protocolos_operacional').delete().eq('id', ins.id);
    ok(!eD, `lançar protocolo no Registro do dia${eD ? ` (teste não apagado: ${eD.message})` : ''}`);
  }
  if (login.startsWith('comercial')) {
    const { data: c } = await sb.from('closers').select('id, nome').eq('id', uid).maybeSingle();
    ok(!!c, `cadastrado como vendedor para lançar fechamento${c ? ` (${c.nome})` : ''}`);
  }
  console.log(`${linhas.some(l => l.includes('✗')) ? '⚠' : '✓'} ${prof?.display_name ?? login} (${email})`);
  console.log(linhas.join('\n'));
  await sb.auth.signOut();
}
console.log(falhas ? `\n${falhas} problema(s)` : '\nTodos prontos para usar.');
process.exitCode = falhas ? 1 : 0;
