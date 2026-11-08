import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, SearchX, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';

// Tabelas de integração fora do types.ts gerado.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

interface LhLeadMatch {
  id: string;
  contact_number: string | null;
  contact_name: string | null;
  source_id: string | null;
  status_id: string | null;
  created_at: string | null;
}

/** Só dígitos; usa os últimos 8 para casar apesar de DDI/DDD/formatação. */
function last8(phone: string): string | null {
  const digits = (phone || '').replace(/\D/g, '');
  return digits.length >= 8 ? digits.slice(-8) : null;
}

/**
 * Dado o telefone digitado no fechamento, procura o lead correspondente no
 * Liderhub (já sincronizado) e mostra a jornada dele: origem, status e data
 * de entrada. Confirma que a venda veio do tráfego pago, sem o closer
 * precisar adivinhar.
 */
export function LeadLiderhubLookup({ phone }: { phone: string }) {
  const key = last8(phone);

  const { data: labels } = useQuery({
    queryKey: ['lh-labels'],
    queryFn: async () => (await db.from('lh_labels').select('id, kind, name')).data as { id: string; kind: string; name: string }[] ?? [],
    staleTime: 5 * 60_000,
  });

  const { data: match, isFetching } = useQuery({
    queryKey: ['lh-lead-lookup', key],
    enabled: !!key,
    queryFn: async () => {
      const { data } = await db
        .from('lh_leads')
        .select('id, contact_number, contact_name, source_id, status_id, created_at')
        .ilike('contact_number', `%${key}%`)
        .order('created_at', { ascending: false })
        .limit(1);
      return (data?.[0] ?? null) as LhLeadMatch | null;
    },
    staleTime: 60_000,
  });

  const nameOf = useMemo(() => {
    const m = new Map((labels ?? []).map(l => [l.id, l.name]));
    return (id: string | null) => (id ? m.get(id) ?? null : null);
  }, [labels]);

  if (!key) return null;

  if (isFetching) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground rounded-lg border border-border px-3 py-2">
        <Loader2 className="w-3.5 h-3.5 animate-spin" /> Procurando lead no Liderhub…
      </div>
    );
  }

  if (!match) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground rounded-lg border border-border px-3 py-2">
        <SearchX className="w-3.5 h-3.5" /> Nenhum lead com esse telefone no Liderhub (pode ser origem orgânica/indicação).
      </div>
    );
  }

  const origem = nameOf(match.source_id);
  const status = nameOf(match.status_id);
  const entrada = match.created_at
    ? new Date(match.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
    : null;

  return (
    <div className="rounded-lg border border-bi-green/30 bg-bi-green/5 px-3 py-2 space-y-1">
      <p className="text-xs font-medium text-bi-green flex items-center gap-1.5">
        <CheckCircle2 className="w-3.5 h-3.5" /> Lead encontrado no Liderhub{match.contact_name ? ` · ${match.contact_name}` : ''}
      </p>
      <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-[11px] text-muted-foreground">
        <span>Origem: <strong className="text-foreground">{origem ?? '—'}</strong></span>
        <span>Status: <strong className="text-foreground">{status ?? '—'}</strong></span>
        {entrada && <span>Entrou em: <strong className="text-foreground">{entrada}</strong></span>}
      </div>
    </div>
  );
}
