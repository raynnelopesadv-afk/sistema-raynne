import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';

type Divisao = 'advogados' | 'educacao';
type Forma = 'a_vista' | 'parcelado';
type Tipo = 'fixo' | 'percentual';

const LABEL_FORMA: Record<Forma, string> = { a_vista: 'À vista', parcelado: 'Parcelado' };

function brl(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 });
}

interface Regra {
  id: string;
  user_id: string;
  product_id: string;
  forma: Forma;
  tipo: Tipo;
  valor: number;
}

// ---------------------------------------------------------------------------
// Configuração das regras (Config → Comissões) — somente gestor
// ---------------------------------------------------------------------------
export function BonificacaoRegrasConfig({ divisao }: { divisao: Divisao }) {
  const qc = useQueryClient();
  const [form, setForm] = useState<{ user_id: string; product_id: string; forma: Forma | ''; tipo: Tipo; valor: string }>({
    user_id: '', product_id: '', forma: '', tipo: 'fixo', valor: '',
  });

  const { data } = useQuery({
    queryKey: ['bonif-regras', divisao],
    queryFn: async () => {
      const [regras, profiles, products] = await Promise.all([
        supabase.from('bonificacao_recebimento_regras').select('*'),
        supabase.from('profiles').select('user_id, display_name, email').order('display_name'),
        supabase.from('products').select('id, nome').eq('divisao', divisao).order('nome'),
      ]);
      const err = regras.error ?? profiles.error ?? products.error;
      if (err) throw err;
      return {
        regras: (regras.data ?? []) as Regra[],
        profiles: profiles.data ?? [],
        products: products.data ?? [],
      };
    },
  });

  const profileMap = useMemo(() => new Map((data?.profiles ?? []).map(p => [p.user_id, p.display_name || p.email || '—'])), [data]);
  const productMap = useMemo(() => new Map((data?.products ?? []).map(p => [p.id, p.nome])), [data]);
  const regrasDaDivisao = (data?.regras ?? []).filter(r => productMap.has(r.product_id));

  const add = useMutation({
    mutationFn: async () => {
      if (!form.user_id) throw new Error('Selecione o beneficiário');
      if (!form.product_id) throw new Error('Selecione o produto');
      if (!form.forma) throw new Error('Selecione a forma de pagamento');
      if (!(Number(form.valor) > 0)) throw new Error('Informe o valor da bonificação');
      const { error } = await supabase.from('bonificacao_recebimento_regras').upsert({
        user_id: form.user_id,
        product_id: form.product_id,
        forma: form.forma,
        tipo: form.tipo,
        valor: Number(form.valor),
      }, { onConflict: 'user_id,product_id,forma' });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bonif-regras'] });
      setForm(f => ({ ...f, forma: '', valor: '' }));
      toast.success('Regra salva!');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('bonificacao_recebimento_regras').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['bonif-regras'] }); toast.success('Regra removida'); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="glass-card p-5 space-y-4">
      <div>
        <p className="text-sm font-semibold text-foreground">Bonificação por recebimento</p>
        <p className="text-[11px] text-muted-foreground mt-1">
          Bonifica um usuário (ex.: estagiária) quando o recebimento de um contrato é registrado na aba Processos.
          No parcelado, a bonificação cai no mês da última parcela (quitação). Valor fixo por contrato ou % sobre o valor recebido.
        </p>
      </div>

      <div className="grid sm:grid-cols-5 gap-2 items-end">
        <div className="sm:col-span-1">
          <label className="text-xs text-muted-foreground mb-1 block">Beneficiário</label>
          <Select value={form.user_id} onValueChange={v => setForm(f => ({ ...f, user_id: v }))}>
            <SelectTrigger><SelectValue placeholder="Usuário" /></SelectTrigger>
            <SelectContent>{(data?.profiles ?? []).map(p => <SelectItem key={p.user_id} value={p.user_id}>{p.display_name || p.email}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Produto</label>
          <Select value={form.product_id} onValueChange={v => setForm(f => ({ ...f, product_id: v }))}>
            <SelectTrigger><SelectValue placeholder="Produto" /></SelectTrigger>
            <SelectContent>{(data?.products ?? []).map(p => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Forma</label>
          <Select value={form.forma} onValueChange={v => setForm(f => ({ ...f, forma: v as Forma }))}>
            <SelectTrigger><SelectValue placeholder="Forma" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="a_vista">À vista</SelectItem>
              <SelectItem value="parcelado">Parcelado</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Tipo</label>
          <Select value={form.tipo} onValueChange={v => setForm(f => ({ ...f, tipo: v as Tipo }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="fixo">R$ fixo por contrato</SelectItem>
              <SelectItem value="percentual">% do valor recebido</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex gap-2">
          <div className="flex-1">
            <label className="text-xs text-muted-foreground mb-1 block">{form.tipo === 'fixo' ? 'Valor (R$)' : 'Percentual (%)'}</label>
            <Input type="number" step="0.01" value={form.valor} onChange={e => setForm(f => ({ ...f, valor: e.target.value }))} />
          </div>
          <Button onClick={() => add.mutate()} disabled={add.isPending} className="gap-1 shrink-0">
            {add.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          </Button>
        </div>
      </div>

      {regrasDaDivisao.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Beneficiário</TableHead><TableHead>Produto</TableHead><TableHead>Forma</TableHead><TableHead className="text-right">Regra</TableHead><TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {regrasDaDivisao.map(r => (
              <TableRow key={r.id}>
                <TableCell className="font-medium">{profileMap.get(r.user_id) ?? '—'}</TableCell>
                <TableCell>{productMap.get(r.product_id) ?? '—'}</TableCell>
                <TableCell>{LABEL_FORMA[r.forma]}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {r.tipo === 'fixo' ? `${brl(Number(r.valor))} / contrato` : `${Number(r.valor)}% do recebido`}
                </TableCell>
                <TableCell>
                  <Button variant="ghost" size="icon" onClick={() => remove.mutate(r.id)}><Trash2 className="w-4 h-4 text-destructive" /></Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Apuração mensal (aba em Comissões)
// ---------------------------------------------------------------------------
export function BonificacaoRecebimento({ divisao, mesRef }: { divisao: Divisao; mesRef: string }) {
  const [year, month] = mesRef.split('-').map(Number);
  const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
  const endObj = new Date(year, month, 0);
  const endDate = `${endObj.getFullYear()}-${String(endObj.getMonth() + 1).padStart(2, '0')}-${String(endObj.getDate()).padStart(2, '0')}`;

  const { data, isLoading } = useQuery({
    queryKey: ['bonif-apuracao', divisao, mesRef],
    queryFn: async () => {
      const [contratos, regras, profiles, products] = await Promise.all([
        supabase
          .from('clientes_fechados')
          .select('id, nome_cliente, product_id, forma_recebimento, data_recebimento, valor_honorarios_recebidos')
          .eq('divisao', divisao)
          .not('data_recebimento', 'is', null)
          .gte('data_recebimento', startDate)
          .lte('data_recebimento', endDate),
        supabase.from('bonificacao_recebimento_regras').select('*'),
        supabase.from('profiles').select('user_id, display_name, email'),
        supabase.from('products').select('id, nome').eq('divisao', divisao),
      ]);
      const err = contratos.error ?? regras.error ?? profiles.error ?? products.error;
      if (err) throw err;
      return {
        contratos: contratos.data ?? [],
        regras: (regras.data ?? []) as Regra[],
        profiles: profiles.data ?? [],
        products: products.data ?? [],
      };
    },
    refetchInterval: 30_000,
  });

  const resumo = useMemo(() => {
    if (!data) return [];
    const profileMap = new Map(data.profiles.map(p => [p.user_id, p.display_name || p.email || '—']));
    const productMap = new Map(data.products.map(p => [p.id, p.nome]));
    const out = new Map<string, { nome: string; qtd: number; total: number; detalhes: string[] }>();

    for (const c of data.contratos) {
      if (!c.product_id || !c.forma_recebimento) continue;
      const matches = data.regras.filter(r => r.product_id === c.product_id && r.forma === c.forma_recebimento);
      for (const r of matches) {
        const valor = r.tipo === 'fixo'
          ? Number(r.valor)
          : (Number(c.valor_honorarios_recebidos) || 0) * Number(r.valor) / 100;
        const cur = out.get(r.user_id) ?? { nome: profileMap.get(r.user_id) ?? '—', qtd: 0, total: 0, detalhes: [] };
        cur.qtd += 1;
        cur.total += valor;
        cur.detalhes.push(`${c.nome_cliente} · ${productMap.get(c.product_id) ?? ''} · ${LABEL_FORMA[c.forma_recebimento as Forma]} · ${brl(valor)}`);
        out.set(r.user_id, cur);
      }
    }
    return Array.from(out.values()).sort((a, b) => b.total - a.total);
  }, [data]);

  if (isLoading) {
    return <div className="flex items-center justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;
  }

  return (
    <div className="glass-card overflow-hidden">
      <div className="px-5 pt-4 pb-2">
        <h3 className="font-semibold text-foreground">Bonificação por recebimento</h3>
        <p className="text-xs text-muted-foreground">
          Contratos com recebimento registrado no mês · regras configuráveis em Config → Comissões
        </p>
      </div>
      {resumo.length === 0 ? (
        <p className="text-sm text-muted-foreground px-5 pb-5">
          Nenhuma bonificação no período. Verifique se há regras cadastradas e se os recebimentos do mês têm a forma de pagamento preenchida (aba Processos).
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Beneficiário</TableHead>
              <TableHead className="text-center">Contratos recebidos</TableHead>
              <TableHead className="text-right">Bonificação do mês</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {resumo.map(r => (
              <TableRow key={r.nome}>
                <TableCell>
                  <span className="font-medium">{r.nome}</span>
                  <span className="block text-[11px] text-muted-foreground">{r.detalhes.slice(0, 4).join('  ·  ')}{r.detalhes.length > 4 ? ` · +${r.detalhes.length - 4}` : ''}</span>
                </TableCell>
                <TableCell className="text-center tabular-nums">{r.qtd}</TableCell>
                <TableCell className="text-right tabular-nums font-semibold">{brl(r.total)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
