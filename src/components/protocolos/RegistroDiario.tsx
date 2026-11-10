import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Plus, Trash2, ChevronLeft, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import { addDays, format, parseISO } from 'date-fns';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/contexts/AuthContext';
import { useUserRole } from '@/hooks/useUserRole';
import { db } from '@/lib/juridico-db';
import { fmtData, hojeISO } from '@/lib/juridico';
import {
  AREAS, BENEFICIOS_SUGERIDOS, TIPO_PROTOCOLO_CURTO, TIPO_PROTOCOLO_LABEL, nomeAmigavel,
  type Protocolo, type TipoProtocolo,
} from '@/lib/protocolos';

export interface Colaborador { user_id: string; nome: string }

const VAZIO = { tipo: 'requerimento_adm' as TipoProtocolo, area: 'Previdenciário', cliente_nome: '', beneficio: '', numero: '', orgao: '', descricao: '' };

export function useColaboradores() {
  return useQuery({
    queryKey: ['colaboradores-juridico'],
    queryFn: async () => {
      const { data, error } = await db.rpc('colaboradores_juridico');
      if (error) throw error;
      return (data ?? []) as Colaborador[];
    },
  });
}

export function RegistroDiario() {
  const { user } = useAuth();
  const { isGestor } = useUserRole();
  const qc = useQueryClient();
  const colabs = useColaboradores();
  const [data, setData] = useState(hojeISO());
  const [colab, setColab] = useState<string>('');
  const [form, setForm] = useState(VAZIO);
  const quem = colab || user?.id || '';

  const { data: doDia, isLoading } = useQuery({
    queryKey: ['protocolos-dia', data],
    queryFn: async () => {
      const { data: rows, error } = await db.from('protocolos_operacional').select('*').eq('data', data).order('criado_em', { ascending: false });
      if (error) throw error;
      return (rows ?? []) as Protocolo[];
    },
  });

  const porColab = useMemo(() => {
    const m = new Map<string, { nome: string; qtd: number }>();
    for (const p of doDia ?? []) {
      const x = m.get(p.colaborador_id) ?? { nome: nomeAmigavel(p.colaborador_nome), qtd: 0 };
      x.qtd += 1;
      m.set(p.colaborador_id, x);
    }
    return [...m.values()].sort((a, b) => b.qtd - a.qtd);
  }, [doDia]);

  const salvar = useMutation({
    mutationFn: async () => {
      if (!form.cliente_nome.trim()) throw new Error('Informe o nome do cliente.');
      const { error } = await db.from('protocolos_operacional').insert({
        data, colaborador_id: quem, tipo: form.tipo, area: form.area || null,
        cliente_nome: form.cliente_nome.trim(), beneficio: form.beneficio.trim() || null,
        numero: form.numero.trim() || null, orgao: form.orgao.trim() || null, descricao: form.descricao.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['protocolos-dia'] });
      qc.invalidateQueries({ queryKey: ['protocolos-periodo'] });
      setForm({ ...VAZIO, tipo: form.tipo, area: form.area });
      toast.success('Protocolo lançado');
    },
    onError: (e: Error) => toast.error(e.message.includes('row-level security') ? 'Você só pode lançar protocolos em seu nome.' : e.message),
  });

  const apagar = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.from('protocolos_operacional').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['protocolos-dia'] });
      qc.invalidateQueries({ queryKey: ['protocolos-periodo'] });
      toast.success('Lançamento apagado');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const set = (k: keyof typeof VAZIO, v: string) => setForm(f => ({ ...f, [k]: v }));
  const mudarDia = (n: number) => setData(format(addDays(parseISO(data), n), 'yyyy-MM-dd'));

  return (
    <div className="grid lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)] gap-4 items-start">
      <form
        className="glass-card p-4 space-y-3"
        onSubmit={e => { e.preventDefault(); salvar.mutate(); }}
      >
        <h2 className="font-semibold">Lançar protocolo</h2>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label className="text-xs">Data</Label>
            <Input type="date" value={data} onChange={e => setData(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Colaborador</Label>
            {isGestor ? (
              <Select value={quem} onValueChange={setColab}>
                <SelectTrigger><SelectValue placeholder="Escolha" /></SelectTrigger>
                <SelectContent>
                  {(colabs.data ?? []).map(c => <SelectItem key={c.user_id} value={c.user_id}>{nomeAmigavel(c.nome)}</SelectItem>)}
                </SelectContent>
              </Select>
            ) : (
              <Input value={nomeAmigavel((colabs.data ?? []).find(c => c.user_id === user?.id)?.nome) || 'Você'} disabled />
            )}
          </div>
        </div>
        <div>
          <Label className="text-xs">O que foi protocolado</Label>
          <Select value={form.tipo} onValueChange={v => set('tipo', v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {(Object.keys(TIPO_PROTOCOLO_LABEL) as TipoProtocolo[]).map(t => <SelectItem key={t} value={t}>{TIPO_PROTOCOLO_LABEL[t]}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label className="text-xs">Área</Label>
            <Select value={form.area} onValueChange={v => set('area', v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{AREAS.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Benefício / assunto</Label>
            <Input list="beneficios" value={form.beneficio} onChange={e => set('beneficio', e.target.value)} placeholder="BPC/LOAS" />
            <datalist id="beneficios">{BENEFICIOS_SUGERIDOS.map(b => <option key={b} value={b} />)}</datalist>
          </div>
        </div>
        <div>
          <Label className="text-xs">Cliente *</Label>
          <Input value={form.cliente_nome} onChange={e => set('cliente_nome', e.target.value)} placeholder="Nome do cliente" />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label className="text-xs">Nº do protocolo / processo</Label>
            <Input value={form.numero} onChange={e => set('numero', e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Órgão</Label>
            <Input value={form.orgao} onChange={e => set('orgao', e.target.value)} placeholder="INSS, TJMG, JEF…" />
          </div>
        </div>
        <div>
          <Label className="text-xs">O que foi feito</Label>
          <Textarea rows={2} value={form.descricao} onChange={e => set('descricao', e.target.value)} placeholder="Ex.: requerimento com laudo e CadÚnico anexados" />
        </div>
        <Button type="submit" className="w-full" disabled={salvar.isPending}>
          {salvar.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Plus className="w-4 h-4 mr-1" />Lançar e começar o próximo</>}
        </Button>
      </form>

      <section className="glass-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-1">
            <Button size="icon" variant="ghost" onClick={() => mudarDia(-1)} aria-label="Dia anterior"><ChevronLeft className="w-4 h-4" /></Button>
            <h2 className="font-semibold first-letter:uppercase">{fmtData(data, "EEEE, dd/MM")}</h2>
            <Button size="icon" variant="ghost" onClick={() => mudarDia(1)} aria-label="Próximo dia"><ChevronRight className="w-4 h-4" /></Button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {porColab.map(c => (
              <span key={c.nome} className="rounded-full border border-border bg-card px-2.5 py-0.5 text-xs">
                {c.nome} <b className="text-primary">{c.qtd}</b>
              </span>
            ))}
          </div>
        </div>
        {isLoading ? <Loader2 className="w-5 h-5 animate-spin text-primary" /> : (doDia ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum protocolo lançado neste dia.</p>
        ) : (
          <div className="divide-y divide-border">
            {(doDia ?? []).map(p => (
              <div key={p.id} className="py-2.5 flex items-start gap-3 text-sm">
                <span className="text-[11px] rounded bg-secondary px-1.5 py-0.5 shrink-0 mt-0.5">{TIPO_PROTOCOLO_CURTO[p.tipo]}</span>
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{p.cliente_nome}{p.beneficio ? <span className="text-muted-foreground font-normal"> · {p.beneficio}</span> : null}</p>
                  <p className="text-xs text-muted-foreground">
                    {nomeAmigavel(p.colaborador_nome)}{p.orgao ? ` · ${p.orgao}` : ''}{p.numero ? ` · nº ${p.numero}` : ''}{p.area ? ` · ${p.area}` : ''}
                  </p>
                  {p.descricao && <p className="text-xs mt-0.5">{p.descricao}</p>}
                </div>
                {(isGestor || p.colaborador_id === user?.id) && (
                  <Button size="icon" variant="ghost" aria-label="Apagar lançamento"
                    onClick={() => { if (window.confirm(`Apagar o protocolo de ${p.cliente_nome}?`)) apagar.mutate(p.id); }}>
                    <Trash2 className="w-4 h-4 text-muted-foreground" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
