import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { db } from '@/lib/juridico-db';
import { nomeAmigavel } from '@/lib/protocolos';
import type { Setor } from '@/lib/tarefas';
import type { Colaborador } from '@/components/protocolos/RegistroDiario';

interface Props {
  open: boolean;
  onClose: () => void;
  setores: Setor[];
  membros: { setor_id: string; user_id: string }[];
  colaboradores: Colaborador[];
}

export function SetoresDialog({ open, onClose, setores, membros, colaboradores }: Props) {
  const qc = useQueryClient();
  const [novo, setNovo] = useState('');
  const [cor, setCor] = useState('#0E7490');
  const atualizar = () => { qc.invalidateQueries({ queryKey: ['setores'] }); qc.invalidateQueries({ queryKey: ['setor-membros'] }); };
  const erro = (e: Error) => toast.error(e.message);

  const criar = useMutation({
    mutationFn: async () => {
      const ordem = Math.max(0, ...setores.map(s => s.ordem)) + 10;
      const { error } = await db.from('setores').insert({ nome: novo.trim(), cor, ordem });
      if (error) throw error;
    },
    onSuccess: () => { setNovo(''); atualizar(); toast.success('Setor criado'); },
    onError: erro,
  });

  const editar = useMutation({
    mutationFn: async (p: { id: string; campos: Partial<Setor> }) => {
      const { error } = await db.from('setores').update(p.campos).eq('id', p.id);
      if (error) throw error;
    },
    onSuccess: atualizar,
    onError: erro,
  });

  const membro = useMutation({
    mutationFn: async (p: { setor_id: string; user_id: string; incluir: boolean }) => {
      const { error } = p.incluir
        ? await db.from('setor_membros').insert({ setor_id: p.setor_id, user_id: p.user_id })
        : await db.from('setor_membros').delete().eq('setor_id', p.setor_id).eq('user_id', p.user_id);
      if (error) throw error;
    },
    onSuccess: atualizar,
    onError: erro,
  });

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Setores do escritório</DialogTitle></DialogHeader>
        <p className="text-xs text-muted-foreground -mt-2">
          Marque quem trabalha em cada setor. Quem é do setor pode mexer em todas as tarefas dele.
        </p>

        <div className="space-y-3">
          {setores.map(s => (
            <div key={s.id} className={`rounded-lg border border-border p-3 ${s.ativo ? '' : 'opacity-60'}`}>
              <div className="flex items-center gap-2">
                <input type="color" value={s.cor} aria-label="Cor do setor" className="w-7 h-7 rounded cursor-pointer bg-transparent"
                  onChange={e => editar.mutate({ id: s.id, campos: { cor: e.target.value } })} />
                <Input defaultValue={s.nome} className="h-8 flex-1"
                  onBlur={e => { const v = e.target.value.trim(); if (v && v !== s.nome) editar.mutate({ id: s.id, campos: { nome: v } }); }} />
                <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Switch checked={s.ativo} onCheckedChange={v => editar.mutate({ id: s.id, campos: { ativo: v } })} /> Ativo
                </label>
              </div>
              <div className="flex flex-wrap gap-1.5 mt-2">
                {colaboradores.map(c => {
                  const dentro = membros.some(m => m.setor_id === s.id && m.user_id === c.user_id);
                  return (
                    <button key={c.user_id} type="button" disabled={membro.isPending}
                      onClick={() => membro.mutate({ setor_id: s.id, user_id: c.user_id, incluir: !dentro })}
                      className="text-xs rounded-full border px-2.5 py-0.5 transition-colors"
                      style={dentro ? { background: s.cor, borderColor: s.cor, color: '#fff' } : undefined}>
                      {nomeAmigavel(c.nome)}
                    </button>
                  );
                })}
                {colaboradores.length === 0 && <span className="text-xs text-muted-foreground">Nenhum colaborador liberado ainda.</span>}
              </div>
            </div>
          ))}
        </div>

        <form className="flex items-center gap-2 border-t border-border pt-3" onSubmit={e => { e.preventDefault(); if (novo.trim()) criar.mutate(); }}>
          <input type="color" value={cor} onChange={e => setCor(e.target.value)} aria-label="Cor do novo setor" className="w-8 h-8 rounded cursor-pointer bg-transparent" />
          <Input value={novo} onChange={e => setNovo(e.target.value)} placeholder="Novo setor (ex.: Trabalhista)" className="flex-1" />
          <Button type="submit" size="sm" disabled={!novo.trim() || criar.isPending}>
            {criar.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4 mr-1" />} Criar
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
