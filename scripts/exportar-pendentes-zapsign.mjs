#!/usr/bin/env node
// Exporta os contratos com assinatura pendente no ZapSign (para a planilha de cobrança). Gera saida/pendentes.json
import { createClient } from '@supabase/supabase-js';
import { mkdirSync, writeFileSync } from 'node:fs';
import { classificarContrato } from './lib/area.mjs';
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const { data, error } = await sb.from('zapsign_documentos')
  .select('nome_documento, criado_em, cliente_nome, cliente_telefone, cliente_status, cliente_visualizacoes, cliente_ultima_visualizacao, link_assinatura, cobrado_em, observacao')
  .eq('status', 'pending').order('criado_em', { ascending: false }).limit(5000);
if (error) throw error;
const linhas = data.map(d => ({ ...d, area: classificarContrato(d.nome_documento) })).filter(d => d.area !== 'interno');
mkdirSync('saida', { recursive: true });
writeFileSync('saida/pendentes.json', JSON.stringify(linhas));
console.log(`${linhas.length} pendentes exportados`);
