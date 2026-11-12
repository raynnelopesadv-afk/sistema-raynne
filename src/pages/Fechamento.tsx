import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, Plus, Pencil, Trash2, Eye, ChevronDown, ChevronRight, FileText, Filter as FilterIcon, History, Info, Copy } from 'lucide-react';
import { Tooltip as UITooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { supabase } from '@/lib/supabase';
import { DivisaoSelector } from '@/components/DivisaoSelector';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { useUserRole } from '@/hooks/useUserRole';
import { usePermissions } from '@/hooks/usePermissions';
import { fetchVendedores } from '@/lib/vendedores';
import { tierPorOrdem } from '@/lib/nivelTier';
import { celebrateSale } from '@/lib/celebrate';
import { useAuth } from '@/contexts/AuthContext';
import { StatusBadge } from '@/components/StatusBadge';
import { ProductMultiFilter } from '@/components/ProductMultiFilter';
import { usePersistentState } from '@/hooks/usePersistentState';
import { ClienteSearchInput } from '@/components/ClienteSearchInput';
import { HighlightMatch } from '@/components/HighlightMatch';
import { matchCliente, useDebounced, maskCPF, isCpfFormatValid, formatCPFDisplay, cpfDigitos, cpfValido } from '@/lib/cliente-search';
import { Checkbox } from '@/components/ui/checkbox';
import { ufFromTelefone, UF_LIST } from '@/lib/ddd-uf';
import { formatDuracao, duracaoEntre } from '@/lib/duracao';
import { getEffectiveStatus, type EffectiveStatus } from '@/lib/contrato-status';
import { FechamentoDetailSheet } from '@/components/FechamentoDetailSheet';
import { ViewToggle, type ViewMode } from '@/components/ViewToggle';
import { KanbanBoard } from '@/components/KanbanBoard';
import { OrigemMetaFields } from '@/components/OrigemMetaFields';
import { PeriodSelector, detectPeriodKind, parseRangeToken } from '@/components/PeriodSelector';
import { CadastroRetroativoDialog } from '@/components/CadastroRetroativoDialog';
import { RetroBadge } from '@/components/RetroBadge';
import { dataComissionada } from '@/lib/travas';
import { SolicitarAlteracaoDialog } from '@/components/SolicitarAlteracaoDialog';
import { Textarea } from '@/components/ui/textarea';

type Divisao = 'advogados' | 'educacao';
type ClienteStatus = 'pendente' | 'qualificado' | 'desqualificado';

interface ClienteFechado {
  id: string;
  nome_cliente: string;
  cpf: string | null;
  telefone: string | null;
  product_id: string | null;
  closer_id: string | null;
  valor: number;
  data_fechamento: string | null;
  fechado_em: string | null;
  status_qualificacao: ClienteStatus;
  protocolado: boolean | null;
  teve_exito: boolean | null;
  divisao: Divisao;
  cadastro_retroativo?: boolean | null;
  data_cadastro_retroativo?: string | null;
  variante?: string | null;
  data_pagamento_confirmado?: string | null;
  fechado_por_ia?: boolean | null;
  incompleto?: boolean | null;
  conta_fechamento?: boolean | null;
  origem_lead?: string | null;
  uf?: string | null;
  data_criacao_lead?: string | null;
  criacao_lead_em?: string | null;
}

function formatCurrency(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0 });
}

function SummaryCard({ label, value, sub, accent, info }: { label: string; value: string; sub?: string; accent: string; info?: string }) {
  return (
    <div className="rounded-2xl bg-card border border-border p-6 shadow-sm">
      <div className="flex items-center gap-1.5">
        <p className="text-xs text-muted-foreground uppercase tracking-wide">{label}</p>
        {info && (
          <UITooltip delayDuration={150}>
            <TooltipTrigger asChild>
              <span className="cursor-help text-muted-foreground/60 hover:text-muted-foreground shrink-0" aria-label={`O que é ${label}?`}>
                <Info className="w-3.5 h-3.5" />
              </span>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-[280px] text-xs leading-relaxed">{info}</TooltipContent>
          </UITooltip>
        )}
      </div>
      <p className="text-3xl font-bold mt-2" style={{ color: accent }}>{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
    </div>
  );
}

/** Ciclo de venda: da entrada do lead até o fechamento (usa o horário quando existir). */
function cicloDoContrato(c: { criacao_lead_em?: string | null; data_criacao_lead?: string | null; fechado_em?: string | null; data_fechamento?: string | null }): number | null {
  return duracaoEntre(c.criacao_lead_em ?? c.data_criacao_lead, c.fechado_em ?? c.data_fechamento);
}

const ORIGEM_LABEL: Record<string, string> = { meta_ads: 'Meta Ads', google_ads: 'Google Ads', indicacao: 'Indicação', organico: 'Orgânico', outro: 'Outro' };
function origemLabel(v?: string | null): string { return ORIGEM_LABEL[v ?? ''] ?? (v || '—'); }

function CopyBtn({ value, label }: { value?: string | null; label?: string }) {
  if (!value) return null;
  return (
    <button
      type="button"
      title="Copiar"
      onClick={(e) => { e.stopPropagation(); navigator.clipboard?.writeText(value); toast.success(`${label ?? 'Copiado'}!`); }}
      className="ml-1.5 align-middle text-muted-foreground/50 hover:text-primary"
    >
      <Copy className="w-3.5 h-3.5 inline" />
    </button>
  );
}

/** Campos que o time precisa preencher para o fechamento deixar de estar incompleto. */
function camposFaltando(c: { cpf?: string | null; telefone?: string | null; closer_id?: string | null; product_id?: string | null; valor?: number | null }): string[] {
  const f: string[] = [];
  if (!c.cpf) f.push('CPF');
  if (!c.telefone) f.push('Telefone');
  if (!c.closer_id) f.push('Closer');
  if (!c.product_id) f.push('Produto');
  if (!(Number(c.valor) > 0)) f.push('Valor');
  return f;
}

export default function Fechamento() {
  const [divisao, setDivisao] = useState<Divisao>('advogados');
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ClienteFechado | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [closerFilter, setCloserFilter] = usePersistentState<string>('fechamento.closer', 'all');
  const [productSelected, setProductSelected] = usePersistentState<string[]>('fechamento.products', []);
  const [mesRef, setMesRef] = usePersistentState<string>('fechamento.mes', `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`);
  const [statusFilter, setStatusFilter] = usePersistentState<EffectiveStatus | 'all'>('fechamento.status', 'all');
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounced(search, 300);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [detail, setDetail] = useState<ClienteFechado | null>(null);
  const [view, setView] = usePersistentState<ViewMode>('fechamento.view', 'list');
  const [hideEmptyCols, setHideEmptyCols] = usePersistentState<boolean>('fechamento.hideEmptyCols', false);
  const [addingCloser, setAddingCloser] = useState(false);
  const [addingProduto, setAddingProduto] = useState(false);
  const [novoCloserEmail, setNovoCloserEmail] = useState('');
  const [novoProduto, setNovoProduto] = useState({ nome: '', valor: '' });
  const [novoCloserNome, setNovoCloserNome] = useState('');
  const [retroOpen, setRetroOpen] = useState(false);
  const [dupInfo, setDupInfo] = useState<{ payload: Record<string, unknown>; match: { nome_cliente: string; data_fechamento: string | null } } | null>(null);
  const [dupMotivo, setDupMotivo] = useState('');
  const [solicitarOpen, setSolicitarOpen] = useState(false);
  const [selIds, setSelIds] = useState<Set<string>>(new Set());
  const [excluirInfo, setExcluirInfo] = useState<ClienteFechado | null>(null);
  const [excluirMotivo, setExcluirMotivo] = useState('');
  const toggleSel = (id: string) => setSelIds(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const qc = useQueryClient();
  const { canEditQualificacao, isGestor } = useUserRole();
  const { can } = usePermissions();
  const canLancar = can('lancar_venda');
  const canCadastrarVenda = can('editar_pendentes');
  const { user } = useAuth();

  const { data, isLoading } = useQuery({
    queryKey: ['fechamento', divisao],
    queryFn: async () => {
      const { data, error } = await supabase.from('clientes_fechados').select('*').eq('divisao', divisao).order('data_fechamento', { ascending: false });
      if (error) throw error;
      return (data ?? []) as ClienteFechado[];
    },
  });

  const { data: closers } = useQuery({ queryKey: ['vendedores-all'], queryFn: async () => (await fetchVendedores()).map(v => ({ id: v.id, nome: v.nome, divisao: v.divisao })) });
  const { data: closersMeta } = useQuery({
    queryKey: ['closers-meta-fotos'],
    queryFn: async () => {
      const [{ data: cs }, { data: lv }] = await Promise.all([
        supabase.from('closers').select('id, foto_url, career_level_id'),
        supabase.from('career_levels').select('id, ordem'),
      ]);
      const ordemById = new Map((lv ?? []).map((l: { id: string; ordem: number }) => [l.id, l.ordem]));
      const map: Record<string, { fotoUrl: string | null; ordem: number | null }> = {};
      (cs ?? []).forEach((c: { id: string; foto_url: string | null; career_level_id: string | null }) => {
        map[c.id] = { fotoUrl: c.foto_url, ordem: c.career_level_id ? (ordemById.get(c.career_level_id) ?? null) : null };
      });
      return map;
    },
  });
  const { data: products } = useQuery({ queryKey: ['products', divisao], queryFn: async () => { const { data } = await supabase.from('products').select('id, nome, valor, variantes, variantes_config, sku, tem_honorarios_iniciais').eq('divisao', divisao).eq('ativo', true).order('nome'); return data ?? []; } });

  const closersFiltered = (closers ?? []).filter(c => !c.divisao || c.divisao === divisao);

  const closerMap = Object.fromEntries((closers ?? []).map(c => [c.id, c.nome]));
  const productMap = Object.fromEntries((products ?? []).map(p => [p.id, p.nome]));
  const productValorMap = Object.fromEntries((products ?? []).map(p => [p.id, Number(p.valor)]));
  const productVariantesMap = Object.fromEntries((products ?? []).map(p => [p.id, ((p as { variantes?: string[] }).variantes ?? [])]));
  const productVarCfgMap = Object.fromEntries((products ?? []).map(p => [p.id, ((p as unknown as { variantes_config?: { nome: string; valor: number; sku: string }[] }).variantes_config ?? [])]));
  const variantesDoProduto: string[] = form.product_id ? (productVariantesMap[form.product_id] ?? []) : [];
  const productHonorariosMap = Object.fromEntries((products ?? []).map(p => [p.id, !!(p as { tem_honorarios_iniciais?: boolean }).tem_honorarios_iniciais]));
  const produtoTemHonorarios: boolean = form.product_id ? (productHonorariosMap[form.product_id] ?? false) : false;

  const save = useMutation({
    mutationFn: async () => {
      if (!form.nome_cliente?.trim()) throw new Error('Informe o nome do cliente');
      if (!form.closer_id) throw new Error('Selecione o closer');
      if (!form.product_id) throw new Error('Selecione o produto');
      const nowIso = new Date().toISOString();
      const fechadoEmIso = form.fechado_em ? new Date(form.fechado_em).toISOString() : nowIso;
      const dataFech = form.fechado_em ? form.fechado_em.slice(0, 10) : (form.data_fechamento || nowIso.slice(0, 10));
      const basePayload = {
        nome_cliente: form.nome_cliente,
        cpf: cpfDigitos(form.cpf) || null,   // sempre só dígitos, para não misturar formatos
        telefone: form.telefone?.trim() || null,
        closer_id: form.closer_id || null,
        product_id: form.product_id || null,
        valor: Number(form.valor) || 0,
        data_fechamento: dataFech,
        fechado_em: fechadoEmIso,
        divisao,
        // atribuição de origem Meta (IDs reais) — alimenta o BI de tráfego
        meta_campaign_id: form.meta_campaign_id || null,
        meta_adset_id: form.meta_adset_id || null,
        meta_ad_id: form.meta_ad_id || null,
        // comissionamento: variante do produto e confirmação de pagamento
        variante: form.variante || null,
        data_pagamento_confirmado: form.data_pagamento_confirmado || null,
        fechado_por_ia: form.fechado_por_ia === 'sim',
        origem_lead: form.origem_lead || 'meta_ads',
        uf: form.uf || ufFromTelefone(form.telefone) || null,
      };
      const prodVariantes: string[] = form.product_id ? (productVariantesMap[form.product_id] ?? []) : [];
      if (prodVariantes.length > 0 && !form.variante) throw new Error('Selecione a variante do produto');
      if (editing) {
        const completo = camposFaltando(basePayload).length === 0;
        const eraIncompleto = !!(editing as { incompleto?: boolean }).incompleto;
        const base2 = { ...basePayload, incompleto: !completo };
        const updatePayload = canEditQualificacao
          ? { ...base2, status_qualificacao: (form.status_qualificacao || 'pendente') as ClienteStatus }
          : base2;
        const { error } = await supabase.from('clientes_fechados').update(updatePayload as never).eq('id', editing.id);
        if (error) throw error;
        return { virouCompleto: eraIncompleto && completo };
      } else {
        // dedo duro: cliente já na base com o mesmo produto vira solicitação ao gestor
        const cpfDigits = (form.cpf || '').replace(/\D/g, '');
        let dupQuery = supabase
          .from('clientes_fechados')
          .select('id, nome_cliente, cpf, data_fechamento, status_qualificacao')
          .eq('divisao', divisao)
          .eq('product_id', form.product_id)
          .neq('status_qualificacao', 'desqualificado');
        dupQuery = cpfDigits.length >= 11
          ? dupQuery.or(`cpf.eq.${cpfDigits},nome_cliente.ilike.${form.nome_cliente.trim()}`)
          : dupQuery.ilike('nome_cliente', form.nome_cliente.trim());
        const { data: dups } = await dupQuery.limit(1);
        if (dups && dups.length > 0) {
          return { dup: { payload: { ...basePayload }, match: dups[0] } };
        }
        const { error } = await supabase.from('clientes_fechados').insert({ ...basePayload, status_qualificacao: 'pendente', incompleto: camposFaltando(basePayload).length > 0 } as never);
        if (error) throw error;
      }
      return {};
    },
    onSuccess: (result: { dup?: { payload: Record<string, unknown>; match: { nome_cliente: string; data_fechamento: string | null } }; virouCompleto?: boolean } | undefined) => {
      if (result?.dup) {
        setDupMotivo('');
        setDupInfo(result.dup);
        return;
      }
      qc.invalidateQueries({ queryKey: ['fechamento', divisao] });
      qc.invalidateQueries({ queryKey: ['pendencias-espelhamento'] });
      setOpen(false);
      toast.success(result?.virouCompleto ? 'Pendência resolvida! 🎉' : editing ? 'Atualizado!' : 'Venda fechada! 🎉');
      if (result?.virouCompleto) {
        celebrateSale();
        window.dispatchEvent(new CustomEvent('bi:venda-celebrar', { detail: {
          closer_id: form.closer_id || null,
          product_id: form.product_id || null,
          valor: Number(form.valor) || 0,
          fechado_por_ia: form.fechado_por_ia === 'sim',
        } }));
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const enviarDuplicado = useMutation({
    mutationFn: async () => {
      if (!dupInfo) return;
      if (dupMotivo.trim().length < 10) throw new Error('Descreva o motivo (mínimo 10 caracteres)');
      const { error } = await supabase.from('solicitacoes_alteracao').insert({
        tipo: 'novo_contrato_duplicado',
        contrato_id: null,
        solicitante: user!.id,
        motivo: dupMotivo.trim(),
        payload: JSON.parse(JSON.stringify({
          contrato: dupInfo.payload,
          duplicado_de: `${dupInfo.match.nome_cliente} (fechado em ${dupInfo.match.data_fechamento ? new Date(dupInfo.match.data_fechamento + 'T12:00:00').toLocaleDateString('pt-BR') : '—'})`,
        })),
      });
      if (error) throw error;
    },
    onSuccess: () => { setDupInfo(null); setOpen(false); toast.success('Solicitação enviada ao gestor'); },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from('clientes_fechados').delete().eq('id', id); if (error) throw error; },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['fechamento', divisao] }); qc.invalidateQueries({ queryKey: ['pendencias-espelhamento'] }); toast.success('Excluído!'); },
    onError: (e: Error) => toast.error(e.message),
  });

  const removeMany = useMutation({
    mutationFn: async (ids: string[]) => { const { error } = await supabase.from('clientes_fechados').delete().in('id', ids); if (error) throw error; },
    onSuccess: (_d, ids) => { qc.invalidateQueries({ queryKey: ['fechamento', divisao] }); qc.invalidateQueries({ queryKey: ['pendencias-espelhamento'] }); setSelIds(new Set()); toast.success(`${ids.length} venda(s) excluída(s)!`); },
    onError: (e: Error) => toast.error(e.message),
  });

  const solicitarExclusao = useMutation({
    mutationFn: async () => {
      if (!excluirInfo) return;
      if (excluirMotivo.trim().length < 10) throw new Error('Descreva o motivo (mínimo 10 caracteres)');
      const { error } = await supabase.from('solicitacoes_alteracao').insert({
        tipo: 'excluir_contrato',
        contrato_id: excluirInfo.id,
        solicitante: user!.id,
        motivo: excluirMotivo.trim(),
        payload: { nome_cliente: excluirInfo.nome_cliente },
      } as never);
      if (error) throw error;
    },
    onSuccess: () => { setExcluirInfo(null); setExcluirMotivo(''); toast.success('Solicitação de exclusão enviada ao gestor.'); },
    onError: (e: Error) => toast.error(e.message),
  });

  const addProduto = useMutation({
    mutationFn: async () => {
      const nome = novoProduto.nome.trim();
      if (!nome) throw new Error('Informe o nome do produto');
      const { data, error } = await supabase
        .from('products')
        .insert({ nome, divisao, ativo: true, valor: Number(novoProduto.valor.replace(',', '.')) || 0 } as never)
        .select('id, nome, valor')
        .single();
      if (error) throw error;
      return data as { id: string; nome: string; valor: number };
    },
    onSuccess: (novo) => {
      qc.invalidateQueries({ queryKey: ['products'] });
      setForm(f => ({ ...f, product_id: novo.id, variante: '', valor: String(novo.valor ?? '') }));
      setAddingProduto(false);
      setNovoProduto({ nome: '', valor: '' });
      toast.success(`Produto "${novo.nome}" cadastrado`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const PRODUTOS_PADRAO: Record<string, string[]> = {
    advogados: ['BPC/LOAS', 'Auxílio-acidente', 'Aposentadoria por incapacidade', 'Auxílio por incapacidade temporária (auxílio-doença)', 'Salário-maternidade', 'Aposentadoria por idade', 'Pensão por morte'],
    educacao: ['Atraso de voo', 'Cancelamento de voo', 'Extravio de bagagem', 'Overbooking'],
  };
  const addPadrao = useMutation({
    mutationFn: async () => {
      const lista = PRODUTOS_PADRAO[divisao] ?? [];
      const { error } = await supabase.from('products').insert(lista.map(nome => ({ nome, divisao, ativo: true, valor: 0 })) as never);
      if (error) throw error;
      return lista.length;
    },
    onSuccess: (n) => {
      qc.invalidateQueries({ queryKey: ['products'] });
      toast.success(`${n} produtos cadastrados. Ajuste os valores em Menu → Produtos.`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const addCloser = useMutation({
    mutationFn: async (nome: string) => {
      const { data, error } = await supabase
        .from('closers')
        .insert({ nome, divisao, ativo: true, ...(novoCloserEmail.trim() ? { email: novoCloserEmail.trim().toLowerCase() } : {}) } as never)
        .select('id, nome, divisao')
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (novo) => {
      qc.invalidateQueries({ queryKey: ['vendedores-all'] });
      setForm(f => ({ ...f, closer_id: novo.id }));
      setAddingCloser(false);
      setNovoCloserNome('');
      setNovoCloserEmail('');
      toast.success(`Closer "${novo.nome}" adicionado`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function openNew() {
    setEditing(null);
    const isCloserUser = (closers ?? []).some(c => c.id === user?.id);
    const agora = new Date();
    const fechadoEmLocal = new Date(agora.getTime() - agora.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    setForm({ nome_cliente: '', cpf: '', telefone: '', closer_id: isCloserUser ? user!.id : '', product_id: '', valor: '', fechado_em: fechadoEmLocal, data_fechamento: '', status_qualificacao: 'pendente', meta_campaign_id: '', meta_adset_id: '', meta_ad_id: '', variante: '', data_pagamento_confirmado: '', fechado_por_ia: '', origem_lead: 'meta_ads', uf: '' });
    setOpen(true);
  }
  function openEdit(c: ClienteFechado) {
    setEditing(c);
    const fechadoLocal = c.fechado_em
      ? (() => { const d = new Date(c.fechado_em!); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0,16); })()
      : '';
    setForm({
      nome_cliente: c.nome_cliente, cpf: c.cpf ?? '', telefone: c.telefone ?? '',
      closer_id: c.closer_id ?? '', product_id: c.product_id ?? '',
      valor: String(c.valor), data_fechamento: c.data_fechamento ?? '', origem_lead: c.origem_lead ?? 'meta_ads', uf: c.uf ?? '',
      fechado_em: fechadoLocal,
      status_qualificacao: c.status_qualificacao,
      meta_campaign_id: (c as unknown as Record<string, string | null>).meta_campaign_id ?? '',
      meta_adset_id: (c as unknown as Record<string, string | null>).meta_adset_id ?? '',
      meta_ad_id: (c as unknown as Record<string, string | null>).meta_ad_id ?? '',
      variante: c.variante ?? '',
      data_pagamento_confirmado: c.data_pagamento_confirmado ?? '',
      fechado_por_ia: c.fechado_por_ia ? 'sim' : '',
    });
    setOpen(true);
  }

  const statusColor: Record<string, string> = { pendente: 'bg-warning/20 text-warning', qualificado: 'bg-success/20 text-success', desqualificado: 'bg-destructive/20 text-destructive' };

  // ===== Filtragem + agregações =====
  const productSet = useMemo(() => new Set(productSelected), [productSelected]);
  const filtered = useMemo(() => {
    const kind = detectPeriodKind(mesRef);
    const range = kind === 'range' ? parseRangeToken(mesRef) : null;
    return (data ?? []).filter(c => {
      if (kind !== 'all') {
        const dRaw = c.fechado_em ?? c.data_fechamento ?? '';
        if (!dRaw) return false;
        if (kind === 'month') {
          if (dRaw.slice(0, 7) !== mesRef) return false;
        } else if (kind === 'year') {
          if (dRaw.slice(0, 4) !== mesRef) return false;
        } else if (kind === 'range' && range) {
          const day = dRaw.slice(0, 10);
          if (day < range.start || day > range.end) return false;
        }
      }
      if (productSet.size > 0 && (!c.product_id || !productSet.has(c.product_id))) return false;
      if (closerFilter === '__none__') { if (c.closer_id) return false; }
      else if (closerFilter !== 'all' && c.closer_id !== closerFilter) return false;
      if (statusFilter !== 'all' && getEffectiveStatus(c) !== statusFilter) return false;
      if (debouncedSearch && !matchCliente(c, debouncedSearch)) return false;
      return true;
    });
  }, [data, mesRef, productSet, closerFilter, statusFilter, debouncedSearch]);

  const totals = useMemo(() => {
    let total = 0, valor = 0, pendentes = 0, qualificados = 0;
    // desqualificado/desistência no mesmo mês do fechamento não conta para os KPIs
    filtered.forEach(c => {
      if (c.conta_fechamento === false) return; // saiu no mesmo mês do fechamento
      total += 1;
      valor += Number(c.valor) || 0;
      const eff = getEffectiveStatus(c);
      if (eff === 'pendente') pendentes += 1;
      if (eff === 'qualificado' || eff === 'exito' || eff === 'sem_exito') qualificados += 1;
    });
    return { total, valor, pendentes, qualificados, taxaQual: total ? (qualificados / total) * 100 : 0 };
  }, [filtered]);

  const groupEntries = useMemo(() => {
    const groups = new Map<string, ClienteFechado[]>();
    filtered.forEach(c => {
      const key = c.closer_id ?? '__none__';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(c);
    });
    // incompletos (pendências) primeiro dentro de cada grupo
    for (const rows of groups.values()) {
      rows.sort((x, y) => Number(!!y.incompleto) - Number(!!x.incompleto));
    }
    return Array.from(groups.entries()).sort((a, b) => {
      // 1) grupos com pendência vêm primeiro (prioridade)
      const ap = a[1].some(r => r.incompleto) ? 1 : 0;
      const bp = b[1].some(r => r.incompleto) ? 1 : 0;
      if (ap !== bp) return bp - ap;
      // 2) "Sem closer" antes dos demais
      const an = a[0] === '__none__' ? 1 : 0;
      const bn = b[0] === '__none__' ? 1 : 0;
      if (an !== bn) return bn - an;
      // 3) alfabético
      const na = closerMap[a[0]] ?? 'Sem closer';
      const nb = closerMap[b[0]] ?? 'Sem closer';
      return na.localeCompare(nb);
    });
  }, [filtered, closerMap]);

  const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map(s => s[0]?.toUpperCase()).join('') || '?';

  const CloserAvatar = ({ closerId, size = 24 }: { closerId: string | null; size?: number }) => {
    const nome = closerId ? (closerMap[closerId] ?? 'Sem closer') : 'Sem closer';
    const meta = closerId ? closersMeta?.[closerId] : undefined;
    const tier = tierPorOrdem(meta?.ordem ?? null);
    const ring = tier ? tier.cor : '#6B7280';
    return (
      <span
        title={`Closer: ${nome.replace(/\[.*?\]\s*/g, '')}`}
        className="inline-flex items-center justify-center rounded-full overflow-hidden shrink-0 bg-card font-semibold"
        style={{ width: size, height: size, border: `2px solid ${ring}`, fontSize: size * 0.38, color: tier?.cor ?? '#6B7076' }}
      >
        {meta?.fotoUrl
          ? <img src={meta.fotoUrl} alt={nome} className="w-full h-full object-cover" />
          : initials(nome.replace(/\[.*?\]\s*/g, ''))}
      </span>
    );
  };
  const fmtDateCompact = (s: string | null) => {
    if (!s) return '—';
    return new Date(s).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Fechamento</h1>
          <p className="text-sm text-muted-foreground mt-1">Lançamento e acompanhamento de contratos</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canEditQualificacao && (
            <Button
              onClick={() => setRetroOpen(true)}
              variant="outline"
              className="gap-2 border-primary/60 text-primary hover:bg-primary/10 hover:text-primary"
            >
              <History className="w-4 h-4" /> Cadastrar Fechamento Retroativo
            </Button>
          )}
          {canLancar && (
            <Button onClick={openNew} className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90">
              <Plus className="w-4 h-4" /> Novo Fechamento
            </Button>
          )}
        </div>
      </div>
      <DivisaoSelector value={divisao} onChange={setDivisao} />

      {/* Barra consolidada de filtros */}
      <div className="rounded-xl bg-card border border-border p-4 space-y-3">
        {/* Linha 1: busca (larga, ocupa a linha em telas pequenas) + visão à direita */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex-1 min-w-[240px]"><ClienteSearchInput value={search} onChange={setSearch} /></div>
          <div className="flex items-center gap-3 shrink-0">
            <ViewToggle value={view} onChange={setView} />
            {view === 'kanban' && (
              <label className="flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-xs text-muted-foreground cursor-pointer">
                <input type="checkbox" checked={hideEmptyCols} onChange={(e) => setHideEmptyCols(e.target.checked)} className="accent-[#F5C518]" />
                Ocultar vazias
              </label>
            )}
          </div>
        </div>
        {/* Linha 2: filtros — quebram naturalmente, nada embaixo da busca */}
        <div className="flex flex-wrap items-center gap-2">
          <PeriodSelector value={mesRef} onChange={setMesRef} />
          <Select value={closerFilter} onValueChange={setCloserFilter}>
            <SelectTrigger className="w-[200px]"><SelectValue placeholder="Closer" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os closers</SelectItem>
              {closersFiltered.map(c => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
              <SelectItem value="__none__">Sem closer</SelectItem>
            </SelectContent>
          </Select>
          <ProductMultiFilter
            products={(products ?? []).map(p => ({ id: p.id, nome: p.nome }))}
            selected={productSelected}
            onChange={setProductSelected}
          />
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as EffectiveStatus | 'all')}>
            <SelectTrigger className="w-[170px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos status</SelectItem>
              <SelectItem value="pendente">Pendente</SelectItem>
              <SelectItem value="qualificado">Protocolo</SelectItem>
              <SelectItem value="desqualificado">Desqualificado</SelectItem>
              <SelectItem value="exito">Êxito</SelectItem>
              <SelectItem value="sem_exito">Sem êxito</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <p className="text-[11px] text-muted-foreground flex items-center gap-2">
          <FilterIcon className="w-3 h-3" /> <kbd className="px-1.5 py-0.5 rounded bg-muted text-[10px]">Ctrl</kbd>+<kbd className="px-1.5 py-0.5 rounded bg-muted text-[10px]">K</kbd> foca · <kbd className="px-1.5 py-0.5 rounded bg-muted text-[10px]">Esc</kbd> limpa
        </p>
      </div>

      {isGestor && selIds.size > 0 && (
        <div className="fixed bottom-24 md:bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 rounded-xl bg-card border border-red-500/40 shadow-lg px-4 py-2 flex-wrap justify-center">
          <span className="text-sm text-foreground">{selIds.size} selecionada(s)</span>
          <Button variant="ghost" size="sm" onClick={() => setSelIds(new Set(filtered.map(c => c.id)))}>Selecionar todos ({filtered.length})</Button>
          <Button variant="ghost" size="sm" onClick={() => setSelIds(new Set())}>Limpar</Button>
          <Button variant="destructive" size="sm" disabled={removeMany.isPending} onClick={() => { if (window.confirm(`Excluir ${selIds.size} venda(s)? Esta ação não pode ser desfeita.`)) removeMany.mutate([...selIds]); }}>
            {removeMany.isPending && <Loader2 className="w-4 h-4 mr-1 animate-spin" />} Excluir selecionadas
          </Button>
        </div>
      )}

      {/* Cards de resumo */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <SummaryCard label="Fechamentos" value={String(totals.total)} accent="#00BCD4" info="Contratos fechados no período e filtros selecionados." />
        <SummaryCard label="Valor total" value={formatCurrency(totals.valor)} accent="#B8892B" info="Soma do valor dos contratos listados." />
        <SummaryCard label="Pendentes de protocolo" value={String(totals.pendentes)} accent="#F59E0B" info="Contratos fechados que ainda não foram protocolados pelo time técnico." />
        <SummaryCard label="Protocolados" value={String(totals.qualificados)} sub={`Taxa ${totals.taxaQual.toFixed(1)}%`} accent="#00BCD4" info="Contratos que avançaram do pendente (protocolados ou com resultado). A taxa é sobre o total listado." />
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl bg-card border border-border p-12 text-center space-y-3">
          <FileText className="w-12 h-12 mx-auto text-muted-foreground/50" />
          <p className="text-foreground text-lg font-medium">
            {debouncedSearch ? `Nenhum processo encontrado para "${debouncedSearch}"` : 'Nenhum fechamento encontrado'}
          </p>
          <p className="text-sm text-muted-foreground">Ajuste os filtros ou clique em “+ Novo Fechamento” para começar</p>
          {canLancar && <Button onClick={openNew} className="gap-2 mt-2"><Plus className="w-4 h-4" /> Novo Fechamento</Button>}
        </div>
      ) : view === 'kanban' ? (
        <KanbanBoard
          rows={filtered}
          closerMap={closerMap}
          productMap={productMap}
          canDrag={false}
          variant="fechamento"
          highlightQuery={debouncedSearch}
          hideEmpty={hideEmptyCols}
          onCardClick={(c) => setDetail(c)}
        />
      ) : (
        <div className="space-y-4">
          {groupEntries.map(([closerId, rows]) => {
            const totalGrupo = rows.reduce((s, r) => s + (Number(r.valor) || 0), 0);
            const qual = rows.filter(r => { const e = getEffectiveStatus(r); return e === 'qualificado' || e === 'exito' || e === 'sem_exito'; }).length;
            const pend = rows.filter(r => getEffectiveStatus(r) === 'pendente').length;
            const isCollapsed = !!collapsed[closerId];
            const nome = closerMap[closerId] ?? 'Sem closer';
            const pct = rows.length ? (qual / rows.length) * 100 : 0;
            return (
              <div key={closerId} className="rounded-2xl bg-card border border-border overflow-hidden">
                <button
                  type="button"
                  onClick={() => setCollapsed(s => ({ ...s, [closerId]: !s[closerId] }))}
                  className="w-full flex items-center justify-between px-5 py-4 hover:bg-white/[0.02] transition-colors text-left"
                >
                  <div className="flex items-center gap-3">
                    {isCollapsed ? <ChevronRight className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                    <CloserAvatar closerId={closerId} size={40} />
                    <div>
                      <p className="text-lg font-semibold text-foreground">{nome}</p>
                      <p className="text-xs text-muted-foreground">{rows.length} fechamento{rows.length !== 1 ? 's' : ''} · {qual} qualificado{qual !== 1 ? 's' : ''} · {pend} pendente{pend !== 1 ? 's' : ''}</p>
                    </div>
                  </div>
                  <p className="text-2xl font-bold text-primary">{formatCurrency(totalGrupo)}</p>
                </button>
                <div className="h-1 bg-white/[0.04]">
                  <div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} />
                </div>
                {!isCollapsed && (
                  <div className="overflow-x-auto hidden md:block">
                    <Table>
                      <TableHeader>
                        <TableRow className="border-b border-gray-800">
                          {isGestor && <TableHead className="w-8" />}
                          <TableHead>Cliente</TableHead>
                          <TableHead>CPF</TableHead>
                          <TableHead>Telefone</TableHead>
                          <TableHead>Produto</TableHead>
                          <TableHead>Origem</TableHead>
                          <TableHead className="text-right">Valor</TableHead>
                          <TableHead>Data</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead className="text-right">Ações</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {rows.map(c => (
                          <TableRow
                            key={c.id}
                            className={`border-b border-gray-800 hover:bg-secondary/50 cursor-pointer ${c.incompleto ? 'bg-red-500/[0.07]' : ''}`}
                            onClick={(e) => {
                              if ((e.target as HTMLElement).closest('button')) return;
                              setDetail(c);
                            }}
                          >
                            {isGestor && (
                              <TableCell className="py-4" onClick={(e) => e.stopPropagation()}>
                                <Checkbox checked={selIds.has(c.id)} onCheckedChange={() => toggleSel(c.id)} />
                              </TableCell>
                            )}
                            <TableCell className={`py-4 font-medium text-foreground ${c.incompleto ? 'border-l-2 border-l-red-500' : c.cadastro_retroativo ? 'border-l-2 border-l-[#6B7280]' : ''}`}>
                              <div className="flex flex-col gap-1">
                                <span className="inline-flex items-center gap-1.5">
                                  <CloserAvatar closerId={c.closer_id} />
                                  {c.cadastro_retroativo && <RetroBadge registradoEm={c.data_cadastro_retroativo ?? null} />}
                                  {c.fechado_por_ia && <span className="inline-flex px-1.5 py-0.5 rounded-full text-[10px] bg-purple-500/15 text-purple-400" title="Fechamento por IA — comissão do fechamento sai junto com o protocolo">🤖 IA</span>}
                                  <HighlightMatch text={c.nome_cliente} query={debouncedSearch} field="name" />
                                </span>
                                {c.incompleto && (
                                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-red-500/15 text-red-400 border border-red-500/40 w-fit" title="Faltam dados — este fechamento não entra na comissão até ser completado">
                                    ⚠ Falta: {camposFaltando(c).join(', ')}
                                  </span>
                                )}
                                {c.conta_fechamento === false && (
                                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-muted text-muted-foreground border border-border w-fit" title="Desqualificado/desistência no mesmo mês do fechamento — não conta como fechamento para nenhum indicador">
                                    não computado
                                  </span>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="py-4 font-mono text-sm text-muted-foreground whitespace-nowrap">
                              {c.cpf ? <><HighlightMatch text={formatCPFDisplay(c.cpf)} query={debouncedSearch} field="cpf" />{!cpfValido(c.cpf) && <span className="ml-1 text-warning" title="CPF com quantidade de dígitos inválida ou dígito verificador incorreto — confira na origem">⚠</span>}<CopyBtn value={formatCPFDisplay(c.cpf)} label="CPF copiado" /></> : '—'}
                            </TableCell>
                            <TableCell className="py-4 text-muted-foreground whitespace-nowrap">{c.telefone ? <>{c.telefone}{(c.uf || ufFromTelefone(c.telefone)) && <span className="ml-1.5 text-[10px] px-1 py-0.5 rounded bg-primary/10 text-primary align-middle">{c.uf || ufFromTelefone(c.telefone)}</span>}<CopyBtn value={c.telefone} label="Telefone copiado" /></> : '—'}</TableCell>
                            <TableCell className="py-4 whitespace-nowrap">{productMap[c.product_id ?? ''] ?? '—'}</TableCell>
                            <TableCell className="py-4 text-xs text-muted-foreground whitespace-nowrap">{origemLabel(c.origem_lead)}</TableCell>
                            <TableCell className="py-4 text-right font-semibold text-primary">{formatCurrency(Number(c.valor) || 0)}</TableCell>
                            <TableCell className="py-4 text-xs whitespace-nowrap">
                              <div className="flex flex-col gap-0.5">
                                <span className="text-muted-foreground" title="Fechamento">
                                  <span className="text-emerald-400 mr-1">●</span>{fmtDateCompact(c.fechado_em ?? c.data_fechamento)}
                                </span>
                                {(c.criacao_lead_em || c.data_criacao_lead) && (
                                  <span className="text-muted-foreground/70 text-[11px]" title="Entrada do lead">
                                    <span className="text-blue-400 mr-1">●</span>{fmtDateCompact(c.criacao_lead_em ?? c.data_criacao_lead!)}
                                    {(() => {
                                      const ms = cicloDoContrato(c);
                                      return ms === null ? null : (
                                        <span className="ml-1.5 px-1 py-0.5 rounded bg-primary/10 text-primary text-[10px]" title="Tempo da entrada até o fechamento">
                                          {formatDuracao(ms)}
                                        </span>
                                      );
                                    })()}
                                  </span>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="py-4"><StatusBadge contrato={c} /></TableCell>
                            <TableCell className="py-4 text-right">
                              <div className="flex justify-end gap-3">
                                <Button variant="ghost" size="icon" className="h-8 w-8" title="Ver detalhes" onClick={() => setDetail(c)}>
                                  <Eye className="w-4 h-4" />
                                </Button>
                                {(canCadastrarVenda || canEditQualificacao) && c.status_qualificacao === 'pendente' && (
                                  <Button variant="ghost" size="icon" className="h-8 w-8" title="Editar" onClick={() => openEdit(c)}>
                                    <Pencil className="w-4 h-4" />
                                  </Button>
                                )}
                                {(isGestor || (canCadastrarVenda && c.status_qualificacao === 'pendente')) && (
                                  <Button variant="ghost" size="icon" className="h-8 w-8" title={isGestor ? 'Excluir' : 'Solicitar exclusão'} onClick={() => (isGestor ? remove.mutate(c.id) : setExcluirInfo(c))}>
                                    <Trash2 className="w-4 h-4 text-destructive" />
                                  </Button>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
                {/* Mobile: cards */}
                {!isCollapsed && (
                  <div className="md:hidden divide-y divide-gray-800">
                    {rows.map(c => (
                      <div key={c.id} className={`p-4 space-y-2 active:bg-secondary/50 ${c.incompleto ? 'border-l-2 border-l-red-500 bg-red-500/[0.05]' : ''}`} onClick={() => setDetail(c)}>
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="font-medium text-foreground truncate inline-flex items-center gap-1.5">
                              <CloserAvatar closerId={c.closer_id} />
                              {c.cadastro_retroativo && <RetroBadge registradoEm={c.data_cadastro_retroativo ?? null} />}
                                {c.fechado_por_ia && <span className="inline-flex px-1.5 py-0.5 rounded-full text-[10px] bg-purple-500/15 text-purple-400" title="Fechamento por IA — comissão do fechamento sai junto com o protocolo">🤖 IA</span>}
                              <HighlightMatch text={c.nome_cliente} query={debouncedSearch} field="name" />
                            </p>
                            {c.cpf && <p className="text-[11px] font-mono text-muted-foreground"><HighlightMatch text={formatCPFDisplay(c.cpf)} query={debouncedSearch} field="cpf" />{!cpfValido(c.cpf) && <span className="ml-1 text-warning" title="CPF inválido — confira na origem">⚠</span>}<CopyBtn value={formatCPFDisplay(c.cpf)} label="CPF copiado" /></p>}
                            <p className="text-[11px] text-muted-foreground mt-0.5">{productMap[c.product_id ?? ''] ?? '—'} · {fmtDateCompact(c.fechado_em ?? c.data_fechamento)} · {origemLabel(c.origem_lead)}</p>
                            {c.incompleto && <p className="text-[10px] text-red-400 mt-0.5">⚠ Falta: {camposFaltando(c).join(', ')}</p>}
                          </div>
                          <StatusBadge contrato={c} />
                        </div>
                        <div className="flex items-center justify-between">
                          <p className="font-semibold text-primary">{formatCurrency(Number(c.valor) || 0)}</p>
                          <div className="flex gap-2">
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={(e) => { e.stopPropagation(); setDetail(c); }}><Eye className="w-4 h-4" /></Button>
                            {(canCadastrarVenda || canEditQualificacao) && c.status_qualificacao === 'pendente' && (
                              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={(e) => { e.stopPropagation(); openEdit(c); }}><Pencil className="w-4 h-4" /></Button>
                            )}
                            {(isGestor || (canCadastrarVenda && c.status_qualificacao === 'pendente')) && (
                              <Button variant="ghost" size="icon" className="h-8 w-8" title={isGestor ? 'Excluir' : 'Solicitar exclusão'} onClick={(e) => { e.stopPropagation(); isGestor ? remove.mutate(c.id) : setExcluirInfo(c); }}><Trash2 className="w-4 h-4 text-destructive" /></Button>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <FechamentoDetailSheet
        open={!!detail}
        onClose={() => setDetail(null)}
        contrato={detail}
        closerNome={detail ? (closerMap[detail.closer_id ?? ''] ?? 'Sem closer') : ''}
        productNome={detail ? (productMap[detail.product_id ?? ''] ?? '—') : ''}
        canMarcarProtocolado={canEditQualificacao}
      />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="bg-card border-border max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing ? 'Editar' : 'Novo'} Fechamento</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <Input placeholder="Nome do cliente" value={form.nome_cliente ?? ''} onChange={e => setForm(f => ({ ...f, nome_cliente: e.target.value }))} />
            <div>
              <Input
                placeholder="CPF (000.000.000-00) — opcional"
                value={form.cpf ?? ''}
                inputMode="numeric"
                maxLength={14}
                onChange={e => setForm(f => ({ ...f, cpf: maskCPF(e.target.value) }))}
              />
              {form.cpf && !isCpfFormatValid(form.cpf) && (
                <p className="text-[11px] text-warning mt-1">Formato incompleto — o CPF deve ter 11 dígitos. Você ainda pode salvar.</p>
              )}
            </div>
            <Input placeholder="Telefone (opcional)" value={form.telefone ?? ''} onChange={e => setForm(f => ({ ...f, telefone: e.target.value }))} />
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">UF (estado) — preenchido pelo DDD do telefone, editável</label>
              <Select value={form.uf || ufFromTelefone(form.telefone) || ''} onValueChange={v => setForm(f => ({ ...f, uf: v }))}>
                <SelectTrigger><SelectValue placeholder="UF" /></SelectTrigger>
                <SelectContent className="max-h-72">
                  {[...UF_LIST].sort().map(uf => <SelectItem key={uf} value={uf}>{uf}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Select value={form.closer_id ?? ''} onValueChange={v => setForm(f => ({ ...f, closer_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Closer" /></SelectTrigger>
                <SelectContent>{closersFiltered.map(c => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}</SelectContent>
              </Select>
              {!addingCloser ? (
                <button type="button" onClick={() => { setAddingCloser(true); setNovoCloserNome(''); }} className="text-xs text-primary hover:underline">
                  + Adicionar closer (ex.: líder Dra. Anielle ou ex-funcionário)
                </button>
              ) : (
                <div className="flex gap-2 items-center">
                  <Input
                    placeholder="Nome (ex.: Dra. Anielle)"
                    value={novoCloserNome}
                    onChange={e => setNovoCloserNome(e.target.value)}
                    autoFocus
                  />
                  <Input
                    placeholder="E-mail do login (opcional)"
                    type="email"
                    value={novoCloserEmail}
                    onChange={e => setNovoCloserEmail(e.target.value)}
                  />
                  <Button
                    type="button"
                    size="sm"
                    disabled={!novoCloserNome.trim() || addCloser.isPending}
                    onClick={() => addCloser.mutate(novoCloserNome.trim())}
                  >
                    {addCloser.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Salvar'}
                  </Button>
                  <Button type="button" size="sm" variant="ghost" onClick={() => setAddingCloser(false)}>Cancelar</Button>
                </div>
              )}
            </div>
            <Select value={form.product_id ?? ''} onValueChange={v => setForm(f => {
              const valor = productValorMap[v];
              return { ...f, product_id: v, variante: '', valor: valor != null ? String(valor) : f.valor };
            })}>
              <SelectTrigger><SelectValue placeholder="Produto (tipo de ação/benefício)" /></SelectTrigger>
              <SelectContent className="max-h-72 overflow-y-auto">
                {(products ?? []).length === 0
                  ? <div className="px-3 py-2 text-sm text-muted-foreground">Nenhum produto cadastrado nesta divisão.</div>
                  : (products ?? []).map(p => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}
              </SelectContent>
            </Select>
            {(products ?? []).length === 0 && !isGestor && (
              <p className="text-xs text-destructive">Ainda não há produtos cadastrados. Peça à Dra. Raynne para cadastrar em Menu → Produtos.</p>
            )}
            {isGestor && (products ?? []).length === 0 && (
              <Button type="button" size="sm" variant="outline" className="w-full" disabled={addPadrao.isPending} onClick={() => addPadrao.mutate()}>
                {addPadrao.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : `Cadastrar produtos padrão (${(PRODUTOS_PADRAO[divisao] ?? []).join(', ')})`}
              </Button>
            )}
            {isGestor && (!addingProduto ? (
              <button type="button" onClick={() => setAddingProduto(true)} className="text-xs text-primary hover:underline">
                + Cadastrar produto novo
              </button>
            ) : (
              <div className="flex gap-2 items-center">
                <Input placeholder="Nome (ex.: BPC/LOAS)" value={novoProduto.nome} autoFocus
                  onChange={e => setNovoProduto(n => ({ ...n, nome: e.target.value }))} />
                <Input placeholder="Valor R$" inputMode="decimal" className="w-28" value={novoProduto.valor}
                  onChange={e => setNovoProduto(n => ({ ...n, valor: e.target.value }))} />
                <Button type="button" size="sm" disabled={!novoProduto.nome.trim() || addProduto.isPending} onClick={() => addProduto.mutate()}>
                  {addProduto.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Salvar'}
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => setAddingProduto(false)}>Cancelar</Button>
              </div>
            ))}
            {variantesDoProduto.length > 0 && (
              <Select value={form.variante ?? ''} onValueChange={v => setForm(f => {
                const cfg = (productVarCfgMap[f.product_id ?? ''] ?? []).find(x => x.nome === v);
                return { ...f, variante: v, valor: cfg && cfg.valor != null ? String(cfg.valor) : f.valor };
              })}>
                <SelectTrigger><SelectValue placeholder="Variante do produto" /></SelectTrigger>
                <SelectContent>{variantesDoProduto.map(vr => <SelectItem key={vr} value={vr}>{vr}</SelectItem>)}</SelectContent>
              </Select>
            )}
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Valor do contrato (R$) — honorários que o escritório vai receber</label>
              <Input type="number" inputMode="decimal" placeholder="Ex.: 1500" value={form.valor ?? ''} onChange={e => setForm(f => ({ ...f, valor: e.target.value }))} />
              <p className="text-[11px] text-muted-foreground mt-1">Já vem preenchido pelo produto. Mude se combinou outro valor com o cliente.</p>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Origem</label>
              <Select value={form.origem_lead || 'meta_ads'} onValueChange={v => setForm(f => ({ ...f, origem_lead: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="meta_ads">Meta Ads</SelectItem>
                  <SelectItem value="google_ads">Google Ads</SelectItem>
                  <SelectItem value="indicacao">Indicação</SelectItem>
                  <SelectItem value="organico">Orgânico</SelectItem>
                  <SelectItem value="outro">Outro</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <OrigemMetaFields
              value={{ meta_campaign_id: form.meta_campaign_id ?? '', meta_adset_id: form.meta_adset_id ?? '', meta_ad_id: form.meta_ad_id ?? '' }}
              onChange={v => setForm(f => ({ ...f, ...v }))}
            />
            <button
              type="button"
              onClick={() => setForm(f => ({ ...f, fechado_por_ia: f.fechado_por_ia === 'sim' ? '' : 'sim' }))}
              className={`w-full flex items-center justify-between rounded-xl border px-4 py-3 text-sm transition-colors ${
                form.fechado_por_ia === 'sim'
                  ? 'border-purple-500/50 bg-purple-500/10 text-purple-300'
                  : 'border-border text-muted-foreground hover:border-purple-500/40'
              }`}
            >
              <span>🤖 Fechamento por IA</span>
              <span className="text-[11px]">
                {form.fechado_por_ia === 'sim'
                  ? 'Ativado — comissão do fechamento sai junto com o protocolo'
                  : 'Clique se esta venda foi fechada pela IA'}
              </span>
            </button>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Data e hora do fechamento (assinatura)</label>
              <Input type="datetime-local" value={form.fechado_em ?? ''} disabled={!!editing && !isGestor && dataComissionada(editing.data_fechamento)} onChange={e => setForm(f => ({ ...f, fechado_em: e.target.value }))} />
              {!!editing && !isGestor && dataComissionada(editing.data_fechamento) ? (
                <p className="text-[11px] text-warning mt-1">
                  🔒 Data de mês já comissionado — alteração exige aprovação.{' '}
                  <button type="button" className="underline" onClick={() => setSolicitarOpen(true)}>Enviar solicitação</button>
                </p>
              ) : (
                <p className="text-[11px] text-muted-foreground mt-1">Usado para calcular comissão dobrada (fim de semana, feriado ou 19h–05h).</p>
              )}
            </div>
            {produtoTemHonorarios && (
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Recebimento dos honorários iniciais (data)</label>
                <Input type="date" value={form.data_pagamento_confirmado ?? ''} disabled={!!editing && !isGestor && dataComissionada(editing.data_pagamento_confirmado)} onChange={e => setForm(f => ({ ...f, data_pagamento_confirmado: e.target.value }))} />
                <p className="text-[11px] text-muted-foreground mt-1">A assinatura e o pagamento podem ter datas diferentes. Deixe em branco se ainda não recebeu — dá para preencher depois. Libera a etapa de comissão correspondente.</p>
              </div>
            )}
            {!editing && (
              <p className="text-xs text-muted-foreground">⚠ Todo novo fechamento entra como <strong>pendente</strong>. A qualificação e o protocolo são feitos pelo operador técnico na aba <strong>Processos</strong>.</p>
            )}
            <Button onClick={() => save.mutate()} className="w-full" disabled={save.isPending}>
              {save.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : editing ? 'Salvar' : 'Criar'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <CadastroRetroativoDialog
        open={retroOpen}
        onOpenChange={setRetroOpen}
        divisao={divisao}
      />

      {editing && (
        <SolicitarAlteracaoDialog
          open={solicitarOpen}
          onClose={() => setSolicitarOpen(false)}
          contratoId={editing.id}
          nomeCliente={editing.nome_cliente}
          camposTravados={[
            ...(dataComissionada(editing.data_fechamento) ? [{ campo: 'data_fechamento', valorAtual: editing.data_fechamento }] : []),
            ...(dataComissionada(editing.data_pagamento_confirmado) ? [{ campo: 'data_pagamento_confirmado', valorAtual: editing.data_pagamento_confirmado ?? null }] : []),
          ]}
        />
      )}

      <Dialog open={!!excluirInfo} onOpenChange={v => !v && (setExcluirInfo(null), setExcluirMotivo(''))}>
        <DialogContent className="bg-card border-border max-w-md">
          <DialogHeader><DialogTitle>Solicitar exclusão</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              A exclusão de <span className="font-medium text-foreground">{excluirInfo?.nome_cliente}</span> precisa de aprovação do gestor.
              Descreva o motivo — ele aparecerá na fila de Solicitações.
            </p>
            <Textarea rows={3} placeholder="Motivo da exclusão (mínimo 10 caracteres)" value={excluirMotivo} onChange={e => setExcluirMotivo(e.target.value)} />
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => { setExcluirInfo(null); setExcluirMotivo(''); }}>Cancelar</Button>
              <Button variant="destructive" disabled={solicitarExclusao.isPending} onClick={() => solicitarExclusao.mutate()}>
                {solicitarExclusao.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Enviar solicitação
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!dupInfo} onOpenChange={v => !v && setDupInfo(null)}>
        <DialogContent className="bg-card border-border max-w-md">
          <DialogHeader><DialogTitle>⚠️ Cliente já está na base</DialogTitle></DialogHeader>
          <p className="text-sm text-foreground">
            <strong>{dupInfo?.match.nome_cliente}</strong> já tem contrato deste produto
            {dupInfo?.match.data_fechamento ? ` (fechado em ${new Date(dupInfo.match.data_fechamento + 'T12:00:00').toLocaleDateString('pt-BR')})` : ''}.
          </p>
          <p className="text-[11px] text-muted-foreground">
            Para evitar comissão duplicada, o lançamento repetido precisa de aprovação do gestor. Descreva o motivo:
          </p>
          <Textarea rows={3} value={dupMotivo} onChange={e => setDupMotivo(e.target.value)} placeholder="Ex.: cliente retornou para novo processo do mesmo tipo..." />
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setDupInfo(null)}>Cancelar</Button>
            <Button onClick={() => enviarDuplicado.mutate()} disabled={enviarDuplicado.isPending}>
              {enviarDuplicado.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Enviar solicitação ao gestor'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

