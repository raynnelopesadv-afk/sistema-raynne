import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, ScrollText, XCircle, Trophy, ChevronDown, ChevronRight, LayoutGrid, List, History, Pencil, UserMinus } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { DivisaoSelector } from '@/components/DivisaoSelector';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { useUserRole } from '@/hooks/useUserRole';
import { usePermissions } from '@/hooks/usePermissions';
import { fetchVendedores } from '@/lib/vendedores';
import { ProtocoloStats } from '@/components/ProtocoloStats';
import { StatusBadge } from '@/components/StatusBadge';
import { ProductMultiFilter } from '@/components/ProductMultiFilter';
import { PerformancePorProduto } from '@/components/PerformancePorProduto';
import { usePersistentState } from '@/hooks/usePersistentState';
import { getEffectiveStatus, type EffectiveStatus } from '@/lib/contrato-status';
import { useMotivosDesqualificacao, MOTIVO_DIVERSO } from '@/lib/desqualificacao';
import { ClienteSearchInput } from '@/components/ClienteSearchInput';
import { HighlightMatch } from '@/components/HighlightMatch';
import { matchCliente, useDebounced, isNumericQuery, maskCPF } from '@/lib/cliente-search';
import { ViewToggle, type ViewMode } from '@/components/ViewToggle';
import { KanbanBoard } from '@/components/KanbanBoard';
import { ProcessoEditSheet } from '@/components/ProcessoEditSheet';
import { CadastroRetroativoDialog } from '@/components/CadastroRetroativoDialog';
import { RetroBadge } from '@/components/RetroBadge';
import { useTvMode } from '@/hooks/useTvMode';

type Divisao = 'advogados' | 'educacao';

interface Contrato {
  id: string;
  nome_cliente: string;
  telefone: string | null;
  cpf: string | null;
  valor: number;
  closer_id: string | null;
  product_id: string | null;
  divisao: Divisao;
  status_qualificacao: 'pendente' | 'qualificado' | 'desqualificado';
  protocolado: boolean | null;
  data_protocolo: string | null;
  tipo_processo: string | null;
  teve_exito: boolean | null;
  valor_exito: number;
  data_recebimento: string | null;
  campos_personalizados?: Record<string, string | number | string[] | null> | null;
  valor_honorarios_recebidos: number;
  forma_recebimento: 'a_vista' | 'parcelado' | null;
  motivo_desqualificacao: string | null;
  fechado_em: string | null;
  data_fechamento: string | null;
  cadastro_retroativo?: boolean | null;
  data_cadastro_retroativo?: string | null;
}

function formatCurrency(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0 });
}

const STATUS_OPTS: { v: EffectiveStatus | 'all'; label: string }[] = [
  { v: 'all', label: 'Todos status' },
  { v: 'pendente', label: 'Pendente' },
  { v: 'qualificado', label: 'Protocolo' },
  { v: 'desqualificado', label: 'Desqualificado' },
  { v: 'exito', label: 'Êxito' },
  { v: 'sem_exito', label: 'Sem êxito' },
];

export default function Processos() {
  // Persistência de filtros entre navegações
  const [divisao, setDivisao] = usePersistentState<Divisao>('processos.divisao', 'advogados');
  const [statusFilter, setStatusFilter] = usePersistentState<EffectiveStatus | 'all'>('processos.status', 'all');
  const [closerFilter, setCloserFilter] = usePersistentState<string>('processos.closer', 'all');
  const [productSelected, setProductSelected] = usePersistentState<string[]>('processos.products', []);
  const [protFrom, setProtFrom] = usePersistentState<string>('processos.protFrom', '');
  const [protTo, setProtTo] = usePersistentState<string>('processos.protTo', '');
  const [recFrom, setRecFrom] = usePersistentState<string>('processos.recFrom', '');
  const [recTo, setRecTo] = usePersistentState<string>('processos.recTo', '');
  const [groupByProduct, setGroupByProduct] = usePersistentState<boolean>('processos.groupByProduct', false);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounced(search, 300);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [view, setView] = usePersistentState<ViewMode>('processos.view', 'kanban');
  const [hideEmptyCols, setHideEmptyCols] = usePersistentState<boolean>('processos.hideEmptyCols', false);
  const [origemFilter, setOrigemFilter] = usePersistentState<'all' | 'normal' | 'retroativo'>('processos.origem', 'all');
  const [retroOpen, setRetroOpen] = useState(false);

  // Action dialogs
  const [protocolarOf, setProtocolarOf] = useState<Contrato | null>(null);
  const [desqualifOf, setDesqualifOf] = useState<Contrato | null>(null);
  const [desistOf, setDesistOf] = useState<Contrato | null>(null);
  const [resultadoOf, setResultadoOf] = useState<Contrato | null>(null);
  const [editOf, setEditOf] = useState<Contrato | null>(null);

  const qc = useQueryClient();
  const { isGestor } = useUserRole();
  const { can } = usePermissions();
  const canWrite = can('qualificar');
  const { isTvMode } = useTvMode();

  const { data, isLoading } = useQuery({
    queryKey: ['processos-contratos', divisao],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('clientes_fechados')
        .select('*')
        .eq('divisao', divisao)
        .order('fechado_em', { ascending: false });
      if (error) throw error;
      return (data ?? []) as Contrato[];
    },
  });

  const { data: closers } = useQuery({
    queryKey: ['vendedores', divisao],
    queryFn: async () => (await fetchVendedores(divisao)).map(v => ({ id: v.id, nome: v.nome })),
  });
  const { data: products } = useQuery({
    queryKey: ['products', divisao],
    queryFn: async () => {
      const { data } = await supabase.from('products').select('id, nome, tem_honorarios_iniciais').eq('divisao', divisao).order('nome');
      return (data ?? []) as { id: string; nome: string }[];
    },
  });

  const closerMap = Object.fromEntries((closers ?? []).map(c => [c.id, c.nome]));
  const productMap = Object.fromEntries((products ?? []).map(p => [p.id, p.nome]));

  const filtered = useMemo(() => {
    const productSet = new Set(productSelected);
    return (data ?? []).filter(c => {
      const eff = getEffectiveStatus(c);
      if (statusFilter !== 'all' && eff !== statusFilter) return false;
      if (closerFilter !== 'all' && c.closer_id !== closerFilter) return false;
      if (productSet.size > 0 && (!c.product_id || !productSet.has(c.product_id))) return false;
      if (protFrom && (!c.data_protocolo || c.data_protocolo < protFrom)) return false;
      if (protTo && (!c.data_protocolo || c.data_protocolo > protTo)) return false;
      if (recFrom && (!c.data_recebimento || c.data_recebimento < recFrom)) return false;
      if (recTo && (!c.data_recebimento || c.data_recebimento > recTo)) return false;
      if (origemFilter === 'normal' && c.cadastro_retroativo) return false;
      if (origemFilter === 'retroativo' && !c.cadastro_retroativo) return false;
      if (debouncedSearch && !matchCliente(c, debouncedSearch)) return false;
      return true;
    });
  }, [data, statusFilter, closerFilter, productSelected, protFrom, protTo, recFrom, recTo, origemFilter, debouncedSearch]);

  // Considera qualificado como protocolado (sincronia automática com Estatísticas)
  const isProt = (c: Contrato) => !!c.protocolado || c.status_qualificacao === 'qualificado';

  // Ranking simples por closer (qtd de contratos protocolados) — usa filtros aplicados
  const ranking = useMemo(() => {
    const counts = new Map<string, number>();
    filtered.forEach(c => {
      if (!c.closer_id || !isProt(c)) return;
      counts.set(c.closer_id, (counts.get(c.closer_id) ?? 0) + 1);
    });
    return Array.from(counts.entries())
      .map(([uid, qtd]) => ({ uid, nome: closerMap[uid] ?? 'Closer', qtd }))
      .sort((a, b) => b.qtd - a.qtd)
      .slice(0, 10);
  }, [filtered, closerMap]);

  // Agrupamento por produto
  const groups = useMemo(() => {
    if (!groupByProduct) return null;
    const map = new Map<string, Contrato[]>();
    filtered.forEach(c => {
      const key = c.product_id ?? '__none__';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(c);
    });
    return Array.from(map.entries())
      .map(([pid, rows]) => {
        const total = rows.length;
        const protocolados = rows.filter(isProt).length;
        const exitos = rows.filter(r => r.teve_exito === true).length;
        const valor = rows.reduce((a, r) => a + (Number(r.valor) || 0), 0);
        const taxa = protocolados > 0 ? (exitos / protocolados) * 100 : 0;
        return { pid, nome: productMap[pid] ?? 'Sem produto', rows, total, valor, taxa };
      })
      .sort((a, b) => a.nome.localeCompare(b.nome));
  }, [groupByProduct, filtered, productMap]);

  const medal = (i: number) => i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}º`;

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['processos-contratos', divisao] });
    qc.invalidateQueries({ queryKey: ['clientes', divisao] });
    qc.invalidateQueries({ queryKey: ['fechamento', divisao] });
    qc.invalidateQueries({ queryKey: ['protocolo-stats'] });
  };

  const filterSubtitle = useMemo(() => {
    const parts: string[] = [];
    if (statusFilter !== 'all') parts.push(STATUS_OPTS.find(o => o.v === statusFilter)?.label ?? '');
    if (closerFilter !== 'all') parts.push(closerMap[closerFilter] ?? 'closer');
    if (productSelected.length === 1) parts.push(productMap[productSelected[0]] ?? 'produto');
    else if (productSelected.length > 1) parts.push(`${productSelected.length} produtos`);
    if (protFrom || protTo) parts.push('período de protocolo');
    if (recFrom || recTo) parts.push('período de recebimento');
    return parts.length ? `Filtrado: ${parts.join(' · ')}` : 'Visão consolidada da divisão';
  }, [statusFilter, closerFilter, productSelected, protFrom, protTo, recFrom, recTo, closerMap, productMap]);

  function renderRows(rows: Contrato[]) {
    return rows.map(c => {
      const eff = getEffectiveStatus(c);
      return (
        <TableRow
          key={c.id}
          className={`${c.cadastro_retroativo ? 'border-l-2 border-l-[#6B7280] ' : ''}${canWrite ? 'cursor-pointer hover:bg-card' : ''}`}
          onClick={canWrite ? (e) => {
            const target = e.target as HTMLElement;
            if (target.closest('button') || target.closest('a')) return;
            setEditOf(c);
          } : undefined}
        >
          <TableCell className="font-medium max-w-[220px]">
            <div className="truncate flex items-center gap-1.5">
              {c.cadastro_retroativo && (
                <RetroBadge registradoEm={c.data_cadastro_retroativo ?? null} />
              )}
              <HighlightMatch text={c.nome_cliente} query={debouncedSearch} field="name" />
            </div>
            {c.cpf && (
              <div className="text-[11px] text-muted-foreground">
                <HighlightMatch text={maskCPF(c.cpf)} query={debouncedSearch} field="cpf" />
              </div>
            )}
          </TableCell>
          <TableCell className="capitalize text-xs text-muted-foreground">{c.tipo_processo ?? '—'}</TableCell>
          <TableCell><StatusBadge contrato={c} /></TableCell>
          <TableCell>{closerMap[c.closer_id ?? ''] ?? '—'}</TableCell>
          <TableCell>{productMap[c.product_id ?? ''] ?? '—'}</TableCell>
          <TableCell>{formatCurrency(Number(c.valor) || 0)}</TableCell>
          <TableCell className="text-xs">{c.data_protocolo ? new Date(c.data_protocolo + 'T12:00:00').toLocaleDateString('pt-BR') : '—'}</TableCell>
          <TableCell className="text-xs">
            {c.teve_exito === true && <span className="text-emerald-600">Sim · {formatCurrency(Number(c.valor_exito) || 0)}</span>}
            {c.teve_exito === false && <span className="text-muted-foreground">Não</span>}
            {c.teve_exito === null && <span className="text-muted-foreground">—</span>}
          </TableCell>
          <TableCell className="text-right">
            {canWrite ? (
              <div className="flex justify-end gap-1 flex-wrap">
                {eff === 'pendente' && (
                  <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => setProtocolarOf(c)}>
                    <ScrollText className="w-3 h-3" /> Protocolar
                  </Button>
                )}
                {(eff === 'pendente' || eff === 'qualificado') && (
                  <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => setDesqualifOf(c)}>
                    <XCircle className="w-3 h-3" /> Desqualificar
                  </Button>
                )}
                {(eff === 'pendente' || eff === 'qualificado') && (
                  <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => setDesistOf(c)}>
                    <UserMinus className="w-3 h-3" /> Desistência
                  </Button>
                )}
                {eff === 'qualificado' && (
                  <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => setResultadoOf(c)}>
                    <ChevronDown className="w-3 h-3" /> Registrar resultado
                  </Button>
                )}
                {(eff === 'exito' || eff === 'sem_exito') && (
                  <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setResultadoOf(c)}>
                    Editar resultado
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs gap-1 border-primary/40 text-primary hover:bg-primary/10 hover:text-primary"
                  onClick={() => setEditOf(c)}
                  title="Editar informações do contrato"
                >
                  <Pencil className="w-3 h-3" /> Editar
                </Button>
              </div>
            ) : (
              <span className="text-xs text-muted-foreground">—</span>
            )}
          </TableCell>
        </TableRow>
      );
    });
  }

  // Modo TV: exibe apenas Estatísticas de Protocolo + Ranking de Protocolo (slide focado)
  if (isTvMode) {
    return (
      <div className="space-y-8">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Processos · {divisao === 'advogados' ? 'Advogados' : 'Educação'}</h1>
            <p className="text-base text-muted-foreground mt-1">Visão em tempo real — protocolos e ranking de closers</p>
          </div>
        </div>

        <ProtocoloStats divisao={divisao} />

        <div className="glass-card p-6">
          <div className="flex items-center gap-2 mb-5">
            <Trophy className="w-6 h-6 text-primary" />
            <h3 className="text-xl font-semibold text-foreground">Ranking de Protocolo</h3>
            <span className="text-sm text-muted-foreground ml-2">Top closers por contratos protocolados</span>
          </div>
          {ranking.length === 0 ? (
            <p className="text-base text-muted-foreground py-6 text-center">Sem contratos protocolados</p>
          ) : (
            <div className="space-y-3">
              {ranking.map((r, i) => (
                <div key={r.uid} className="flex items-center justify-between px-5 py-4 rounded-xl bg-muted/30">
                  <div className="flex items-center gap-4">
                    <span className="text-3xl w-12 text-center">{medal(i)}</span>
                    <span className="text-2xl font-medium text-foreground">{r.nome}</span>
                  </div>
                  <span className="text-xl font-semibold text-primary tabular-nums">
                    {r.qtd} {r.qtd === 1 ? 'protocolo' : 'protocolos'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Processos</h1>
          <p className="text-sm text-muted-foreground mt-1">Workspace do operador técnico — protocolar, desqualificar e registrar resultados</p>
        </div>
        {canWrite && (
          <Button
            onClick={() => setRetroOpen(true)}
            variant="outline"
            className="gap-2 border-primary/60 text-primary hover:bg-primary/10 hover:text-primary"
          >
            <History className="w-4 h-4" /> Cadastrar Fechamento Retroativo
          </Button>
        )}
      </div>
      <DivisaoSelector value={divisao} onChange={setDivisao} />

      <div className="glass-card p-4">
        <ClienteSearchInput value={search} onChange={setSearch} />
        <p className="text-[11px] text-muted-foreground mt-2">
          Dica: <kbd className="px-1.5 py-0.5 rounded bg-muted text-[10px]">Ctrl</kbd> + <kbd className="px-1.5 py-0.5 rounded bg-muted text-[10px]">K</kbd> para focar · <kbd className="px-1.5 py-0.5 rounded bg-muted text-[10px]">Esc</kbd> para limpar
          {debouncedSearch && (
            <span className="ml-2">· {filtered.length} resultado{filtered.length === 1 ? '' : 's'} para “{debouncedSearch}” {isNumericQuery(debouncedSearch) ? '(CPF)' : '(nome)'}</span>
          )}
        </p>
      </div>

      <ProtocoloStats divisao={divisao} rows={filtered} subtitle={filterSubtitle} />

      {/* Ranking */}
      <div className="glass-card p-5">
        <div className="flex items-center gap-2 mb-4">
          <Trophy className="w-5 h-5 text-primary" />
          <h3 className="font-semibold text-foreground">Ranking de Protocolo</h3>
          <span className="text-xs text-muted-foreground ml-2">Top closers por contratos protocolados (com filtros)</span>
        </div>
        {ranking.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">Sem contratos protocolados</p>
        ) : (
          <div className="space-y-2">
            {ranking.map((r, i) => (
              <div key={r.uid} className="flex items-center justify-between px-3 py-2 rounded-lg bg-muted/30">
                <div className="flex items-center gap-3">
                  <span className="text-lg w-8 text-center">{medal(i)}</span>
                  <span className="font-medium text-foreground">{r.nome}</span>
                </div>
                <span className="text-sm font-semibold text-primary">{r.qtd} {r.qtd === 1 ? 'protocolo' : 'protocolos'}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Performance por Produto */}
      <PerformancePorProduto
        rows={filtered}
        products={products ?? []}
        onSelectProduct={(pid) => setProductSelected([pid])}
      />

      {/* Filtros */}
      <div className="glass-card p-4 space-y-3">
        <div className="w-full">
          <ClienteSearchInput value={search} onChange={setSearch} />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as EffectiveStatus | 'all')}>
            <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {STATUS_OPTS.map(o => <SelectItem key={o.v} value={o.v}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={closerFilter} onValueChange={setCloserFilter}>
            <SelectTrigger className="w-[200px]"><SelectValue placeholder="Closer" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os closers</SelectItem>
              {(closers ?? []).map(c => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
            </SelectContent>
          </Select>
          <ProductMultiFilter
            products={products ?? []}
            selected={productSelected}
            onChange={setProductSelected}
          />
          <Select value={origemFilter} onValueChange={(v) => setOrigemFilter(v as 'all' | 'normal' | 'retroativo')}>
            <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as origens</SelectItem>
              <SelectItem value="normal">Cadastro normal</SelectItem>
              <SelectItem value="retroativo">Cadastro retroativo</SelectItem>
            </SelectContent>
          </Select>
          <div className="flex items-center gap-3 ml-auto">
            <ViewToggle value={view} onChange={setView} />
            {view === 'kanban' && (
              <div className="flex items-center gap-2 rounded-lg border border-border px-3 py-1.5">
                <Label className="text-xs text-muted-foreground cursor-pointer" htmlFor="hide-empty-cols">Ocultar vazias</Label>
                <Switch id="hide-empty-cols" checked={hideEmptyCols} onCheckedChange={setHideEmptyCols} />
              </div>
            )}
            {view === 'list' && (
              <div className="flex items-center gap-2 rounded-lg border border-border px-3 py-1.5">
                {groupByProduct ? <LayoutGrid className="w-4 h-4 text-primary" /> : <List className="w-4 h-4 text-muted-foreground" />}
                <Label className="text-xs text-muted-foreground cursor-pointer" htmlFor="group-by-product">Agrupar por produto</Label>
                <Switch id="group-by-product" checked={groupByProduct} onCheckedChange={setGroupByProduct} />
              </div>
            )}
          </div>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div>
            <Label className="text-[11px] text-muted-foreground">Protocolo de</Label>
            <Input type="date" value={protFrom} onChange={(e) => setProtFrom(e.target.value)} />
          </div>
          <div>
            <Label className="text-[11px] text-muted-foreground">Protocolo até</Label>
            <Input type="date" value={protTo} onChange={(e) => setProtTo(e.target.value)} />
          </div>
          <div>
            <Label className="text-[11px] text-muted-foreground">Recebimento de</Label>
            <Input type="date" value={recFrom} onChange={(e) => setRecFrom(e.target.value)} />
          </div>
          <div>
            <Label className="text-[11px] text-muted-foreground">Recebimento até</Label>
            <Input type="date" value={recTo} onChange={(e) => setRecTo(e.target.value)} />
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
      ) : filtered.length === 0 ? (
        <div className="glass-card p-12 text-center"><p className="text-muted-foreground text-lg">{debouncedSearch ? `Nenhum processo encontrado para "${debouncedSearch}"` : 'Nenhum contrato encontrado'}</p></div>
      ) : view === 'kanban' ? (
        <KanbanBoard
          rows={filtered}
          closerMap={closerMap}
          productMap={productMap}
          canDrag={canWrite}
          variant="processos"
          highlightQuery={debouncedSearch}
          hideEmpty={hideEmptyCols}
          onCardClick={(row) => setEditOf(row)}
          onDropTransition={(row, from, to) => {
            if (to === 'qualificado') setProtocolarOf(row);
            else if (to === 'desqualificado') setDesqualifOf(row);
            else if (to === 'exito') setResultadoOf({ ...row, teve_exito: true });
            else if (to === 'sem_exito') setResultadoOf({ ...row, teve_exito: false });
          }}
          onInvalidTransition={() => toast.error('Transição não permitida')}
        />
      ) : groupByProduct && groups ? (
        <div className="space-y-3">
          {groups.map(g => {
            const isCollapsed = collapsed[g.pid];
            return (
              <div key={g.pid} className="glass-card overflow-hidden">
                <button
                  type="button"
                  onClick={() => setCollapsed(s => ({ ...s, [g.pid]: !s[g.pid] }))}
                  className="w-full flex items-center justify-between px-4 py-3 border-b border-border bg-secondary/30 hover:bg-secondary/40 transition"
                >
                  <div className="flex items-center gap-3">
                    {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    <div className="text-left">
                      <p className="font-semibold text-foreground">{g.nome}</p>
                      <p className="text-xs text-muted-foreground">{g.total} contrato{g.total !== 1 ? 's' : ''} · taxa de êxito {g.taxa.toFixed(1)}%</p>
                    </div>
                  </div>
                  <p className="text-sm font-semibold text-primary">{formatCurrency(g.valor)}</p>
                </button>
                {!isCollapsed && (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Cliente</TableHead>
                          <TableHead>Tipo</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Closer</TableHead>
                          <TableHead>Produto</TableHead>
                          <TableHead>Valor</TableHead>
                          <TableHead>Protocolo</TableHead>
                          <TableHead>Êxito</TableHead>
                          <TableHead className="text-right">Ações</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>{renderRows(g.rows)}</TableBody>
                    </Table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="glass-card overflow-hidden overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cliente</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Closer</TableHead>
                <TableHead>Produto</TableHead>
                <TableHead>Valor</TableHead>
                <TableHead>Protocolo</TableHead>
                <TableHead>Êxito</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>{renderRows(filtered)}</TableBody>
          </Table>
        </div>
      )}

      <ProtocolarDialog contrato={protocolarOf} onClose={() => setProtocolarOf(null)} onSuccess={invalidate} />
      <DesqualificarDialog contrato={desqualifOf} onClose={() => setDesqualifOf(null)} onSuccess={invalidate} />
      <DesistenciaDialog contrato={desistOf} onClose={() => setDesistOf(null)} onSuccess={invalidate} />
      <ResultadoDialog contrato={resultadoOf} onClose={() => setResultadoOf(null)} onSuccess={invalidate} />

      <ProcessoEditSheet
        contrato={editOf as never}
        onClose={() => setEditOf(null)}
        closers={closers ?? []}
        products={products ?? []}
        canEditAll={canWrite}
        canEditClient={canWrite || (editOf ? getEffectiveStatus(editOf) === 'pendente' : false)}
        canChangeCloser={canWrite}
        canDelete={isGestor}
        canChangeStatus={canWrite}
        onTransition={(row, to) => {
          if (to === 'qualificado') setProtocolarOf(row as Contrato);
          else if (to === 'desqualificado') setDesqualifOf(row as Contrato);
          else if (to === 'exito') setResultadoOf({ ...(row as Contrato), teve_exito: true });
          else if (to === 'sem_exito') setResultadoOf({ ...(row as Contrato), teve_exito: false });
        }}
      />

      <CadastroRetroativoDialog
        open={retroOpen}
        onOpenChange={setRetroOpen}
        divisao={divisao}
      />
    </div>
  );
}


/* -------------------- Action Dialogs -------------------- */

function ProtocolarDialog({ contrato, onClose, onSuccess }: { contrato: Contrato | null; onClose: () => void; onSuccess: () => void }) {
  const [data, setData] = useState('');
  const [tipo, setTipo] = useState<'judicial' | 'administrativo'>('judicial');

  const mut = useMutation({
    mutationFn: async () => {
      if (!contrato) return;
      if (!data) throw new Error('Informe a data do protocolo');
      const { error } = await supabase
        .from('clientes_fechados')
        .update({
          data_protocolo: data,
          protocolado: true,
          tipo_processo: tipo,
          status_qualificacao: 'qualificado',
        })
        .eq('id', contrato.id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success('Contrato protocolado!'); onSuccess(); onClose(); setData(''); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={!!contrato} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="bg-card border-border max-w-md">
        <DialogHeader><DialogTitle>Protocolar — {contrato?.nome_cliente}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div>
            <Label className="text-xs text-muted-foreground">Data do Protocolo</Label>
            <Input type="date" value={data} onChange={(e) => setData(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Tipo</Label>
            <Select value={tipo} onValueChange={(v) => setTipo(v as 'judicial' | 'administrativo')}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="judicial">Judicial</SelectItem>
                <SelectItem value="administrativo">Administrativo</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => mut.mutate()} disabled={mut.isPending}>
            {mut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Confirmar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DesqualificarDialog({ contrato, onClose, onSuccess }: { contrato: Contrato | null; onClose: () => void; onSuccess: () => void }) {
  const [motivo, setMotivo] = useState('');
  const [detalhe, setDetalhe] = useState('');
  const motivosLista = useMotivosDesqualificacao(contrato?.divisao ?? 'advogados');
  const isDiverso = motivo === MOTIVO_DIVERSO;
  const mut = useMutation({
    mutationFn: async () => {
      if (!contrato) return;
      if (!motivo) throw new Error('Selecione o motivo da desqualificação');
      const motivoFinal = isDiverso && detalhe.trim() ? `Motivo diverso: ${detalhe.trim()}` : motivo;
      const { error } = await supabase
        .from('clientes_fechados')
        .update({ status_qualificacao: 'desqualificado', motivo_desqualificacao: motivoFinal })
        .eq('id', contrato.id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success('Contrato desqualificado'); onSuccess(); onClose(); setMotivo(''); setDetalhe(''); },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Dialog open={!!contrato} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="bg-card border-border max-w-md">
        <DialogHeader><DialogTitle>Desqualificar — {contrato?.nome_cliente}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <Label className="text-xs text-muted-foreground">Motivo da desqualificação</Label>
          <Select value={motivo} onValueChange={setMotivo}>
            <SelectTrigger><SelectValue placeholder="Selecione o motivo" /></SelectTrigger>
            <SelectContent>
              {motivosLista.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
            </SelectContent>
          </Select>
          {isDiverso && (
            <Textarea rows={3} value={detalhe} onChange={(e) => setDetalhe(e.target.value)} placeholder="Descreva o motivo..." />
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button variant="destructive" onClick={() => mut.mutate()} disabled={mut.isPending || !motivo}>
            {mut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Desqualificar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DesistenciaDialog({ contrato, onClose, onSuccess }: { contrato: Contrato | null; onClose: () => void; onSuccess: () => void }) {
  const [motivo, setMotivo] = useState('');
  const mut = useMutation({
    mutationFn: async () => {
      if (!contrato) return;
      const { error } = await supabase
        .from('clientes_fechados')
        .update({ status_qualificacao: 'desistencia', motivo_desqualificacao: motivo.trim() || null })
        .eq('id', contrato.id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success('Marcado como desistência'); onSuccess(); onClose(); setMotivo(''); },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Dialog open={!!contrato} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="bg-card border-border max-w-md">
        <DialogHeader><DialogTitle>Desistência — {contrato?.nome_cliente}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <Label className="text-xs text-muted-foreground">Observação (opcional)</Label>
          <Textarea rows={3} value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ex.: cliente parou de responder, desistiu do processo..." />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button className="bg-orange-600 hover:bg-orange-600/90 text-white" onClick={() => mut.mutate()} disabled={mut.isPending}>
            {mut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Marcar desistência'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ResultadoDialog({ contrato, onClose, onSuccess }: { contrato: Contrato | null; onClose: () => void; onSuccess: () => void }) {
  const [exito, setExito] = useState<'sim' | 'nao'>('sim');
  const [valorExito, setValorExito] = useState('');
  const [dataReceb, setDataReceb] = useState('');
  const [valorReceb, setValorReceb] = useState('');
  const [formaReceb, setFormaReceb] = useState<'a_vista' | 'parcelado' | ''>('');

  // sync when contrato changes
  useMemo(() => {
    if (contrato) {
      setExito(contrato.teve_exito === false ? 'nao' : 'sim');
      setValorExito(String(contrato.valor_exito ?? 0));
      setDataReceb(contrato.data_recebimento ?? '');
      setValorReceb(String(contrato.valor_honorarios_recebidos ?? 0));
      setFormaReceb(contrato.forma_recebimento ?? '');
    }
  }, [contrato]);

  const mut = useMutation({
    mutationFn: async () => {
      if (!contrato) return;
      const teve = exito === 'sim';
      const { error } = await supabase
        .from('clientes_fechados')
        .update({
          teve_exito: teve,
          valor_exito: teve ? Number(valorExito) || 0 : 0,
          data_recebimento: teve ? (dataReceb || null) : null,
          valor_honorarios_recebidos: teve ? Number(valorReceb) || 0 : 0,
          forma_recebimento: teve ? (formaReceb || null) : null,
        })
        .eq('id', contrato.id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success('Resultado registrado'); onSuccess(); onClose(); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={!!contrato} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="bg-card border-border max-w-md">
        <DialogHeader><DialogTitle>Registrar resultado — {contrato?.nome_cliente}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div>
            <Label className="text-xs text-muted-foreground">Teve êxito?</Label>
            <Select value={exito} onValueChange={(v) => setExito(v as 'sim' | 'nao')}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="sim">Sim</SelectItem>
                <SelectItem value="nao">Não</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {exito === 'sim' && (
            <>
              <div>
                <Label className="text-xs text-muted-foreground">Valor do Êxito (R$)</Label>
                <Input type="number" step="0.01" value={valorExito} onChange={(e) => setValorExito(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Data de Recebimento dos Honorários</Label>
                <Input type="date" value={dataReceb} onChange={(e) => setDataReceb(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Valor Efetivamente Recebido (R$)</Label>
                <Input type="number" step="0.01" value={valorReceb} onChange={(e) => setValorReceb(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Forma de pagamento</Label>
                <Select value={formaReceb} onValueChange={(v) => setFormaReceb(v as 'a_vista' | 'parcelado')}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="a_vista">À vista</SelectItem>
                    <SelectItem value="parcelado">Parcelado</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground mt-1">No parcelado, informe a data de recebimento da <strong>última parcela</strong> (quitação).</p>
              </div>
            </>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => mut.mutate()} disabled={mut.isPending}>
            {mut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Confirmar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
