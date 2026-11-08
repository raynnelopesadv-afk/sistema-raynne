import { cn } from '@/lib/utils';

interface Props {
  value: number; // actual days
  sla: number;   // target days
  label?: string;
  size?: number;
}

export function SLAGauge({ value, sla, label, size = 120 }: Props) {
  const ratio = sla > 0 ? value / sla : 0;
  const status: 'good' | 'warn' | 'bad' = ratio <= 1 ? 'good' : ratio <= 1.2 ? 'warn' : 'bad';
  const color = status === 'good' ? 'hsl(var(--bi-green))' : status === 'warn' ? 'hsl(var(--bi-orange))' : 'hsl(var(--bi-red))';
  // semicircle arc
  const r = size / 2 - 8;
  const cx = size / 2;
  const cy = size / 2;
  const circumference = Math.PI * r;
  const filled = Math.min(ratio, 1.5) / 1.5; // cap visual at 150%
  const dash = circumference * filled;

  return (
    <div className="flex flex-col items-center" style={{ width: size }}>
      <svg width={size} height={size / 2 + 8} viewBox={`0 0 ${size} ${size / 2 + 8}`}>
        <path
          d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
          stroke="hsl(var(--muted) / 0.4)"
          strokeWidth={8}
          fill="none"
          strokeLinecap="round"
        />
        <path
          d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
          stroke={color}
          strokeWidth={8}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circumference}`}
          style={{ transition: 'stroke-dasharray 800ms ease-out' }}
        />
      </svg>
      <div className="-mt-7 text-center">
        <div className={cn('text-xl font-bold tabular-nums', status === 'good' && 'text-bi-green', status === 'warn' && 'text-bi-orange', status === 'bad' && 'text-bi-red')}>
          {value.toFixed(0)}d
        </div>
        <div className="text-[10px] text-muted-foreground">SLA: {sla}d</div>
        {label && <div className="text-[11px] text-muted-foreground mt-1">{label}</div>}
      </div>
    </div>
  );
}
