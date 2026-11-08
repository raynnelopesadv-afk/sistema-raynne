import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { getEffectiveStatus, type EffectiveStatus } from '@/lib/contrato-status';
import { HighlightMatch } from './HighlightMatch';
import { formatCPFDisplay, cpfValido } from '@/lib/cliente-search';

export interface KanbanRow {
  id: string;
  nome_cliente: string;
  cpf?: string | null;
  valor: number;
  product_id?: string | null;
  closer_id?: string | null;
  status_qualificacao: string;
  protocolado?: boolean | null;
  teve_exito?: boolean | null;
  data_fechamento?: string | null;
  fechado_em?: string | null;
  data_protocolo?: string | null;
  tipo_processo?: string | null;
  campos_personalizados?: Record<string, string | number | string[] | null> | null;
  valor_exito?: number;
  valor_honorarios_recebidos?: number;
  data_recebimento?: string | null;
  motivo_desqualificacao?: string | null;
  cadastro_retroativo?: boolean | null;
  data_cadastro_retroativo?: string | null;
}

const COLUMNS: { key: EffectiveStatus; label: string; color: string }[] = [
  { key: 'pendente', label: 'Pendente', color: '#F59E0B' },
  { key: 'qualificado', label: 'Protocolo', color: '#00BCD4' },
  { key: 'exito', label: 'Êxito', color: '#22C55E' },
  { key: 'sem_exito', label: 'Sem Êxito', color: '#6B7280' },
  { key: 'desqualificado', label: 'Desqualificado', color: '#EF4444' },
  { key: 'desistencia', label: 'Desistência', color: '#F97316' },
];

function formatCurrency(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0 });
}

function fmtDate(s: string | null | undefined) {
  if (!s) return '—';
  const d = new Date(s.length === 10 ? s + 'T12:00:00' : s);
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

function timeAgo(iso: string | null | undefined) {
  if (!iso) return '';
  const d = new Date(iso.length === 10 ? iso + 'T12:00:00' : iso);
  const days = Math.floor((Date.now() - d.getTime()) / 86400000);
  if (days < 1) return 'hoje';
  if (days === 1) return 'há 1 dia';
  if (days < 30) return `há ${days} dias`;
  const m = Math.floor(days / 30);
  return m === 1 ? 'há 1 mês' : `há ${m} meses`;
}

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map(s => s[0]?.toUpperCase()).join('') || '?';
}

export function isValidTransition(from: EffectiveStatus, to: EffectiveStatus): boolean {
  if (from === to) return false;
  if (from === 'exito' || from === 'sem_exito' || from === 'desqualificado') return false;
  if (from === 'pendente' && (to === 'qualificado' || to === 'desqualificado')) return true;
  if (from === 'qualificado' && (to === 'exito' || to === 'sem_exito' || to === 'desqualificado')) return true;
  return false;
}

interface Props<T extends KanbanRow> {
  rows: T[];
  closerMap: Record<string, string>;
  productMap: Record<string, string>;
  canDrag: boolean;
  variant: 'fechamento' | 'processos';
  highlightQuery?: string;
  hideEmpty?: boolean;
  onCardClick?: (row: T) => void;
  onDropTransition?: (row: T, from: EffectiveStatus, to: EffectiveStatus) => void;
  onInvalidTransition?: (row: T, from: EffectiveStatus, to: EffectiveStatus) => void;
}

export function KanbanBoard<T extends KanbanRow>({
  rows,
  closerMap,
  productMap,
  canDrag,
  variant,
  highlightQuery = '',
  hideEmpty = false,
  onCardClick,
  onDropTransition,
  onInvalidTransition,
}: Props<T>) {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  // campos personalizados marcados para aparecer no card
  const { data: camposKanban } = useQuery({
    queryKey: ['campos-kanban'],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from('product_campos')
        .select('id, product_id, label, tipo, ordem')
        .eq('ativo', true)
        .eq('visivel_kanban', true)
        .order('ordem');
      return (data ?? []) as Array<{ id: string; product_id: string; label: string; tipo: string; ordem: number }>;
    },
  });
  const camposPorProduto = useMemo(() => {
    const m = new Map<string, Array<{ id: string; label: string; tipo: string }>>();
    (camposKanban ?? []).forEach(c => {
      const arr = m.get(c.product_id) ?? [];
      arr.push({ id: c.id, label: c.label, tipo: c.tipo });
      m.set(c.product_id, arr);
    });
    return m;
  }, [camposKanban]);

  const [hoverCol, setHoverCol] = useState<EffectiveStatus | null>(null);
  const [hoverValid, setHoverValid] = useState<boolean>(true);
  const [activeColMobile, setActiveColMobile] = useState<EffectiveStatus>('pendente');

  const grouped = useMemo(() => {
    const map: Record<EffectiveStatus, T[]> = {
      pendente: [], qualificado: [], exito: [], sem_exito: [], desqualificado: [], desistencia: [],
    };
    rows.forEach(r => { map[getEffectiveStatus(r)].push(r); });
    return map;
  }, [rows]);

  const totalValor = useMemo(() => rows.reduce((s, r) => s + (Number(r.valor) || 0), 0), [rows]);

  const visibleColumns = useMemo(() => {
    if (!hideEmpty) return COLUMNS;
    return COLUMNS.filter(c => grouped[c.key].length > 0);
  }, [hideEmpty, grouped]);

  const draggingRow = useMemo(() => rows.find(r => r.id === draggingId) ?? null, [draggingId, rows]);

  function handleDragStart(e: React.DragEvent, row: T) {
    if (!canDrag) return;
    setDraggingId(row.id);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', row.id);
  }

  function handleDragEnd() {
    setDraggingId(null);
    setHoverCol(null);
  }

  function handleDragOver(e: React.DragEvent, col: EffectiveStatus) {
    if (!canDrag || !draggingRow) return;
    const from = getEffectiveStatus(draggingRow);
    const valid = isValidTransition(from, col);
    if (valid) e.preventDefault();
    setHoverCol(col);
    setHoverValid(valid);
  }

  function handleDrop(e: React.DragEvent, col: EffectiveStatus) {
    e.preventDefault();
    if (!canDrag || !draggingRow) return;
    const from = getEffectiveStatus(draggingRow);
    setHoverCol(null);
    setDraggingId(null);
    if (!isValidTransition(from, col)) {
      onInvalidTransition?.(draggingRow, from, col);
      return;
    }
    onDropTransition?.(draggingRow, from, col);
  }

  function renderCard(row: T) {
    const closerNome = closerMap[row.closer_id ?? ''] ?? null;
    const productNome = productMap[row.product_id ?? ''] ?? null;
    const eff = getEffectiveStatus(row);
    const dragging = draggingId === row.id;
    return (
      <div
        key={row.id}
        draggable={canDrag}
        onDragStart={(e) => handleDragStart(e, row)}
        onDragEnd={handleDragEnd}
        onClick={() => onCardClick?.(row)}
        className={`group relative rounded-xl bg-[#111827] border border-[#1F2937] p-4 transition-all hover:border-[#374151] hover:shadow-lg ${canDrag ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'} ${dragging ? 'opacity-60 rotate-1 shadow-2xl' : ''}`}
      >
        {row.cadastro_retroativo && (
          <span className="absolute left-0 top-2 bottom-2 w-[3px] rounded-r bg-[#6B7280]" aria-hidden />
        )}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-white truncate flex items-center gap-1.5">
              {row.cadastro_retroativo && (
                <span title="Cadastro retroativo" className="inline-flex items-center text-[#9CA3AF]">
                  <svg viewBox="0 0 24 24" className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l3 2"/></svg>
                </span>
              )}
              <HighlightMatch text={row.nome_cliente} query={highlightQuery} field="name" />
            </p>
            {row.cpf && (
              <p className="font-mono text-[11px] text-muted-foreground mt-0.5">
                <HighlightMatch text={formatCPFDisplay(row.cpf)} query={highlightQuery} field="cpf" />{!cpfValido(row.cpf) && <span className="ml-1 text-warning" title="CPF inválido — confira na origem">⚠</span>}
              </p>
            )}
          </div>
        </div>


        {(productNome || (variant === 'processos' && row.tipo_processo)) && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {productNome && (
              <span className="text-[10px] px-2 py-0.5 rounded-md border border-[#1F2937] text-muted-foreground">
                {productNome}
              </span>
            )}
            {variant === 'processos' && row.tipo_processo && (
              <span className="text-[10px] px-2 py-0.5 rounded-md border border-[#1F2937] capitalize text-muted-foreground">
                {row.tipo_processo}
              </span>
            )}
          </div>
        )}

        <p className="text-lg font-bold text-[#D4AF37] mt-3">{formatCurrency(Number(row.valor) || 0)}</p>

        {(() => {
          const defs = camposPorProduto.get(row.product_id ?? '') ?? [];
          if (defs.length === 0 || !row.campos_personalizados) return null;
          const itens = defs
            .map(d => {
              const v = row.campos_personalizados?.[d.id];
              if (v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0)) return null;
              const texto = Array.isArray(v)
                ? v.join(', ')
                : d.tipo === 'data'
                  ? new Date(String(v) + 'T12:00:00').toLocaleDateString('pt-BR')
                  : String(v);
              return { label: d.label, texto };
            })
            .filter(Boolean) as Array<{ label: string; texto: string }>;
          if (itens.length === 0) return null;
          return (
            <div className="mt-2 space-y-0.5">
              {itens.map(i => (
                <p key={i.label} className="text-[11px] text-muted-foreground truncate" title={`${i.label}: ${i.texto}`}>
                  <span className="text-muted-foreground/60">{i.label}:</span> <span className="text-foreground">{i.texto}</span>
                </p>
              ))}
            </div>
          );
        })()}

        {variant === 'processos' && eff === 'qualificado' && row.data_protocolo && (
          <p className="text-[11px] text-muted-foreground mt-1">
            Protocolado {fmtDate(row.data_protocolo)} · {timeAgo(row.data_protocolo)}
          </p>
        )}
        {variant === 'processos' && eff === 'exito' && (
          <div className="text-[11px] text-[#22C55E] mt-1 space-y-0.5">
            <p>Êxito: {formatCurrency(Number(row.valor_exito) || 0)}</p>
            {(Number(row.valor_honorarios_recebidos) || 0) > 0 && (
              <p>Recebido: {formatCurrency(Number(row.valor_honorarios_recebidos) || 0)}</p>
            )}
            {row.data_recebimento && <p className="text-muted-foreground">Em {fmtDate(row.data_recebimento)}</p>}
          </div>
        )}
        {variant === 'processos' && eff === 'desqualificado' && row.motivo_desqualificacao && (
          <p className="text-[11px] text-muted-foreground mt-1 italic line-clamp-2">"{row.motivo_desqualificacao}"</p>
        )}

        <div className="flex items-center justify-between mt-3 pt-2 border-t border-[#1F2937]">
          <p className="text-[10px] text-muted-foreground">
            {fmtDate(row.fechado_em ?? row.data_fechamento)} · {timeAgo(row.fechado_em ?? row.data_fechamento)}
          </p>
          {closerNome && (
            <div
              className="w-6 h-6 rounded-full bg-primary/15 text-primary text-[10px] font-semibold grid place-items-center"
              title={closerNome}
            >
              {initials(closerNome)}
            </div>
          )}
        </div>
        {variant === 'processos' && closerNome && (
          <p className="text-[10px] text-muted-foreground mt-1 truncate">Closer: {closerNome}</p>
        )}
      </div>
    );
  }

  function renderColumn(col: typeof COLUMNS[number]) {
    const items = grouped[col.key];
    const valor = items.reduce((s, r) => s + (Number(r.valor) || 0), 0);
    const pct = totalValor > 0 ? (valor / totalValor) * 100 : 0;
    const isHover = hoverCol === col.key;
    const ringClass = isHover
      ? hoverValid
        ? 'border-[#F5C518] shadow-[0_0_0_2px_rgba(245,197,24,0.25)]'
        : 'border-[#EF4444] cursor-not-allowed'
      : 'border-[#1F2937]';

    return (
      <div
        key={col.key}
        onDragOver={(e) => handleDragOver(e, col.key)}
        onDragLeave={() => setHoverCol(prev => (prev === col.key ? null : prev))}
        onDrop={(e) => handleDrop(e, col.key)}
        className={`flex flex-col rounded-2xl bg-[#0D0D0D] border ${ringClass} transition-all min-w-[300px] max-w-[360px] flex-1`}
      >
        <div className="px-4 pt-4 pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold" style={{ color: col.color }}>{col.label}</span>
              <span className="text-[11px] text-muted-foreground">({items.length})</span>
            </div>
            <span className="text-sm font-bold text-[#D4AF37]">{formatCurrency(valor)}</span>
          </div>
          {variant === 'processos' && (
            <div className="mt-2 h-1 rounded-full bg-white/[0.04] overflow-hidden">
              <div className="h-full transition-all" style={{ width: `${pct}%`, background: col.color }} />
            </div>
          )}
        </div>
        <div className="h-1 mx-4 rounded-full" style={{ background: col.color }} />
        <div className="flex-1 px-3 py-3 space-y-2 overflow-y-auto max-h-[calc(100vh-380px)] min-h-[200px]">
          {items.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-8 italic">Sem contratos neste estágio</p>
          ) : (
            items.map(renderCard)
          )}
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Mobile column tabs */}
      <div className="md:hidden flex gap-1 overflow-x-auto pb-2">
        {visibleColumns.map(col => (
          <button
            key={col.key}
            type="button"
            onClick={() => setActiveColMobile(col.key)}
            className={`px-3 py-1.5 rounded-lg text-xs whitespace-nowrap font-medium transition-all border ${
              activeColMobile === col.key
                ? 'border-transparent text-black'
                : 'border-[#1F2937] text-muted-foreground'
            }`}
            style={activeColMobile === col.key ? { background: col.color } : undefined}
          >
            {col.label} ({grouped[col.key].length})
          </button>
        ))}
      </div>

      {/* Desktop & tablet: horizontal scroll */}
      <div className="hidden md:flex gap-4 overflow-x-auto pb-4">
        {visibleColumns.map(renderColumn)}
      </div>

      {/* Mobile: single column */}
      <div className="md:hidden">
        {visibleColumns.filter(c => c.key === activeColMobile).map(renderColumn)}
      </div>
    </>
  );
}
