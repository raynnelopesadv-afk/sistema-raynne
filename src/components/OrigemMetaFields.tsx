import { useQuery } from '@tanstack/react-query';
import { Megaphone } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

// Tabelas de integração ainda fora do types.ts gerado.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export interface OrigemMeta {
  meta_campaign_id: string;
  meta_adset_id: string;
  meta_ad_id: string;
}

interface Props {
  value: OrigemMeta;
  onChange: (v: OrigemMeta) => void;
}

const NONE = '__none__';

/**
 * Selects em cascata Campanha → Conjunto → Anúncio usando os IDs REAIS
 * da Meta (sincronizados na aba Meta Ads). Alimenta o cruzamento
 * tráfego × fechamento no BI. Todos opcionais.
 */
export function OrigemMetaFields({ value, onChange }: Props) {
  const { data: campaigns } = useQuery({
    queryKey: ['meta-campaigns-select'],
    queryFn: async () => (await db.from('meta_campaigns').select('id, name, status').order('name')).data as { id: string; name: string; status: string }[] ?? [],
  });
  const { data: adsets } = useQuery({
    queryKey: ['meta-adsets-select'],
    queryFn: async () => (await db.from('meta_adsets').select('id, campaign_id, name').order('name')).data as { id: string; campaign_id: string | null; name: string }[] ?? [],
  });
  const { data: ads } = useQuery({
    queryKey: ['meta-ads-select'],
    queryFn: async () => (await db.from('meta_ads').select('id, adset_id, campaign_id, name').order('name')).data as { id: string; adset_id: string | null; campaign_id: string | null; name: string }[] ?? [],
  });

  if (!campaigns || campaigns.length === 0) return null; // sem sync da Meta ainda — não polui o formulário

  const adsetOpts = (adsets ?? []).filter(s => !value.meta_campaign_id || s.campaign_id === value.meta_campaign_id);
  const adOpts = (ads ?? []).filter(a =>
    (!value.meta_campaign_id || a.campaign_id === value.meta_campaign_id) &&
    (!value.meta_adset_id || a.adset_id === value.meta_adset_id));

  return (
    <div className="space-y-2 rounded-xl border border-border p-3">
      <p className="text-xs text-muted-foreground flex items-center gap-1.5">
        <Megaphone className="w-3.5 h-3.5 text-primary" /> Origem do lead (Meta Ads) — opcional, alimenta o CAC por campanha
      </p>
      <Select
        value={value.meta_campaign_id || NONE}
        onValueChange={v => onChange({ meta_campaign_id: v === NONE ? '' : v, meta_adset_id: '', meta_ad_id: '' })}
      >
        <SelectTrigger><SelectValue placeholder="Campanha de origem" /></SelectTrigger>
        <SelectContent className="max-h-64 overflow-y-auto">
          <SelectItem value={NONE}>Sem campanha / outra origem</SelectItem>
          {campaigns.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
        </SelectContent>
      </Select>
      {value.meta_campaign_id && (
        <Select
          value={value.meta_adset_id || NONE}
          onValueChange={v => onChange({ ...value, meta_adset_id: v === NONE ? '' : v, meta_ad_id: '' })}
        >
          <SelectTrigger><SelectValue placeholder="Conjunto de anúncios (opcional)" /></SelectTrigger>
          <SelectContent className="max-h-64 overflow-y-auto">
            <SelectItem value={NONE}>Não sei o conjunto</SelectItem>
            {adsetOpts.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
          </SelectContent>
        </Select>
      )}
      {value.meta_campaign_id && (
        <Select
          value={value.meta_ad_id || NONE}
          onValueChange={v => onChange({ ...value, meta_ad_id: v === NONE ? '' : v })}
        >
          <SelectTrigger><SelectValue placeholder="Anúncio/criativo (opcional)" /></SelectTrigger>
          <SelectContent className="max-h-64 overflow-y-auto">
            <SelectItem value={NONE}>Não sei o anúncio</SelectItem>
            {adOpts.map(a => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
          </SelectContent>
        </Select>
      )}
    </div>
  );
}
