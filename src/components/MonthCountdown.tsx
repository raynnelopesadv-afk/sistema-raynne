import { CalendarClock, Target, TrendingUp, Zap, Flag } from 'lucide-react';
import { cn } from '@/lib/utils';

interface MonthCountdownProps {
  /** Contratos já fechados no mês */
  contratosFechados: number;
  /** Total de contratos da meta */
  contratosMeta: number;
  /** Mês de referência (default: mês atual) */
  refDate?: Date;
}

function getMonthDayInfo(ref: Date) {
  const now = new Date();
  const year = ref.getFullYear();
  const month = ref.getMonth();
  const isCurrentMonth = ref.getFullYear() === now.getFullYear() && ref.getMonth() === now.getMonth();
  const isPastMonth = ref < new Date(now.getFullYear(), now.getMonth(), 1);
  const today = isCurrentMonth ? now.getDate() : (isPastMonth ? new Date(year, month + 1, 0).getDate() + 1 : 1);
  const lastDay = new Date(year, month + 1, 0).getDate();

  let totalRestantes = 0;
  let uteisRestantes = 0;
  let uteisAposHoje = 0;
  let uteisDecorridos = 0;
  let totalUteisMes = 0;

  for (let d = 1; d <= lastDay; d++) {
    const wd = new Date(year, month, d).getDay();
    const isUtil = wd !== 0 && wd !== 6;
    if (isUtil) totalUteisMes++;
    if (d <= today && isUtil) uteisDecorridos++;   // hoje conta como decorrido (mesma regra do gráfico de pace)
    if (d >= today) {
      totalRestantes++;
      if (isUtil) uteisRestantes++;
    }
    if (d > today && isUtil) uteisAposHoje++;
  }

  return { totalRestantes, uteisRestantes, uteisAposHoje, lastDay, uteisDecorridos, totalUteisMes, today };
}

export function MonthCountdown({ contratosFechados, contratosMeta, refDate }: MonthCountdownProps) {
  const { totalRestantes, uteisRestantes, uteisAposHoje, uteisDecorridos, totalUteisMes } = getMonthDayInfo(refDate ?? new Date());
  const metaInt = Math.round(contratosMeta);
  const fechados = Math.max(0, Math.round(contratosFechados));
  const faltantes = Math.max(0, metaInt - fechados);

  // Ritmo atual: contratos por dia útil decorrido (mín. 1 dia útil pra evitar div/0)
  const diasBase = Math.max(1, uteisDecorridos);
  const ritmoAtual = fechados / diasBase;

  // Projeção: ritmo atual * total de dias úteis do mês
  const projecao = Math.round(ritmoAtual * totalUteisMes);

  // Ritmo necessário por dia útil restante para bater a meta
  const ritmoNecessario = uteisAposHoje > 0 ? faltantes / uteisAposHoje : faltantes;

  // Status da projeção vs meta
  const projOk = projecao >= contratosMeta;
  const projNear = !projOk && projecao >= contratosMeta * 0.7;
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
    <div className="space-y-4">
      {/* Bloco principal de tendência */}
      <div className={cn('glass-card p-5 border-2 transition-all', projBg)}>
        <div className="flex items-center gap-2 mb-4">
          <div className={cn('p-2 rounded-xl bg-background/50', projColor)}>
            <TrendingUp className="w-4 h-4" />
          </div>
          <h3 className="font-semibold text-foreground text-sm">Tendência de fechamento</h3>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {/* Fechados */}
          <div>
            <div className="flex items-center gap-1.5 text-muted-foreground mb-1" title={`Contratos fechados no mês. Meta do período: ${metaInt}.`}>
              <Flag className="w-3 h-3" />
              <p className="text-[11px] uppercase tracking-wider font-medium cursor-help">Fechados</p>
            </div>
            <p className="text-3xl font-bold text-foreground leading-none tabular-nums">{fechados}</p>
            <p className="text-[11px] text-muted-foreground mt-1">de {metaInt} meta</p>
          </div>

          {/* Projeção */}
          <div>
            <div className="flex items-center gap-1.5 text-muted-foreground mb-1" title="Onde o mês deve terminar mantendo o ritmo atual (fechados ÷ dias úteis decorridos × dias úteis do mês). O dia de hoje conta como decorrido — mesma regra do gráfico Pace do mês.">
              <TrendingUp className="w-3 h-3" />
              <p className="text-[11px] uppercase tracking-wider font-medium cursor-help">Projeção</p>
            </div>
            <p className={cn('text-3xl font-bold leading-none tabular-nums', projColor)}>{projecao}</p>
            <p className="text-[11px] text-muted-foreground mt-1">no ritmo atual</p>
          </div>

          {/* Faltantes */}
          <div>
            <div className="flex items-center gap-1.5 text-muted-foreground mb-1" title="Quantos contratos ainda faltam para bater a meta do período. Zero significa meta atingida.">
              <Target className="w-3 h-3" />
              <p className="text-[11px] uppercase tracking-wider font-medium cursor-help">Faltam</p>
            </div>
            <p className="text-3xl font-bold text-primary leading-none tabular-nums">{faltantes}</p>
            <p className="text-[11px] text-muted-foreground mt-1">para a meta</p>
          </div>

          {/* Ritmo: necessário enquanto falta meta; atual depois de batida */}
          <div>
            <div
              className="flex items-center gap-1.5 text-muted-foreground mb-1"
              title={faltantes > 0
                ? 'Ritmo NECESSÁRIO: quantos contratos por dia útil restante para bater a meta. Quando a meta for atingida, este número passa a mostrar o ritmo atual.'
                : 'Meta já atingida — agora mostra o RITMO ATUAL: contratos fechados por dia útil já decorrido no mês.'}
            >
              <Zap className="w-3 h-3" />
              <p className="text-[11px] uppercase tracking-wider font-medium cursor-help">Ritmo</p>
            </div>
            <p className="text-3xl font-bold text-accent leading-none tabular-nums">
              {(faltantes > 0 ? ritmoNecessario : ritmoAtual).toFixed(1)}
            </p>
            <p className="text-[11px] text-muted-foreground mt-1">
              {faltantes > 0 ? 'necessário por dia útil' : 'atual por dia útil'}
            </p>
          </div>
        </div>
      </div>

      {/* Dias do mês */}
      <div className="glass-card p-5">
        <div className="flex items-center gap-2 mb-3">
          <div className="p-2 rounded-xl bg-accent/10 text-accent">
            <CalendarClock className="w-4 h-4" />
          </div>
          <h3 className="font-semibold text-foreground text-sm">Dias restantes no mês</h3>
        </div>
        <div className="flex items-end gap-6">
          <div>
            <p className="text-4xl font-bold text-foreground leading-none">{totalRestantes}</p>
            <p className="text-xs text-muted-foreground mt-1">dias totais</p>
          </div>
          <div>
            <p className="text-4xl font-bold text-accent leading-none">{uteisRestantes}</p>
            <p className="text-xs text-muted-foreground mt-1">dias úteis</p>
          </div>
        </div>
      </div>
    </div>
  );
}
