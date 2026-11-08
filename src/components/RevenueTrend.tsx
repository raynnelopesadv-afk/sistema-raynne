import { Target, TrendingUp, Zap, Flag } from 'lucide-react';
import { cn } from '@/lib/utils';

interface RevenueTrendProps {
  /** Receita já realizada no mês (R$) */
  realizado: number;
  /** Meta mensal em R$ */
  meta: number;
}

function formatCurrency(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0 });
}

function formatCompact(v: number) {
  if (v >= 1_000_000) return `R$ ${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `R$ ${Math.round(v / 1000)}k`;
  return formatCurrency(v);
}

function getMonthDayInfo() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const today = now.getDate();
  const lastDay = new Date(year, month + 1, 0).getDate();

  let uteisRestantes = 0;
  let uteisDecorridos = 0;
  let totalUteisMes = 0;

  for (let d = 1; d <= lastDay; d++) {
    const wd = new Date(year, month, d).getDay();
    const isUtil = wd !== 0 && wd !== 6;
    if (isUtil) totalUteisMes++;
    if (d <= today && isUtil) uteisDecorridos++;   // hoje conta como decorrido
    if (d > today && isUtil) uteisRestantes++;     // restantes = após hoje
  }

  return { uteisRestantes, uteisDecorridos, totalUteisMes };
}

export function RevenueTrend({ realizado, meta }: RevenueTrendProps) {
  const { uteisRestantes, uteisDecorridos, totalUteisMes } = getMonthDayInfo();
  const realizadoSafe = Math.max(0, realizado);
  const faltante = Math.max(0, meta - realizadoSafe);

  const diasBase = Math.max(1, uteisDecorridos);
  const ritmoAtual = realizadoSafe / diasBase;
  const projecao = Math.round(ritmoAtual * totalUteisMes);
  const ritmoNecessario = uteisRestantes > 0 ? faltante / uteisRestantes : faltante;

  const projOk = projecao >= meta;
  const projNear = !projOk && projecao >= meta * 0.7;
  const projColor = projOk
    ? 'text-success'
    : projNear
      ? 'text-yellow-500'
      : 'text-destructive';
  const projBg = projOk
    ? 'bg-success/10 border-success/30'
    : projNear
      ? 'bg-yellow-500/10 border-yellow-500/30'
      : 'bg-destructive/10 border-destructive/30';

  return (
    <div className={cn('glass-card p-5 border-2 transition-all', projBg)}>
      <div className="flex items-center gap-2 mb-4">
        <div className={cn('p-2 rounded-xl bg-background/50', projColor)}>
          <TrendingUp className="w-4 h-4" />
        </div>
        <h3 className="font-semibold text-foreground text-sm">Tendência de faturamento</h3>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div>
          <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
            <Flag className="w-3 h-3" />
            <p className="text-[11px] uppercase tracking-wider font-medium">Realizado</p>
          </div>
          <p className="text-2xl font-bold text-foreground leading-none tabular-nums">{formatCompact(realizadoSafe)}</p>
          <p className="text-[11px] text-muted-foreground mt-1">de {formatCompact(meta)}</p>
        </div>

        <div>
          <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
            <TrendingUp className="w-3 h-3" />
            <p className="text-[11px] uppercase tracking-wider font-medium">Projeção</p>
          </div>
          <p className={cn('text-2xl font-bold leading-none tabular-nums', projColor)}>{formatCompact(projecao)}</p>
          <p className="text-[11px] text-muted-foreground mt-1">no ritmo atual</p>
        </div>

        <div>
          <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
            <Target className="w-3 h-3" />
            <p className="text-[11px] uppercase tracking-wider font-medium">Faltam</p>
          </div>
          <p className="text-2xl font-bold text-primary leading-none tabular-nums">{formatCompact(faltante)}</p>
          <p className="text-[11px] text-muted-foreground mt-1">para a meta</p>
        </div>

        <div>
          <div
            className="flex items-center gap-1.5 text-muted-foreground mb-1"
            title={faltante > 0
              ? 'Ritmo NECESSÁRIO: quanto precisa entrar por dia útil restante para bater a meta. Quando a meta for atingida, passa a mostrar o ritmo atual.'
              : 'Meta já atingida — agora mostra o RITMO ATUAL: receita por dia útil já decorrido no mês.'}
          >
            <Zap className="w-3 h-3" />
            <p className="text-[11px] uppercase tracking-wider font-medium cursor-help">Ritmo</p>
          </div>
          <p className="text-2xl font-bold text-accent leading-none tabular-nums">{formatCompact(faltante > 0 ? ritmoNecessario : ritmoAtual)}</p>
          <p className="text-[11px] text-muted-foreground mt-1">{faltante > 0 ? 'necessário por dia útil' : 'atual por dia útil'}</p>
        </div>
      </div>
    </div>
  );
}
