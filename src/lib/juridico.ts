// Módulo jurídico: tipos, acesso ao banco e regras de urgência.
import { differenceInCalendarDays, format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export type StatusPublicacao = 'nao_lida' | 'tratada' | 'arquivada';
export type TipoAgenda =
  | 'prazo' | 'audiencia' | 'pericia' | 'tarefa' | 'reuniao' | 'despacho' | 'exigencia_inss' | 'evento';

export interface Publicacao {
  id: string;
  fonte: 'djen' | 'tramitacao' | 'manual';
  id_externo: string;
  data_disponibilizacao: string | null;
  inicio_prazo: string | null;
  tribunal: string | null;
  uf: string | null;
  orgao: string | null;
  numero_processo: string | null;
  tipo_comunicacao: string | null;
  tipo_documento: string | null;
  classe: string | null;
  texto: string | null;
  link: string | null;
  status: StatusPublicacao;
  tratado_por: string | null;
  tratado_em: string | null;
  observacao: string | null;
}

export interface ItemAgenda {
  id: string;
  fonte: 'tramitacao' | 'google_agenda' | 'inss' | 'manual';
  id_externo: string | null;
  tipo: TipoAgenda;
  titulo: string;
  data: string;
  hora: string | null;
  numero_processo: string | null;
  cliente: string | null;
  local: string | null;
  responsavel_nome: string | null;
  concluido: boolean;
  concluido_em: string | null;
  link: string | null;
  observacao: string | null;
}

export interface RequerimentoInss {
  id: string;
  protocolo: string;
  cliente: string | null;
  servico: string | null;
  data_protocolo: string | null;
  unidade: string | null;
  status: string | null;
  despacho: string | null;
  ultimo_aviso_em: string | null;
  prazo_exigencia: string | null;
  exigencia_automatica: boolean;
  cumprido: boolean;
  cumprido_em: string | null;
  observacao: string | null;
}

export interface AcaoColaborador {
  id: number;
  usuario_id: string | null;
  usuario_nome: string | null;
  fonte: string;
  acao: string;
  entidade: string | null;
  entidade_id: string | null;
  descricao: string | null;
  em: string;
}

export const TIPO_AGENDA_LABEL: Record<TipoAgenda, string> = {
  prazo: 'Prazo',
  audiencia: 'Audiência',
  pericia: 'Perícia',
  tarefa: 'Tarefa',
  reuniao: 'Reunião',
  despacho: 'Despacho',
  exigencia_inss: 'Exigência INSS',
  evento: 'Evento',
};

export const ACAO_LABEL: Record<string, string> = {
  publicacao_tratada: 'Tratou publicação',
  publicacao_nao_lida: 'Reabriu publicação',
  publicacao_arquivada: 'Arquivou publicação',
  cumpriu_exigencia_inss: 'Cumpriu exigência INSS',
  reabriu_exigencia_inss: 'Reabriu exigência INSS',
  concluiu_prazo: 'Concluiu prazo',
  concluiu_audiencia: 'Concluiu audiência',
  concluiu_pericia: 'Concluiu perícia',
  concluiu_tarefa: 'Concluiu tarefa',
  concluiu_atividade: 'Concluiu atividade (Tramitação)',
};

const PROTOCOLO_ACAO: Record<string, string> = {
  requerimento_adm: 'Protocolou requerimento administrativo',
  acao_judicial: 'Protocolou ação judicial',
  recurso_adm: 'Protocolou recurso administrativo',
  recurso_judicial: 'Protocolou recurso judicial',
  peticao: 'Protocolou petição',
  cumprimento_exigencia: 'Cumpriu exigência do INSS',
  outro: 'Protocolou',
};

export function acaoLabel(acao: string): string {
  if (ACAO_LABEL[acao]) return ACAO_LABEL[acao];
  if (acao.startsWith('protocolou_')) return PROTOCOLO_ACAO[acao.slice(11)] ?? 'Protocolou';
  if (acao.startsWith('concluiu_')) return 'Concluiu ' + acao.slice(9).replace(/_/g, ' ');
  if (acao.startsWith('reabriu_')) return 'Reabriu ' + acao.slice(8).replace(/_/g, ' ');
  return acao.replace(/_/g, ' ');
}

/** Dias corridos de hoje até a data (negativo = atrasado). */
export function diasAte(data: string | null | undefined, hoje: Date = new Date()): number | null {
  if (!data) return null;
  return differenceInCalendarDays(parseISO(data), hoje);
}

export type Urgencia = 'atrasado' | 'hoje' | 'amanha' | 'semana' | 'futuro' | 'sem_data' | 'feito';

export function urgencia(data: string | null | undefined, feito = false, hoje: Date = new Date()): Urgencia {
  if (feito) return 'feito';
  const d = diasAte(data, hoje);
  if (d === null) return 'sem_data';
  if (d < 0) return 'atrasado';
  if (d === 0) return 'hoje';
  if (d === 1) return 'amanha';
  if (d <= 7) return 'semana';
  return 'futuro';
}

export const URGENCIA_STYLE: Record<Urgencia, { label: string; cls: string }> = {
  atrasado: { label: 'Atrasado', cls: 'bg-red-50 text-red-700 border-red-200' },
  hoje: { label: 'Hoje', cls: 'bg-orange-50 text-orange-700 border-orange-200' },
  amanha: { label: 'Amanhã', cls: 'bg-amber-50 text-amber-800 border-amber-200' },
  semana: { label: 'Esta semana', cls: 'bg-[hsl(41_60%_95%)] text-[hsl(41_69%_30%)] border-[hsl(41_45%_80%)]' },
  futuro: { label: 'Futuro', cls: 'bg-secondary text-muted-foreground border-border' },
  sem_data: { label: 'Sem data', cls: 'bg-secondary text-muted-foreground border-border' },
  feito: { label: 'Concluído', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
};

export function fmtData(d: string | null | undefined, padrao = 'dd/MM/yyyy'): string {
  if (!d) return '—';
  try {
    return format(parseISO(d), padrao, { locale: ptBR });
  } catch {
    return d;
  }
}

export function hojeISO(hoje: Date = new Date()): string {
  return format(hoje, 'yyyy-MM-dd');
}

export function somaDias(base: string, dias: number): string {
  const d = parseISO(base);
  d.setDate(d.getDate() + dias);
  return format(d, 'yyyy-MM-dd');
}

/** UF a partir do número CNJ (J.TR): 8 = estadual (TR = código do TJ), 4 = federal. */
const TR_ESTADUAL: Record<string, string> = {
  '01': 'AC', '02': 'AL', '03': 'AP', '04': 'AM', '05': 'BA', '06': 'CE', '07': 'DF', '08': 'ES',
  '09': 'GO', '10': 'MA', '11': 'MT', '12': 'MS', '13': 'MG', '14': 'PA', '15': 'PB', '16': 'PR',
  '17': 'PE', '18': 'PI', '19': 'RJ', '20': 'RN', '21': 'RS', '22': 'RO', '23': 'RR', '24': 'SC',
  '25': 'SE', '26': 'SP', '27': 'TO',
};

export function ufDoProcesso(numero: string | null | undefined): string | null {
  if (!numero) return null;
  const dig = numero.replace(/\D/g, '');
  if (dig.length !== 20) return null;
  const j = dig.slice(13, 14);
  const tr = dig.slice(14, 16);
  if (j === '8') return TR_ESTADUAL[tr] ?? null;
  return null;
}
