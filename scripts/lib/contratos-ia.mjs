// Contratos fechados pela IA (Liderhub) no ZapSign — funções puras (testadas em src/test).
//
// A IA sempre gera o documento a partir dos modelos do ZapSign:
//   PROCURAÇÃO E CONTRATO. BPC MENOR
//   PROCURAÇÃO E CONTRATO AÉREO
//   PROCURAÇÃO E CONTRATO APOSENTADORIA OU BPC
//   PROCURAÇÃO E CONTRATO AUXILIO DOENÇA
//   MODELO AUXILIO ACIDENTE
// Contratos feitos pela equipe têm outros nomes de arquivo ("CONTRATO FULANO.docx").

const sem = s => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();

export const NOME_CLOSER_IA = 'IA Liderhub';

/** Valor de cada contrato fechado, definido pela Dra. Raynne. */
export const VALOR_PRODUTO = {
  'Aposentadoria': 8105,
  'Auxílio-acidente': 8105,
  'Benefício por incapacidade temporária': 1500,
  'Salário-maternidade': 1621,
  'Aéreo': 1621,
  'BPC/LOAS': 8105,
  'Pensão por morte': 8105,
  'Trabalhista': 1621,
};

export function ehContratoDaIA(nomeDocumento) {
  const n = sem(nomeDocumento);
  return /^procuracao e contrato\b/.test(n) || /^modelo auxilio acidente\b/.test(n);
}

/** Produto (nome igual ao cadastro de Produtos) e divisão de um contrato, pelo nome do arquivo. */
export function produtoDoContrato(nomeDocumento) {
  const n = sem(nomeDocumento);
  if (/aereo|latam|\bgol\b|\bazul\b|voo/.test(n)) return { produto: 'Aéreo', divisao: 'educacao' };
  if (/maternidade/.test(n)) return { produto: 'Salário-maternidade', divisao: 'advogados' };
  if (/acidente/.test(n)) return { produto: 'Auxílio-acidente', divisao: 'advogados' };
  if (/doenca|incapacidade/.test(n)) return { produto: 'Benefício por incapacidade temporária', divisao: 'advogados' };
  if (/aposentadoria/.test(n)) return { produto: 'Aposentadoria', divisao: 'advogados' };
  if (/bpc|loas|impubere/.test(n)) return { produto: 'BPC/LOAS', divisao: 'advogados' };
  if (/pensao/.test(n)) return { produto: 'Pensão por morte', divisao: 'advogados' };
  if (/trabalhista/.test(n)) return { produto: 'Trabalhista', divisao: 'advogados' };
  return { produto: null, divisao: 'advogados' };
}

/** Data (AAAA-MM-DD) em Brasília. */
export function diaBrasilia(iso) {
  if (!iso) return null;
  return new Date(new Date(iso).getTime() - 3 * 3600 * 1000).toISOString().slice(0, 10);
}

export const normNome = s => sem(s).replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim();
