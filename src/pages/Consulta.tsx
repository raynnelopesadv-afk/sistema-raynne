import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2, Search } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

export default function Consulta() {
  const [search, setSearch] = useState('');
  const q = search.trim();

  const { data: clientes, isLoading: l1 } = useQuery({
    queryKey: ['consulta-clientes', q],
    queryFn: async () => {
      if (!q) return [];
      let query = supabase.from('clientes_fechados').select('*').limit(20);
      if (/^\d+$/.test(q)) query = query.ilike('telefone', `%${q}%`);
      else query = query.ilike('nome_cliente', `%${q}%`);
      const { data } = await query;
      return data ?? [];
    },
    enabled: q.length >= 2,
  });

  const { data: agendamentos, isLoading: l2 } = useQuery({
    queryKey: ['consulta-agendamentos', q],
    queryFn: async () => {
      if (!q) return [];
      let query = supabase.from('agendamentos').select('*').limit(20);
      if (/^\d+$/.test(q)) query = query.ilike('telefone', `%${q}%`);
      else query = query.ilike('nome_cliente', `%${q}%`);
      const { data } = await query;
      return data ?? [];
    },
    enabled: q.length >= 2,
  });

  const loading = l1 || l2;

  return (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-bold text-foreground">Consulta</h1><p className="text-sm text-muted-foreground mt-1">Busca global por nome ou telefone</p></div>
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input placeholder="Digite nome ou telefone (mín. 2 caracteres)..." className="pl-9" value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      {q.length < 2 ? (
        <div className="glass-card p-12 text-center"><p className="text-muted-foreground">Digite pelo menos 2 caracteres para buscar</p></div>
      ) : loading ? (
        <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
      ) : (
        <div className="space-y-6">
          <div>
            <h2 className="text-lg font-semibold text-foreground mb-3">Clientes Fechados ({(clientes ?? []).length})</h2>
            {(clientes ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum resultado</p>
            ) : (
              <div className="glass-card overflow-hidden overflow-x-auto">
                <Table>
                  <TableHeader><TableRow><TableHead>Nome</TableHead><TableHead>Telefone</TableHead><TableHead>Divisão</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
                  <TableBody>{(clientes ?? []).map(c => (
                    <TableRow key={c.id}><TableCell className="font-medium">{c.nome_cliente}</TableCell><TableCell>{c.telefone}</TableCell><TableCell>{c.divisao}</TableCell><TableCell>{c.status_qualificacao}</TableCell></TableRow>
                  ))}</TableBody>
                </Table>
              </div>
            )}
          </div>
          <div>
            <h2 className="text-lg font-semibold text-foreground mb-3">Agendamentos ({(agendamentos ?? []).length})</h2>
            {(agendamentos ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum resultado</p>
            ) : (
              <div className="glass-card overflow-hidden overflow-x-auto">
                <Table>
                  <TableHeader><TableRow><TableHead>Cliente</TableHead><TableHead>Telefone</TableHead><TableHead>Divisão</TableHead><TableHead>Data</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
                  <TableBody>{(agendamentos ?? []).map(a => (
                    <TableRow key={a.id}><TableCell className="font-medium">{a.nome_cliente}</TableCell><TableCell>{a.telefone}</TableCell><TableCell>{a.divisao}</TableCell><TableCell>{a.data_agendamento ? new Date(a.data_agendamento).toLocaleDateString('pt-BR') : '—'}</TableCell><TableCell>{a.status}</TableCell></TableRow>
                  ))}</TableBody>
                </Table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
