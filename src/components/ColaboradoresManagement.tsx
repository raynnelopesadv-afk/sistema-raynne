import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, Plus, UserMinus, UserCheck } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { useUserRole } from '@/hooks/useUserRole';

type Divisao = 'advogados' | 'educacao';
type CloserStatus = 'ativo' | 'desligado' | 'externo';

interface Colab {
  id: string;
  nome: string;
  divisao: Divisao;
  ativo: boolean;
  status: CloserStatus;
  data_desligamento: string | null;
  funcao: string | null;
  email: string | null;
}

export function ColaboradoresManagement() {
  const qc = useQueryClient();
  const { isGestor } = useUserRole();
  const [statusFilter, setStatusFilter] = useState<'all' | CloserStatus>('all');
  const [addOpen, setAddOpen] = useState(false);
  const [novoNome, setNovoNome] = useState('');
  const [novoDivisao, setNovoDivisao] = useState<Divisao>('advogados');
  const [novoData, setNovoData] = useState('');

  const { data: colabs, isLoading } = useQuery({
    queryKey: ['colaboradores'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('closers')
        .select('id, nome, divisao, ativo, status, data_desligamento, funcao, email')
        .order('nome');
      if (error) throw error;
      return (data ?? []).map((c): Colab => ({
        id: c.id,
        nome: c.nome,
        divisao: c.divisao as Divisao,
        ativo: c.ativo,
        status: ((c as { status?: string }).status as CloserStatus) ?? (c.ativo ? 'ativo' : 'desligado'),
        data_desligamento: (c as { data_desligamento?: string | null }).data_desligamento ?? null,
        funcao: (c as { funcao?: string | null }).funcao ?? null,
        email: (c as { email?: string | null }).email ?? null,
      }));
    },
  });

  const { data: contratosPorCloser } = useQuery({
    queryKey: ['colab-contratos-count'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('clientes_fechados')
        .select('closer_id');
      if (error) throw error;
      const map: Record<string, number> = {};
      (data ?? []).forEach(r => {
        if (r.closer_id) map[r.closer_id] = (map[r.closer_id] ?? 0) + 1;
      });
      return map;
    },
  });

  const toggleStatus = useMutation({
    mutationFn: async ({ id, novoStatus }: { id: string; novoStatus: CloserStatus }) => {
      const update: Record<string, unknown> = {
        status: novoStatus,
        ativo: novoStatus === 'ativo',
      };
      if (novoStatus === 'desligado') {
        update.data_desligamento = new Date().toISOString().slice(0, 10);
      } else if (novoStatus === 'ativo') {
        update.data_desligamento = null;
      }
      const { error } = await supabase.from('closers').update(update as never).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['colaboradores'] });
      qc.invalidateQueries({ queryKey: ['vendedores-all'] });
      qc.invalidateQueries({ queryKey: ['closers-retro'] });
      toast.success('Status atualizado');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const setEmail = useMutation({
    mutationFn: async ({ id, email }: { id: string; email: string }) => {
      const { error } = await supabase.from('closers').update({ email: email.trim() || null } as never).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['colaboradores'] }); toast.success('E-mail salvo'); },
    onError: (e: Error) => toast.error(e.message),
  });

  const addColab = useMutation({
    mutationFn: async () => {
      if (!novoNome.trim()) throw new Error('Informe o nome');
      const { error } = await supabase.from('closers').insert({
        nome: novoNome.trim(),
        divisao: novoDivisao,
        ativo: false,
        status: 'desligado',
        data_desligamento: novoData || null,
        funcao: 'closer',
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['colaboradores'] });
      qc.invalidateQueries({ queryKey: ['vendedores-all'] });
      qc.invalidateQueries({ queryKey: ['closers-retro'] });
      setAddOpen(false);
      setNovoNome('');
      setNovoData('');
      toast.success('Colaborador desligado adicionado');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const filtered = (colabs ?? []).filter(c => statusFilter === 'all' || c.status === statusFilter);

  const badgeClass = (s: CloserStatus) =>
    s === 'ativo'
      ? 'bg-success/15 text-success border-success/30'
      : s === 'desligado'
      ? 'bg-muted-foreground/15 text-muted-foreground border-[#6B7280]/30'
      : 'bg-warning/15 text-warning border-warning/30';

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h3 className="font-semibold text-foreground">Colaboradores</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Gerencie closers ativos, desligados e externos. Colaboradores desligados permanecem vinculados aos contratos históricos.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as 'all' | CloserStatus)}>
            <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="ativo">Ativos</SelectItem>
              <SelectItem value="desligado">Desligados</SelectItem>
              <SelectItem value="externo">Externos</SelectItem>
            </SelectContent>
          </Select>
          {isGestor && (
            <Button onClick={() => setAddOpen(true)} className="gap-1.5" size="sm">
              <Plus className="w-4 h-4" /> Adicionar desligado
            </Button>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
      ) : (
        <div className="glass-card overflow-hidden overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Divisão</TableHead>
                <TableHead>Função</TableHead>
                <TableHead>E-mail (Data Crazy)</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Desligamento</TableHead>
                <TableHead className="text-center">Contratos vinculados</TableHead>
                {isGestor && <TableHead className="text-right">Ações</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={isGestor ? 8 : 7} className="text-center text-sm text-muted-foreground py-8">
                    Nenhum colaborador
                  </TableCell>
                </TableRow>
              )}
              {filtered.map(c => {
                const qtd = contratosPorCloser?.[c.id] ?? 0;
                return (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{c.nome}</TableCell>
                    <TableCell className="capitalize text-muted-foreground text-sm">{c.divisao}</TableCell>
                    <TableCell className="text-xs text-muted-foreground capitalize">{c.funcao ?? 'closer'}</TableCell>
                    <TableCell>
                      {isGestor ? (
                        <Input
                          defaultValue={c.email ?? ''}
                          placeholder="email@dominio.com"
                          className="h-8 w-52 text-xs"
                          onBlur={(e) => { const v = e.target.value.trim(); if (v !== (c.email ?? '')) setEmail.mutate({ id: c.id, email: v }); }}
                        />
                      ) : (
                        <span className="text-xs text-muted-foreground">{c.email ?? '—'}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] border ${badgeClass(c.status)}`}>
                        {c.status === 'ativo' ? 'Ativo' : c.status === 'desligado' ? 'Desligado' : 'Externo'}
                      </span>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {c.data_desligamento ? new Date(c.data_desligamento + 'T12:00:00').toLocaleDateString('pt-BR') : '—'}
                    </TableCell>
                    <TableCell className="text-center tabular-nums">{qtd}</TableCell>
                    {isGestor && (
                      <TableCell className="text-right">
                        {c.status === 'ativo' ? (
                          <Button
                            size="sm" variant="outline" className="gap-1 h-7 text-xs"
                            onClick={() => { if (confirm(`Desligar ${c.nome}?`)) toggleStatus.mutate({ id: c.id, novoStatus: 'desligado' }); }}
                          >
                            <UserMinus className="w-3 h-3" /> Desligar
                          </Button>
                        ) : (
                          <Button
                            size="sm" variant="outline" className="gap-1 h-7 text-xs"
                            onClick={() => toggleStatus.mutate({ id: c.id, novoStatus: 'ativo' })}
                          >
                            <UserCheck className="w-3 h-3" /> Reativar
                          </Button>
                        )}
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Adicionar colaborador desligado</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Nome *</Label>
              <Input value={novoNome} onChange={(e) => setNovoNome(e.target.value)} />
            </div>
            <div>
              <Label>Divisão *</Label>
              <Select value={novoDivisao} onValueChange={(v) => setNovoDivisao(v as Divisao)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="advogados">Advogados</SelectItem>
                  <SelectItem value="educacao">Educação</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Data de desligamento</Label>
              <Input type="date" value={novoData} onChange={(e) => setNovoData(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAddOpen(false)}>Cancelar</Button>
            <Button onClick={() => addColab.mutate()} disabled={addColab.isPending}>
              {addColab.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Salvar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
