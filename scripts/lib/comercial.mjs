// Regras do relatório de fim de dia do comercial (puras, testadas em src/test/comercial.test.ts).

const DIA = 86400000;
const iso = d => d.toISOString().slice(0, 10);
const util = s => { const w = new Date(s + 'T12:00:00Z').getUTCDay(); return w !== 0 && w !== 6; };

export function diasUteis(de, ate) {
  const out = [];
  for (let t = new Date(de + 'T12:00:00Z').getTime(); t <= new Date(ate + 'T12:00:00Z').getTime(); t += DIA) {
    const s = iso(new Date(t));
    if (util(s)) out.push(s);
  }
  return out;
}

export function proximoDiaUtil(s) {
  let t = new Date(s + 'T12:00:00Z').getTime() + DIA;
  while (!util(iso(new Date(t)))) t += DIA;
  return iso(new Date(t));
}

function ultimoDiaMes(s) {
  const d = new Date(s + 'T12:00:00Z');
  return iso(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0, 12)));
}

/**
 * @param {{hoje:string, metaEquipeDia:number, vendedores:{id:string,nome:string,metaMes:number}[],
 *          fechamentos:{vendedorId:string|null,dia:string}[], desistencias?:{vendedorId:string|null,dia:string}[],
 *          zapsign?:{pendentes:number,assinadosHoje:number}}} p
 */
export function analisarComercial(p) {
  const { hoje } = p;
  const inicioMes = hoje.slice(0, 8) + '01';
  const fimMes = ultimoDiaMes(hoje);
  const uteisMes = diasUteis(inicioMes, fimMes);
  const uteisPassados = uteisMes.filter(d => d <= hoje);
  const restantes = uteisMes.filter(d => d > hoje).length;
  const ult5 = diasUteis(iso(new Date(new Date(hoje + 'T12:00:00Z').getTime() - 13 * DIA)), hoje).slice(-5);
  const ontemUtil = uteisPassados.filter(d => d < hoje).slice(-1)[0] ?? null;

  const n = Math.max(1, p.vendedores.length);
  const metaEquipeMes = p.vendedores.some(v => v.metaMes > 0)
    ? p.vendedores.reduce((s, v) => s + (v.metaMes || 0), 0)
    : p.metaEquipeDia * uteisMes.length;

  const vend = p.vendedores.map(v => {
    const meus = p.fechamentos.filter(f => f.vendedorId === v.id);
    const mes = meus.filter(f => f.dia >= inicioMes && f.dia <= hoje).length;
    const hojeQtd = meus.filter(f => f.dia === hoje).length;
    const ontem = ontemUtil ? meus.filter(f => f.dia === ontemUtil).length : 0;
    const ultimos5 = meus.filter(f => ult5.includes(f.dia)).length;
    const meta = v.metaMes > 0 ? v.metaMes : Math.round(metaEquipeMes / n);
    const esperadoAteHoje = meta * (uteisPassados.length / Math.max(1, uteisMes.length));
    const ritmo = esperadoAteHoje > 0 ? mes / esperadoAteHoje : 1;
    const falta = Math.max(0, meta - mes);
    const porDia = restantes > 0 ? Math.ceil(falta / restantes) : falta;
    const diasSemFechar = (() => { let k = 0; for (const d of [...uteisPassados].reverse()) { if (meus.some(f => f.dia === d)) break; k++; } return k; })();
    const desist = (p.desistencias ?? []).filter(f => f.vendedorId === v.id && f.dia >= inicioMes).length;
    const situacao = ritmo >= 1 ? 'verde' : ritmo >= 0.7 ? 'amarelo' : 'vermelho';
    return { id: v.id, nome: v.nome, hoje: hojeQtd, ontem, ultimos5, mes, meta, falta, porDia, ritmo: Math.round(ritmo * 100), diasSemFechar, desistencias: desist, situacao };
  }).sort((a, b) => a.ritmo - b.ritmo);

  const semVendedor = p.fechamentos.filter(f => !f.vendedorId && f.dia >= inicioMes && f.dia <= hoje).length;
  const lancadosMes = p.fechamentos.filter(f => f.dia >= inicioMes && f.dia <= hoje).length;
  const lancadosHoje = p.fechamentos.filter(f => f.dia === hoje).length;
  // o total da equipe usa o maior entre o lançado no sistema e o assinado no ZapSign (sem somar os dois)
  const zap = { pendentes: 0, assinadosHoje: 0, assinadosMes: 0, ...(p.zapsign ?? {}) };
  const mesEquipe = Math.max(lancadosMes, zap.assinadosMes);
  const hojeEquipe = Math.max(lancadosHoje, zap.assinadosHoje);
  const faltaEquipe = Math.max(0, metaEquipeMes - mesEquipe);
  return {
    hoje, amanha: proximoDiaUtil(hoje), diasUteisMes: uteisMes.length, diasUteisPassados: uteisPassados.length, diasUteisRestantes: restantes,
    equipe: {
      hoje: hojeEquipe, metaDia: p.metaEquipeDia, mes: mesEquipe, metaMes: metaEquipeMes, falta: faltaEquipe,
      porDiaNecessario: restantes > 0 ? Math.ceil(faltaEquipe / restantes) : faltaEquipe,
      percentual: metaEquipeMes > 0 ? Math.round((mesEquipe / metaEquipeMes) * 100) : 0,
      semVendedor, lancadosMes, lancadosHoje,
    },
    zapsign: zap,
    vendedores: vend,
  };
}

const ICONE = { verde: '🟢', amarelo: '🟡', vermelho: '🔴' };
const br = s => s.split('-').reverse().slice(0, 2).join('/');

/** Texto-base (sem IA) — a tarefa agendada do Claude reescreve com análise mais rica. */
export function textoRelatorio(a) {
  const e = a.equipe;
  const L = [];
  L.push(`**Hoje (${br(a.hoje)}): ${e.hoje} fechamento${e.hoje === 1 ? '' : 's'}** — meta do dia ${e.metaDia}. ${e.hoje >= e.metaDia ? 'Meta do dia batida! 🎉' : `Faltaram ${e.metaDia - e.hoje}.`}`);
  L.push(`**Mês:** ${e.mes} de ${e.metaMes} (${e.percentual}%). Faltam ${e.falta} em ${a.diasUteisRestantes} dias úteis → **${e.porDiaNecessario} por dia** a partir de amanhã.`);
  L.push(`ZapSign: ${a.zapsign.assinadosHoje} assinado(s) hoje e ${a.zapsign.assinadosMes} no mês · lançados no sistema pelos vendedores: ${e.lancadosHoje} hoje e ${e.lancadosMes} no mês.`);
  if (a.zapsign.assinadosMes > e.lancadosMes) L.push(`⚠️ ${a.zapsign.assinadosMes - e.lancadosMes} contrato(s) assinado(s) ainda não lançado(s) em Fechamento — sem isso o ranking por vendedor fica incompleto.`);
  if (e.semVendedor) L.push(`⚠️ ${e.semVendedor} fechamento(s) do mês sem vendedor marcado — corrigir em Fechamento para o ranking ficar certo.`);
  L.push('');
  L.push('### Quem está fraco');
  const fracos = a.vendedores.filter(v => v.situacao !== 'verde');
  if (!fracos.length) L.push('Todo mundo no ritmo da meta. Manter.');
  for (const v of a.vendedores) {
    L.push(`${ICONE[v.situacao]} **${v.nome}** — ${v.mes}/${v.meta} no mês (${v.ritmo}% do ritmo), hoje ${v.hoje}, últimos 5 dias úteis ${v.ultimos5}${v.diasSemFechar >= 2 ? `, **${v.diasSemFechar} dias sem fechar**` : ''}${v.desistencias ? `, ${v.desistencias} desistência(s)` : ''}. Precisa de ${v.porDia}/dia.`);
  }
  L.push('');
  L.push(`### Plano para ${br(a.amanha)}`);
  L.push(`1. **8h45 — reunião de 10 min:** número do mês, meta de amanhã por pessoa (${a.vendedores.map(v => `${v.nome}: ${Math.max(1, v.porDia)}`).join(', ') || '—'}).`);
  if (a.zapsign.pendentes) L.push(`2. **Até 11h — cobrar as ${a.zapsign.pendentes} assinaturas pendentes no ZapSign** (Contratos Fechados → Pendentes). É o fechamento mais rápido do dia.`);
  L.push(`${a.zapsign.pendentes ? 3 : 2}. **Blocos de ligação:** 9h–11h30 e 14h–16h30 sem interrupção; retorno primeiro aos leads quentes de hoje.`);
  for (const v of fracos.filter(v => v.situacao === 'vermelho')) {
    L.push(`- **${v.nome}:** ouvir 2 atendimentos dela(e) antes das 10h e fazer 15 min de role-play da objeção que mais trava; ${v.diasSemFechar >= 2 ? 'repassar 3 leads quentes para destravar' : 'acompanhar o checkpoint das 13h'}.`);
  }
  L.push(`${a.zapsign.pendentes ? 4 : 3}. **Checkpoints 13h e 17h:** quem não fechou até 13h muda de abordagem à tarde (oferta de análise gratuita do caso / ligação em vez de texto).`);
  return L.join('\n');
}
