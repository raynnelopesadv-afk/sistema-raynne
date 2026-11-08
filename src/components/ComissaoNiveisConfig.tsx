import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, Save, Plus, Trash2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { DivisaoSelector } from '@/components/DivisaoSelector';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { DEFAULT_SETTINGS, type ComissaoSettings } from '@/lib/comissaoRegras';
import { BonificacaoRegrasConfig } from '@/components/BonificacaoRecebimento';

type Divisao = 'advogados' | 'educacao';

interface Level { id: string; nome: string; ordem: number; bonus_combo: number; honorario_fixo: number; }
interface CloserRow { id: string; nome: string; career_level_id: string | null; operacao_product_ids: string[]; foto_url: string | null; }

const SEM_NIVEL = '__none__';

export function ComissaoNiveisConfig() {
  const [divisao, setDivisao] = useState<Divisao>('advogados');
  const qc = useQueryClient();

  const { data: levels } = useQuery({
    queryKey: ['career-levels'],
    queryFn: async () => {
      const { data, error } = await supabase.from('career_levels').select('id, nome, ordem, bonus_combo, honorario_fixo').eq('ativo', true).order('ordem');
      if (error) throw error;
      return data as Level[];
    },
  });

  const { data: closers, isLoading } = useQuery({
    queryKey: ['closers-niveis', divisao],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('closers')
        .select('id, nome, career_level_id, operacao_product_ids, foto_url')
        .eq('ativo', true)
        .eq('divisao', divisao)
        .order('nome');
      if (error) throw error;
      return data as CloserRow[];
    },
  });

  const { data: produtosDivisao } = useQuery({
    queryKey: ['produtos-operacao', divisao],
    queryFn: async () => {
      const { data, error } = await supabase.from('products').select('id, nome').eq('divisao', divisao).eq('ativo', true).order('nome');
      if (error) throw error;
      return data as { id: string; nome: string }[];
    },
  });

  const setOperacao = useMutation({
    mutationFn: async ({ closerId, productIds }: { closerId: string; productIds: string[] }) => {
      const { error } = await supabase.from('closers').update({ operacao_product_ids: productIds }).eq('id', closerId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['closers-niveis', divisao] });
      qc.invalidateQueries({ queryKey: ['comissao-regras'] });
      toast.success('Operação atualizada');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const setNivelCampo = useMutation({
    mutationFn: async ({ levelId, campos }: { levelId: string; campos: Record<string, unknown> }) => {
      const { error } = await supabase.from('career_levels').update(campos as never).eq('id', levelId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['career-levels'] });
      qc.invalidateQueries({ queryKey: ['comissao-regras'] });
      toast.success('Nível atualizado');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const criarNivel = useMutation({
    mutationFn: async () => {
      const proxOrdem = Math.max(0, ...((levels ?? []).map(l => l.ordem))) + 1;
      const { error } = await supabase.from('career_levels').insert({ nome: `Novo nível ${proxOrdem}`, ordem: proxOrdem, honorario_fixo: 0, bonus_combo: 0, ativo: true });
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['career-levels'] }); toast.success('Nível criado'); },
    onError: (e: Error) => toast.error(e.message),
  });

  const removerNivel = useMutation({
    mutationFn: async (levelId: string) => {
      const { error } = await supabase.from('career_levels').update({ ativo: false }).eq('id', levelId);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['career-levels'] }); toast.success('Nível removido'); },
    onError: (e: Error) => toast.error(e.message),
  });

  const uploadFoto = useMutation({
    mutationFn: async ({ closerId, file }: { closerId: string; file: File }) => {
      const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
      const path = `${closerId}.${ext}`;
      const { error: upErr } = await supabase.storage.from('avatars').upload(path, file, { upsert: true, contentType: file.type });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from('avatars').getPublicUrl(path);
      const url = `${pub.publicUrl}?v=${Date.now()}`;
      const { error } = await supabase.from('closers').update({ foto_url: url }).eq('id', closerId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['closers-niveis', divisao] });
      toast.success('Foto atualizada!');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const setLevel = useMutation({
    mutationFn: async ({ closerId, levelId }: { closerId: string; levelId: string | null }) => {
      const { error } = await supabase.from('closers').update({ career_level_id: levelId }).eq('id', closerId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['closers-niveis', divisao] });
      qc.invalidateQueries({ queryKey: ['comissao-regras'] });
      toast.success('Nível atualizado');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // -------- parâmetros gerais --------
  const { data: settingsRow } = useQuery({
    queryKey: ['comissao-settings', divisao],
    queryFn: async () => {
      const { data } = await supabase.from('config').select('id, valor').eq('divisao', divisao).eq('chave', 'comissao_settings').maybeSingle();
      return data ?? null;
    },
  });

  const [draft, setDraft] = useState<ComissaoSettings>(DEFAULT_SETTINGS);
  useEffect(() => {
    const v = (settingsRow?.valor ?? null) as Partial<ComissaoSettings> | null;
    setDraft({
      pisoPct: v?.pisoPct ?? DEFAULT_SETTINGS.pisoPct,
      proporcional: v?.proporcional ?? DEFAULT_SETTINGS.proporcional,
      multFds: v?.multFds ?? DEFAULT_SETTINGS.multFds,
      iaMultFds: v?.iaMultFds ?? DEFAULT_SETTINGS.iaMultFds,
    });
  }, [settingsRow]);

  const saveSettings = useMutation({
    mutationFn: async () => {
      const valor = { pisoPct: Number(draft.pisoPct) || 0, proporcional: !!draft.proporcional, multFds: Number(draft.multFds) || 1, iaMultFds: !!draft.iaMultFds };
      if (settingsRow?.id) {
        const { error } = await supabase.from('config').update({ valor }).eq('id', settingsRow.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('config').insert({ divisao, chave: 'comissao_settings', valor });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['comissao-settings', divisao] });
      qc.invalidateQueries({ queryKey: ['comissao-regras'] });
      toast.success('Parâmetros salvos');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <DivisaoSelector value={divisao} onChange={setDivisao} />

      <div className="glass-card p-5 space-y-4">
        <div>
          <p className="text-sm font-semibold text-foreground">Parâmetros gerais do variável</p>
          <p className="text-[11px] text-muted-foreground mt-1">
            Valem para todos os produtos desta divisão. Os valores por contrato são definidos em cada produto (aba Produtos).
          </p>
        </div>
        <div className="grid sm:grid-cols-3 gap-4">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Piso da meta (%) para receber variável</label>
            <Input type="number" value={String(draft.pisoPct)} onChange={e => setDraft(d => ({ ...d, pisoPct: Number(e.target.value) }))} />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Multiplicador fim de semana (sáb/dom)</label>
            <Input type="number" step="0.1" value={String(draft.multFds)} onChange={e => setDraft(d => ({ ...d, multFds: Number(e.target.value) }))} />
          </div>
          <div className="flex items-end gap-3 pb-1">
            <Switch checked={draft.proporcional} onCheckedChange={v => setDraft(d => ({ ...d, proporcional: v }))} />
            <span className="text-sm text-foreground">Proporcional entre o piso e 99% da meta</span>
          </div>
          <div className="flex items-end gap-3 pb-1 sm:col-span-3">
            <Switch checked={draft.iaMultFds} onCheckedChange={v => setDraft(d => ({ ...d, iaMultFds: v }))} />
            <span className="text-sm text-foreground">Fechamento por IA ganha o multiplicador de fim de semana</span>
          </div>
        </div>
        <Button onClick={() => saveSettings.mutate()} disabled={saveSettings.isPending} className="gap-2">
          {saveSettings.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Salvar parâmetros
        </Button>
      </div>

      <div className="glass-card overflow-hidden">
        <div className="px-5 py-4 border-b border-border">
          <p className="text-sm font-semibold text-foreground">Nível de carreira dos closers</p>
          <p className="text-[11px] text-muted-foreground mt-1">
            O nível define a meta e os valores de comissão de cada produto para o closer. Promoções e rebaixamentos são aplicados aqui pelo gestor.
          </p>
        </div>
        {isLoading ? (
          <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
        ) : !closers || closers.length === 0 ? (
          <p className="text-sm text-muted-foreground p-6">Sem closers ativos nesta divisão.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow><TableHead>Closer</TableHead><TableHead className="w-56">Nível de carreira</TableHead><TableHead>Operação (produtos)</TableHead></TableRow>
            </TableHeader>
            <TableBody>
              {closers.map(c => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      <label className="relative w-9 h-9 rounded-full overflow-hidden bg-primary/10 flex items-center justify-center cursor-pointer border border-border hover:border-primary/50 shrink-0" title="Clique para enviar/trocar a foto (aparece no telão de vendas)">
                        {c.foto_url
                          ? <img src={c.foto_url} alt={c.nome} className="w-full h-full object-cover" />
                          : <span className="text-[11px] font-bold text-primary">{c.nome.replace(/\[.*?\]\s*/g, '').split(' ').filter(Boolean).slice(0, 2).map(p => p[0]?.toUpperCase() ?? '').join('')}</span>}
                        <input
                          type="file"
                          accept="image/*"
                          className="absolute inset-0 opacity-0 cursor-pointer"
                          onChange={e => { const f = e.target.files?.[0]; if (f) uploadFoto.mutate({ closerId: c.id, file: f }); e.target.value = ''; }}
                        />
                      </label>
                      {c.nome}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Select
                      value={c.career_level_id ?? SEM_NIVEL}
                      onValueChange={v => setLevel.mutate({ closerId: c.id, levelId: v === SEM_NIVEL ? null : v })}
                    >
                      <SelectTrigger className="w-52"><SelectValue placeholder="Sem nível" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value={SEM_NIVEL}>Sem nível (não comissiona)</SelectItem>
                        {(levels ?? []).map(l => <SelectItem key={l.id} value={l.id}>{l.nome}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap items-center gap-1">
                      {(produtosDivisao ?? []).map(p => {
                        const has = (c.operacao_product_ids ?? []).includes(p.id);
                        return (
                          <button
                            key={p.id}
                            type="button"
                            disabled={setOperacao.isPending}
                            onClick={() => {
                              const cur = c.operacao_product_ids ?? [];
                              const next = has ? cur.filter(x => x !== p.id) : [...cur, p.id];
                              setOperacao.mutate({ closerId: c.id, productIds: next });
                            }}
                            className={`px-2 py-1 rounded-full text-[11px] border transition-colors ${
                              has ? 'bg-primary/15 text-primary border-primary/40' : 'bg-transparent text-muted-foreground border-border hover:border-primary/40'
                            }`}
                          >
                            {p.nome}
                          </button>
                        );
                      })}
                      {(c.operacao_product_ids ?? []).length >= 2 && (
                        <span className="inline-flex px-2 py-0.5 rounded-full text-[11px] bg-purple-500/15 text-purple-400" title="Metas reduzidas em 1/3 e direito ao bônus de combo">Misto</span>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <div className="glass-card p-5 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-sm font-semibold text-foreground">Níveis de carreira</p>
            <p className="text-[11px] text-muted-foreground mt-1">
              Honorário fixo é o salário base do nível. O bônus de combo é pago ao closer misto que bate as metas mistas de todos os produtos no mês.
              As metas e os valores por contrato ficam em cada produto (aba Produtos).
            </p>
          </div>
          <Button size="sm" variant="outline" className="gap-1 shrink-0" onClick={() => criarNivel.mutate()} disabled={criarNivel.isPending}>
            <Plus className="w-4 h-4" /> Novo nível
          </Button>
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nível</TableHead>
                <TableHead className="w-40">Honorário fixo (R$)</TableHead>
                <TableHead className="w-40">Bônus de combo (R$)</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {(levels ?? []).map(l => (
                <TableRow key={l.id}>
                  <TableCell>
                    <Input
                      className="w-40"
                      defaultValue={l.nome}
                      onBlur={e => { const v = e.target.value.trim(); if (v && v !== l.nome) setNivelCampo.mutate({ levelId: l.id, campos: { nome: v } }); }}
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      className="w-32"
                      defaultValue={String(l.honorario_fixo ?? 0)}
                      onBlur={e => { const v = Number(e.target.value) || 0; if (v !== Number(l.honorario_fixo ?? 0)) setNivelCampo.mutate({ levelId: l.id, campos: { honorario_fixo: v } }); }}
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      className="w-32"
                      defaultValue={String(l.bonus_combo ?? 0)}
                      onBlur={e => { const v = Number(e.target.value) || 0; if (v !== Number(l.bonus_combo ?? 0)) setNivelCampo.mutate({ levelId: l.id, campos: { bonus_combo: v } }); }}
                    />
                  </TableCell>
                  <TableCell>
                    <Button variant="ghost" size="icon" title="Remover nível" onClick={() => { if (confirm(`Remover o nível "${l.nome}"? Closers nesse nível ficam sem nível.`)) removerNivel.mutate(l.id); }}>
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      <BonificacaoRegrasConfig divisao={divisao} />
    </div>
  );
}
