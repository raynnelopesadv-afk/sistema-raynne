import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { db } from '@/lib/juridico-db';
import {
  hojeISO, somaDias, fmtData, TIPO_AGENDA_LABEL, type ItemAgenda, type TipoAgenda,
} from '@/lib/juridico';
import { UrgenciaBadge } from '@/components/juridico/UrgenciaBadge';

type Filtro = 'abertos' | 'atrasados' | 'hoje' | 'semana' | 'mes' | 'concluidos';

const FILTROS: { v: Filtro; l: string }[] = [
  { v: 'abertos', l: 'Todos em aberto' },
  { v: 'atrasados', l: 'Atrasados' },
  { v: 'hoje', l: 'Hoje' },
  { v: 'semana', l: 'Próximos 7 dias' },
  { v: 'mes', l: 'Próximos 30 dias' },
  { v: 'concluidos', l: 'Feitos (30 dias)' },
];

const FONTE_LABEL: Record<string, string> = {
  tramitacao: 'Tramitação', google_agenda: 'Google Agenda', inss: 'INSS', manual: 'Lançado à mão',
};

const VAZIO = { tipo: 'prazo' as TipoAgenda, titulo: '', data: '', hora: '', numero_processo: '', cliente: '', responsavel_nome: '', observacao: '' };

export default function AgendaJuridica() {
  const [params] = useSearchParams();
  const [filtro, setFiltro] = useState<Filtro>((params.get('filtro') as Filtro) || 'abertos');
  const [tipo, setTipo] = useState<string>(params.get('tipo') || 'todos');
  const [busca, setBusca] = useState('');
  const [novo, setNovo] = useState(false);
  const [form, setForm] = useState(VAZIO);
  const qc = useQueryClient();
  const hoje = hojeISO();

  const { data, isLoading } = useQuery({
    queryKey: ['agenda-juridica', filtro],
    queryFn: async () => {
      let q = db.from('agenda_juridica').select('*');
      if (filtro === 'concluidos') q = q.eq('concluido', true).gte('data', somaDias(hoje, -30));
      else q = q.eq('concluido', false);
      if (filtro === 'atrasados') q = q.lt('data', hoje);
      if (filtro === 'hoje') q = q.eq('data', hoje);
      if (filtro === 'semana') q = q.gte('data', hoje).lte('data', somaDias(hoje, 7));
      if (filtro === 'mes') q = q.gte('data', hoje).lte('data', somaDias(hoje, 30));
      const { data, error } = await q.order('data', { ascending: filtro !== 'concluidos' }).order('hora').limit(1000);
      if (error) throw error;
      return (data ?? []) as ItemAgenda[];
    },
  });

  const itens = useMemo(() => {
    const t = busca.trim().toLowerCase();
    return (data ?? []).filter(i => {
      if (tipo === 'audiencia' && !['audiencia', 'pericia'].includes(i.tipo)) return false;
      if (tipo !== 'todos' && tipo !== 'audiencia' && i.tipo !== tipo) return false;
      if (!t) return true;
      return [i.titulo, i.numero_processo, i.cliente, i.responsavel_nome].some(x => x?.toLowerCase().includes(t));
    });
  }, [data, tipo, busca]);

  const concluir = useMutation({
    mutationFn: async ({ id, concluido }: { id: string; concluido: boolean }) => {
      const { error } = await db.from('agenda_juridica').update({ concluido }).eq('id', id);
      if (error) throw error;
      const item = (data ?? []).find(i => i.id === id);
      if (item?.fonte === 'inss' && item.id_externo) {
        await db.from('inss_requerimentos').update({ cumprido: concluido }).eq('protocolo', item.id_externo);
      }
    },
    onSuccess: (_, v) => {
      qc.invalidateQueries({ queryKey: ['agenda-juridica'] });
      qc.invalidateQueries({ queryKey: ['painel-agenda'] });
      toast.success(v.concluido ? 'Marcado como feito' : 'Reaberto');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const salvar = useMutation({
    mutationFn: async () => {
      if (!form.titulo || !form.data) throw new Error('Preencha título e data.');
      const { error } = await db.from('agenda_juridica').insert({
        fonte: 'manual', tipo: form.tipo, titulo: form.titulo, data: form.data,
        hora: form.hora || null, numero_processo: form.numero_processo || null,
        cliente: form.cliente || null, responsavel_nome: form.responsavel_nome || null,
        observacao: form.observacao || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['agenda-juridica'] });
      setNovo(false); setForm(VAZIO); toast.success('Incluído na agenda');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="titulo-pagina text-3xl">Prazos e Audiências</h1>
          <p className="text-sm text-muted-foreground">Atualizado sozinho todo dia pela Tramitação Inteligente e pelo Google Agenda</p>
        </div>
        <Button onClick={() => setNovo(true)}><Plus className="w-4 h-4 mr-1" /> Lançar à mão</Button>
      </div>

      <div className="flex flex-wrap gap-2">
        {FILTROS.map(f => (
          <button key={f.v} onClick={() => setFiltro(f.v)}
            className={`rounded-full border px-3 py-1 text-xs ${filtro === f.v ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:text-foreground'}`}>
            {f.l}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <Select value={tipo} onValueChange={setTipo}>
          <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os tipos</SelectItem>
            <SelectItem value="audiencia">Audiências e perícias</SelectItem>
            {(Object.keys(TIPO_AGENDA_LABEL) as TipoAgenda[]).map(t => (
              <SelectItem key={t} value={t}>{TIPO_AGENDA_LABEL[t]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input placeholder="Buscar por título, processo, cliente ou responsável" value={busca} onChange={e => setBusca(e.target.value)} className="max-w-md" />
        <span className="self-center text-xs text-muted-foreground">{itens.length} itens</span>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
      ) : itens.length === 0 ? (
        <p className="glass-card p-6 text-sm text-muted-foreground">Nada por aqui com esses filtros.</p>
      ) : (
        <div className="glass-card divide-y divide-border">
          {itens.map(i => (
            <div key={i.id} className="p-3 flex items-start gap-3">
              <Checkbox className="mt-1" checked={i.concluido}
                onCheckedChange={v => concluir.mutate({ id: i.id, concluido: v === true })} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <UrgenciaBadge data={i.data} feito={i.concluido} />
                  <span className="text-[11px] rounded bg-secondary px-1.5 py-0.5">{TIPO_AGENDA_LABEL[i.tipo]}</span>
                  <span className="text-[11px] text-muted-foreground">{FONTE_LABEL[i.fonte]}</span>
                </div>
                <p className={`mt-1 font-medium leading-snug ${i.concluido ? 'line-through text-muted-foreground' : ''}`}>{i.titulo}</p>
                <p className="text-xs text-muted-foreground">
                  {fmtData(i.data, 'EEE, dd/MM/yyyy')}{i.hora ? ` às ${i.hora.slice(0, 5)}` : ''}
                  {i.numero_processo ? ` · ${i.numero_processo}` : ''}{i.cliente ? ` · ${i.cliente}` : ''}
                  {i.local ? ` · ${i.local}` : ''}{i.responsavel_nome ? ` · Resp.: ${i.responsavel_nome}` : ''}
                </p>
                {i.observacao && <p className="text-xs text-muted-foreground mt-1">{i.observacao}</p>}
              </div>
              {i.link && <a href={i.link} target="_blank" rel="noreferrer" className="text-xs text-primary shrink-0">abrir</a>}
            </div>
          ))}
        </div>
      )}

      <Dialog open={novo} onOpenChange={setNovo}>
        <DialogContent>
          <DialogHeader><DialogTitle>Novo item na agenda</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <Select value={form.tipo} onValueChange={v => setForm({ ...form, tipo: v as TipoAgenda })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(TIPO_AGENDA_LABEL) as TipoAgenda[]).map(t => <SelectItem key={t} value={t}>{TIPO_AGENDA_LABEL[t]}</SelectItem>)}
              </SelectContent>
            </Select>
            <Input placeholder="Título" value={form.titulo} onChange={e => setForm({ ...form, titulo: e.target.value })} />
            <div className="grid grid-cols-2 gap-2">
              <Input type="date" value={form.data} onChange={e => setForm({ ...form, data: e.target.value })} />
              <Input type="time" value={form.hora} onChange={e => setForm({ ...form, hora: e.target.value })} />
            </div>
            <Input placeholder="Número do processo" value={form.numero_processo} onChange={e => setForm({ ...form, numero_processo: e.target.value })} />
            <Input placeholder="Cliente" value={form.cliente} onChange={e => setForm({ ...form, cliente: e.target.value })} />
            <Input placeholder="Responsável" value={form.responsavel_nome} onChange={e => setForm({ ...form, responsavel_nome: e.target.value })} />
            <Input placeholder="Observação" value={form.observacao} onChange={e => setForm({ ...form, observacao: e.target.value })} />
            <Button onClick={() => salvar.mutate()} disabled={salvar.isPending}>Salvar</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
