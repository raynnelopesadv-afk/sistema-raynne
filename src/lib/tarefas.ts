// Tarefas por setor (estilo Advbox): tipos, rótulos e regras de prazo.
import { addDays, format, parseISO } from 'date-fns';

export type StatusTarefa = 'a_fazer' | 'fazendo' | 'aguardando' | 'concluida' | 'cancelada';
export type Prioridade = 'baixa' | 'normal' | 'alta' | 'urgente';
export type Recorrencia = 'nenhuma' | 'diaria' | 'semanal' | 'mensal';
export type FaixaPrazo = 'atrasada' | 'hoje' | 'amanha' | 'semana' | 'depois' | 'sem_prazo' | 'finalizada';

export interface ItemChecklist { texto: string; feito: boolean }

export interface Setor { id: string; nome: string; cor: string; ordem: number; ativo: boolean }

export interface Tarefa {
  id: string;
  titulo: string;
  descricao: string | null;
  setor_id: string | null;
  responsavel_id: string | null;
  responsavel_nome: string | null;
  criado_por: string | null;
  criado_por_nome: string | null;
  prioridade: Prioridade;
  status: StatusTarefa;
  prazo: string | null;
  hora: string | null;
  cliente_nome: string | null;
  processo_numero: string | null;
  checklist: ItemChecklist[];
  recorrencia: Recorrencia;
  concluida_em: string | null;
  criado_em: string;
  atualizado_em: string;
}

export interface Comentario { id: string; tarefa_id: string; autor_id: string | null; autor_nome: string | null; texto: string; criado_em: string }

export const STATUS_COLUNAS: { key: StatusTarefa; label: string; cor: string }[] = [
  { key: 'a_fazer', label: 'A fazer', cor: '#6B7280' },
  { key: 'fazendo', label: 'Fazendo', cor: '#2563EB' },
  { key: 'aguardando', label: 'Aguardando', cor: '#D97706' },
  { key: 'concluida', label: 'Concluída', cor: '#15803D' },
];

export const STATUS_LABEL: Record<StatusTarefa, string> = {
  a_fazer: 'A fazer', fazendo: 'Fazendo', aguardando: 'Aguardando', concluida: 'Concluída', cancelada: 'Cancelada',
};

export const PRIORIDADE_LABEL: Record<Prioridade, string> = {
  baixa: 'Baixa', normal: 'Normal', alta: 'Alta', urgente: 'Urgente',
};

export const PRIORIDADE_COR: Record<Prioridade, string> = {
  baixa: '#6B7280', normal: '#0E7490', alta: '#D97706', urgente: '#DC2626',
};

export const PRIORIDADE_PESO: Record<Prioridade, number> = { urgente: 0, alta: 1, normal: 2, baixa: 3 };

export const RECORRENCIA_LABEL: Record<Recorrencia, string> = {
  nenhuma: 'Não repete', diaria: 'Todo dia útil', semanal: 'Toda semana', mensal: 'Todo mês',
};

export const FAIXA_LABEL: Record<FaixaPrazo, string> = {
  atrasada: 'Atrasadas', hoje: 'Hoje', amanha: 'Amanhã', semana: 'Próximos 7 dias',
  depois: 'Mais pra frente', sem_prazo: 'Sem prazo', finalizada: 'Concluídas',
};

export const FAIXAS_ORDEM: FaixaPrazo[] = ['atrasada', 'hoje', 'amanha', 'semana', 'depois', 'sem_prazo', 'finalizada'];

/** Modelos rápidos de tarefa por setor (o título pode ser editado). */
export const MODELOS_TAREFA: Record<string, string[]> = {
  'Comercial': ['Retornar lead', 'Enviar contrato para assinatura', 'Cobrar documentos do cliente', 'Follow-up de proposta'],
  'Atendimento e Pós-venda': ['Boas-vindas ao cliente', 'Coletar documentos', 'Atualizar cliente sobre o processo', 'Agendar perícia/audiência com cliente'],
  'Previdenciário': ['Fazer requerimento no INSS', 'Cumprir exigência do INSS', 'Elaborar inicial', 'Recurso ao CRPS', 'Analisar CNIS'],
  'Aéreo/Consumidor': ['Elaborar inicial aérea', 'Conferir documentos do voo', 'Réplica', 'Alegações finais', 'Analisar proposta de acordo'],
  'Protocolo': ['Protocolar inicial', 'Protocolar petição', 'Juntar documento', 'Conferir distribuição'],
  'Financeiro': ['Cobrar honorários', 'Emitir recibo', 'Conferir RPV/alvará', 'Lançar despesa'],
  'Marketing': ['Gravar Reels', 'Editar vídeo', 'Postar conteúdo', 'Responder comentários'],
  'Administrativo': ['Organizar documentos', 'Pagar conta', 'Comprar material'],
};

export function aberta(t: Pick<Tarefa, 'status'>): boolean {
  return t.status !== 'concluida' && t.status !== 'cancelada';
}

/** Em que faixa de prazo a tarefa cai, olhando a data de hoje (yyyy-MM-dd). */
export function faixaPrazo(t: Pick<Tarefa, 'status' | 'prazo'>, hoje: string): FaixaPrazo {
  if (!aberta(t)) return 'finalizada';
  if (!t.prazo) return 'sem_prazo';
  const amanha = format(addDays(parseISO(hoje), 1), 'yyyy-MM-dd');
  const em7 = format(addDays(parseISO(hoje), 7), 'yyyy-MM-dd');
  if (t.prazo < hoje) return 'atrasada';
  if (t.prazo === hoje) return 'hoje';
  if (t.prazo === amanha) return 'amanha';
  if (t.prazo <= em7) return 'semana';
  return 'depois';
}

/** Ordena: prazo mais próximo primeiro (sem prazo no fim), depois prioridade, depois criação. */
export function ordenarTarefas<T extends Pick<Tarefa, 'prazo' | 'hora' | 'prioridade' | 'criado_em'>>(lista: T[]): T[] {
  return [...lista].sort((a, b) => {
    const pa = a.prazo ? `${a.prazo} ${a.hora ?? '99'}` : '9999';
    const pb = b.prazo ? `${b.prazo} ${b.hora ?? '99'}` : '9999';
    if (pa !== pb) return pa < pb ? -1 : 1;
    const pr = PRIORIDADE_PESO[a.prioridade] - PRIORIDADE_PESO[b.prioridade];
    if (pr !== 0) return pr;
    return a.criado_em < b.criado_em ? -1 : 1;
  });
}

export function progressoChecklist(c: ItemChecklist[] | null | undefined): { feitos: number; total: number } {
  const lista = Array.isArray(c) ? c : [];
  return { feitos: lista.filter(i => i.feito).length, total: lista.length };
}

export interface FiltroTarefas {
  setorId: string | 'todos';
  responsavel: 'minhas' | 'todos' | 'sem_responsavel' | string;
  busca: string;
  mostrarConcluidas: boolean;
  usuarioId: string | null;
}

export function filtrarTarefas<T extends Tarefa>(lista: T[], f: FiltroTarefas): T[] {
  const q = f.busca.trim().toLowerCase();
  return lista.filter(t => {
    if (t.status === 'cancelada') return false;
    if (!f.mostrarConcluidas && t.status === 'concluida') return false;
    if (f.setorId !== 'todos' && t.setor_id !== f.setorId) return false;
    if (f.responsavel === 'minhas' && t.responsavel_id !== f.usuarioId) return false;
    if (f.responsavel === 'sem_responsavel' && t.responsavel_id) return false;
    if (!['minhas', 'todos', 'sem_responsavel'].includes(f.responsavel) && t.responsavel_id !== f.responsavel) return false;
    if (q) {
      const alvo = [t.titulo, t.descricao, t.cliente_nome, t.processo_numero, t.responsavel_nome].join(' ').toLowerCase();
      if (!alvo.includes(q)) return false;
    }
    return true;
  });
}
