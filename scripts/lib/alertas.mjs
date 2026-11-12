// Alertas de meta no celular: monta as mensagens de hora em hora.
// Regras (definidas pela Dra. Raynne):
//   - Comercial e líder: 3 contratos fechados por dia, cada um.
//   - Jurídico (protocolos): 4 a 5 protocolos por dia (meta 4, ideal 5).
//   - Prazos: cumprir todos os prazos do dia.
//   - Gestão: não tem meta própria; acompanha a equipe toda.
// Funções puras (sem banco), testadas em src/test/alertas.test.ts.

export const SETORES_META = {
  comercial: { label: 'Comercial', meta: 3, unidade: 'contratos' },
  lider: { label: 'Líder do comercial', meta: 3, unidade: 'contratos' },
  juridico: { label: 'Jurídico (protocolos)', meta: 4, ideal: 5, unidade: 'protocolos' },
  prazos: { label: 'Prazos', meta: 0, unidade: 'prazos' },
  gestao: { label: 'Gestão', meta: 0, unidade: '' },
};

export const HORA_INICIO = 9;
export const HORA_FIM = 17;

/** Quanto da meta já deveria estar feito nesta hora (ritmo linear das 9h às 17h). */
export function esperadoAte(meta, hora) {
  const frac = Math.min(1, Math.max(0, (hora - HORA_INICIO) / (HORA_FIM - HORA_INICIO)));
  return Math.floor(meta * frac);
}

const plural = (n, um, varios) => (n === 1 ? um : varios);

/** Mensagem individual da pessoa. */
export function mensagemPessoal({ setor, feito, meta, hora, prazos }) {
  if (setor === 'gestao') return null;
  if (setor === 'prazos') {
    const total = prazos?.total ?? 0;
    const feitos = prazos?.feitos ?? 0;
    if (total === 0) {
      return { titulo: 'Vai, vencedor(a)!', corpo: `São ${hora}h e não há prazos para hoje. Aproveita para adiantar os de amanhã!` };
    }
    if (feitos >= total) {
      return { titulo: 'Prazos zerados!', corpo: `Todos os ${total} prazos de hoje cumpridos. Aqui só tem os melhores!` };
    }
    const faltam = total - feitos;
    return {
      titulo: 'Vai, vencedor(a)!',
      corpo: `São ${hora}h e você cumpriu ${feitos} de ${total} prazos de hoje. ${plural(faltam, 'Falta 1', `Faltam ${faltam}`)} — bora zerar!`,
    };
  }
  const unidade = setor === 'juridico' ? 'protocolos' : 'contratos';
  const ideal = SETORES_META[setor]?.ideal;
  if (feito >= meta) {
    if (ideal && feito < ideal) {
      return { titulo: 'Meta batida!', corpo: `Você já fez ${feito} ${unidade} hoje. Bora buscar o ${ideal}º — aqui só tem os melhores!` };
    }
    return { titulo: 'Meta batida!', corpo: `Você já fez ${feito} ${unidade} hoje. Aqui só tem os melhores — bora pro próximo!` };
  }
  const faltam = meta - feito;
  return {
    titulo: 'Vai, vencedor(a)!',
    corpo: `São ${hora}h e você está com ${feito} de ${meta} ${unidade}. ${plural(faltam, 'Falta só 1', `Faltam ${faltam}`)} — você consegue, bora pra meta!`,
  };
}

/** Quem cada setor enxerga no aviso da equipe. */
export function setoresVisiveis(setor) {
  if (setor === 'gestao') return ['comercial', 'lider', 'juridico', 'prazos'];
  if (setor === 'comercial' || setor === 'lider') return ['comercial', 'lider'];
  if (setor === 'juridico') return ['juridico'];
  if (setor === 'prazos') return ['prazos'];
  return [];
}

/** Pessoas abaixo do ritmo da meta nesta hora. */
export function abaixoDoRitmo(pessoas, hora) {
  return pessoas.filter(p => p.meta > 0 && p.feito < p.meta && p.feito < Math.max(1, esperadoAte(p.meta, hora)));
}

/** Aviso da equipe: quem está abaixo da meta (no fim do dia, quem não bateu). */
export function mensagemEquipe({ setor, pessoas, prazos, hora, euId }) {
  const vis = setoresVisiveis(setor);
  if (!vis.length) return null;
  const fimDoDia = hora >= HORA_FIM;
  const grupo = pessoas.filter(p => vis.includes(p.setor) && p.setor !== 'prazos' && p.userId !== euId);
  const atrasados = fimDoDia ? grupo.filter(p => p.meta > 0 && p.feito < p.meta) : abaixoDoRitmo(grupo, hora);
  const linhas = atrasados.map(p => `${p.nome}: ${p.feito}/${p.meta} ${p.setor === 'juridico' ? 'protocolos' : 'contratos'}`);
  const verPrazos = vis.includes('prazos') && setor !== 'prazos' && (prazos?.total ?? 0) > 0 && prazos.feitos < prazos.total;
  if (verPrazos) linhas.push(`Prazos: ${prazos.feitos} de ${prazos.total} cumpridos`);
  if (!linhas.length) return null;
  return {
    titulo: fimDoDia ? 'Não bateram a meta hoje' : `Abaixo da meta às ${hora}h`,
    corpo: `${linhas.join(' · ')}. ${fimDoDia ? 'Amanhã a gente vai pra cima!' : 'Bora, time! Ainda dá tempo.'}`,
  };
}

/** Resumo das 17h por setor. */
export function mensagemResumo({ setor, pessoas, prazos }) {
  const vis = setoresVisiveis(setor);
  const partes = [];
  const com = pessoas.filter(p => vis.includes(p.setor) && (p.setor === 'comercial' || p.setor === 'lider'));
  if (com.length) {
    const feito = com.reduce((s, p) => s + p.feito, 0);
    const meta = com.reduce((s, p) => s + p.meta, 0);
    partes.push(`Comercial fechou ${feito} de ${meta} contratos`);
  }
  const jur = pessoas.filter(p => vis.includes(p.setor) && p.setor === 'juridico');
  if (jur.length) partes.push(`Jurídico fez ${jur.reduce((s, p) => s + p.feito, 0)} protocolos`);
  if (vis.includes('prazos') && (prazos?.total ?? 0) > 0) partes.push(`Prazos: ${prazos.feitos} de ${prazos.total} cumpridos`);
  if (!partes.length) return null;
  return { titulo: 'Resumo do dia — 17h', corpo: `${partes.join(' · ')}. Aqui só tem os melhores!` };
}

/**
 * Monta todas as notificações desta hora.
 * inscricoes: [{ userId, nome, setor, alertaHora, alertaEquipe, resumoDia }]
 * feitos: { [userId]: número feito hoje } (contratos ou protocolos, conforme o setor)
 * prazos: { total, feitos } do dia
 */
export function montarAlertas({ hora, inscricoes, feitos, prazos }) {
  const pessoas = inscricoes
    .filter(i => i.setor !== 'gestao' && i.setor !== 'prazos')
    .map(i => ({ userId: i.userId, nome: i.nome, setor: i.setor, meta: SETORES_META[i.setor]?.meta ?? 0, feito: feitos[i.userId] ?? 0 }));
  const saida = [];
  for (const i of inscricoes) {
    const meta = SETORES_META[i.setor]?.meta ?? 0;
    if (i.alertaHora) {
      const m = mensagemPessoal({ setor: i.setor, feito: feitos[i.userId] ?? 0, meta, hora, prazos });
      if (m) saida.push({ userId: i.userId, tipo: 'pessoal', ...m });
    }
    if (i.alertaEquipe) {
      const m = mensagemEquipe({ setor: i.setor, pessoas, prazos, hora, euId: i.userId });
      if (m) saida.push({ userId: i.userId, tipo: 'equipe', ...m });
    }
    if (i.resumoDia && hora >= HORA_FIM) {
      const m = mensagemResumo({ setor: i.setor, pessoas, prazos });
      if (m) saida.push({ userId: i.userId, tipo: 'resumo', ...m });
    }
  }
  return saida;
}
