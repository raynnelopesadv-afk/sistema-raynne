interface FilialList {
  nome: string;
  total: number;
}

interface FiliaisRankingProps {
  title: string;
  rows: FilialList[];
}

export function FiliaisRanking({ title, rows }: FiliaisRankingProps) {
  const total = rows.reduce((s, r) => s + r.total, 0);
  const max = Math.max(1, ...rows.map((r) => r.total));
  return (
    <div className="glass-card p-4">
      <h4 className="text-cyan-400 font-semibold italic text-sm mb-3">{title}</h4>
      <div className="space-y-1.5">
        {rows.length === 0 && <p className="text-xs text-muted-foreground py-2">Sem dados</p>}
        {rows.map((r, i) => (
          <div key={r.nome} className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground w-4 text-xs">{i + 1}.</span>
            <span className="flex-1 truncate text-foreground">{r.nome}</span>
            <div className="relative h-5 w-20 rounded bg-secondary/40 overflow-hidden">
              <div className="absolute inset-y-0 left-0 bg-cyan-500/50" style={{ width: `${(r.total / max) * 100}%` }} />
              <span className="absolute inset-0 flex items-center justify-center text-[11px] font-bold tabular-nums">{r.total}</span>
            </div>
          </div>
        ))}
      </div>
      {rows.length > 0 && (
        <div className="border-t border-border/60 mt-3 pt-2 flex justify-between text-xs">
          <span className="text-cyan-400 font-bold uppercase tracking-wider">Total</span>
          <span className="font-bold tabular-nums">{total}</span>
        </div>
      )}
    </div>
  );
}
