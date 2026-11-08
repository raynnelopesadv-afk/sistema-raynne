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
const DIAS = i >= 0 ? Number(process.argv[i + 1]) : 60;
const corte = new Date(Date.now() - DIAS * 86400000);
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function api(path, tentativa = 0) {
  const res = await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${TOKEN}`, Accept: 'application/json' } });
  if (res.status === 429 && tentativa < 5) { await sleep(2000 * (tentativa + 1)); return api(path, tentativa + 1); }
  if (!res.ok) throw new Error(`ZapSign ${res.status} em ${path}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

async function main() {
  // 1) lista os documentos recentes (mais novos primeiro), até passar do corte
  const recentes = [];
  for (let page = 1; page <= 60; page++) {
    const r = await api(`/docs/?page=${page}`);
    const lista = r.results ?? r ?? [];
    if (!lista.length) break;
    let passou = false;
    for (const d of lista) {
      if (d.created_at && new Date(d.created_at) < corte) { passou = true; continue; }
      recentes.push(d);
    }
    if (passou || !r.next) break;
    await sleep(300);
  }

  // 2) detalha cada um (signatários, telefone, link) — já assinados e sem mudança são pulados
  const { data: existentes } = await sb.from('zapsign_documentos').select('token, status, atualizado_zapsign_em');
  const mapa = new Map((existentes ?? []).map(e => [e.token, e]));
  const linhas = [];
  for (const d of recentes) {
    const ex = mapa.get(d.token);
    if (ex && ex.status === 'signed' && d.status === 'signed') continue;
    if (ex && ex.status === d.status && d.last_update_at && ex.atualizado_zapsign_em && new Date(ex.atualizado_zapsign_em) >= new Date(d.last_update_at) && d.status !== 'pending') continue;
    const det = await api(`/docs/${d.token}/`);
    linhas.push(paraLinha(det, IGNORAR));
    await sleep(250);
  }

  for (let k = 0; k < linhas.length; k += 100) {
    const { error } = await sb.from('zapsign_documentos').upsert(linhas.slice(k, k + 100), { onConflict: 'token' });
    if (error) throw error;
  }
  const assinados = linhas.filter(l => l.status === 'signed').length;
  const pendentes = linhas.filter(l => l.status === 'pending').length;
  await sb.from('sync_juridico').insert({ fonte: 'zapsign', inseridos: linhas.length, atualizados: 0, erro: null });
  console.log(`ZapSign: ${recentes.length} documentos nos últimos ${DIAS} dias; ${linhas.length} atualizados (${assinados} assinados, ${pendentes} pendentes).`);
}

{
  main().catch(async e => {
    console.error(e.message ?? e);
    await sb.from('sync_juridico').insert({ fonte: 'zapsign', inseridos: 0, atualizados: 0, erro: String(e.message ?? e).slice(0, 500) });
    process.exit(1);
  });
}
