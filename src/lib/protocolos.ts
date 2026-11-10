// Protocolos do setor operacional: tipos, rótulos e cálculo de desempenho.
import { eachDayOfInterval, format, isWeekend, parseISO } from 'date-fns';

/** Nome para exibir: nunca mostra e-mail (usa a parte antes do @, capitalizada). */
export function nomeAmigavel(n: string | null | undefined): string {
  const t = (n ?? '').trim();
  if (!t) return '—';
  if (!t.includes('@')) return t;
  return t.split('@')[0].replace(/[._-]+/g, ' ').replace(/\d+/g, '').trim()
    .split(/\s+/).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ') || '—';
}

export type TipoProtocolo =
  | 'requerimento_adm' | 'acao_judicial' | 'recurso_adm' | 'recurso_judicial'
  | 'peticao' | 'cumprimento_exigencia' | 'outro';

export const TIPO_PROTOCOLO_LABEL: Record<TipoProtocolo, string> = {
  requerimento_adm: 'Requerimento administrativo (INSS)',
  acao_judicial: 'Ação judicial (inicial)',
  recurso_adm: 'Recurso administrativo (CRPS)',
  recurso_judicial: 'Recurso judicial',
  peticao: 'Petição intermediária',
  cumprimento_exigencia: 'Cumprimento de exigência INSS',
  outro: 'Outro',
};

export const TIPO_PROTOCOLO_CURTO: Record<TipoProtocolo, string> = {
  requerimento_adm: 'Requerimento',
  acao_judicial: 'Ação judicial',
  recurso_adm: 'Recurso adm.',
  recurso_judicial: 'Recurso jud.',
  peticao: 'Petição',
  cumprimento_exigencia: 'Exigência',
  outro: 'Outro',
};

export const AREAS = ['Previdenciário', 'Aéreo/Consumidor', 'Cível', 'Trabalhista', 'Outra'] as const;

export const BENEFICIOS_SUGERIDOS = [
  'BPC/LOAS', 'Auxílio-acidente', 'Auxílio-doença', 'Aposentadoria por incapacidade',
  'Salário-maternidade', 'Pensão por morte', 'Aposentadoria', 'Atraso/cancelamento de voo', 'Bagagem',
];

export interface Protocolo {
  id: string;
  data: string;
  colaborador_id: string;
  colaborador_nome: string | null;
  tipo: TipoProtocolo;
  area: string | null;
  cliente_nome: string;
  beneficio: string | null;
  numero: string | null;
  orgao: string | null;
  descricao: string | null;
  criado_em: string;
}

export interface LinhaDesempenho {
  colaborador_id: string;
  nome: string;
  total: number;
  porTipo: Partial<Record<TipoProtocolo, number>>;
  diasComLancamento: number;
  mediaDiaUtil: number;
  hoje: number;
  melhorDia: { data: string; qtd: number } | null;
}

/** Dias úteis (seg–sex) no intervalo, no mínimo 1. */
export function diasUteis(de: string, ate: string): number {
  const n = eachDayOfInterval({ start: parseISO(de), end: parseISO(ate) }).filter(d => !isWeekend(d)).length;
  return Math.max(1, n);
}

export function calcularDesempenho(
  protocolos: Protocolo[], de: string, ate: string, hoje: string = format(new Date(), 'yyyy-MM-dd'),
): LinhaDesempenho[] {
  const uteis = diasUteis(de, ate);
  const mapa = new Map<string, LinhaDesempenho & { porDia: Map<string, number> }>();
  for (const p of protocolos) {
    if (p.data < de || p.data > ate) continue;
    let l = mapa.get(p.colaborador_id);
    if (!l) {
      l = { colaborador_id: p.colaborador_id, nome: nomeAmigavel(p.colaborador_nome), total: 0, porTipo: {},
            diasComLancamento: 0, mediaDiaUtil: 0, hoje: 0, melhorDia: null, porDia: new Map() };
      mapa.set(p.colaborador_id, l);
    }
    l.total += 1;
    l.porTipo[p.tipo] = (l.porTipo[p.tipo] ?? 0) + 1;
    l.porDia.set(p.data, (l.porDia.get(p.data) ?? 0) + 1);
    if (p.data === hoje) l.hoje += 1;
  }
  return [...mapa.values()].map(({ porDia, ...l }) => {
    let melhor: { data: string; qtd: number } | null = null;
    for (const [data, qtd] of porDia) if (!melhor || qtd > melhor.qtd) melhor = { data, qtd };
    return { ...l, diasComLancamento: porDia.size, mediaDiaUtil: Math.round((l.total / uteis) * 10) / 10, melhorDia: melhor };
  }).sort((a, b) => b.total - a.total || a.nome.localeCompare(b.nome));
}

/** Série por dia para o gráfico: { data, [nome]: qtd } */
export function seriePorDia(protocolos: Protocolo[], de: string, ate: string) {
  const dias = eachDayOfInterval({ start: parseISO(de), end: parseISO(ate) }).map(d => format(d, 'yyyy-MM-dd'));
  const nomes = [...new Set(protocolos.map(p => nomeAmigavel(p.colaborador_nome)))].sort();
  const linhas = dias.map(d => {
    const o: Record<string, string | number> = { data: d };
    for (const n of nomes) o[n] = 0;
    return o;
  });
  const idx = new Map(dias.map((d, i) => [d, i]));
  for (const p of protocolos) {
    const i = idx.get(p.data);
    if (i === undefined) continue;
    const n = nomeAmigavel(p.colaborador_nome);
    linhas[i][n] = (linhas[i][n] as number) + 1;
  }
  return { linhas, nomes };
}
