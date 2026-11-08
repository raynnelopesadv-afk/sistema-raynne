// Regras de comissionamento dos closers
// Faixas (% da meta_mes do closer):
//   META       (até 100%)    -> R$ 25 / contrato
//   SUPERMETA  (101% – 150%) -> R$ 35 / contrato
//   ULTRAMETA  (>150%)       -> R$ 45 / contrato
// Quando sobe de faixa, TODOS os contratos do mês passam a valer a faixa nova.
// Bônus 2x: contratos fechados em fim de semana, feriado nacional ou entre 19h e 05h
// recebem o dobro do valor da faixa vigente (apenas o contrato elegível).
// Pagamento:
//   - 1ª metade: 5º dia útil (sobre todos os contratos fechados no mês de referência).
//   - 2ª metade: liberada por contrato quando ele passa a "qualificado".
// Recálculo: sempre realizado com a faixa atual no momento do pagamento.

export type Faixa = 'abaixo' | 'meta' | 'supermeta' | 'ultrameta';

export const VALOR_POR_FAIXA: Record<Exclude<Faixa, 'abaixo'>, number> = {
  meta: 25,
  supermeta: 35,
  ultrameta: 45,
};

export const LABEL_FAIXA: Record<Faixa, string> = {
  abaixo: 'Abaixo da meta',
  meta: 'Meta',
  supermeta: 'Supermeta',
  ultrameta: 'Ultrameta',
};

// Feriados nacionais BR fixos (data sem ano: 'MM-DD') + lista por ano para móveis.
// 2025/2026 inclui Carnaval, Sexta-Santa, Corpus Christi.
const FERIADOS_FIXOS = [
  '01-01', // Confraternização
  '04-21', // Tiradentes
  '05-01', // Trabalho
  '09-07', // Independência
  '10-12', // N. Sra. Aparecida
  '11-02', // Finados
  '11-15', // República
  '11-20', // Consciência Negra
  '12-25', // Natal
];

const FERIADOS_MOVEIS_POR_ANO: Record<number, string[]> = {
  2025: ['2025-03-03', '2025-03-04', '2025-04-18', '2025-06-19'],
  2026: ['2026-02-16', '2026-02-17', '2026-04-03', '2026-06-04'],
  2027: ['2027-02-08', '2027-02-09', '2027-03-26', '2027-05-27'],
};

export function isFeriado(d: Date): boolean {
  const y = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  if (FERIADOS_FIXOS.includes(`${mm}-${dd}`)) return true;
  return (FERIADOS_MOVEIS_POR_ANO[y] ?? []).includes(`${y}-${mm}-${dd}`);
}

export function isFimDeSemana(d: Date): boolean {
  const dow = d.getDay();
  return dow === 0 || dow === 6;
}

// Horário noturno: 19:00 até 04:59 (do dia seguinte).
export function isHorarioNoturno(d: Date): boolean {
  const h = d.getHours();
  return h >= 19 || h < 5;
}

export function isContratoEspecial(fechadoEm: string | Date | null | undefined): boolean {
  if (!fechadoEm) return false;
  const d = typeof fechadoEm === 'string' ? new Date(fechadoEm) : fechadoEm;
  if (Number.isNaN(d.getTime())) return false;
  return isFimDeSemana(d) || isFeriado(d) || isHorarioNoturno(d);
}

export function classificarFaixa(pct: number): Faixa {
  if (pct >= 150.0001) return 'ultrameta';
  if (pct >= 100.0001) return 'supermeta';
  if (pct >= 70) return 'meta';
  return 'abaixo';
}

export function valorFaixa(f: Faixa): number {
  if (f === 'abaixo') return 0;
  return VALOR_POR_FAIXA[f];
}

// Retorna o 5º dia útil do mês informado (year, monthIndex 0-11).
export function quintoDiaUtil(year: number, monthIndex: number): Date {
  let count = 0;
  let day = 1;
  while (true) {
    const d = new Date(year, monthIndex, day);
    if (!isFimDeSemana(d) && !isFeriado(d)) {
      count++;
      if (count === 5) return d;
    }
    day++;
    if (day > 31) return new Date(year, monthIndex, 31);
  }
}

export interface ContratoCalc {
  id: string;
  closer_id: string | null;
  fechado_em: string | null;
  qualificado_em: string | null;
  status_qualificacao: 'pendente' | 'qualificado' | 'desqualificado';
}

export interface ResumoCloser {
  closer_id: string;
  nome: string;
  meta_mes: number;
  contratos: number;
  pct_meta: number;
  faixa: Faixa;
  valor_unit: number;
  qtd_especiais: number;
  qtd_qualificados: number;
  total_bruto: number;          // total devido pelo mês (todos os contratos, faixa atual)
  primeira_metade: number;      // pago no 5º dia útil
  segunda_metade_total: number; // valor máximo da 2ª metade
  segunda_metade_liberada: number; // já liberado com base nos qualificados até a data de corte
}

// Calcula resumo do mês de referência para um closer.
// `dataCorte` define até quando contam qualificações (ex.: 5º dia útil do mês seguinte).
export function calcularResumoCloser(params: {
  closer_id: string;
  nome: string;
  meta_mes: number;
  contratos: ContratoCalc[]; // contratos fechados no mês de referência
  qualificadosAteDataCorte: ContratoCalc[]; // contratos (de qualquer mês) qualificados no período
}): ResumoCloser {
  const { closer_id, nome, meta_mes, contratos, qualificadosAteDataCorte } = params;
  const qtd = contratos.length;
  const pct = meta_mes > 0 ? (qtd / meta_mes) * 100 : 0;
  // Abaixo de 70% da meta: NÃO conta valor (R$ 0).
  const faixa = classificarFaixa(pct);
  const unit = valorFaixa(faixa);

  let totalBruto = 0;
  let especiais = 0;
  for (const c of contratos) {
    const especial = isContratoEspecial(c.fechado_em);
    if (especial) especiais++;
    totalBruto += unit * (especial ? 2 : 1);
  }

  const primeira = totalBruto / 2;
  const segundaTotal = totalBruto / 2;

  // 2ª metade liberada: por contrato qualificado até a data de corte.
  // O valor unitário da 2ª metade = (unit*especial?2:1)/2.
  let segundaLiberada = 0;
  const qualSet = new Set(qualificadosAteDataCorte.map(q => q.id));
  for (const c of contratos) {
    if (qualSet.has(c.id)) {
      const especial = isContratoEspecial(c.fechado_em);
      segundaLiberada += (unit * (especial ? 2 : 1)) / 2;
    }
  }

  return {
    closer_id,
    nome,
    meta_mes,
    contratos: qtd,
    pct_meta: pct,
    faixa,
    valor_unit: unit,
    qtd_especiais: especiais,
    qtd_qualificados: contratos.filter(c => qualSet.has(c.id)).length,
    total_bruto: totalBruto,
    primeira_metade: primeira,
    segunda_metade_total: segundaTotal,
    segunda_metade_liberada: segundaLiberada,
  };
}
