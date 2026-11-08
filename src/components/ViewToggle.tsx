import { LayoutGrid, AlignJustify } from 'lucide-react';

export type ViewMode = 'list' | 'kanban';

export function ViewToggle({ value, onChange }: { value: ViewMode; onChange: (v: ViewMode) => void }) {
  const base = 'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all';
  const active = 'bg-primary text-black shadow-sm';
  const inactive = 'bg-transparent border border-border text-muted-foreground hover:text-white hover:border-border';
  return (
    <div className="inline-flex gap-2" role="tablist" aria-label="Modo de visualização">
      <button
        type="button"
        onClick={() => onChange('list')}
        className={`${base} ${value === 'list' ? active : inactive}`}
        aria-pressed={value === 'list'}
      >
        <AlignJustify className="w-3.5 h-3.5" /> Lista
      </button>
      <button
        type="button"
        onClick={() => onChange('kanban')}
        className={`${base} ${value === 'kanban' ? active : inactive}`}
        aria-pressed={value === 'kanban'}
      >
        <LayoutGrid className="w-3.5 h-3.5" /> Kanban
      </button>
    </div>
  );
}
