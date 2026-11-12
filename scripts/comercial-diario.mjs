#!/usr/bin/env node
// Fim do dia do comercial: calcula quem está fraco e monta o plano de amanhã para a meta ser batida.
// Grava um relatório-base em relatorios_ia (tipo 'comercial') e salva os números (sem dados de clientes)
// em dados/comercial/AAAA-MM-DD.json para a IA (tarefa agendada do Claude) escrever a versão final.
//
//   node scripts/comercial-diario.mjs [--data AAAA-MM-DD]
// Variáveis: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, META_EQUIPE_DIA (padrão 3)

import { createClient } from '@supabase/supabase-js';
import { mkdirSync, writeFileSync } from 'node:fs';
import { analisarComercial, textoRelatorio } from './lib/comercial.mjs';
import { classificarContrato } from './lib/area.mjs';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) { console.error('Faltam SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY.'); process.exit(1); }
const sb = createClient(url, key, { auth: { persistSession: false } });

const hojeSP = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
const i = process.argv.indexOf('--data');
const hoje = i >= 0 ? process.argv[i + 1] : hojeSP;
const inicioMes = hoje.slice(0, 8) + '01';
const desde = new Date(new Date(hoje + 'T12:00:00Z').getTime() - 14 * 86400000).toISOString().slice(0, 10);
const corte = desde < inicioMes ? desde : inicioMes;

const { data: closers, error: e1 } = await sb.from('closers').select('id, nome, meta_mes, meta_dia, ativo, divisao').eq('ativo', true).eq('divisao', 'advogados');
if (e1) throw e1;
const { data: fechados, error: e2 } = await sb.from('clientes_fechados')
  .select('closer_id, data_fechamento, fechado_em, status_qualificacao, divisao')
  .eq('divisao', 'advogados')
  .or(`data_fechamento.gte.${corte},and(data_fechamento.is.null,fechado_em.gte.${corte}T00:00:00-03:00)`)
  .limit(20000);
if (e2) throw e2;
const { count: pendentesZap } = await sb.from('zapsign_documentos').select('token', { count: 'exact', head: true }).eq('status', 'pending')
  .gte('criado_em', new Date(Date.now() - 30 * 86400000).toISOString()); // só os enviados nos últimos 30 dias
// Contratos assinados no ZapSign (fonte oficial dos fechamentos), sem documentos internos,
// contando 1 por cliente por dia.
const { data: assinados } = await sb.from('zapsign_documentos').select('nome_documento, cliente_nome, assinado_em')
  .eq('status', 'signed').gte('assinado_em', `${inicioMes}T00:00:00-03:00`).limit(10000);
const diaSP = t => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date(t));
const unicos = new Set();
let assinadosMes = 0, assinadosHoje = 0;
for (const d of assinados ?? []) {
  if (classificarContrato(d.nome_documento) === 'interno') continue;
  const dia = diaSP(d.assinado_em);
  const k = `${dia}|${(d.cliente_nome ?? d.nome_documento ?? '').trim().toLowerCase()}`;
  if (unicos.has(k) || dia > hoje) continue;
  unicos.add(k);
  assinadosMes++;
  if (dia === hoje) assinadosHoje++;
}

const diaDe = f => f.data_fechamento ?? (f.fechado_em ? new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date(f.fechado_em)) : null);
const analise = analisarComercial({
  hoje,
  metaEquipeDia: Number(process.env.META_EQUIPE_DIA || 3),
  vendedores: (closers ?? []).map(c => ({ id: c.id, nome: c.nome, metaMes: Number(c.meta_mes || 0) })),
  fechamentos: (fechados ?? []).filter(f => f.status_qualificacao !== 'desistencia').map(f => ({ vendedorId: f.closer_id, dia: diaDe(f) })).filter(f => f.dia),
  desistencias: (fechados ?? []).filter(f => f.status_qualificacao === 'desistencia').map(f => ({ vendedorId: f.closer_id, dia: diaDe(f) })).filter(f => f.dia),
  zapsign: { pendentes: pendentesZap ?? 0, assinadosHoje, assinadosMes },
});

const conteudo = textoRelatorio(analise);
const { error: e3 } = await sb.from('relatorios_ia').upsert(
  { tipo: 'comercial', data: hoje, titulo: `Comercial — plano para ${analise.amanha}`, conteudo, dados: analise, criado_em: new Date().toISOString() },
  { onConflict: 'tipo,data' });
if (e3) console.log(`aviso: relatório não gravado (${e3.message}) — rode a migração 20261112100000_relatorios_ia.sql`);

mkdirSync('dados/comercial', { recursive: true });
writeFileSync(`dados/comercial/${hoje}.json`, JSON.stringify(analise, null, 2));
writeFileSync('dados/comercial/ultimo.json', JSON.stringify(analise, null, 2));
console.log(conteudo);
