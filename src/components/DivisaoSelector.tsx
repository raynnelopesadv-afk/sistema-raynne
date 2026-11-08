import { BRAND } from '@/config/brand';

type Divisao = 'advogados' | 'educacao';

interface Props {
  value: Divisao;
  onChange: (d: Divisao) => void;
}

export function DivisaoSelector({ value, onChange }: Props) {
  return (
    <div className="flex gap-2">
      <button
        onClick={() => onChange('advogados')}
        className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
          value === 'advogados'
            ? 'bg-primary/10 text-primary border-primary/20'
            : 'bg-secondary/50 text-muted-foreground border-border hover:text-foreground'
        }`}
      >
        {BRAND.divisionLabels.advogados}
      </button>
      <button
        onClick={() => onChange('educacao')}
        className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
          value === 'educacao'
            ? 'bg-accent/10 text-accent border-accent/20'
            : 'bg-secondary/50 text-muted-foreground border-border hover:text-foreground'
        }`}
      >
        {BRAND.divisionLabels.educacao}
      </button>
    </div>
  );
}
