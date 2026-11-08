// Status efetivo derivado dos campos do contrato.
// Ordem de prioridade: desqualificado > exito/sem_exito > qualificado > pendente.

export type EffectiveStatus =
  | 'pendente'
  | 'qualificado'
  | 'desqualificado'
  | 'desistencia'
  | 'exito'
  | 'sem_exito';

export interface ContratoLike {
  status_qualificacao: string;
  protocolado?: boolean | null;
  teve_exito?: boolean | null;
}

export function getEffectiveStatus(c: ContratoLike): EffectiveStatus {
  if (c.status_qualificacao === 'desqualificado') return 'desqualificado';
  if (c.status_qualificacao === 'desistencia') return 'desistencia';
  if (c.teve_exito === true) return 'exito';
  if (c.teve_exito === false) return 'sem_exito';
  if (c.status_qualificacao === 'qualificado' || c.protocolado) return 'qualificado';
  return 'pendente';
}

export const STATUS_LABEL: Record<EffectiveStatus, string> = {
  pendente: 'Pendente',
  qualificado: 'Protocolo',
  desqualificado: 'Desqualificado',
  desistencia: 'Desistência',
  exito: 'Êxito',
  sem_exito: 'Sem êxito',
};

// Cores conforme spec (#F59E0B, #00BCD4, #EF4444, #22C55E, #6B7280)
export const STATUS_BADGE_CLASS: Record<EffectiveStatus, string> = {
  pendente: 'bg-amber-600/15 text-amber-600 border border-amber-600/30',
  qualificado: 'bg-cyan-700/15 text-cyan-700 border border-cyan-700/30',
  desqualificado: 'bg-red-600/15 text-red-600 border border-red-600/30',
  desistencia: 'bg-orange-600/15 text-orange-600 border border-orange-600/30',
  exito: 'bg-emerald-600/15 text-emerald-600 border border-emerald-600/30',
  sem_exito: 'bg-muted-foreground/15 text-muted-foreground border border-[#6B7280]/30',
};

export function StatusBadgeClass(c: ContratoLike) {
  return STATUS_BADGE_CLASS[getEffectiveStatus(c)];
}
