import { useMemo, useState } from 'react';
import { Check, ChevronDown, Package, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';

interface Product { id: string; nome: string }

interface Props {
  products: Product[];
  selected: string[];
  onChange: (next: string[]) => void;
  width?: string;
}

export function ProductMultiFilter({ products, selected, onChange, width = 'w-[220px]' }: Props) {
  const [search, setSearch] = useState('');
  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return q ? products.filter(p => p.nome.toLowerCase().includes(q)) : products;
  }, [products, search]);

  const allSelected = selected.length === 0;
  const label = allSelected
    ? 'Todos os produtos'
    : selected.length === 1
      ? products.find(p => p.id === selected[0])?.nome ?? '1 produto'
      : `${selected.length} produtos`;

  function toggle(id: string) {
    onChange(selected.includes(id) ? selected.filter(x => x !== id) : [...selected, id]);
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" className={`${width} justify-between font-normal`}>
          <span className="flex items-center gap-2 truncate">
            <Package className="w-4 h-4 text-muted-foreground shrink-0" />
            <span className="truncate">{label}</span>
          </span>
          <ChevronDown className="w-4 h-4 opacity-50 shrink-0" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[280px] p-0 bg-card border-border" align="start">
        <div className="p-2 border-b border-border">
          <Input
            placeholder="Buscar produto..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 text-sm"
          />
        </div>
        <div className="max-h-72 overflow-y-auto py-1">
          <button
            type="button"
            onClick={() => onChange([])}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-muted/40 text-left"
          >
            {allSelected ? <Check className="w-4 h-4 text-primary" /> : <span className="w-4 h-4" />}
            <span className="font-medium">Todos os produtos</span>
          </button>
          <div className="h-px bg-border my-1" />
          {filtered.length === 0 ? (
            <p className="px-3 py-4 text-xs text-muted-foreground text-center">Nenhum produto</p>
          ) : (
            filtered.map(p => {
              const checked = selected.includes(p.id);
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => toggle(p.id)}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-muted/40 text-left"
                >
                  <Checkbox checked={checked} className="pointer-events-none" />
                  <span className="truncate">{p.nome}</span>
                </button>
              );
            })
          )}
        </div>
        {selected.length > 0 && (
          <div className="p-2 border-t border-border">
            <Button variant="ghost" size="sm" className="w-full h-7 text-xs" onClick={() => onChange([])}>
              <X className="w-3 h-3 mr-1" /> Limpar seleção
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
