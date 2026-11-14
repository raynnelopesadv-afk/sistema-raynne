#!/usr/bin/env node
// Roda logo depois da sincronização do ZapSign (a cada 2 horas):
//  1) acerta o valor de cada produto (faturamento por contrato);
//  2) preenche o valor dos fechamentos lançados com valor 0;
//  3) cadastra como fechamento do closer "IA Liderhub" todo contrato assinado
//     que a IA gerou pelos modelos do ZapSign — entra no Faturamento, no ranking
//     do comercial (Protocolos → Comercial) e na fila do protocolo.
import { createClient } from '@supabase/supabase-js';
import { NOME_CLOSER_IA, VALOR_PRODUTO, ehContratoDaIA, produtoDoContrato, diaBrasilia, normNome } from './lib/contratos-ia.mjs';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) { console.error('Faltam SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY.'); process.exit(1); }
const sb = createClient(url, key, { auth: { persistSession: false } });
const DESDE = process.env.IA_DESDE || '2026-01-01';

async function todos(tabela, colunas, filtro = q => q) {
  const out = [];
  for (let de = 0; ; de += 1000) {
    const { data, error } = await filtro(sb.from(tabela).select(colunas)).range(de, de + 999);
    if (error) throw error;
    out.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return out;
}

// 1) valores dos produtos
const produtos = await todos('products', 'id, nome, valor, divisao, ativo');
for (const p of produtos) {
  const v = p.divisao === 'educacao' ? VALOR_PRODUTO['Aéreo'] : VALOR_PRODUTO[p.nome];
  if (v && Number(p.valor) !== v) {
    const { error } = await sb.from('products').update({ valor: v }).eq('id', p.id);
    console.log(error ? `aviso: valor de ${p.nome} (${error.message})` : `Produto ${p.nome}: R$ ${v}`);
    p.valor = v;
  }
}
const valorDe = Object.fromEntries(produtos.map(p => [p.id, Number(p.valor) || 0]));
const ativos = produtos.filter(p => p.ativo);
function idProduto(nome, divisao) {
  const daDiv = ativos.filter(p => p.divisao === divisao);
  if (divisao === 'educacao') return (daDiv.find(p => /aereo|atraso/i.test(p.nome.normalize('NFD').replace(/[̀-ͯ]/g, ''))) ?? daDiv[0])?.id ?? null;
  return daDiv.find(p => p.nome === nome)?.id ?? null;
}

// 2) fechamentos com valor 0 recebem o valor do produto
const semValor = await todos('clientes_fechados', 'id, product_id, valor', q => q.not('product_id', 'is', null).or('valor.is.null,valor.eq.0'));
let preenchidos = 0;
for (const c of semValor) {
  const v = valorDe[c.product_id];
  if (!v) continue;
  const { error } = await sb.from('clientes_fechados').update({ valor: v }).eq('id', c.id);
  if (!error) preenchidos++;
}
console.log(`Fechamentos sem valor preenchidos: ${preenchidos}`);

// 3) closer da IA
let { data: closerIa } = await sb.from('closers').select('id').eq('nome', NOME_CLOSER_IA).maybeSingle();
if (!closerIa) {
  const { data, error } = await sb.from('closers').insert({ nome: NOME_CLOSER_IA, divisao: 'advogados', ativo: true, meta_mes: 0, meta_dia: 0 }).select('id').single();
  if (error) throw error;
  closerIa = data;
  console.log(`Closer "${NOME_CLOSER_IA}" criado.`);
}

// 4) contratos da IA assinados → fechamentos
const docs = (await todos('zapsign_documentos', 'token, nome_documento, status, assinado_em, cliente_nome, cliente_telefone',
  q => q.eq('status', 'signed').gte('assinado_em', `${DESDE}T00:00:00-03:00`))).filter(d => ehContratoDaIA(d.nome_documento));
const existentes = await todos('clientes_fechados', 'id, nome_cliente, divisao, origem, campos_personalizados, data_fechamento');
const tokensJa = new Set(existentes.map(e => e.campos_personalizados?.zapsign_token).filter(Boolean));
const chave = (nome, div) => `${normNome(nome)}|${div}`;
const nomesJa = new Map(existentes.map(e => [chave(e.nome_cliente, e.divisao), e]));

let novos = 0, jaLancados = 0;
for (const d of docs.sort((a, b) => a.assinado_em.localeCompare(b.assinado_em))) {
  if (tokensJa.has(d.token)) continue;
  const { produto, divisao } = produtoDoContrato(d.nome_documento);
  const k = chave(d.cliente_nome, divisao);
  if (normNome(d.cliente_nome) && nomesJa.has(k)) { jaLancados++; continue; } // vendedor já lançou ou outro documento do mesmo cliente
  const product_id = idProduto(produto, divisao);
  const linha = {
    nome_cliente: d.cliente_nome ?? 'Cliente (ZapSign)',
    telefone: d.cliente_telefone,
    closer_id: closerIa.id,
    divisao,
    product_id,
    valor: (product_id && valorDe[product_id]) || VALOR_PRODUTO[produto] || 0,
    data_fechamento: diaBrasilia(d.assinado_em),
    fechado_em: d.assinado_em,
    fechado_por_ia: true,
    origem: 'zapsign_ia',
    status_qualificacao: 'pendente',
    campos_personalizados: { zapsign_token: d.token, modelo: d.nome_documento },
  };
  const { error } = await sb.from('clientes_fechados').insert(linha);
  if (error) { console.log(`aviso: ${d.token} (${error.message})`); continue; }
  novos++;
  tokensJa.add(d.token);
  nomesJa.set(k, linha);
}
console.log(`IA Liderhub: ${docs.length} contratos da IA assinados desde ${DESDE}; ${novos} novos fechamentos; ${jaLancados} já estavam lançados.`);
await sb.from('sync_juridico').insert({ fonte: 'zapsign ia', inseridos: novos, atualizados: preenchidos, erro: null });

// 5) Nome de exibição da Dra. Raynne (no lugar do e-mail) em perfis, protocolos e histórico
{
  const NOME = 'Dra. Raynne';
  const usuarios = [];
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 200 });
    if (error) { console.log(`aviso: usuários (${error.message})`); break; }
    usuarios.push(...data.users);
    if (data.users.length < 200) break;
  }
  const dela = usuarios.filter(u => /^raynne/i.test(u.email ?? '') && !(u.email ?? '').includes('+')); // só a Dra. Raynne; logins da equipe usam "+"
  for (const u of dela) {
    await sb.from('profiles').update({ display_name: NOME }).eq('user_id', u.id);
    await sb.auth.admin.updateUserById(u.id, { user_metadata: { ...(u.user_metadata ?? {}), display_name: NOME } });
    await sb.from('protocolos_operacional').update({ colaborador_nome: NOME }).eq('colaborador_id', u.id).neq('colaborador_nome', NOME);
    await sb.from('colaborador_acoes').update({ usuario_nome: NOME }).eq('usuario_id', u.id).neq('usuario_nome', NOME);
  }
  console.log(`Nome "${NOME}" aplicado a ${dela.length} login(s): ${dela.map(u => u.email).join(', ')}`);
}

// 6) Protocolos já lançados no Registro diário tiram o cliente da fila de Processos
{
  const TIPO = { requerimento_adm: 'administrativo', acao_judicial: 'judicial' };
  const lancados = await todos('protocolos_operacional', 'cliente_nome, tipo, data, numero', q => q.in('tipo', Object.keys(TIPO)));
  const fila = await todos('clientes_fechados', 'id, nome_cliente', q => q.eq('protocolado', false).not('status_qualificacao', 'in', '(desqualificado,desistencia)'));
  const porNome = new Map();
  for (const c of fila) { const k = normNome(c.nome_cliente); if (k) porNome.set(k, [...(porNome.get(k) ?? []), c]); }
  let marcados = 0;
  for (const p of lancados.sort((a, b) => a.data.localeCompare(b.data))) {
    const cands = porNome.get(normNome(p.cliente_nome)) ?? [];
    if (cands.length !== 1) continue; // só quando o nome bate com um único cliente da fila
    const { error } = await sb.from('clientes_fechados').update({
      protocolado: true, data_protocolo: p.data, tipo_processo: TIPO[p.tipo], status_qualificacao: 'qualificado',
      ...(p.numero ? { numero_protocolo: p.numero } : {}),
    }).eq('id', cands[0].id);
    if (!error) { marcados++; porNome.delete(normNome(p.cliente_nome)); }
  }
  console.log(`Registro diário → Processos: ${marcados} cliente(s) marcados como protocolados (${lancados.length} lançamentos conferidos).`);
}
