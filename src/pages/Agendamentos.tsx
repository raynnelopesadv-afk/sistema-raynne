import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, Plus, Pencil, Trash2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { DivisaoSelector } from '@/components/DivisaoSelector';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { fetchVendedores } from '@/lib/vendedores';

type Divisao = 'advogados' | 'educacao';

interface Agendamento {
  id: string;
  nome_cliente: string;
  telefone: string | null;
  closer_id: string | null;
  data_agendamento: string;
  status: string | null;
  observacoes: string | null;
  divisao: Divisao;
}

const EMPTY = {
  nome_cliente: '', telefone: '', closer_id: '' as string,
  data_agendamento: '', status: 'agendado', observacoes: '',
};

export default function Agendamentos() {
  const [divisao, setDivisao] = useState<Divisao>('advogados');
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Agendamento | null>(null);
  const [form, setForm] = useState(EMPTY);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['agendamentos', divisao],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('agendamentos').select('*').eq('divisao', divisao).order('data_agendamento', { ascending: false });
      if (error) throw error;
      return (data ?? []) as Agendamento[];
    },
  });

  const { data: closers } = useQuery({
    queryKey: ['vendedores', divisao],
    queryFn: async () => (await fetchVendedores(divisao)).map(v => ({ id: v.id, nome: v.nome })),
  });

  const closerMap = Object.fromEntries((closers ?? []).map(c => [c.id, c.nome]));

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        nome_cliente: form.nome_cliente,
        telefone: form.telefone || null,
        closer_id: form.closer_id || null,
        data_agendamento: form.data_agendamento,
        status: form.status || 'agendado',
        observacoes: form.observacoes || null,
        divisao,
      };
      if (editing) {
        const { error } = await supabase.from('agendamentos').update(payload).eq('id', editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('agendamentos').insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['agendamentos', divisao] });
      setOpen(false); setEditing(null); setForm(EMPTY);
      toast.success(editing ? 'Atualizado!' : 'Criado!');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('agendamentos').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['agendamentos', divisao] });
      toast.success('Excluído!');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function openNew() { setEditing(null); setForm(EMPTY); setOpen(true); }
  function openEdit(a: Agendamento) {
    setEditing(a);
    setForm({
      nome_cliente: a.nome_cliente,
      telefone: a.telefone ?? '',
      closer_id: a.closer_id ?? '',
      data_agendamento: a.data_agendamento?.slice(0, 16) ?? '',
      status: a.status ?? 'agendado',
      observacoes: a.observacoes ?? '',
    });
    setOpen(true);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Agendamentos</h1>
          <p className="text-sm text-muted-foreground mt-1">Gerenciar agendamentos</p>
        </div>
        <Button onClick={openNew} className="gap-2"><Plus className="w-4 h-4" /> Novo</Button>
      </div>
      <DivisaoSelector value={divisao} onChange={setDivisao} />

      {isLoading ? (
        <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
      ) : !data || data.length === 0 ? (
        <div className="glass-card p-12 text-center"><p className="text-muted-foreground text-lg">Sem dados ainda</p></div>
      ) : (
        <div className="glass-card overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cliente</TableHead>
                <TableHead>Telefone</TableHead>
                <TableHead>Closer</TableHead>
                <TableHead>Data</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map(a => (
                <TableRow key={a.id}>
                  <TableCell className="font-medium">{a.nome_cliente}</TableCell>
                  <TableCell>{a.telefone}</TableCell>
                  <TableCell>{closerMap[a.closer_id ?? ''] ?? '—'}</TableCell>
                  <TableCell>{a.data_agendamento ? new Date(a.data_agendamento).toLocaleDateString('pt-BR') : '—'}</TableCell>
                  <TableCell><span className="px-2 py-0.5 rounded-full text-xs bg-secondary text-secondary-foreground">{a.status}</span></TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(a)}><Pencil className="w-4 h-4" /></Button>
                      <Button variant="ghost" size="icon" onClick={() => remove.mutate(a.id)}><Trash2 className="w-4 h-4 text-destructive" /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="bg-card border-border">
          <DialogHeader><DialogTitle>{editing ? 'Editar Agendamento' : 'Novo Agendamento'}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <Input placeholder="Nome do cliente" value={form.nome_cliente} onChange={e => setForm(f => ({ ...f, nome_cliente: e.target.value }))} />
            <Input placeholder="Telefone" value={form.telefone} onChange={e => setForm(f => ({ ...f, telefone: e.target.value }))} />
            <Select value={form.closer_id} onValueChange={v => setForm(f => ({ ...f, closer_id: v }))}>
              <SelectTrigger><SelectValue placeholder="Closer" /></SelectTrigger>
              <SelectContent>{(closers ?? []).map(c => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}</SelectContent>
            </Select>
            <Input type="datetime-local" value={form.data_agendamento} onChange={e => setForm(f => ({ ...f, data_agendamento: e.target.value }))} />
            <Input placeholder="Status" value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))} />
            <Input placeholder="Observações" value={form.observacoes} onChange={e => setForm(f => ({ ...f, observacoes: e.target.value }))} />
            <Button onClick={() => save.mutate()} className="w-full" disabled={save.isPending}>
              {save.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : editing ? 'Salvar' : 'Criar'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
