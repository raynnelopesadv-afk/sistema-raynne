// =============================================================================
// Motor de comissionamento configurável — produto × nível × etapa
// Regras (Manual de Onboarding Comercial):
//   - Cada closer tem um nível de carreira (Entrada → Elite), definido pelo gestor.
//   - Cada produto define, por nível: meta de contratos/mês e valor por contrato
//     em cada etapa de pagamento (fechamento, protocolo, pagamento confirmado).
//   - Piso: abaixo de pisoPct% da meta do mês → sem variável naquele produto.
//     Entre pisoPct% e 99%: variável proporcional ao % atingido (se proporcional=true).
//     100%+: variável cheio.
//   - Contratos fechados em sábado/domingo valem multFds× (padrão 1,5×).
//   - Cada parcela é creditada no mês em que a etapa ocorreu; o fator de meta
//     usado é sempre o do mês de FECHAMENTO do contrato.
// =============================================================================

export type Etapa = 'fechamento' | 'protocolo' | 'pagamento';

export const ETAPAS: Etapa[] = ['fechamento', 'protocolo', 'pagamento'];

export const LABEL_ETAPA: Record<Etapa, string> = {
  fechamento: 'Fechamento',
  protocolo: 'Protocolo',
  pagamento: 'Pagamento confirmado',
};

export interface ComissaoSettings {
  pisoPct: number;       // % mínimo da meta para receber variável (padrão 50)
  proporcional: boolean; // 50–99% paga proporcional (padrão true)
  multFds: number;       // multiplicador sábado/domingo (padrão 1.5)
  iaMultFds: boolean;    // fechamento por IA ganha o multiplicador de fds? (padrão false)
}

export const DEFAULT_SETTINGS: ComissaoSettings = {
  pisoPct: 50,
  proporcional: true,
  multFds: 1.5,
  iaMultFds: false,
};

export interface StageRule {
  product_id: string;
  career_level_id: string;
  etapa: Etapa;
  variante: string | null;
  valor: number;
}

export interface ProductMeta {
  product_id: string;
  career_level_id: string;
  meta_contratos: number;
}

export interface CareerLevel {
  id: string;
  nome: string;
  ordem: number;
}

/** Indexa regras de valor: product|level|etapa|variante -> valor */
export class RegrasIndex {
  private valores = new Map<string, number>();
  private metas = new Map<string, number>();

  constructor(stages: StageRule[], metas: ProductMeta[]) {
    for (const s of stages) {
      this.valores.set(keyOf(s.product_id, s.career_level_id, s.etapa, s.variante), Number(s.valor) || 0);
    }
    for (const m of metas) {
      this.metas.set(`${m.product_id}|${m.career_level_id}`, Number(m.meta_contratos) || 0);
    }
  }

  /** Valor da etapa para o contrato; tenta a variante exata e cai para a regra padrão (variante null). */
  valorEtapa(productId: string, levelId: string | null, etapa: Etapa, variante: string | null): number {
    if (!levelId) return 0;
    if (variante) {
      const v = this.valores.get(keyOf(productId, levelId, etapa, variante));
      if (v != null) return v;
    }
    return this.valores.get(keyOf(productId, levelId, etapa, null)) ?? 0;
  }

  meta(productId: string, levelId: string | null): number {
    if (!levelId) return 0;
    return this.metas.get(`${productId}|${levelId}`) ?? 0;
  }

  /** true se o produto tem alguma regra de valor para o nível */
  temRegras(productId: string, levelId: string | null): boolean {
    if (!levelId) return false;
    for (const k of this.valores.keys()) {
      if (k.startsWith(`${productId}|${levelId}|`)) return true;
    }
    return false;
  }
}

function keyOf(productId: string, levelId: string, etapa: Etapa, variante: string | null): string {
  return `${productId}|${levelId}|${etapa}|${variante ?? ''}`;
}

/** Fator aplicado ao variável conforme % da meta atingido no mês de fechamento. */
export function fatorMeta(pct: number, settings: ComissaoSettings): number {
  if (pct < settings.pisoPct) return 0;
  if (pct >= 100) return 1;
  return settings.proporcional ? pct / 100 : 1;
}

// ---------------------------------------------------------------------------
// Operação do closer (exclusivo vs misto) — Manual seção 5.4
// ---------------------------------------------------------------------------

/** Closer é misto quando opera 2+ produtos. */
export function isMisto(operacao: Set<string> | undefined): boolean {
  return !!operacao && operacao.size >= 2;
}

/** Meta ajustada: misto tem a meta de cada produto reduzida em 1/3 (arredonda p/ baixo). */
export function metaAjustada(meta: number, misto: boolean): number {
  if (meta <= 0) return 0;
  return misto ? Math.floor((meta * 2) / 3) : meta;
}

/** Meta efetiva do closer para um produto, considerando sua operação. */
export function metaDoCloser(params: {
  regras: RegrasIndex;
  productId: string;
  levelId: string | null;
  operacao: Set<string> | undefined;
}): number {
  const { regras, productId, levelId, operacao } = params;
  const base = regras.meta(productId, levelId);
  const aplicaMisto = isMisto(operacao) && (operacao?.has(productId) ?? false);
  return metaAjustada(base, aplicaMisto);
}

/**
 * Bônus de combo do mês: misto que bate a meta mista de TODOS os produtos
 * da sua operação recebe o bônus do seu nível. Sem bônus parcial.
 */
export function calcularBonusCombo(params: {
  ymRef: string;
  closers: Array<{ id: string; career_level_id: string | null }>;
  operacaoPorCloser: Map<string, Set<string>>;
  contagemFechamentos: Map<string, number>;
  regras: RegrasIndex;
  bonusPorNivel: Map<string, number>;
}): Map<string, number> {
  const { ymRef, closers, operacaoPorCloser, contagemFechamentos, regras, bonusPorNivel } = params;
  const out = new Map<string, number>();
  for (const c of closers) {
    const operacao = operacaoPorCloser.get(c.id);
    if (!c.career_level_id || !isMisto(operacao)) continue;
    const bonus = bonusPorNivel.get(c.career_level_id) ?? 0;
    if (bonus <= 0) continue;
    let bateuTodas = true;
    for (const pid of operacao!) {
      const metaMista = metaAjustada(regras.meta(pid, c.career_level_id), true);
      if (metaMista <= 0) { bateuTodas = false; break; }
      const feitos = contagemFechamentos.get(`${c.id}|${pid}|${ymRef}`) ?? 0;
      if (feitos < metaMista) { bateuTodas = false; break; }
    }
    if (bateuTodas) out.set(c.id, bonus);
  }
  return out;
}

/** Multiplicador de fim de semana com base na data de fechamento do contrato. */
export function multiplicadorContrato(dataFechamento: string | null | undefined, settings: ComissaoSettings): number {
  if (!dataFechamento) return 1;
  const d = new Date(dataFechamento.length <= 10 ? dataFechamento + 'T12:00:00' : dataFechamento);
  if (Number.isNaN(d.getTime())) return 1;
  const dow = d.getDay();
  return dow === 0 || dow === 6 ? settings.multFds : 1;
}

export interface ContratoRegras {
  id: string;
  closer_id: string | null;
  product_id: string | null;
  variante: string | null;
  data_fechamento: string | null;         // AAAA-MM-DD
  data_protocolo: string | null;          // AAAA-MM-DD
  data_pagamento_confirmado: string | null; // AAAA-MM-DD
  status_qualificacao?: string;
  /** Fechado por IA: a parcela do fechamento é liberada só no mês do protocolo. */
  fechado_por_ia?: boolean;
  /** Data em que o contrato foi desqualificado / houve desistência (AAAA-MM-DD). */
  data_desqualificacao?: string | null;
  /** Nome do cliente — usado no detalhamento dos descontos. */
  nome_cliente?: string | null;
}

export function ymOf(date: string | null | undefined): string | null {
  if (!date) return null;
  return date.slice(0, 7); // AAAA-MM
}

export interface ParcelaCalculada {
  contrato_id: string;
  closer_id: string;
  product_id: string;
  etapa: Etapa;
  valor_base: number;   // valor da regra × mult fds (sem fator de meta)
  fator: number;        // fator de meta do mês de fechamento
  valor: number;        // valor_base × fator (negativo quando é estorno)
  /** true = desconto por desqualificação/desistência de contrato já comissionado */
  estorno?: boolean;
  /** nome do cliente (só nos estornos, para o detalhamento) */
  cliente?: string | null;
}

/**
 * Calcula as parcelas devidas no mês de referência (ymRef = 'AAAA-MM').
 *
 * @param contratosEvento contratos com ALGUMA etapa ocorrida no mês de referência
 * @param contagemFechamentos mapa `closerId|productId|ymFechamento` -> nº de contratos
 *        fechados naquele mês (para o fator de meta). Deve cobrir todos os meses de
 *        fechamento presentes em contratosEvento.
 * @param nivelPorCloser mapa closerId -> career_level_id
 * @param operacaoPorCloser produtos que cada closer opera (misto = 2+ -> meta × 2/3)
 */
export function calcularParcelasMes(params: {
  ymRef: string;
  contratosEvento: ContratoRegras[];
  contagemFechamentos: Map<string, number>;
  nivelPorCloser: Map<string, string | null>;
  regras: RegrasIndex;
  settings: ComissaoSettings;
  operacaoPorCloser?: Map<string, Set<string>>;
}): ParcelaCalculada[] {
  const { ymRef, contratosEvento, contagemFechamentos, nivelPorCloser, regras, settings, operacaoPorCloser } = params;
  const out: ParcelaCalculada[] = [];

  for (const c of contratosEvento) {
    if (!c.closer_id || !c.product_id) continue;
    // desistência/desqualificado: estorno simples — não gera parcela nova
    if (c.status_qualificacao === 'desqualificado' || c.status_qualificacao === 'desistencia') continue;

    const levelId = nivelPorCloser.get(c.closer_id) ?? null;
    const ymFech = ymOf(c.data_fechamento);
    const mult = multiplicadorContrato(c.data_fechamento, settings);

    // fator de meta calculado no mês de fechamento do contrato
    // (meta ajustada pela operação do closer: misto = meta × 2/3)
    let fator = 0;
    if (ymFech) {
      const qtd = contagemFechamentos.get(`${c.closer_id}|${c.product_id}|${ymFech}`) ?? 0;
      const meta = metaDoCloser({ regras, productId: c.product_id, levelId, operacao: operacaoPorCloser?.get(c.closer_id) });
      const pct = meta > 0 ? (qtd / meta) * 100 : 0;
      fator = meta > 0 ? fatorMeta(pct, settings) : 0;
    }

    // Fechamento por IA: a parcela do fechamento é represada até o protocolo
    const dataParcelaFechamento = c.fechado_por_ia ? c.data_protocolo : c.data_fechamento;
    const eventos: Array<[Etapa, string | null]> = [
      ['fechamento', dataParcelaFechamento],
      ['protocolo', c.data_protocolo],
      ['pagamento', c.data_pagamento_confirmado],
    ];

    for (const [etapa, dataEvento] of eventos) {
      if (ymOf(dataEvento) !== ymRef) continue;
      const valorRegra = regras.valorEtapa(c.product_id, levelId, etapa, c.variante);
      if (valorRegra <= 0) continue;
      const multEfetivo = c.fechado_por_ia && !settings.iaMultFds ? 1 : mult;
      const valorBase = valorRegra * multEfetivo;
      out.push({
        contrato_id: c.id,
        closer_id: c.closer_id,
        product_id: c.product_id,
        etapa,
        valor_base: valorBase,
        fator,
        valor: valorBase * fator,
      });
    }
  }

  return out;
}


/**
 * Estornos (descontos) do mês: contratos DESQUALIFICADOS ou com DESISTÊNCIA
 * cuja comissão já havia sido creditada em meses ANTERIORES.
 *
 * Regra do escritório:
 *  - Desqualificado no mesmo mês da competência: a parcela simplesmente não é
 *    paga (o motor já ignora esses contratos em calcularParcelasMes).
 *  - Desqualificado depois: o valor já creditado é descontado do total do mês
 *    em que a desqualificação aconteceu.
 *
 * Retorna parcelas com valor NEGATIVO e estorno = true.
 */
export function calcularEstornosMes(params: {
  ymRef: string;
  /** contratos desqualificados/desistência com data_desqualificacao no mês de referência */
  contratosDesqualificados: ContratoRegras[];
  contagemFechamentos: Map<string, number>;
  nivelPorCloser: Map<string, string | null>;
  regras: RegrasIndex;
  settings: ComissaoSettings;
  operacaoPorCloser?: Map<string, Set<string>>;
}): ParcelaCalculada[] {
  const { ymRef, contratosDesqualificados, contagemFechamentos, nivelPorCloser, regras, settings, operacaoPorCloser } = params;
  const out: ParcelaCalculada[] = [];

  for (const c of contratosDesqualificados) {
    if (!c.closer_id || !c.product_id) continue;
    const ymDesq = ymOf(c.data_desqualificacao ?? null);
    if (ymDesq !== ymRef) continue; // só estorna no mês em que foi desqualificado

    const levelId = nivelPorCloser.get(c.closer_id) ?? null;
    const ymFech = ymOf(c.data_fechamento);
    const mult = multiplicadorContrato(c.data_fechamento, settings);

    let fator = 0;
    if (ymFech) {
      const qtd = contagemFechamentos.get(`${c.closer_id}|${c.product_id}|${ymFech}`) ?? 0;
      const meta = metaDoCloser({ regras, productId: c.product_id, levelId, operacao: operacaoPorCloser?.get(c.closer_id) });
      const pct = meta > 0 ? (qtd / meta) * 100 : 0;
      fator = meta > 0 ? fatorMeta(pct, settings) : 0;
    }

    const dataParcelaFechamento = c.fechado_por_ia ? c.data_protocolo : c.data_fechamento;
    const eventos: Array<[Etapa, string | null]> = [
      ['fechamento', dataParcelaFechamento],
      ['protocolo', c.data_protocolo],
      ['pagamento', c.data_pagamento_confirmado],
    ];

    for (const [etapa, dataEvento] of eventos) {
      const ymEvento = ymOf(dataEvento);
      if (!ymEvento) continue;
      // só estorna o que JÁ FOI creditado, ou seja, em mês anterior ao da desqualificação
      if (ymEvento >= ymRef) continue;
      const valorRegra = regras.valorEtapa(c.product_id, levelId, etapa, c.variante);
      if (valorRegra <= 0) continue;
      const multEfetivo = c.fechado_por_ia && !settings.iaMultFds ? 1 : mult;
      const valorBase = valorRegra * multEfetivo;
      out.push({
        contrato_id: c.id,
        closer_id: c.closer_id,
        product_id: c.product_id,
        etapa,
        valor_base: -valorBase,
        fator,
        valor: -(valorBase * fator),
        estorno: true,
        cliente: c.nome_cliente ?? null,
      });
    }
  }

  return out;
}
