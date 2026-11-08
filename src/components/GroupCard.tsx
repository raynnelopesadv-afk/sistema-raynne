import { cn } from '@/lib/utils';

interface GroupCardProps {
  title: string;
  mes: number | string;
  semana: number | string;
  hoje: number | string;
  variant?: 'gold' | 'purple' | 'cyan';
}

const variantMap = {
  gold: 'text-primary',
  purple: 'text-accent',
  cyan: 'text-cyan-400',
} as const;

function Cell({ label, value, color }: { label: string; value: number | string; color: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg bg-background/40 border border-border/40 px-3 py-2 min-w-[72px]">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={cn('text-2xl font-bold tabular-nums leading-tight mt-0.5', color)}>{value}</p>
    </div>
  );
}

export function GroupCard({ title, mes, semana, hoje, variant = 'cyan' }: GroupCardProps) {
  const color = variantMap[variant];
  return (
    <div className="glass-card p-4">
      <h4 className={cn('font-serif italic text-lg font-semibold mb-3', color)}>{title}</h4>
      <div className="grid grid-cols-3 gap-2">
        <Cell label="Mês" value={mes} color={color} />
        <Cell label="Semana" value={semana} color={color} />
        <Cell label="Hoje" value={hoje} color={color} />
      </div>
    </div>
  );
}
