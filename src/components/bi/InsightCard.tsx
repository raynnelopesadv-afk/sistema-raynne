import { AlertTriangle, TrendingUp, TrendingDown, Info, Zap, LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

type InsightType = 'critical' | 'warning' | 'positive' | 'info';

const TYPE: Record<InsightType, { border: string; icon: LucideIcon; iconColor: string }> = {
  critical: { border: 'border-l-bi-red',    icon: AlertTriangle, iconColor: 'text-bi-red' },
  warning:  { border: 'border-l-bi-orange', icon: TrendingDown,  iconColor: 'text-bi-orange' },
  positive: { border: 'border-l-bi-green',  icon: TrendingUp,    iconColor: 'text-bi-green' },
  info:     { border: 'border-l-bi-blue',   icon: Info,          iconColor: 'text-bi-blue' },
};

interface Props {
  type: InsightType;
  title: string;
  description: string;
  impact?: string;
  onAction?: () => void;
  actionLabel?: string;
}

export function InsightCard({ type, title, description, impact, onAction, actionLabel = 'Ver detalhes' }: Props) {
  const t = TYPE[type];
  const Icon = t.icon;
  return (
    <div className={cn('premium-card p-4 border-l-4', t.border)}>
      <div className="flex items-start gap-3">
        <div className={cn('p-1.5 rounded-lg bg-muted/40', t.iconColor)}>
          <Icon className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-semibold text-foreground">{title}</h4>
          <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{description}</p>
          {impact && (
            <p className={cn('text-xs font-medium mt-1.5 tabular-nums', t.iconColor)}>{impact}</p>
          )}
          {onAction && (
            <button onClick={onAction} className="text-[11px] font-medium text-primary hover:underline mt-2">
              {actionLabel} →
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
