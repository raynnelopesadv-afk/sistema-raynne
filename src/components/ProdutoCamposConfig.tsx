import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, Plus, Trash2, ListChecks, Eye, EyeOff } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';

export type CampoTipo = 'texto' | 'numero' | 'data' | 'select' | 'multi';
export interface ProductCampo {
  id: string;
  product_id: string;
  label: string;
  tipo: CampoTipo;
  opcoes: string[];
  obrigatorio: boolean;
  ordem: number;
  ativo: boolean;
  visivel_kanban: boolean;
}

export const TIPO_LABEL: Record<CampoTipo, string> = {
  texto: 'Texto',
  numero: 'Número',
  data: 'Data',
  select: 'Lista suspensa',
  multi: 'Múltipla escolha',
};

/** Configuração dos campos personalizados de um produto (aparecem na ficha do processo). */
export function ProdutoCamposConfig({ productId }: { productId: string | null }) {
  const qc = useQueryClient();
  const [novoLabel, setNovoLabel] = useState('');
  const [novoTipo, setNovoTipo] = useState<CampoTipo>('texto');

  const { data: campos, isLoading } = useQuery({
    queryKey: ['product-campos', productId],
    enabled: !!productId,
    queryFn: async () => {
      const { data, error } = await supabase.from('product_campos').select('*').eq('product_id', productId!).order('ordem');
      if (error) throw error;
      return (data ?? []) as ProductCampo[];
    },
  });

  const add = useMutation({
    mutationFn: async () => {
      if (!productId) throw new Error('Salve o produto antes de adicionar campos');
      if (!novoLabel.trim()) throw new Error('Informe o nome do campo');
      const ordem = (campos?.[campos.length - 1]?.ordem ?? 0) + 1;
      const { error } = await supabase.from('product_campos').insert({
        product_id: productId, label: novoLabel.trim(), tipo: novoTipo, ordem,
      } as never);
      if (error) throw error;
    },
    onSuccess: () => { setNovoLabel(''); qc.invalidateQueries({ queryKey: ['product-campos', productId] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const upd = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<ProductCampo> }) => {
      const { error } = await supabase.from('product_campos').update(patch as never).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['product-campos', productId] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from('product_campos').delete().eq('id', id); if (error) throw error; },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['product-campos', productId] }),
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="rounded-xl border border-border p-4 space-y-3">
      <div className="flex items-center gap-2">
        <ListChecks className="w-4 h-4 text-primary" />
        <p className="text-sm font-semibold text-foreground">Campos personalizados</p>
      </div>
      <p className="text-[11px] text-muted-foreground">
        Campos específicos deste produto, preenchidos na ficha do processo (ex.: dados que o Salário Maternidade exige e o Motorista/App não).
        O <span className="text-primary">olho</span> controla se o campo aparece no card do kanban — por padrão, todos aparecem.
      </p>

      {!productId ? (
        <p className="text-xs text-muted-foreground">Salve o produto primeiro para configurar os campos.</p>
      ) : isLoading ? (
        <div className="flex justify-center py-4"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>
      ) : (
        <>
          {(campos ?? []).length > 0 && (
            <div className="space-y-2">
              {(campos ?? []).map(c => (
                <div key={c.id} className="rounded-lg border border-border/60 p-2 space-y-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Input
                      className="h-8 text-sm flex-1 min-w-[160px]"
                      defaultValue={c.label}
                      onBlur={e => { const v = e.target.value.trim(); if (v && v !== c.label) upd.mutate({ id: c.id, patch: { label: v } }); }}
                    />
                    <Select value={c.tipo} onValueChange={(v) => upd.mutate({ id: c.id, patch: { tipo: v as CampoTipo } })}>
                      <SelectTrigger className="h-8 w-40 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {(Object.keys(TIPO_LABEL) as CampoTipo[]).map(t => <SelectItem key={t} value={t}>{TIPO_LABEL[t]}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <label className="flex items-center gap-1.5 text-xs text-muted-foreground whitespace-nowrap">
                      <Switch checked={c.obrigatorio} onCheckedChange={v => upd.mutate({ id: c.id, patch: { obrigatorio: v } })} />
                      obrigatório
                    </label>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      title={c.visivel_kanban !== false ? 'Aparece no card do kanban — clique para esconder' : 'Escondido no kanban — clique para mostrar'}
                      onClick={() => upd.mutate({ id: c.id, patch: { visivel_kanban: !(c.visivel_kanban !== false) } })}
                    >
                      {c.visivel_kanban !== false
                        ? <Eye className="w-4 h-4 text-primary" />
                        : <EyeOff className="w-4 h-4 text-muted-foreground" />}
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => del.mutate(c.id)}>
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  </div>
                  {(c.tipo === 'select' || c.tipo === 'multi') && (
                    <Input
                      className="h-8 text-xs"
                      placeholder="Opções separadas por vírgula — ex.: CLT, Autônoma, Desempregada"
                      defaultValue={(c.opcoes ?? []).join(', ')}
                      onBlur={e => {
                        const arr = e.target.value.split(',').map(x => x.trim()).filter(Boolean);
                        if (arr.join('|') !== (c.opcoes ?? []).join('|')) upd.mutate({ id: c.id, patch: { opcoes: arr } });
                      }}
                    />
                  )}
                </div>
              ))}
            </div>
          )}

          <div className="flex items-center gap-2 flex-wrap pt-1">
            <Input
              className="h-8 text-sm flex-1 min-w-[160px]"
              placeholder="Nome do campo (ex.: Data do parto)"
              value={novoLabel}
              onChange={e => setNovoLabel(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add.mutate(); } }}
            />
            <Select value={novoTipo} onValueChange={(v) => setNovoTipo(v as CampoTipo)}>
              <SelectTrigger className="h-8 w-40 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(TIPO_LABEL) as CampoTipo[]).map(t => <SelectItem key={t} value={t}>{TIPO_LABEL[t]}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button type="button" variant="outline" size="sm" onClick={() => add.mutate()} disabled={add.isPending}>
              <Plus className="w-4 h-4 mr-1" /> Adicionar
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
