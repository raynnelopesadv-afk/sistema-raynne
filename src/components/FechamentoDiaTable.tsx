import { cn } from '@/lib/utils';
import { Info } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

interface Row {
  id: string;
  nome: string;
  meta_dia: number;
  feito: number;
  conv: number;
  meta_mes?: number;
  feito_mes?: number;
  pct_mes?: number;
}

interface FechamentoDiaTableProps {
  rows: Row[];
}

export function FechamentoDiaTable({ rows }: FechamentoDiaTableProps) {
  const totalMeta = rows.reduce((s, r) => s + (r.meta_dia || 0), 0);
  const totalFeito = rows.reduce((s, r) => s + r.feito, 0);
  const totalMetaMes = rows.reduce((s, r) => s + (r.meta_mes || 0), 0);
  const totalFeitoMes = rows.reduce((s, r) => s + (r.feito_mes || 0), 0);
  const totalPctMes = totalMetaMes > 0 ? (totalFeitoMes / totalMetaMes) * 100 : 0;
  const totalConv = rows.length > 0 ? rows.reduce((s, r) => s + r.conv, 0) / rows.length : 0;

  // largura máxima para barras
  const maxVal = Math.max(1, ...rows.map((r) => Math.max(r.meta_dia, r.feito)));

  return (
    <div className="glass-card p-5">
      <h3 className="text-center font-semibold text-foreground mb-4 text-base tracking-wide">
        Fechamento da Semana
      </h3>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-cyan-400/80 text-[11px] uppercase tracking-wider">
              <th className="text-left font-medium pb-2 pr-2">Consultor</th>
              <th className="text-center font-medium pb-2 px-2">
                <span className="inline-flex items-center gap-1">
                  Meta semana
                  <Tooltip delayDuration={150}>
                    <TooltipTrigger asChild>
                      <span className="cursor-help normal-case"><Info className="w-3 h-3" /></span>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-[280px] text-xs leading-relaxed normal-case tracking-normal">
                      Ritmo necessário para bater a meta do mês: (meta mensal − já feito) ÷ semanas restantes.
                      A meta mensal vem das regras de comissão (produto × nível do closer), salvo quando há meta manual definida em Config → Metas.
                    </TooltipContent>
                  </Tooltip>
                </span>
              </th>
              <th className="text-center font-medium pb-2 px-2">Feito</th>
              <th className="text-center font-medium pb-2 px-2">
                <span className="inline-flex items-center gap-1">
                  Mês
                  <Tooltip delayDuration={150}>
                    <TooltipTrigger asChild>
                      <span className="cursor-help normal-case"><Info className="w-3 h-3" /></span>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-[280px] text-xs leading-relaxed normal-case tracking-normal">
                      Progressão da meta mensal: contratos fechados no mês ÷ meta mensal do closer.
                    </TooltipContent>
                  </Tooltip>
                </span>
              </th>
              <th className="text-center font-medium pb-2 px-2">Conv.</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="text-center text-muted-foreground py-6">
                  Sem fechamentos hoje
                </td>
              </tr>
            )}
            {rows.map((r, i) => {
              const metaPct = (r.meta_dia / maxVal) * 100;
              const feitoPct = (r.feito / maxVal) * 100;
              const bateu = r.feito >= r.meta_dia && r.meta_dia > 0;
              const pctMes = r.pct_mes ?? 0;
              const bateuMes = pctMes >= 100;
              return (
                <tr key={r.id} className="border-t border-border/40">
                  <td className="py-2 pr-2 text-foreground font-medium whitespace-nowrap">
                    <span className="text-muted-foreground mr-2">{i + 1}.</span>
                    {r.nome}
                  </td>
                  <td className="py-2 px-2">
                    <div className="relative h-6 rounded bg-secondary/40 overflow-hidden min-w-[60px]">
                      <div
                        className="absolute inset-y-0 left-0 bg-blue-500/60"
                        style={{ width: `${metaPct}%` }}
                      />
                      <span className="absolute inset-0 flex items-center justify-center text-xs font-semibold text-foreground tabular-nums">
                        {r.meta_dia || '-'}
                      </span>
                    </div>
                  </td>
                  <td className="py-2 px-2">
                    <div className="relative h-6 rounded bg-secondary/40 overflow-hidden min-w-[60px]">
                      <div
                        className={cn('absolute inset-y-0 left-0', bateu ? 'bg-success/60' : 'bg-cyan-500/60')}
                        style={{ width: `${feitoPct}%` }}
                      />
                      <span className="absolute inset-0 flex items-center justify-center text-xs font-bold text-foreground tabular-nums">
                        {r.feito}
                      </span>
                    </div>
                  </td>
                  <td className="py-2 px-2 min-w-[110px]">
                    {(r.meta_mes ?? 0) > 0 ? (
                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-[11px] tabular-nums">
                          <span className="text-muted-foreground">{r.feito_mes}/{r.meta_mes}</span>
                          <span className={cn('font-semibold', bateuMes ? 'text-success' : 'text-foreground')}>{pctMes.toFixed(0)}%</span>
                        </div>
                        <div className="h-1.5 rounded bg-secondary/40 overflow-hidden">
                          <div
                            className={cn('h-full', bateuMes ? 'bg-success/70' : 'bg-amber-400/70')}
                            style={{ width: `${Math.min(100, pctMes)}%` }}
                          />
                        </div>
                      </div>
                    ) : (
                      <span className="block text-center text-xs text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="py-2 px-2 text-center">
                    <span className={cn('text-xs font-semibold tabular-nums', bateu ? 'text-success' : 'text-foreground')}>
                      {r.conv.toFixed(2)}%
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
          {rows.length > 0 && (
            <tfoot>
              <tr className="border-t-2 border-border/60">
                <td className="pt-3 text-cyan-400 font-bold uppercase tracking-wider text-xs">Total</td>
                <td className="pt-3 text-center font-bold text-foreground tabular-nums">{totalMeta}</td>
                <td className="pt-3 text-center font-bold text-foreground tabular-nums">{totalFeito}</td>
                <td className="pt-3 text-center font-bold text-foreground tabular-nums">{totalMetaMes > 0 ? `${totalPctMes.toFixed(0)}%` : '—'}</td>
                <td className="pt-3 text-center font-bold text-foreground tabular-nums">{totalConv.toFixed(2)}%</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
