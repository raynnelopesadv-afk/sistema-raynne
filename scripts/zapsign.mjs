#!/usr/bin/env node
// Sincroniza documentos do ZapSign: assinados (fechamentos) e pendentes (com contato do cliente).
//
//   node scripts/zapsign.mjs [--dias 60]
//
// Variáveis: ZAPSIGN_API_TOKEN, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
//            ZAPSIGN_IGNORAR (nomes/e-mails do escritório separados por vírgula; padrão "raynne")

import { createClient } from '@supabase/supabase-js';
import { paraLinha } from './lib/zapsign.mjs';

const API = process.env.ZAPSIGN_API_URL || 'https://api.zapsign.com.br/api/v1';
const TOKEN = process.env.ZAPSIGN_API_TOKEN;
const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!TOKEN || !url || !key) {
  console.error('Faltam ZAPSIGN_API_TOKEN, SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}
const sb = createClient(url, key, { auth: { persistSession: false } });
const IGNORAR = (process.env.ZAPSIGN_IGNORAR || 'raynne').toLowerCase().split(',').map(s => s.trim()).filter(Boolean);
const i = process.argv.indexOf('--dias');
const j = process.argv.indexOf('--desde');
const DESDE = j >= 0 ? process.argv[j + 1] : (process.env.ZAPSIGN_DESDE || null);
const DIAS = i >= 0 ? Number(process.argv[i + 1]) : 60;
const corte = DESDE ? new Date(`${DESDE}T00:00:00-03:00`) : new Date(Date.now() - DIAS * 86400000);
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function api(path, tentativa = 0) {
  const res = await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${TOKEN}`, Accept: 'application/json' } });
  if (res.status === 429 && tentativa < 5) { await sleep(2000 * (tentativa + 1)); return api(path, tentativa + 1); }
  if (!res.ok) throw new Error(`ZapSign ${res.status} em ${path}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

async function main() {
  // 1) lista os documentos criados desde o corte (mais novos primeiro)
  const recentes = [];
  let listagemCompleta = false;
  const vistos = new Set();
  for (let page = 1; page <= 400; page++) {
    const r = await api(`/docs/?page=${page}&sort_order=desc&deleted=false&created_from=${corte.toISOString().slice(0, 10)}`);
    const lista = r.results ?? r ?? [];
    if (!lista.length) break;
    let passou = false;
    for (const d of lista) {
      if (d.created_at && new Date(d.created_at) < corte) { passou = true; continue; }
      if (!vistos.has(d.token)) { vistos.add(d.token); recentes.push(d); }
    }
    if (passou || !r.next) { listagemCompleta = true; break; }
    await sleep(300);
  }
  const tokensZapsign = new Set(recentes.map(d => d.token));
  if (process.env.ZAPSIGN_LISTAR_SEM_AREA) {
    const pastas = new Map(); for (const d of recentes) { const k = d.folder_path ?? '(sem pasta)'; pastas.set(k, (pastas.get(k) ?? 0) + 1); }
    console.log('PASTAS:\n' + [...pastas].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${n}\t${k}`).join('\n'));
    console.log('CAMPOS: ' + Object.keys(recentes[0] ?? {}).join(','));
    if (process.env.ZAPSIGN_SO_PASTAS) process.exit(0);
  }

  // pendentes já conhecidos fora da janela: confere se foram assinados
  const { data: antigos } = await sb.from('zapsign_documentos').select('token, status').eq('status', 'pending');
  for (const a of antigos ?? []) if (!recentes.some(r => r.token === a.token)) recentes.push({ token: a.token, status: 'pending' });

  // 2) detalha cada um (signatários, telefone, link) — já assinados e sem mudança são pulados
  const { data: existentes } = await sb.from('zapsign_documentos').select('token, status, atualizado_zapsign_em');
  const mapa = new Map((existentes ?? []).map(e => [e.token, e]));
  const linhas = [];
  for (const d of recentes) {
    const ex = mapa.get(d.token);
    if (ex && ex.status === 'signed' && d.status === 'signed') continue;
    if (ex && ex.status === d.status && d.last_update_at && ex.atualizado_zapsign_em && new Date(ex.atualizado_zapsign_em) >= new Date(d.last_update_at) && d.status !== 'pending') continue;
    // pendentes antigos (45+ dias) sem mudança de status: não precisa detalhar de novo a cada 2h
    if (ex && ex.status === d.status && d.status === 'pending' && d.created_at && Date.now() - new Date(d.created_at).getTime() > 45 * 86400000) continue;
    const det = await api(`/docs/${d.token}/`);
    // anexos de envelope (ex.: procuração junto do contrato) não têm status nem signatários
    if (!det?.status || !Array.isArray(det.signers) || det.signers.length === 0) continue;
    linhas.push(paraLinha(det, IGNORAR));
    await sleep(250);
  }

  // um registro por documento (a listagem pode repetir documentos entre páginas)
  const porToken = new Map(linhas.map(l => [l.token, l]));
  linhas.length = 0; linhas.push(...porToken.values());
  await sb.from('zapsign_documentos').delete().is('status', null);
  // documentos apagados no ZapSign (ou anexos de envelope) saem do sistema
  let removidos = 0;
  if (listagemCompleta && tokensZapsign.size > 0) {
    const { data: noBanco } = await sb.from('zapsign_documentos').select('token').gte('criado_em', corte.toISOString());
    const sobrando = (noBanco ?? []).map(x => x.token).filter(t => !tokensZapsign.has(t));
    for (let k = 0; k < sobrando.length; k += 100) {
      const { error } = await sb.from('zapsign_documentos').delete().in('token', sobrando.slice(k, k + 100));
      if (error) throw error;
    }
    removidos = sobrando.length;
  }
  for (let k = 0; k < linhas.length; k += 100) {
    const { error } = await sb.from('zapsign_documentos').upsert(linhas.slice(k, k + 100), { onConflict: 'token' });
    if (error) throw error;
  }
  const assinados = linhas.filter(l => l.status === 'signed').length;
  const pendentes = linhas.filter(l => l.status === 'pending').length;
  await sb.from('sync_juridico').insert({ fonte: 'zapsign', inseridos: linhas.length, atualizados: 0, erro: null });
  console.log(`ZapSign: ${recentes.length} documentos desde ${corte.toISOString().slice(0, 10)}; ${linhas.length} atualizados (${assinados} assinados, ${pendentes} pendentes); ${removidos} removidos (apagados no ZapSign).`);
  // resumo mês × área (contratos de clientes, sem repetir o mesmo cliente na mesma área)
  const todos = [];
  for (let de = 0; ; de += 1000) {
    const { data, error } = await sb.from('zapsign_documentos').select('token,nome_documento,status,criado_em,assinado_em,cliente_nome').gte('criado_em', corte.toISOString()).order('token').range(de, de + 999);
    if (error) throw error;
    todos.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  console.log(`No sistema: ${todos.length} documentos desde ${corte.toISOString().slice(0, 10)}.`);
  const { resumoMesArea } = await import('./lib/area.mjs');
  console.log(resumoMesArea(todos));
  if (process.env.ZAPSIGN_LISTAR_SEM_AREA) {
    // só palavras que se repetem em 5+ arquivos (modelos), nunca nomes de clientes
    const { classificarContrato } = await import('./lib/area.mjs');
    const c = new Map(); let n = 0;
    for (const d of todos) if (classificarContrato(d.nome_documento) === 'a_classificar') {
      n++;
      const ws = new Set(String(d.nome_documento ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').split(/[^a-z]+/).filter(w => w.length > 2));
      for (const w of ws) c.set(w, (c.get(w) ?? 0) + 1);
    }
    console.log(`SEM ÁREA: ${n} documentos. Palavras frequentes:\n` + [...c].filter(([, k]) => k >= 5).sort((a, b) => b[1] - a[1]).map(([w, k]) => `${k}\t${w}`).join('\n'));
  }
}

{
  main().catch(async e => {
    console.error(e.message ?? e);
    await sb.from('sync_juridico').insert({ fonte: 'zapsign', inseridos: 0, atualizados: 0, erro: String(e.message ?? e).slice(0, 500) });
    process.exit(1);
  });
}
