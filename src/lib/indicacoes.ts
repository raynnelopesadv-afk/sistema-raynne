// Comissão por indicação: cada colaborador indica clientes de fora (não do tráfego pago).
// Conta para a comissão do mês tudo que o colaborador lançou no mês (exceto "não fechou"),
// para a equipe ver o valor acumulado. Valores definidos pela Dra. Raynne.

export type ProdutoIndicacao = 'auxilio_acidente' | 'bpc' | 'aposentadoria' | 'pensao_morte' | 'salario_maternidade' | 'auxilio_doenca' | 'outro';
export type StatusIndicacao = 'indicado' | 'fechado' | 'nao_fechou';

export const PRODUTOS_INDICACAO: { valor: ProdutoIndicacao; label: string; comissao: number }[] = [
  { valor: 'auxilio_acidente', label: 'Auxílio-acidente', comissao: 45 },
  { valor: 'bpc', label: 'BPC/LOAS', comissao: 45 },
  { valor: 'aposentadoria', label: 'Aposentadoria', comissao: 45 },
  { valor: 'pensao_morte', label: 'Pensão por morte', comissao: 45 },
  { valor: 'salario_maternidade', label: 'Salário-maternidade', comissao: 40 },
  { valor: 'auxilio_doenca', label: 'Auxílio-doença', comissao: 40 },
  { valor: 'outro', label: 'Outro (valor pela gestão)', comissao: 0 },
];

export const STATUS_INDICACAO: { valor: StatusIndicacao; label: string }[] = [
  { valor: 'indicado', label: 'Indicado (aguardando)' },
  { valor: 'fechado', label: 'Virou contrato' },
  { valor: 'nao_fechou', label: 'Não fechou' },
];

export const labelProduto = (p: string) => PRODUTOS_INDICACAO.find(x => x.valor === p)?.label ?? p;
export const labelStatus = (s: string) => STATUS_INDICACAO.find(x => x.valor === s)?.label ?? s;

export function valorPadrao(produto: string): number {
  return PRODUTOS_INDICACAO.find(x => x.valor === produto)?.comissao ?? 0;
}

export interface Indicacao {
  id: string;
  indicador_id: string;
  indicador_nome: string | null;
  cliente_nome: string;
  telefone: string | null;
  produto: ProdutoIndicacao;
  data_indicacao: string;
  status: StatusIndicacao;
  data_fechamento: string | null;
  valor: number | null;
  pago: boolean;
  pago_em: string | null;
  observacao: string | null;
}

/** Mês (AAAA-MM) em que a indicação conta para a comissão: o do fechamento. */
export function mesDaComissao(i: Pick<Indicacao, 'status' | 'data_fechamento' | 'data_indicacao'>): string | null {
  if (i.status !== 'fechado') return null;
  return (i.data_fechamento ?? i.data_indicacao).slice(0, 7);
}

export interface ResumoIndicador {
  indicadorId: string;
  nome: string;
  indicadas: number;
  fechadas: number;
  total: number;
  pago: number;
  aPagar: number;
}

/**
 * Resumo do mês por colaborador.
 * "indicadas"/valores = lançadas no mês (exceto "não fechou"); "fechadas" = viraram contrato no mês.
 */
export function resumoDoMes(lista: Indicacao[], mes: string): ResumoIndicador[] {
  const m: Record<string, ResumoIndicador> = {};
  const linha = (i: Indicacao) => (m[i.indicador_id] ??= {
    indicadorId: i.indicador_id, nome: i.indicador_nome || 'Colaborador', indicadas: 0, fechadas: 0, total: 0, pago: 0, aPagar: 0,
  });
  for (const i of lista) {
    // Comissão conta no mês do lançamento: tudo que foi lançado, exceto "não fechou".
    if (i.data_indicacao.slice(0, 7) === mes) {
      const r = linha(i);
      r.indicadas += 1;
      if (i.status !== 'nao_fechou') {
        const v = Number(i.valor ?? valorPadrao(i.produto));
        r.total += v;
        if (i.pago) r.pago += v; else r.aPagar += v;
      }
    }
    if (mesDaComissao(i) === mes) linha(i).fechadas += 1;
  }
  return Object.values(m).sort((a, b) => b.total - a.total || b.fechadas - a.fechadas || b.indicadas - a.indicadas);
}

/** Lista exibida no mês: lançadas no mês OU que fecharam no mês. */
export function doMes(lista: Indicacao[], mes: string): Indicacao[] {
  return lista.filter(i => i.data_indicacao.slice(0, 7) === mes || mesDaComissao(i) === mes);
}
