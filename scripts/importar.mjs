#!/usr/bin/env node
// Importador do módulo jurídico.
//
//   node scripts/importar.mjs djen [--dias 7]          → busca no DJEN pela(s) OAB(s) e grava
//   node scripts/importar.mjs lote <arquivo.json> ...  → grava um lote coletado pelo Claude
//                                                         (Tramitação, Google Agenda, e-mails do INSS)
//
// Variáveis de ambiente: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, OABS (ex.: "160914/MG").
// A chave service_role fica só nos Secrets do GitHub — nunca no código.

import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { buscarDjen } from './lib/djen.mjs';
import { lerEmailInss, prazoCorrido } from './lib/inss.mjs';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Faltam SUPABASE_URL e/ou SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}
const sb = createClient(url, key, { auth: { persistSession: false } });

const hoje = () => new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10);
const menosDias = (iso, n) => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() - n); return d.toISOString().slice(0, 10); };
const lotes = (arr, n = 200) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));

async function logSync(fonte, inseridos, atualizados, erro = null) {
  await sb.from('sync_juridico').insert({ fonte, inseridos, atualizados, erro });
}

// ---------------------------------------------------------------- publicações
// Novas entram como vieram. Existentes: atualiza os dados, mas o status só muda
// para "tratada" (nunca desfaz o que a equipe marcou aqui).
async function gravarPublicacoes(fonte, itens) {
  let novos = 0, atual = 0;
  for (const grupo of lotes(itens)) {
    const ids = grupo.map(p => p.id_externo);
    const { data: existentes, error } = await sb.from('publicacoes').select('id, id_externo, status').eq('fonte', fonte).in('id_externo', ids);
    if (error) throw error;
    const mapa = new Map((existentes ?? []).map(e => [e.id_externo, e]));
    const inserir = [];
    for (const p of grupo) {
      const ex = mapa.get(p.id_externo);
      if (!ex) { inserir.push(p); continue; }
      const { status, ...resto } = p;
      const upd = { ...resto };
      if (status === 'tratada' && ex.status === 'nao_lida') upd.status = 'tratada';
      const { error: e2 } = await sb.from('publicacoes').update(upd).eq('id', ex.id);
      if (e2) throw e2;
      atual++;
    }
    if (inserir.length) {
      const { error: e3 } = await sb.from('publicacoes').insert(inserir);
      if (e3) throw e3;
      novos += inserir.length;
    }
  }
  // A mesma intimação chega pelo DJEN e pela Tramitação: o que foi tratado lá
  // também sai da lista de não lidas aqui.
  if (fonte === 'tramitacao') {
    for (const p of itens.filter(i => i.status === 'tratada' && i.numero_processo && i.data_disponibilizacao)) {
      const dig = p.numero_processo.replace(/\D/g, '');
      await sb.from('publicacoes').update({ status: 'tratada' })
        .eq('fonte', 'djen').eq('status', 'nao_lida')
        .eq('numero_processo_digitos', dig).eq('data_disponibilizacao', p.data_disponibilizacao);
    }
  }
  return { novos, atual };
}

// ---------------------------------------------------------------- agenda
async function gravarAgenda(itens) {
  let novos = 0, atual = 0;
  const porFonte = new Map();
  for (const i of itens) {
    if (!i.id_externo || !i.data || !i.titulo) continue;
    if (!porFonte.has(i.fonte)) porFonte.set(i.fonte, []);
    porFonte.get(i.fonte).push(i);
  }
  for (const [fonte, lista] of porFonte) {
    for (const grupo of lotes(lista)) {
      const { data: existentes, error } = await sb.from('agenda_juridica').select('id, id_externo, concluido')
        .eq('fonte', fonte).in('id_externo', grupo.map(i => String(i.id_externo)));
      if (error) throw error;
      const mapa = new Map((existentes ?? []).map(e => [e.id_externo, e]));
      const inserir = [];
      for (const i of grupo) {
        const item = { ...i, id_externo: String(i.id_externo), hora: i.hora || null };
        const ex = mapa.get(item.id_externo);
        if (!ex) { inserir.push(item); continue; }
        const { concluido, ...resto } = item;
        const upd = { ...resto };
        if (concluido && !ex.concluido) upd.concluido = true;
        const { error: e2 } = await sb.from('agenda_juridica').update(upd).eq('id', ex.id);
        if (e2) throw e2;
        atual++;
      }
      if (inserir.length) {
        const { error: e3 } = await sb.from('agenda_juridica').insert(inserir);
        if (e3) throw e3;
        novos += inserir.length;
      }
    }
  }
  return { novos, atual };
}

// ---------------------------------------------------------------- INSS
async function gravarEmailsInss(emails) {
  const avisos = emails.map(lerEmailInss).filter(Boolean);
  let novos = 0;
  for (const grupo of lotes(avisos)) {
    const { data, error } = await sb.from('inss_avisos').upsert(
      grupo.map(a => ({ email_id: a.email_id, protocolo: a.protocolo, status: a.status, despacho: a.despacho, recebido_em: a.recebido_em })),
      { onConflict: 'email_id', ignoreDuplicates: true },
    ).select('id');
    if (error) throw error;
    novos += data?.length ?? 0;
  }

  // Recalcula cada requerimento pelo aviso mais recente.
  const porProtocolo = new Map();
  for (const a of avisos) {
    const atual = porProtocolo.get(a.protocolo);
    if (!atual || a.recebido_em > atual.recebido_em) porProtocolo.set(a.protocolo, a);
  }
  let atual = 0;
  for (const grupo of lotes([...porProtocolo.values()])) {
    const { data: existentes, error } = await sb.from('inss_requerimentos')
      .select('id, protocolo, ultimo_aviso_em, cumprido, cumprido_em').in('protocolo', grupo.map(a => a.protocolo));
    if (error) throw error;
    const mapa = new Map((existentes ?? []).map(e => [e.protocolo, e]));
    for (const a of grupo) {
      const ex = mapa.get(a.protocolo);
      if (ex?.ultimo_aviso_em && new Date(ex.ultimo_aviso_em) >= new Date(a.recebido_em)) continue; // já tem aviso mais novo
      const pendente = (a.status ?? '').startsWith('PENDENTE');
      const reg = {
        protocolo: a.protocolo,
        cliente: a.cliente,
        servico: a.servico,
        data_protocolo: a.data_protocolo,
        unidade: a.unidade,
        status: a.status,
        despacho: a.despacho,
        ultimo_aviso_em: a.recebido_em,
        prazo_exigencia: pendente ? prazoCorrido(a.recebido_em, 30) : null,
        exigencia_automatica: a.exigencia_automatica,
      };
      if (!ex) {
        const { error: e2 } = await sb.from('inss_requerimentos').insert(reg);
        if (e2) throw e2;
      } else {
        // Nova exigência depois de a equipe ter cumprido a anterior → reabre.
        if (pendente && ex.cumprido && (!ex.cumprido_em || new Date(a.recebido_em) > new Date(ex.cumprido_em))) {
          reg.cumprido = false;
        }
        const { error: e3 } = await sb.from('inss_requerimentos').update(reg).eq('id', ex.id);
        if (e3) throw e3;
      }
      atual++;
    }
  }
  return { novos, atual };
}

// ---------------------------------------------------------------- INSS → tarefas na agenda
// Toda exigência pendente vira um item "Exigência INSS" em Prazos e Audiências,
// com o prazo estimado. Quando deixa de ser pendente (ou a equipe cumpre), sai da lista.
async function sincronizarAgendaInss() {
  const { data: reqs, error } = await sb.from('inss_requerimentos')
    .select('protocolo, cliente, servico, status, despacho, prazo_exigencia, exigencia_automatica, cumprido, ultimo_aviso_em');
  if (error) throw error;
  const itens = [];
  for (const r of reqs ?? []) {
    const pendente = (r.status ?? '').toUpperCase().startsWith('PENDENTE') && !r.exigencia_automatica;
    const data = r.prazo_exigencia ?? (r.ultimo_aviso_em ? r.ultimo_aviso_em.slice(0, 10) : null);
    if (!data) continue;
    itens.push({
      fonte: 'inss',
      id_externo: r.protocolo,
      tipo: 'exigencia_inss',
      titulo: `Exigência INSS — ${r.cliente ?? 'cliente'}${r.servico ? ` (${r.servico})` : ''}`,
      data,
      numero_processo: `Prot. ${r.protocolo}`,
      cliente: r.cliente,
      observacao: r.despacho ? r.despacho.slice(0, 400) : null,
      concluido: !pendente || r.cumprido,
    });
  }
  // só cria item para exigência em aberto; os já existentes são atualizados
  const { data: existentes } = await sb.from('agenda_juridica').select('id_externo').eq('fonte', 'inss');
  const ja = new Set((existentes ?? []).map(e => e.id_externo));
  return gravarAgenda(itens.filter(i => !i.concluido || ja.has(i.id_externo)));
}

// ---------------------------------------------------------------- ações (Tramitação)
async function gravarAcoes(acoes) {
  const linhas = acoes.filter(a => a.chave).map(a => ({ ...a, fonte: a.fonte ?? 'tramitacao' }));
  let novos = 0;
  for (const grupo of lotes(linhas)) {
    const { data, error } = await sb.from('colaborador_acoes').upsert(grupo, { onConflict: 'chave', ignoreDuplicates: true }).select('id');
    if (error) throw error;
    novos += data?.length ?? 0;
  }
  return { novos, atual: 0 };
}

// ---------------------------------------------------------------- comandos
async function cmdDjen(args) {
  const i = args.indexOf('--dias');
  const dias = i >= 0 ? Number(args[i + 1]) : 7;
  const ate = hoje();
  const de = menosDias(ate, dias);
  const oabs = (process.env.OABS || '160914/MG').split(',').map(s => s.trim()).filter(Boolean);
  for (const o of oabs) {
    const [oab, uf] = o.split('/');
    try {
      const itens = await buscarDjen({ oab, uf, de, ate });
      const r = await gravarPublicacoes('djen', itens);
      await logSync(`djen ${o}`, r.novos, r.atual);
      console.log(`DJEN ${o} ${de}..${ate}: ${itens.length} encontradas, ${r.novos} novas, ${r.atual} atualizadas`);
    } catch (e) {
      await logSync(`djen ${o}`, 0, 0, String(e.message ?? e));
      console.error(`DJEN ${o}: ${e.message ?? e}`);
      process.exitCode = 1;
    }
  }
}

async function cmdLote(arquivos) {
  for (const arq of arquivos) {
    const lote = JSON.parse(readFileSync(arq, 'utf8'));
    console.log(`Lote ${arq} (gerado em ${lote.gerado_em ?? '?'})`);
    const etapas = [
      ['tramitacao publicacoes', () => gravarPublicacoes('tramitacao', lote.publicacoes ?? [])],
      ['agenda', () => gravarAgenda(lote.agenda ?? [])],
      ['inss e-mails', () => gravarEmailsInss(lote.inss_emails ?? [])],
      ['acoes equipe', () => gravarAcoes(lote.acoes ?? [])],
      ['inss tarefas', () => sincronizarAgendaInss()],
    ];
    for (const [nome, fn] of etapas) {
      try {
        const r = await fn();
        await logSync(nome, r.novos, r.atual);
        console.log(`  ${nome}: ${r.novos} novos, ${r.atual} atualizados`);
      } catch (e) {
        await logSync(nome, 0, 0, String(e.message ?? e));
        console.error(`  ${nome}: ERRO ${e.message ?? e}`);
        process.exitCode = 1;
      }
    }
  }
}

const [cmd, ...resto] = process.argv.slice(2);
if (cmd === 'djen') await cmdDjen(resto);
else if (cmd === 'lote') await cmdLote(resto);
else if (cmd === 'inss-tarefas') {
  const r = await sincronizarAgendaInss();
  await logSync('inss tarefas', r.novos, r.atual);
  console.log(`INSS → tarefas: ${r.novos} novas, ${r.atual} atualizadas`);
}
else {
  console.log('Uso: node scripts/importar.mjs djen [--dias 7] | lote <arquivo.json> ...');
  process.exit(1);
}
