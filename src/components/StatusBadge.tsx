import { Clock, CheckCircle2, XCircle, Trophy, MinusCircle, UserMinus } from 'lucide-react';
import { getEffectiveStatus, STATUS_LABEL, STATUS_BADGE_CLASS, type ContratoLike, type EffectiveStatus } from '@/lib/contrato-status';

const ICONS: Record<EffectiveStatus, React.ComponentType<{ className?: string }>> = {
  pendente: Clock,
  qualificado: CheckCircle2,
  desqualificado: XCircle,
  desistencia: UserMinus,
  exito: Trophy,
  sem_exito: MinusCircle,
};

export function StatusBadge({ contrato, size = 'sm' }: { contrato: ContratoLike; size?: 'sm' | 'md' }) {
  const s = getEffectiveStatus(contrato);
  const Icon = ICONS[s];
  const sizing = size === 'md' ? 'px-3 py-1 text-xs' : 'px-2.5 py-0.5 text-[11px]';
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full font-medium ${sizing} ${STATUS_BADGE_CLASS[s]}`}>
      <Icon className="w-3 h-3" />
      {STATUS_LABEL[s]}
    </span>
  );
}
