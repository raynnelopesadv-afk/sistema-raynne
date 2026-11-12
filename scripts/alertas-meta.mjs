#!/usr/bin/env node
// Alertas de meta no celular — roda de hora em hora (9h às 17h, seg a sex).
// Calcula quanto cada pessoa já fez hoje e manda a notificação "Vai, vencedor(a)!"
// para quem cadastrou o celular na tela "Meu celular".
//
//   node scripts/alertas-meta.mjs              envia os alertas da hora atual
//   node scripts/alertas-meta.mjs --preparar   só garante as chaves de envio (não envia nada)
//   node scripts/alertas-meta.mjs --forcar     envia mesmo fora do horário (teste)
// Variáveis: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ALERTA_HORAS_PAUSA (padrão "12,13": almoço)

import { createClient } from '@supabase/supabase-js';
import webpush from 'web-push';
import { montarAlertas, HORA_INICIO, HORA_FIM } from './lib/alertas.mjs';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) { console.error('Faltam SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY.'); process.exit(1); }
const sb = createClient(url, key, { auth: { persistSession: false } });
const arg = f => process.argv.includes(f);

// 1) Chaves de envio: criadas uma única vez e guardadas no banco (só o robô lê).
let { data: cfg, error: eCfg } = await sb.from('alertas_config').select('vapid_publica, vapid_privada').eq('id', 1).maybeSingle();
if (eCfg) { console.error(`Tabela de alertas não encontrada (${eCfg.message}). Rode a migração 20261112120000_alertas_meta.sql.`); process.exit(1); }
if (!cfg) {
  const k = webpush.generateVAPIDKeys();
  const { error } = await sb.from('alertas_config').insert({ id: 1, vapid_publica: k.publicKey, vapid_privada: k.privateKey });
  if (error) throw error;
  cfg = { vapid_publica: k.publicKey, vapid_privada: k.privateKey };
  console.log('Chaves de envio criadas.');
}
if (arg('--preparar')) { console.log('Pronto para enviar alertas.'); process.exit(0); }
webpush.setVapidDetails('mailto:raynnelopes.adv@gmail.com', cfg.vapid_publica, cfg.vapid_privada);

// 2) Hora de Brasília
const agora = new Date();
const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(agora);
const hora = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Sao_Paulo', hour: '2-digit', hourCycle: 'h23' }).format(agora));
const pausa = (process.env.ALERTA_HORAS_PAUSA ?? '12,13').split(',').map(s => Number(s.trim())).filter(n => !Number.isNaN(n));
if (!arg('--forcar') && (hora < HORA_INICIO || hora > HORA_FIM || pausa.includes(hora))) {
  console.log(`São ${hora}h: fora do horário de alertas. Nada enviado.`);
  process.exit(0);
}

// 3) Quem está inscrito
const { data: insc, error: e1 } = await sb.from('alertas_inscricoes').select('*').eq('ativo', true);
if (e1) throw e1;
if (!insc?.length) { console.log('Ninguém cadastrou o celular ainda.'); process.exit(0); }
const inscricoes = insc.map(i => ({
  userId: i.user_id, nome: i.nome || 'Colega', setor: i.setor_meta,
  alertaHora: i.alerta_hora, alertaEquipe: i.alerta_equipe, resumoDia: i.resumo_dia,
}));

// 4) Quanto cada um já fez hoje
const feitos = {};
// 4a) Comercial e líder: contratos fechados hoje (ligados pelo e-mail do cadastro do closer)
const comerciais = inscricoes.filter(i => i.setor === 'comercial' || i.setor === 'lider');
if (comerciais.length) {
  const emails = {};
  for (let page = 1; page < 20; page++) {
    const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    for (const u of data.users) emails[u.id] = (u.email ?? '').toLowerCase();
    if (data.users.length < 200) break;
  }
  const { data: closers } = await sb.from('closers').select('id, email');
  const closerDoEmail = {};
  for (const c of closers ?? []) if (c.email) closerDoEmail[c.email.trim().toLowerCase()] = c.id;
  const { data: fech, error: e2 } = await sb.from('clientes_fechados')
    .select('closer_id, data_fechamento, fechado_em, status_qualificacao')
    .or(`data_fechamento.eq.${hoje},and(data_fechamento.is.null,fechado_em.gte.${hoje}T00:00:00-03:00)`)
    .limit(5000);
  if (e2) throw e2;
  const porCloser = {};
  for (const f of fech ?? []) {
    if (f.status_qualificacao === 'desistencia') continue;
    porCloser[f.closer_id] = (porCloser[f.closer_id] ?? 0) + 1;
  }
  const idsCloser = new Set((closers ?? []).map(c => c.id));
  for (const i of comerciais) {
    const cid = idsCloser.has(i.userId) ? i.userId : closerDoEmail[emails[i.userId]];
    if (!cid) console.log(`aviso: ${i.nome} não está ligado a um closer (confira o e-mail no cadastro do closer).`);
    feitos[i.userId] = cid ? (porCloser[cid] ?? 0) : 0;
  }
}
// 4b) Jurídico: protocolos lançados hoje
if (inscricoes.some(i => i.setor === 'juridico')) {
  const { data: prot, error: e3 } = await sb.from('protocolos_operacional').select('colaborador_id').eq('data', hoje).limit(5000);
  if (e3) throw e3;
  for (const p of prot ?? []) {
    const ins = inscricoes.find(i => i.userId === p.colaborador_id && i.setor === 'juridico');
    if (ins) feitos[ins.userId] = (feitos[ins.userId] ?? 0) + 1;
  }
}
// 4c) Prazos do dia (agenda jurídica)
const { data: ag, error: e4 } = await sb.from('agenda_juridica').select('concluido')
  .eq('data', hoje).in('tipo', ['prazo', 'exigencia_inss']).limit(5000);
if (e4) throw e4;
const prazos = { total: ag?.length ?? 0, feitos: (ag ?? []).filter(a => a.concluido).length };

// 5) Monta e envia
const alertas = montarAlertas({ hora, inscricoes, feitos, prazos });
const { data: disps, error: e5 } = await sb.from('alertas_dispositivos').select('*');
if (e5) throw e5;
let enviados = 0, removidos = 0;
for (const a of alertas) {
  const meus = (disps ?? []).filter(d => d.user_id === a.userId);
  if (!meus.length) continue;
  const payload = JSON.stringify({ title: a.titulo, body: a.corpo, url: '/', tag: `meta-${a.tipo}` });
  let ok = false;
  for (const d of meus) {
    try {
      await webpush.sendNotification({ endpoint: d.endpoint, keys: { p256dh: d.p256dh, auth: d.auth } }, payload, { TTL: 3600, urgency: 'high' });
      ok = true;
      await sb.from('alertas_dispositivos').update({ ultimo_envio_em: new Date().toISOString(), falhas: 0 }).eq('id', d.id);
    } catch (err) {
      const code = err?.statusCode;
      if (code === 404 || code === 410 || (d.falhas ?? 0) >= 5) {
        await sb.from('alertas_dispositivos').delete().eq('id', d.id);
        removidos++;
      } else {
        await sb.from('alertas_dispositivos').update({ falhas: (d.falhas ?? 0) + 1 }).eq('id', d.id);
        console.log(`aviso: falha ao enviar (${code ?? err?.message})`);
      }
    }
  }
  if (ok) {
    enviados++;
    await sb.from('alertas_enviados').insert({ user_id: a.userId, tipo: a.tipo, titulo: a.titulo, corpo: a.corpo });
  }
}
console.log(`${hora}h — ${enviados} alertas enviados${removidos ? `, ${removidos} celulares desativados removidos` : ''}. Prazos: ${prazos.feitos}/${prazos.total}.`);
