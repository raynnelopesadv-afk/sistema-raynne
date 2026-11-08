import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, Plus, Pencil, Trash2, Coins, Info } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { DivisaoSelector } from '@/components/DivisaoSelector';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { toast } from 'sonner';
import { ETAPAS, LABEL_ETAPA, type Etapa } from '@/lib/comissaoRegras';
import { ProdutoCamposConfig } from '@/components/ProdutoCamposConfig';

type Divisao = 'advogados' | 'educacao';

interface VarCfg { nome: string; valor: number; sku: string; }
interface Product { id: string; nome: string; short: string; tipo: string; valor: number; ativo: boolean; divisao: string; variantes: string[]; variantes_config?: VarCfg[] | null; sku?: string | null; tem_honorarios_iniciais: boolean; exito_tipo: 'fixo' | 'percentual'; exito_valor: number; exito_probabilidade: number | null; projecao_soma_inicial: boolean; }
interface Level { id: string; nome: string; ordem: number; }

function formatCurrency(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0 });
}

// chave dos inputs de valor: `${levelId}|${etapa}|${variante ?? ''}`
function vk(levelId: string, etapa: Etapa, variante: string | null) {
  return `${levelId}|${etapa}|${variante ?? ''}`;
}

function InfoSku() {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" className="text-muted-foreground hover:text-primary" title="O que é o SKU?">
          <Info className="w-3.5 h-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80 text-xs leading-relaxed" align="start">
        <p className="font-semibold text-foreground mb-1">O que é o SKU?</p>
        <p className="text-muted-foreground">
          É o identificador do produto no <span className="text-foreground">Data Crazy</span>. Use aqui o
          <span className="text-foreground"> mesmo SKU</span> cadastrado lá (em crm.datacrazy.io → Produtos → coluna
          Identificador/SKU).
        </p>
        <p className="text-muted-foreground mt-2">
          É ele que conecta este produto/variante ao Data Crazy. No futuro, quando um negócio for
          <span className="text-foreground"> ganho no DC</span>, a venda será lançada aqui automaticamente pelo SKU.
        </p>
        <p className="text-muted-foreground mt-2">
          Como no DC cada <span className="text-foreground">variante é um produto separado</span>, cada variante aqui
          deve ter o SKU do produto correspondente no DC. Produto sem variante usa o SKU do próprio produto.
        </p>
      </PopoverContent>
    </Popover>
  );
}

export default function Produtos() {
  const [divisao, setDivisao] = useState<Divisao>('advogados');
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [form, setForm] = useState<Record<string, string | boolean>>({});
  const [metas, setMetas] = useState<Record<string, string>>({});
  const [valores, setValores] = useState<Record<string, string>>({});
  const [varRows, setVarRows] = useState<{ nome: string; valor: string; sku: string }[]>([]);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['produtos', divisao],
    queryFn: async () => {
      const { data, error } = await supabase.from('products').select('*').eq('divisao', divisao).order('nome');
      if (error) throw error;
      return data as unknown as Product[];
    },
  });

  const { data: levels } = useQuery({
    queryKey: ['career-levels'],
    queryFn: async () => {
      const { data, error } = await supabase.from('career_levels').select('id, nome, ordem').eq('ativo', true).order('ordem');
      if (error) throw error;
      return data as Level[];
    },
  });

  const variantesList = varRows.map(r => r.nome.trim()).filter(Boolean);

  async function loadRegras(productId: string) {
    const [{ data: pm }, { data: pcs }] = await Promise.all([
      supabase.from('product_metas').select('career_level_id, meta_contratos').eq('product_id', productId),
      supabase.from('product_commission_stages').select('career_level_id, etapa, variante, valor').eq('product_id', productId),
    ]);
    const m: Record<string, string> = {};
    (pm ?? []).forEach(r => { m[r.career_level_id] = String(r.meta_contratos); });
    const v: Record<string, string> = {};
    (pcs ?? []).forEach(r => { v[vk(r.career_level_id, r.etapa as Etapa, r.variante)] = String(r.valor); });
    setMetas(m);
    setValores(v);
  }

  const save = useMutation({
    mutationFn: async () => {
      if (!String(form.nome ?? '').trim()) throw new Error('Informe o nome do produto');
      const payload = {
        nome: String(form.nome),
        short: String(form.short ?? ''),
        tipo: String(form.tipo ?? ''),
        valor: Number(form.valor) || 0,
        ativo: !!form.ativo,
        divisao,
        sku: String(form.sku ?? '').trim() || null,
        variantes: variantesList,
        variantes_config: varRows
          .filter(r => r.nome.trim())
          .map(r => ({ nome: r.nome.trim(), valor: Number(r.valor) || 0, sku: r.sku.trim() })),
        tem_honorarios_iniciais: !!form.tem_honorarios_iniciais,
        exito_tipo: (String(form.exito_tipo || 'fixo')) as 'fixo' | 'percentual',
        exito_valor: Number(form.exito_valor) || 0,
        exito_probabilidade: Number(form.exito_probabilidade) > 0 ? Number(form.exito_probabilidade) : null,
        projecao_soma_inicial: !!form.projecao_soma_inicial,
      };
      let productId = editing?.id;
      if (editing) {
        const { error } = await supabase.from('products').update(payload).eq('id', editing.id);
        if (error) throw error;
      } else {
        const { data: created, error } = await supabase.from('products').insert(payload).select('id').single();
        if (error) throw error;
        productId = created.id;
      }
      if (!productId) throw new Error('Erro ao salvar produto');

      // regras: substitui tudo do produto
      const [d1, d2] = await Promise.all([
        supabase.from('product_metas').delete().eq('product_id', productId),
        supabase.from('product_commission_stages').delete().eq('product_id', productId),
      ]);
      if (d1.error) throw d1.error;
      if (d2.error) throw d2.error;

      const metasRows = Object.entries(metas)
        .filter(([, v]) => Number(v) > 0)
        .map(([levelId, v]) => ({ product_id: productId!, career_level_id: levelId, meta_contratos: Number(v) }));
      if (metasRows.length) {
        const { error } = await supabase.from('product_metas').insert(metasRows);
        if (error) throw error;
      }

      const stageRows = Object.entries(valores)
        .filter(([, v]) => Number(v) > 0)
        .map(([key, v]) => {
          const [levelId, etapa, variante] = key.split('|');
          return { product_id: productId!, career_level_id: levelId, etapa, variante: variante || null, valor: Number(v) };
        });
      if (stageRows.length) {
        const { error } = await supabase.from('product_commission_stages').insert(stageRows);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['produtos', divisao] });
      qc.invalidateQueries({ queryKey: ['comissao-regras'] });
      setOpen(false);
      toast.success(editing ? 'Atualizado!' : 'Criado!');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from('products').delete().eq('id', id); if (error) throw error; },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['produtos', divisao] }); toast.success('Excluído!'); },
    onError: (e: Error) => toast.error(e.message),
  });

  function openNew() {
    setEditing(null);
    setForm({ nome: '', short: '', tipo: '', valor: '', ativo: true, sku: '', tem_honorarios_iniciais: false, exito_tipo: 'fixo', exito_valor: '', exito_probabilidade: '', projecao_soma_inicial: false });
    setMetas({});
    setValores({});
    setVarRows([]);
    setOpen(true);
  }
  function openEdit(p: Product) {
    setEditing(p);
    setForm({ nome: p.nome, short: p.short, tipo: p.tipo, valor: String(p.valor), ativo: p.ativo, sku: p.sku ?? '', tem_honorarios_iniciais: !!p.tem_honorarios_iniciais, exito_tipo: p.exito_tipo ?? 'fixo', exito_valor: p.exito_valor ? String(p.exito_valor) : '', exito_probabilidade: p.exito_probabilidade ? String(p.exito_probabilidade) : '', projecao_soma_inicial: !!p.projecao_soma_inicial });
    setMetas({});
    setValores({});
    const cfg = (p.variantes_config && p.variantes_config.length)
      ? p.variantes_config.map(v => ({ nome: v.nome, valor: String(v.valor ?? ''), sku: v.sku ?? '' }))
      : (p.variantes ?? []).map(n => ({ nome: n, valor: '', sku: '' }));
    setVarRows(cfg);
    loadRegras(p.id);
    setOpen(true);
  }

  // colunas de valor: sem variantes -> 1 por etapa; com variantes -> 1 por etapa × variante
  const labelEtapa = (etapa: Etapa) =>
    etapa === 'pagamento' && form.tem_honorarios_iniciais ? 'Honorários iniciais' : LABEL_ETAPA[etapa];
  const valorCols: Array<{ etapa: Etapa; variante: string | null; label: string }> = ETAPAS.flatMap(etapa =>
    variantesList.length > 0
      ? variantesList.map(vr => ({ etapa, variante: vr as string | null, label: `${labelEtapa(etapa)} · ${vr}` }))
      : [{ etapa, variante: null, label: labelEtapa(etapa) }],
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div><h1 className="text-2xl font-bold text-foreground">Produtos</h1><p className="text-sm text-muted-foreground mt-1">Catálogo de produtos e regras de comissão</p></div>
        <Button onClick={openNew} className="gap-2"><Plus className="w-4 h-4" /> Novo</Button>
      </div>
      <DivisaoSelector value={divisao} onChange={setDivisao} />

      {isLoading ? (
        <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
      ) : !data || data.length === 0 ? (
        <div className="glass-card p-12 text-center"><p className="text-muted-foreground text-lg">Sem dados ainda</p></div>
      ) : (
        <div className="glass-card overflow-hidden overflow-x-auto">
          <Table>
            <TableHeader><TableRow><TableHead>Nome</TableHead><TableHead>Short</TableHead><TableHead>Tipo</TableHead><TableHead>Valor</TableHead><TableHead>Variantes</TableHead><TableHead>Ativo</TableHead><TableHead className="text-right">Ações</TableHead></TableRow></TableHeader>
            <TableBody>{data.map(p => (
              <TableRow key={p.id}>
                <TableCell className="font-medium">{p.nome}</TableCell>
                <TableCell>{p.short}</TableCell>
                <TableCell>{p.tipo}</TableCell>
                <TableCell>{formatCurrency(Number(p.valor) || 0)}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{(p.variantes ?? []).join(', ') || '—'}</TableCell>
                <TableCell>{p.ativo ? <span className="text-success text-xs">Ativo</span> : <span className="text-muted-foreground text-xs">Inativo</span>}</TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button variant="ghost" size="icon" onClick={() => openEdit(p)}><Pencil className="w-4 h-4" /></Button>
                    <Button variant="ghost" size="icon" onClick={() => remove.mutate(p.id)}><Trash2 className="w-4 h-4 text-destructive" /></Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}</TableBody>
          </Table>
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="bg-card border-border max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing ? 'Editar' : 'Novo'} Produto</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-3">
              <Input placeholder="Nome" value={String(form.nome ?? '')} onChange={e => setForm(f => ({ ...f, nome: e.target.value }))} />
              <Input placeholder="Short (abreviação)" value={String(form.short ?? '')} onChange={e => setForm(f => ({ ...f, short: e.target.value }))} />
              <Input placeholder="Tipo" value={String(form.tipo ?? '')} onChange={e => setForm(f => ({ ...f, tipo: e.target.value }))} />
              <Input type="number" placeholder="Valor (R$ do contrato)" value={String(form.valor ?? '')} onChange={e => setForm(f => ({ ...f, valor: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 flex items-center gap-1">SKU do produto (Data Crazy) — usado quando não há variante <InfoSku /></label>
              <Input placeholder="ex.: NS-AMEA" value={String(form.sku ?? '')} onChange={e => setForm(f => ({ ...f, sku: e.target.value }))} />
            </div>
            <div className="rounded-xl border border-border p-4 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-foreground flex items-center gap-1">Variantes (opcional) <InfoSku /></p>
                  <p className="text-[11px] text-muted-foreground">Cada variante tem valor próprio (preenche o valor da venda ao ser escolhida) e SKU próprio (vínculo com o Data Crazy).</p>
                </div>
                <Button type="button" variant="outline" size="sm" onClick={() => setVarRows(r => [...r, { nome: '', valor: '', sku: '' }])}>
                  <Plus className="w-4 h-4 mr-1" /> Adicionar
                </Button>
              </div>
              {varRows.length === 0 ? (
                <p className="text-xs text-muted-foreground">Sem variantes — o valor e o SKU do produto acima serão usados.</p>
              ) : (
                <div className="space-y-2">
                  <div className="grid grid-cols-[1fr_120px_150px_36px] gap-2 text-[11px] text-muted-foreground px-1">
                    <span>Nome</span><span>Valor (R$)</span><span>SKU (Data Crazy)</span><span></span>
                  </div>
                  {varRows.map((r, i) => (
                    <div key={i} className="grid grid-cols-[1fr_120px_150px_36px] gap-2 items-center">
                      <Input placeholder="ex.: 1 plataforma" value={r.nome} onChange={e => setVarRows(rs => rs.map((x, j) => (j === i ? { ...x, nome: e.target.value } : x)))} />
                      <Input type="number" step="0.01" placeholder="0,00" value={r.valor} onChange={e => setVarRows(rs => rs.map((x, j) => (j === i ? { ...x, valor: e.target.value } : x)))} />
                      <Input placeholder="ex.: UBER-1" value={r.sku} onChange={e => setVarRows(rs => rs.map((x, j) => (j === i ? { ...x, sku: e.target.value } : x)))} />
                      <Button type="button" variant="ghost" size="icon" onClick={() => setVarRows(rs => rs.filter((_, j) => j !== i))}><Trash2 className="w-4 h-4 text-destructive" /></Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <ProdutoCamposConfig productId={editing?.id ?? null} />

            <div className="flex items-center gap-3">
              <Switch checked={!!form.ativo} onCheckedChange={v => setForm(f => ({ ...f, ativo: v }))} />
              <span className="text-sm text-foreground">Ativo</span>
            </div>
            <div className="flex items-start gap-3">
              <Switch checked={!!form.tem_honorarios_iniciais} onCheckedChange={v => setForm(f => ({ ...f, tem_honorarios_iniciais: v }))} />
              <div>
                <span className="text-sm text-foreground">Tem honorários iniciais</span>
                <p className="text-[11px] text-muted-foreground">
                  A assinatura e o pagamento da inicial podem ocorrer em datas diferentes (ex.: até 30 dias).
                  O contrato ganha o campo "Recebimento dos honorários iniciais", que libera a etapa de comissão correspondente.
                </p>
              </div>
            </div>

            {/* Projeção de êxito */}
            <div className="rounded-xl border border-border p-4 space-y-3">
              <p className="text-sm font-semibold text-foreground">Projeção de êxito</p>
              <p className="text-[11px] text-muted-foreground">
                Usada nos painéis para projetar a receita dos contratos em andamento.
                Deixe em branco para usar o histórico do produto (média de êxito e taxa de êxito reais).
              </p>
              <div className="grid sm:grid-cols-3 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Formato do êxito</label>
                  <select
                    className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                    value={String(form.exito_tipo || 'fixo')}
                    onChange={e => setForm(f => ({ ...f, exito_tipo: e.target.value }))}
                  >
                    <option value="fixo">R$ fixo por contrato</option>
                    <option value="percentual">% do valor do contrato</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">{form.exito_tipo === 'percentual' ? 'Percentual (%)' : 'Valor do êxito (R$)'}</label>
                  <Input type="number" step="0.01" placeholder="vazio = média histórica" value={String(form.exito_valor ?? '')} onChange={e => setForm(f => ({ ...f, exito_valor: e.target.value }))} />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Probabilidade de êxito (%)</label>
                  <Input type="number" step="1" placeholder="vazio = taxa histórica" value={String(form.exito_probabilidade ?? '')} onChange={e => setForm(f => ({ ...f, exito_probabilidade: e.target.value }))} />
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Switch checked={!!form.projecao_soma_inicial} onCheckedChange={v => setForm(f => ({ ...f, projecao_soma_inicial: v }))} />
                <span className="text-sm text-foreground">Somar honorários iniciais (valor do contrato) à projeção</span>
              </div>
            </div>

            {/* Grade de comissionamento */}
            <div className="rounded-xl border border-border p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Coins className="w-4 h-4 text-primary" />
                <p className="text-sm font-semibold text-foreground">Comissionamento por nível e etapa</p>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Para cada nível de carreira, defina a meta de contratos/mês e o valor pago ao closer por contrato em cada etapa.
                Deixe em branco (ou 0) as etapas que não geram pagamento neste produto.
              </p>
              {!levels || levels.length === 0 ? (
                <p className="text-sm text-muted-foreground">Níveis de carreira não configurados. Rode a migration do banco.</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="whitespace-nowrap">Nível</TableHead>
                        <TableHead className="whitespace-nowrap">Meta/mês</TableHead>
                        {valorCols.map(c => (
                          <TableHead key={vk('h', c.etapa, c.variante)} className="whitespace-nowrap text-xs">{c.label} (R$)</TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {levels.map(l => (
                        <TableRow key={l.id}>
                          <TableCell className="font-medium whitespace-nowrap">{l.nome}</TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              className="w-20"
                              value={metas[l.id] ?? ''}
                              onChange={e => setMetas(m => ({ ...m, [l.id]: e.target.value }))}
                            />
                          </TableCell>
                          {valorCols.map(c => (
                            <TableCell key={vk(l.id, c.etapa, c.variante)}>
                              <Input
                                type="number"
                                step="0.01"
                                className="w-24"
                                value={valores[vk(l.id, c.etapa, c.variante)] ?? ''}
                                onChange={e => setValores(v => ({ ...v, [vk(l.id, c.etapa, c.variante)]: e.target.value }))}
                              />
                            </TableCell>
                          ))}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>

            <Button onClick={() => save.mutate()} className="w-full" disabled={save.isPending}>
              {save.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : editing ? 'Salvar' : 'Criar'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
