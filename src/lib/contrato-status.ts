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
  pendente: 'bg-[#F59E0B]/15 text-[#F59E0B] border border-[#F59E0B]/30',
  qualificado: 'bg-[#00BCD4]/15 text-[#00BCD4] border border-[#00BCD4]/30',
  desqualificado: 'bg-[#EF4444]/15 text-[#EF4444] border border-[#EF4444]/30',
  desistencia: 'bg-[#F97316]/15 text-[#F97316] border border-[#F97316]/30',
  exito: 'bg-[#22C55E]/15 text-[#22C55E] border border-[#22C55E]/30',
  sem_exito: 'bg-[#6B7280]/15 text-[#9CA3AF] border border-[#6B7280]/30',
};

export function StatusBadgeClass(c: ContratoLike) {
  return STATUS_BADGE_CLASS[getEffectiveStatus(c)];
}
