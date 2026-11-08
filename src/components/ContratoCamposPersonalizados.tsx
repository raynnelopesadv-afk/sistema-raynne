import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { ListChecks } from 'lucide-react';
import type { ProductCampo } from '@/components/ProdutoCamposConfig';

export type ValoresCampos = Record<string, string | number | string[] | null>;

/** Campos personalizados do produto, preenchidos na ficha do processo. */
export function ContratoCamposPersonalizados({ productId, valores, onChange, disabled }: {
  productId: string | null;
  valores: ValoresCampos;
  onChange: (v: ValoresCampos) => void;
  disabled?: boolean;
}) {
  const { data: campos } = useQuery({
    queryKey: ['product-campos', productId],
    enabled: !!productId,
    queryFn: async () => {
      const { data, error } = await supabase.from('product_campos').select('*').eq('product_id', productId!).eq('ativo', true).order('ordem');
      if (error) throw error;
      return (data ?? []) as ProductCampo[];
    },
  });

  if (!campos || campos.length === 0) return null;

  const set = (id: string, v: string | number | string[] | null) => onChange({ ...valores, [id]: v });

  return (
    <div className="rounded-xl border border-border p-4 space-y-3">
      <div className="flex items-center gap-2">
        <ListChecks className="w-4 h-4 text-primary" />
        <p className="text-sm font-semibold text-foreground">Informações do produto</p>
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        {campos.map(c => {
          const v = valores?.[c.id];
          const label = (
            <label className="text-xs text-muted-foreground mb-1 block">
              {c.label}{c.obrigatorio && <span className="text-destructive ml-0.5">*</span>}
            </label>
          );
          if (c.tipo === 'multi') {
            const sel: string[] = Array.isArray(v) ? v : [];
            return (
              <div key={c.id} className="sm:col-span-2">
                {label}
                <div className="flex flex-wrap gap-3">
                  {(c.opcoes ?? []).map(op => (
                    <label key={op} className="flex items-center gap-1.5 text-sm text-foreground">
                      <Checkbox
                        checked={sel.includes(op)}
                        disabled={disabled}
                        onCheckedChange={() => set(c.id, sel.includes(op) ? sel.filter(x => x !== op) : [...sel, op])}
                      />
                      {op}
                    </label>
                  ))}
                </div>
              </div>
            );
          }
          if (c.tipo === 'select') {
            return (
              <div key={c.id}>
                {label}
                <Select value={(v as string) ?? ''} onValueChange={(x) => set(c.id, x)} disabled={disabled}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    {(c.opcoes ?? []).map(op => <SelectItem key={op} value={op}>{op}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            );
          }
          return (
            <div key={c.id}>
              {label}
              <Input
                type={c.tipo === 'data' ? 'date' : c.tipo === 'numero' ? 'number' : 'text'}
                value={(v as string | number) ?? ''}
                disabled={disabled}
                onChange={e => set(c.id, c.tipo === 'numero' ? (e.target.value === '' ? null : Number(e.target.value)) : e.target.value)}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Campos obrigatórios ainda não preenchidos (para avisar ao salvar). */
export function camposObrigatoriosFaltando(campos: ProductCampo[] | undefined, valores: ValoresCampos): string[] {
  if (!campos) return [];
  return campos
    .filter(c => c.ativo && c.obrigatorio)
    .filter(c => {
      const v = valores?.[c.id];
      if (Array.isArray(v)) return v.length === 0;
      return v === undefined || v === null || v === '';
    })
    .map(c => c.label);
}
