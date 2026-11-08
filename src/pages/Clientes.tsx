import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, ChevronRight, Pencil, Check, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { DivisaoSelector } from '@/components/DivisaoSelector';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { fetchVendedores } from '@/lib/vendedores';
import { StatusBadge } from '@/components/StatusBadge';
import { getEffectiveStatus, STATUS_LABEL, type EffectiveStatus } from '@/lib/contrato-status';
import { ClienteSearchInput } from '@/components/ClienteSearchInput';
import { HighlightMatch } from '@/components/HighlightMatch';
import { matchCliente, useDebounced, maskCPF, isCpfFormatValid, isNumericQuery } from '@/lib/cliente-search';
import { toast } from 'sonner';
import { useUserRole } from '@/hooks/useUserRole';
import { usePermissions } from '@/hooks/usePermissions';

type Divisao = 'advogados' | 'educacao';

interface Contrato {
  id: string;
  nome_cliente: string;
  telefone: string | null;
  cpf: string | null;
  closer_id: string | null;
  product_id: string | null;
  divisao: Divisao;
  valor: number;
  status_qualificacao: 'pendente' | 'qualificado' | 'desqualificado';
  protocolado: boolean | null;
  data_protocolo: string | null;
  teve_exito: boolean | null;
  valor_exito: number;
  data_recebimento: string | null;
  valor_honorarios_recebidos: number;
  fechado_em: string | null;
  data_fechamento: string | null;
  motivo_desqualificacao: string | null;
  tipo_processo: string | null;
}

interface Cliente {
  key: string;
  nome: string;
  telefone: string | null;
  contratos: Contrato[];
  totalValor: number;
  closersIds: Set<string>;
}

function formatCurrency(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0 });
}
function fmtDate(s: string | null) {
  if (!s) return '—';
  const d = s.length <= 10 ? new Date(s + 'T12:00:00') : new Date(s);
  return d.toLocaleDateString('pt-BR');
}

export default function Clientes() {
  const [divisao, setDivisao] = useState<Divisao>('advogados');
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounced(search, 300);
  const [closerFilter, setCloserFilter] = useState<string>('all');
  const [openCliente, setOpenCliente] = useState<Cliente | null>(null);
  const qc = useQueryClient();
  const { can } = usePermissions();
  const canEditCpf = can('editar_cpf');

  const { data, isLoading } = useQuery({
    queryKey: ['clientes', divisao],
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
    queryKey: ['vendedores-all'],
    queryFn: async () => (await fetchVendedores()).map(v => ({ id: v.id, nome: v.nome, divisao: v.divisao })),
  });
  const closersFiltered = (closers ?? []).filter(c => !c.divisao || c.divisao === divisao);
  const closerMap = Object.fromEntries((closers ?? []).map(c => [c.id, c.nome]));

  const { data: products } = useQuery({
    queryKey: ['products', divisao],
    queryFn: async () => {
      const { data } = await supabase.from('products').select('id, nome').eq('divisao', divisao);
      return data ?? [];
    },
  });
  const productMap = Object.fromEntries((products ?? []).map(p => [p.id, p.nome]));

  // Agrupa contratos por cliente (nome + telefone)
  const clientes = useMemo<Cliente[]>(() => {
    const map = new Map<string, Cliente>();
    (data ?? []).forEach(c => {
      const key = `${(c.nome_cliente ?? '').trim().toLowerCase()}|${(c.telefone ?? '').trim()}`;
      const existing = map.get(key);
      if (existing) {
        existing.contratos.push(c);
        existing.totalValor += Number(c.valor) || 0;
        if (c.closer_id) existing.closersIds.add(c.closer_id);
      } else {
        map.set(key, {
          key,
          nome: c.nome_cliente,
          telefone: c.telefone,
          contratos: [c],
          totalValor: Number(c.valor) || 0,
          closersIds: new Set(c.closer_id ? [c.closer_id] : []),
        });
      }
    });
    return Array.from(map.values()).sort((a, b) => a.nome.localeCompare(b.nome));
  }, [data]);

  const filtered = useMemo(() => {
    return clientes.filter(c => {
      if (debouncedSearch) {
        // Match in any contrato (nome ou cpf)
        const ok = c.contratos.some(ct => matchCliente(ct, debouncedSearch))
          || matchCliente({ nome_cliente: c.nome, cpf: null }, debouncedSearch);
        if (!ok) return false;
      }
      if (closerFilter === '__none__') { if (c.closersIds.size > 0) return false; }
      else if (closerFilter !== 'all' && !c.closersIds.has(closerFilter)) return false;
      return true;
    });
  }, [clientes, debouncedSearch, closerFilter]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Clientes</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Registro cadastral — somente leitura. Para alterar status, use a aba Processos.
        </p>
      </div>
      <DivisaoSelector value={divisao} onChange={setDivisao} />

      <div className="glass-card p-4 space-y-3">
        <ClienteSearchInput value={search} onChange={setSearch} />
        <div className="flex flex-wrap items-center gap-3">
          <Select value={closerFilter} onValueChange={setCloserFilter}>
            <SelectTrigger className="w-[200px]"><SelectValue placeholder="Closer" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os closers</SelectItem>
              {closersFiltered.map(c => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
              <SelectItem value="__none__">Sem closer</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-[11px] text-muted-foreground">
            <kbd className="px-1.5 py-0.5 rounded bg-muted text-[10px]">Ctrl</kbd>+<kbd className="px-1.5 py-0.5 rounded bg-muted text-[10px]">K</kbd> foca · <kbd className="px-1.5 py-0.5 rounded bg-muted text-[10px]">Esc</kbd> limpa
            {debouncedSearch && <span className="ml-2">· buscando por {isNumericQuery(debouncedSearch) ? 'CPF' : 'nome'}</span>}
          </p>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
      ) : filtered.length === 0 ? (
        <div className="glass-card p-12 text-center"><p className="text-muted-foreground text-lg">{debouncedSearch ? `Nenhum processo encontrado para "${debouncedSearch}"` : 'Sem clientes'}</p></div>
      ) : (
        <div className="glass-card overflow-hidden overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cliente</TableHead>
                <TableHead>CPF</TableHead>
                <TableHead>Telefone</TableHead>
                <TableHead>Contratos</TableHead>
                <TableHead>Valor total</TableHead>
                <TableHead>Status mais recente</TableHead>
                <TableHead className="text-right"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map(c => {
                const ultimo = c.contratos[0];
                return (
                  <TableRow key={c.key} className="hover:bg-muted/30 cursor-pointer" onClick={() => setOpenCliente(c)}>
                    <TableCell className="font-medium"><HighlightMatch text={c.nome} query={debouncedSearch} field="name" /></TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {(() => {
                        const cpf = c.contratos.find(ct => ct.cpf)?.cpf;
                        return cpf ? <HighlightMatch text={maskCPF(cpf)} query={debouncedSearch} field="cpf" /> : '—';
                      })()}
                    </TableCell>
                    <TableCell>{c.telefone ?? '—'}</TableCell>
                    <TableCell>{c.contratos.length}</TableCell>
                    <TableCell>{formatCurrency(c.totalValor)}</TableCell>
                    <TableCell>{ultimo ? <StatusBadge contrato={ultimo} /> : '—'}</TableCell>
                    <TableCell className="text-right"><ChevronRight className="w-4 h-4 inline text-muted-foreground" /></TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <Sheet open={!!openCliente} onOpenChange={(v) => !v && setOpenCliente(null)}>
        <SheetContent className="bg-card border-border w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{openCliente?.nome}</SheetTitle>
            <p className="text-xs text-muted-foreground">{openCliente?.telefone ?? 'sem telefone'}</p>
          </SheetHeader>
          {openCliente && (
            <div className="mt-6 space-y-6">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-lg bg-muted/30 p-3">
                  <p className="text-[11px] text-muted-foreground">Contratos</p>
                  <p className="text-lg font-semibold">{openCliente.contratos.length}</p>
                </div>
                <div className="rounded-lg bg-muted/30 p-3">
                  <p className="text-[11px] text-muted-foreground">Valor total</p>
                  <p className="text-lg font-semibold text-primary">{formatCurrency(openCliente.totalValor)}</p>
                </div>
              </div>

              <div>
                <h4 className="text-sm font-semibold text-foreground mb-3">Histórico de contratos</h4>
                <div className="space-y-3">
                  {openCliente.contratos.map(ct => {
                    const eff: EffectiveStatus = getEffectiveStatus(ct);
                    return (
                      <div key={ct.id} className="rounded-lg border border-border p-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm font-medium">{productMap[ct.product_id ?? ''] ?? '—'}</p>
                            <p className="text-[11px] text-muted-foreground">
                              {closerMap[ct.closer_id ?? ''] ?? 'Sem closer'} · {fmtDate(ct.fechado_em ?? ct.data_fechamento)}
                            </p>
                          </div>
                          <StatusBadge contrato={ct} />
                        </div>
                        <div className="text-sm font-semibold text-primary">{formatCurrency(Number(ct.valor) || 0)}</div>
                        <CpfEditor
                          contratoId={ct.id}
                          cpf={ct.cpf}
                          canEdit={canEditCpf}
                          onSaved={() => qc.invalidateQueries({ queryKey: ['clientes', divisao] })}
                        />

                        {/* Linha do tempo dos status */}
                        <ol className="text-[11px] space-y-1 mt-2 pl-3 border-l border-border">
                          <li className="text-muted-foreground">
                            <span className="text-foreground font-medium">Pendente</span> — {fmtDate(ct.fechado_em ?? ct.data_fechamento)}
                          </li>
                          {(eff === 'qualificado' || eff === 'exito' || eff === 'sem_exito') && (
                            <li className="text-muted-foreground">
                              <span className="text-[#00BCD4] font-medium">Qualificado</span> — {fmtDate(ct.data_protocolo)}
                              {ct.tipo_processo && <span className="capitalize"> · {ct.tipo_processo}</span>}
                            </li>
                          )}
                          {eff === 'desqualificado' && (
                            <li className="text-muted-foreground">
                              <span className="text-[#EF4444] font-medium">Desqualificado</span>
                              {ct.motivo_desqualificacao && <> — {ct.motivo_desqualificacao}</>}
                            </li>
                          )}
                          {eff === 'exito' && (
                            <li className="text-muted-foreground">
                              <span className="text-[#22C55E] font-medium">Êxito</span> — {fmtDate(ct.data_recebimento)}
                              {' · '}{formatCurrency(Number(ct.valor_honorarios_recebidos) || 0)} recebido
                            </li>
                          )}
                          {eff === 'sem_exito' && (
                            <li className="text-muted-foreground">
                              <span className="text-[#6B7280] font-medium">Sem êxito</span>
                            </li>
                          )}
                          <li className="text-[10px] text-muted-foreground/70 italic mt-1">Status atual: {STATUS_LABEL[eff]}</li>
                        </ol>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function CpfEditor({ contratoId, cpf, canEdit, onSaved }: { contratoId: string; cpf: string | null; canEdit: boolean; onSaved: () => void }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(cpf ? maskCPF(cpf) : '');
  const mut = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('clientes_fechados')
        .update({ cpf: value ? maskCPF(value) : null })
        .eq('id', contratoId);
      if (error) throw error;
    },
    onSuccess: () => { toast.success('CPF atualizado'); setEditing(false); onSaved(); },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!editing) {
    return (
      <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
        <span>CPF:</span>
        <span className="font-mono text-foreground">{cpf ? maskCPF(cpf) : '—'}</span>
        {canEdit && (
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => { setValue(cpf ? maskCPF(cpf) : ''); setEditing(true); }}>
            <Pencil className="w-3 h-3" />
          </Button>
        )}
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2">
      <Input
        value={value}
        onChange={(e) => setValue(maskCPF(e.target.value))}
        placeholder="000.000.000-00"
        inputMode="numeric"
        maxLength={14}
        className="h-8 text-xs"
      />
      <Button size="icon" variant="ghost" className="h-7 w-7 text-success" onClick={() => mut.mutate()} disabled={mut.isPending}>
        <Check className="w-4 h-4" />
      </Button>
      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditing(false)}>
        <X className="w-4 h-4" />
      </Button>
      {value && !isCpfFormatValid(value) && <span className="text-[10px] text-warning">11 dígitos</span>}
    </div>
  );
}
