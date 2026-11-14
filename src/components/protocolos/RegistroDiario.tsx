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
import { supabase } from '@/lib/supabase';
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

interface NaFila { id: string; nome_cliente: string; divisao: string; product_id: string | null; data_fechamento: string | null }
const normNome = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim();
// Lançar estes tipos tira o cliente da fila de "aguardando protocolo" (tela Processos)
const TIPOS_QUE_PROTOCOLAM: Record<string, 'administrativo' | 'judicial'> = { requerimento_adm: 'administrativo', acao_judicial: 'judicial' };

export function RegistroDiario() {
  const { user } = useAuth();
  const { isGestor } = useUserRole();
  const qc = useQueryClient();
  const colabs = useColaboradores();
  const [data, setData] = useState(hojeISO());
  const [colab, setColab] = useState<string>('');
  const [form, setForm] = useState(VAZIO);
  const [filaId, setFilaId] = useState<string | null>(null);
  const quem = colab || user?.id || '';

  // Fila: contratos fechados que ainda não foram protocolados
  const fila = useQuery({
    queryKey: ['fila-protocolo'],
    queryFn: async () => {
      const [{ data: rows, error }, { data: prods }] = await Promise.all([
        supabase.from('clientes_fechados').select('id, nome_cliente, divisao, product_id, data_fechamento')
          .eq('protocolado', false).not('status_qualificacao', 'in', '(desqualificado,desistencia)').limit(5000),
        supabase.from('products').select('id, nome'),
      ]);
      if (error) throw error;
      const nomeProd = Object.fromEntries((prods ?? []).map(p => [p.id, p.nome as string]));
      return { lista: (rows ?? []) as NaFila[], nomeProd };
    },
  });
  const escolhido = (fila.data?.lista ?? []).find(c => c.id === filaId) ?? null;
  const sugestoes = useMemo(() => {
    const t = normNome(form.cliente_nome);
    if (filaId || t.length < 2) return [];
    return (fila.data?.lista ?? []).filter(c => normNome(c.nome_cliente).includes(t)).slice(0, 6);
  }, [form.cliente_nome, filaId, fila.data]);
  const escolher = (c: NaFila) => {
    const prod = c.product_id ? fila.data?.nomeProd[c.product_id] : undefined;
    setFilaId(c.id);
    setForm(f => ({
      ...f,
      cliente_nome: c.nome_cliente,
      area: c.divisao === 'educacao' ? (AREAS.find(a => /a[eé]reo/i.test(a)) ?? f.area) : 'Previdenciário',
      beneficio: f.beneficio || prod || '',
    }));
  };

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
      // cliente da fila: o escolhido na lista ou, se digitou, o único com o mesmo nome
      let alvo = escolhido;
      if (!alvo) {
        const iguais = (fila.data?.lista ?? []).filter(c => normNome(c.nome_cliente) === normNome(form.cliente_nome));
        if (iguais.length === 1) alvo = iguais[0];
      }
      const { error } = await db.from('protocolos_operacional').insert({
        data, colaborador_id: quem, tipo: form.tipo, area: form.area || null,
        cliente_nome: form.cliente_nome.trim(), beneficio: form.beneficio.trim() || null,
        numero: form.numero.trim() || null, orgao: form.orgao.trim() || null, descricao: form.descricao.trim() || null,
      });
      if (error) throw error;
      const tipoProc = TIPOS_QUE_PROTOCOLAM[form.tipo];
      if (alvo && tipoProc) {
        const { error: e2 } = await supabase.from('clientes_fechados').update({
          protocolado: true, data_protocolo: data, tipo_processo: tipoProc, status_qualificacao: 'qualificado',
          ...(form.numero.trim() ? { numero_protocolo: form.numero.trim() } : {}),
        }).eq('id', alvo.id);
        if (e2) return { naFila: false, aviso: `Lançado, mas não consegui marcar ${alvo.nome_cliente} como protocolado em Processos (${e2.message}).` };
        return { naFila: true, aviso: '' };
      }
      return { naFila: false, aviso: '' };
    },
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['protocolos-dia'] });
      qc.invalidateQueries({ queryKey: ['protocolos-periodo'] });
      qc.invalidateQueries({ queryKey: ['fila-protocolo'] });
      qc.invalidateQueries({ queryKey: ['protocolos'] });
      setForm({ ...VAZIO, tipo: form.tipo, area: form.area });
      setFilaId(null);
      if (r?.aviso) toast.warning(r.aviso);
      else toast.success(r?.naFila ? 'Protocolo lançado e cliente saiu da fila de Processos' : 'Protocolo lançado');
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
          <Input value={form.cliente_nome} onChange={e => { setFilaId(null); set('cliente_nome', e.target.value); }} placeholder="Digite e escolha da fila de contratos fechados" />
          {sugestoes.length > 0 && (
            <div className="mt-1 rounded-md border border-border bg-card divide-y divide-border">
              {sugestoes.map(c => (
                <button key={c.id} type="button" onClick={() => escolher(c)} className="w-full text-left px-2.5 py-1.5 text-sm hover:bg-muted">
                  {c.nome_cliente}
                  <span className="text-xs text-muted-foreground"> · {(c.product_id && fila.data?.nomeProd[c.product_id]) || (c.divisao === 'educacao' ? 'Aéreo' : 'Previdenciário')}{c.data_fechamento ? ` · fechado em ${fmtData(c.data_fechamento, 'dd/MM')}` : ''}</span>
                </button>
              ))}
            </div>
          )}
          {escolhido && (
            <p className="mt-1 text-xs text-emerald-700">
              ✓ Cliente da fila de contratos fechados{TIPOS_QUE_PROTOCOLAM[form.tipo] ? ' — ao lançar, sai da fila de Processos como protocolado.' : ' (este tipo de lançamento não tira da fila).'}
              {' '}<button type="button" className="underline" onClick={() => setFilaId(null)}>desvincular</button>
            </p>
          )}
          {fila.data && <p className="mt-1 text-[11px] text-muted-foreground">{fila.data.lista.length} cliente(s) aguardando protocolo.</p>}
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
