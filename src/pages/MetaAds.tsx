import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Loader2, RefreshCw, Megaphone, DollarSign, Users, Percent, Stamp,
  Trophy, AlertTriangle, ImageOff, Wallet, Target,
} from 'lucide-react';
import {
  ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts';
import { supabase } from '@/lib/supabase';
import { KPICard, ConversionFunnel } from '@/components/bi';
import { PeriodSelector, detectPeriodKind } from '@/components/PeriodSelector';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { useUserRole } from '@/hooks/useUserRole';
import { usePermissions } from '@/hooks/usePermissions';

// Tabelas novas ainda não existem no types.ts gerado — cliente sem tipagem estrita.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

interface Campaign { id: string; name: string; status: string; objective: string | null }
interface AdSet { id: string; campaign_id: string | null; name: string; status: string }
interface Ad {
  id: string; adset_id: string | null; campaign_id: string | null; name: string; status: string;
  creative_id: string | null; creative_thumbnail_url: string | null; creative_title: string | null;
  prefilled_message?: string | null;
}
interface InsightRow {
  ad_id: string; date: string; spend: number; impressions: number; reach: number; clicks: number;
  ctr: number | null; frequency: number | null; leads: number; conversations: number;
}
interface LhLead { id: string; status_id: string | null; source_id: string | null; created_at: string | null; first_message?: string | null; contact_number?: string | null }
interface Label { id: string; kind: string; name: string }
interface ClassMap { label_id: string; classification: string }
interface Fechado {
  id: string; valor: number; data_fechamento: string | null; fechado_em: string | null;
  closer_id: string | null; product_id: string | null; telefone: string | null;
  meta_campaign_id: string | null; meta_adset_id: string | null; meta_ad_id: string | null;
}
interface SyncLog { integration: string; started_at: string; finished_at: string | null; ok: boolean | null; items: number; error: string | null }
interface Attrib { phone: string; meta_ad_id: string | null; meta_adset_id: string | null; meta_campaign_id: string | null; source: string | null }

function periodRange(v: string): { start: string; end: string } {
  const kind = detectPeriodKind(v);
  if (kind === 'all') return { start: '1970-01-01', end: '2999-12-31' };
  if (kind === 'range') { const [, s, e] = v.split(':'); return { start: s, end: e }; }
  if (kind === 'year') return { start: `${v}-01-01`, end: `${v}-12-31` };
  const [y, m] = v.split('-').map(Number);
  const last = new Date(y, m, 0).getDate();
  return { start: `${y}-${String(m).padStart(2, '0')}-01`, end: `${y}-${String(m).padStart(2, '0')}-${String(last).padStart(2, '0')}` };
}

const fmtBRL = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: v >= 100 ? 0 : 2 });
const fmtNum = (v: number) => v.toLocaleString('pt-BR');

// Normaliza texto de mensagem para casar 1ª msg do lead × pré-preenchida do anúncio.
const normMsg = (s: string | null | undefined): string =>
  (s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ').trim();
// Últimos 8 dígitos do telefone (casa apesar de DDI/DDD/formatação).
const last8 = (p: string | null | undefined): string | null => {
  const d = (p ?? '').replace(/\D/g, '');
  return d.length >= 8 ? d.slice(-8) : null;
};
// Chave canônica de telefone BR (DDD + 8, sem 55, sem o 9 do celular).
// Espelha public.norm_phone — usada p/ casar com a central lead_attribution.
const normPhone = (p: string | null | undefined): string | null => {
  let d = (p ?? '').replace(/\D/g, '');
  if (d.length >= 12 && d.startsWith('55')) d = d.slice(2);
  if (d.length === 11 && d[2] === '9') d = d.slice(0, 2) + d.slice(3);
  d = d.slice(-10);
  return d.length ? d : null;
};

export default function MetaAds() {
  const now = new Date();
  const [period, setPeriod] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`);
  const [campFilter, setCampFilter] = useState('all');
  const [adsetFilter, setAdsetFilter] = useState('all');
  const [adFilter, setAdFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [produtoFilter, setProdutoFilter] = useState('all');
  const [closerFilter, setCloserFilter] = useState('all');
  const [syncing, setSyncing] = useState<string | null>(null);
  const qc = useQueryClient();
  const { isAgencia } = useUserRole();
  const { can } = usePermissions();
  const isGestor = can('sincronizar_meta');
  const { start, end } = periodRange(period);

  // ---------------- dados base ----------------
  const { data: campaigns } = useQuery({
    queryKey: ['meta-campaigns'],
    queryFn: async () => (await db.from('meta_campaigns').select('id, name, status, objective').order('name')).data as Campaign[] ?? [],
  });
  const { data: adsets } = useQuery({
    queryKey: ['meta-adsets'],
    queryFn: async () => (await db.from('meta_adsets').select('id, campaign_id, name, status')).data as AdSet[] ?? [],
  });
  const { data: ads } = useQuery({
    queryKey: ['meta-ads-list'],
    queryFn: async () => (await db.from('meta_ads').select('id, adset_id, campaign_id, name, status, creative_id, creative_thumbnail_url, creative_title, prefilled_message')).data as Ad[] ?? [],
  });
  const { data: insights, isLoading: loadingInsights } = useQuery({
    queryKey: ['meta-insights', start, end],
    queryFn: async () => (await db.from('meta_insights_daily')
      .select('ad_id, date, spend, impressions, reach, clicks, ctr, frequency, leads, conversations')
      .gte('date', start).lte('date', end)).data as InsightRow[] ?? [],
  });
  const { data: lhLeads } = useQuery({
    queryKey: ['lh-leads', start, end],
    queryFn: async () => (await db.from('lh_leads').select('id, status_id, source_id, created_at, first_message, contact_number')
      .gte('created_at', `${start}T00:00:00Z`).lte('created_at', `${end}T23:59:59Z`)).data as LhLead[] ?? [],
  });
  const { data: labels } = useQuery({
    queryKey: ['lh-labels'],
    queryFn: async () => (await db.from('lh_labels').select('id, kind, name')).data as Label[] ?? [],
  });
  const { data: classMap } = useQuery({
    queryKey: ['lead-class-map'],
    queryFn: async () => (await db.from('lead_class_map').select('label_id, classification')).data as ClassMap[] ?? [],
  });
  const { data: fechados } = useQuery({
    queryKey: ['fechados-meta', start, end],
    queryFn: async () => (await db.from('clientes_fechados')
      .select('id, valor, data_fechamento, fechado_em, closer_id, product_id, telefone, meta_campaign_id, meta_adset_id, meta_ad_id')
      .gte('data_fechamento', start).lte('data_fechamento', end)).data as Fechado[] ?? [],
  });
  const { data: attrib } = useQuery({
    queryKey: ['lead-attribution'],
    queryFn: async () => (await db.from('lead_attribution')
      .select('phone, meta_ad_id, meta_adset_id, meta_campaign_id, source')).data as Attrib[] ?? [],
  });
  const { data: produtos } = useQuery({
    queryKey: ['produtos-options'],
    queryFn: async () => (await db.from('products').select('id, nome').order('nome')).data as { id: string; nome: string }[] ?? [],
  });
  const { data: closers } = useQuery({
    queryKey: ['closers-options'],
    queryFn: async () => (await db.from('closers').select('id, nome').order('nome')).data as { id: string; nome: string }[] ?? [],
  });
  const { data: syncLogs } = useQuery({
    queryKey: ['sync-logs'],
    queryFn: async () => (await db.from('integration_sync_logs')
      .select('integration, started_at, finished_at, ok, items, error')
      .order('started_at', { ascending: false }).limit(20)).data as SyncLog[] ?? [],
    refetchInterval: 15_000,
  });

  // ---------------- sincronização ----------------
  const runSync = async (fn: 'sync-meta' | 'sync-liderhub') => {
    setSyncing(fn);
    try {
      // Meta: puxa 365 dias (ano cheio) de métricas diárias.
      const body = fn === 'sync-meta' ? { days: 365 } : {};
      const { data, error } = await supabase.functions.invoke(fn, { body });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success(`${fn === 'sync-meta' ? 'Meta' : 'Liderhub'}: ${data?.items ?? 0} registros sincronizados`);
      qc.invalidateQueries();
    } catch (e) {
      toast.error(`Falha na sincronização: ${e instanceof Error ? e.message : e}`);
    } finally {
      setSyncing(null);
    }
  };

  const lastSync = (integration: string) => (syncLogs ?? []).find(l => l.integration === integration && l.finished_at);
  const lastErr = (integration: string) => {
    const l = (syncLogs ?? []).find(x => x.integration === integration && x.finished_at);
    return l && l.ok === false ? l.error : null;
  };

  // ---------------- agregações ----------------
  const agg = useMemo(() => {
    const adById = new Map((ads ?? []).map(a => [a.id, a]));
    const campById = new Map((campaigns ?? []).map(c => [c.id, c]));
    const adsetById = new Map((adsets ?? []).map(s => [s.id, s]));
    const classByLabel = new Map((classMap ?? []).map(m => [m.label_id, m.classification]));

    // === Atribuição por anúncio ===
    // Fonte principal: central lead_attribution (telefone → anúncio), alimentada
    // automaticamente pelo CTWA (Liderhub) e pelo webhook de formulário.
    // Fallback: casamento por CÓDIGO/ TEXTO da 1ª mensagem do lead (legado).
    const attrByPhone = new Map<string, Attrib>();
    for (const a of (attrib ?? [])) if (a.phone) attrByPhone.set(a.phone, a);
    const attrAd = (p: string | null | undefined): string | null =>
      attrByPhone.get(normPhone(p) ?? '')?.meta_ad_id ?? null;

    const adCode = (s: string | null | undefined): string | null => {
      const m = (s ?? '').match(/\bad\s*0*(\d{1,4})\b/i);
      return m ? 'ad' + m[1] : null;
    };
    const codeToAd = new Map<string, string>();       // 'ad9' -> ad.id
    const prefilledToAd = new Map<string, string>();  // texto normalizado -> ad.id
    for (const a of (ads ?? [])) {
      const c = adCode(a.name);
      if (c && !codeToAd.has(c)) codeToAd.set(c, a.id);
      const k = normMsg(a.prefilled_message);
      if (k.length >= 8) prefilledToAd.set(k, a.id);
    }
    const phoneToAdId = new Map<string, string>();    // fallback por mensagem (últimos 8)
    for (const l of (lhLeads ?? [])) {
      const c = adCode(l.first_message);
      const adId = (c && codeToAd.get(c)) || prefilledToAd.get(normMsg(l.first_message));
      if (adId) {
        const ph = last8(l.contact_number);
        if (ph && !phoneToAdId.has(ph)) phoneToAdId.set(ph, adId);
      }
    }
    // Anúncio efetivo de um lead: central (telefone) → fallback mensagem.
    const leadAdId = (l: LhLead): string | null =>
      attrAd(l.contact_number) || phoneToAdId.get(last8(l.contact_number) ?? '') || null;
    const leadsAtribuidos = (lhLeads ?? []).filter(l => leadAdId(l)).length;
    // Anúncio/campanha efetivos de um fechamento: manual/central no registro,
    // senão central por telefone, senão fallback por mensagem.
    const effAdId = (f: Fechado): string | null =>
      f.meta_ad_id || attrAd(f.telefone) || phoneToAdId.get(last8(f.telefone) ?? '') || null;
    const effCampId = (f: Fechado): string | null => {
      if (f.meta_campaign_id) return f.meta_campaign_id;
      const ad = effAdId(f);
      return ad ? (adById.get(ad)?.campaign_id ?? null) : null;
    };

    // filtro de anúncios em cima dos insights
    const adPass = (adId: string) => {
      const ad = adById.get(adId);
      if (!ad) return false;
      if (campFilter !== 'all' && ad.campaign_id !== campFilter) return false;
      if (adsetFilter !== 'all' && ad.adset_id !== adsetFilter) return false;
      if (adFilter !== 'all' && ad.id !== adFilter) return false;
      if (statusFilter !== 'all') {
        const camp = ad.campaign_id ? campById.get(ad.campaign_id) : null;
        if ((camp?.status ?? '') !== statusFilter) return false;
      }
      return true;
    };
    const rows = (insights ?? []).filter(r => adPass(r.ad_id));

    const spend = rows.reduce((s, r) => s + Number(r.spend || 0), 0);
    const impressions = rows.reduce((s, r) => s + Number(r.impressions || 0), 0);
    const clicks = rows.reduce((s, r) => s + Number(r.clicks || 0), 0);
    const reach = rows.reduce((s, r) => s + Number(r.reach || 0), 0);
    const metaLeads = rows.reduce((s, r) => s + Number(r.leads || 0) + Number(r.conversations || 0), 0);
    const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;
    const cpl = metaLeads > 0 ? spend / metaLeads : 0;

    // funil comercial (Liderhub)
    const clsOf = (l: LhLead) => (l.status_id ? classByLabel.get(l.status_id) ?? null : null);
    const leadsTot = (lhLeads ?? []).length;
    const qualPlus = ['qualificado', 'mql', 'fechamento'];
    const qualificados = (lhLeads ?? []).filter(l => { const c = clsOf(l); return c !== null && qualPlus.includes(c); }).length;
    const mqls = (lhLeads ?? []).filter(l => { const c = clsOf(l); return c === 'mql' || c === 'fechamento'; }).length;
    const fechamentosLh = (lhLeads ?? []).filter(l => clsOf(l) === 'fechamento').length;
    const desqualificados = (lhLeads ?? []).filter(l => clsOf(l) === 'desqualificado').length;
    const perdidos = (lhLeads ?? []).filter(l => clsOf(l) === 'perdido').length;

    // fechamentos (CRM) com filtros comerciais (usa atribuição efetiva)
    const fechPass = (f: Fechado) => {
      if (produtoFilter !== 'all' && f.product_id !== produtoFilter) return false;
      if (closerFilter !== 'all' && f.closer_id !== closerFilter) return false;
      if (campFilter !== 'all' && effCampId(f) !== campFilter) return false;
      if (adsetFilter !== 'all' && f.meta_adset_id !== adsetFilter) return false;
      if (adFilter !== 'all' && effAdId(f) !== adFilter) return false;
      return true;
    };
    const fechRows = (fechados ?? []).filter(fechPass);
    const fechTotal = fechRows.length;
    const fechAtribuidos = fechRows.filter(f => effCampId(f)).length;
    const fechAutoAttrib = fechRows.filter(f => !f.meta_ad_id && effAdId(f)).length;
    const receitaAtribuida = fechRows.filter(f => effCampId(f)).reduce((s, f) => s + Number(f.valor || 0), 0);
    const cac = fechTotal > 0 ? spend / fechTotal : 0;
    const custoMql = mqls > 0 ? spend / mqls : 0;
    const roas = spend > 0 ? receitaAtribuida / spend : 0;

    // por campanha
    const porCampanha = new Map<string, { spend: number; leads: number; impressions: number; clicks: number; fech: number; receita: number }>();
    for (const r of rows) {
      const ad = adById.get(r.ad_id);
      const cid = ad?.campaign_id ?? '—';
      const cur = porCampanha.get(cid) ?? { spend: 0, leads: 0, impressions: 0, clicks: 0, fech: 0, receita: 0 };
      cur.spend += Number(r.spend || 0);
      cur.leads += Number(r.leads || 0) + Number(r.conversations || 0);
      cur.impressions += Number(r.impressions || 0);
      cur.clicks += Number(r.clicks || 0);
      porCampanha.set(cid, cur);
    }
    for (const f of fechRows) {
      const cid = effCampId(f);
      if (!cid) continue;
      const cur = porCampanha.get(cid) ?? { spend: 0, leads: 0, impressions: 0, clicks: 0, fech: 0, receita: 0 };
      cur.fech += 1;
      cur.receita += Number(f.valor || 0);
      porCampanha.set(cid, cur);
    }
    const campanhasTable = Array.from(porCampanha.entries())
      .map(([id, v]) => ({
        id,
        nome: campById.get(id)?.name ?? '(campanha não sincronizada)',
        status: campById.get(id)?.status ?? '—',
        ...v,
        cpl: v.leads > 0 ? v.spend / v.leads : null,
        cac: v.fech > 0 ? v.spend / v.fech : null,
        roas: v.spend > 0 ? v.receita / v.spend : null,
      }))
      .sort((a, b) => b.spend - a.spend);

    // por anúncio (criativo)
    type AdAgg = { spend: number; leads: number; leadsAttr: number; qual: number; fech: number; receita: number };
    const novoAd = (): AdAgg => ({ spend: 0, leads: 0, leadsAttr: 0, qual: 0, fech: 0, receita: 0 });
    const porAd = new Map<string, AdAgg>();
    for (const r of rows) {
      const cur = porAd.get(r.ad_id) ?? novoAd();
      cur.spend += Number(r.spend || 0);
      cur.leads += Number(r.leads || 0) + Number(r.conversations || 0);
      porAd.set(r.ad_id, cur);
    }
    // leads reais atribuídos ao criativo (via central por telefone) + qualificados
    for (const l of (lhLeads ?? [])) {
      const aid = leadAdId(l);
      if (!aid) continue;
      const cur = porAd.get(aid) ?? novoAd();
      cur.leadsAttr += 1;
      const c = clsOf(l);
      if (c !== null && qualPlus.includes(c)) cur.qual += 1;
      porAd.set(aid, cur);
    }
    for (const f of fechRows) {
      const aid = effAdId(f);
      if (!aid) continue;
      const cur = porAd.get(aid) ?? novoAd();
      cur.fech += 1;
      cur.receita += Number(f.valor || 0);
      porAd.set(aid, cur);
    }
    const adsTable = Array.from(porAd.entries())
      .map(([id, v]) => {
        const ad = adById.get(id);
        return {
          id,
          nome: ad?.name ?? '(anúncio não sincronizado)',
          thumb: ad?.creative_thumbnail_url ?? null,
          campanha: ad?.campaign_id ? (campById.get(ad.campaign_id)?.name ?? '—') : '—',
          conjunto: ad?.adset_id ? (adsetById.get(ad.adset_id)?.name ?? '—') : '—',
          ...v,
          cpl: v.leads > 0 ? v.spend / v.leads : null,
          cac: v.fech > 0 ? v.spend / v.fech : null,
          roas: v.spend > 0 && v.receita > 0 ? v.receita / v.spend : null,
        };
      })
      .sort((a, b) => b.spend - a.spend);

    // evolução diária
    const porDia = new Map<string, { spend: number; leads: number }>();
    for (const r of rows) {
      const cur = porDia.get(r.date) ?? { spend: 0, leads: 0 };
      cur.spend += Number(r.spend || 0);
      cur.leads += Number(r.leads || 0) + Number(r.conversations || 0);
      porDia.set(r.date, cur);
    }
    const evolucao = Array.from(porDia.entries())
      .map(([date, v]) => ({ date, label: date.slice(8, 10) + '/' + date.slice(5, 7), spend: Number(v.spend.toFixed(2)), leads: v.leads }))
      .sort((a, b) => a.date.localeCompare(b.date));

    const attribCtwa = (attrib ?? []).filter(a => a.source === 'ctwa').length;
    const attribForm = (attrib ?? []).filter(a => a.source === 'form').length;

    return {
      spend, impressions, clicks, reach, metaLeads, ctr, cpl,
      leadsTot, qualificados, mqls, fechamentosLh, desqualificados, perdidos,
      fechTotal, fechAtribuidos, fechAutoAttrib, receitaAtribuida, cac, custoMql, roas,
      campanhasTable, adsTable, evolucao,
      leadsAtribuidos, attribTotal: (attrib ?? []).length, attribCtwa, attribForm,
    };
  }, [ads, adsets, campaigns, insights, lhLeads, classMap, fechados, attrib, campFilter, adsetFilter, adFilter, statusFilter, produtoFilter, closerFilter]);

  const adsetsForFilter = (adsets ?? []).filter(s => campFilter === 'all' || s.campaign_id === campFilter);
  const adsForFilter = (ads ?? []).filter(a =>
    (campFilter === 'all' || a.campaign_id === campFilter) && (adsetFilter === 'all' || a.adset_id === adsetFilter));

  const hasMetaData = (campaigns ?? []).length > 0;
  const hasLhData = (labels ?? []).length > 0;

  const fmtSyncTime = (iso?: string | null) =>
    iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : 'nunca';

  return (
    <div className="space-y-6">
      {/* header + sync */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Meta Ads</h1>
          <p className="text-sm text-muted-foreground mt-1">Tráfego × Comercial — campanhas, criativos, leads e fechamentos</p>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <div className="flex gap-2">
            {isGestor && (
              <>
                <Button size="sm" variant="outline" className="gap-2" disabled={syncing !== null} onClick={() => runSync('sync-liderhub')}>
                  {syncing === 'sync-liderhub' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                  Liderhub
                </Button>
                <Button size="sm" variant="outline" className="gap-2" disabled={syncing !== null} onClick={() => runSync('sync-meta')}>
                  {syncing === 'sync-meta' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                  Meta
                </Button>
              </>
            )}
          </div>
          <p className="text-[10px] text-muted-foreground">
            Meta: {fmtSyncTime(lastSync('meta')?.finished_at)} · Liderhub: {fmtSyncTime(lastSync('liderhub')?.finished_at)}
          </p>
          {(lastErr('meta') || lastErr('liderhub')) && (
            <p className="text-[10px] text-bi-red flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" /> Última sincronização falhou — ver logs
            </p>
          )}
        </div>
      </div>

      {/* filtros */}
      <div className="flex flex-wrap items-center gap-2">
        <PeriodSelector value={period} onChange={setPeriod} />
        <Select value={campFilter} onValueChange={v => { setCampFilter(v); setAdsetFilter('all'); setAdFilter('all'); }}>
          <SelectTrigger className="w-52"><SelectValue placeholder="Campanha" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas campanhas</SelectItem>
            {(campaigns ?? []).map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={adsetFilter} onValueChange={v => { setAdsetFilter(v); setAdFilter('all'); }}>
          <SelectTrigger className="w-48"><SelectValue placeholder="Conjunto" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos conjuntos</SelectItem>
            {adsetsForFilter.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={adFilter} onValueChange={setAdFilter}>
          <SelectTrigger className="w-48"><SelectValue placeholder="Anúncio" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos anúncios</SelectItem>
            {adsForFilter.map(a => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos status</SelectItem>
            <SelectItem value="ACTIVE">Ativas</SelectItem>
            <SelectItem value="PAUSED">Pausadas</SelectItem>
            <SelectItem value="ARCHIVED">Arquivadas</SelectItem>
          </SelectContent>
        </Select>
        <Select value={produtoFilter} onValueChange={setProdutoFilter}>
          <SelectTrigger className="w-44"><SelectValue placeholder="Produto" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos produtos</SelectItem>
            {(produtos ?? []).map(p => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={closerFilter} onValueChange={setCloserFilter}>
          <SelectTrigger className="w-40"><SelectValue placeholder="Closer" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos closers</SelectItem>
            {(closers ?? []).map(c => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {!hasMetaData && !hasLhData ? (
        <div className="glass-card p-16 text-center">
          <Megaphone className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-xl font-semibold text-foreground">Sem dados ainda</p>
          <p className="text-sm text-muted-foreground mt-2">
            {isGestor ? 'Use os botões de sincronização acima para importar os dados da Meta e do Liderhub.' : 'Peça a um gestor para executar a primeira sincronização.'}
          </p>
        </div>
      ) : loadingInsights ? (
        <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
      ) : (
        <>
          {/* Cobertura da central de atribuição por telefone */}
          {!isAgencia && (
          <div className="text-[11px] text-muted-foreground rounded-lg border border-border px-3 py-2 flex flex-wrap gap-x-4 gap-y-1">
            <span>Central de atribuição por telefone:</span>
            <span><strong className="text-foreground">{fmtNum(agg.attribTotal)}</strong> telefones atribuídos ({agg.attribCtwa} clique-WhatsApp · {agg.attribForm} formulário)</span>
            <span><strong className="text-foreground">{fmtNum(agg.leadsAtribuidos)}</strong> leads do período com anúncio</span>
            <span><strong className="text-foreground">{agg.fechAtribuidos}</strong> fechamentos com origem</span>
            {agg.attribForm === 0 && (
              <span className="text-bi-orange">Leads de formulário ainda sem atribuição — a agência precisa plugar o webhook (ver docs).</span>
            )}
          </div>
          )}

          {/* KPIs tráfego */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            <KPICard title="Investimento" info="Total investido em anúncios no Meta Ads no período (via integração)." value={agg.spend} format="currency" decimals={2} icon={DollarSign} tone="gold" highlight />
            <KPICard title="Leads (Meta)" info="Leads reportados pelo Meta: cadastros e conversas iniciadas atribuídas aos anúncios." value={agg.metaLeads} icon={Users} tone="blue" subtitle="leads + conversas iniciadas" />
            <KPICard title="CPL" info="Custo por lead: investimento ÷ leads do Meta." value={agg.cpl} format="currency" decimals={2} icon={Target} tone="teal" />
            <KPICard title="Impressões" info="Quantas vezes os anúncios foram exibidos." value={agg.impressions} icon={Megaphone} tone="purple" />
            <KPICard title="Cliques" info="Cliques nos anúncios. CTR é a proporção de cliques por impressão." value={agg.clicks} icon={Percent} tone="blue" subtitle={`CTR ${agg.ctr.toFixed(2)}%`} />
            <KPICard title="Alcance" info="Pessoas únicas que viram os anúncios." value={agg.reach} icon={Users} tone="purple" />
          </div>

          {/* KPIs comercial */}
          {!isAgencia && (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            <KPICard title="Leads (Liderhub)" info="Leads que chegaram ao atendimento (WhatsApp/CRM Liderhub) no período." value={agg.leadsTot} icon={Users} tone="blue" />
            <KPICard title="Qualificados" info="Leads do atendimento marcados como qualificados no período." value={agg.qualificados} icon={Users} tone="green"
              subtitle={agg.leadsTot > 0 ? `taxa ${(agg.qualificados / agg.leadsTot * 100).toFixed(1)}% · desqualif. ${agg.desqualificados}` : undefined} />
            <KPICard title="MQLs" info="Leads com perfil qualificado para venda, conforme classificação do atendimento." value={agg.mqls} icon={Trophy} tone="teal"
              subtitle={agg.custoMql > 0 ? `custo/MQL ${fmtBRL(agg.custoMql)}` : undefined} />
            <KPICard title="Fechamentos" info="Contratos fechados atribuídos ao tráfego pago no período." value={agg.fechTotal} icon={Stamp} tone="gold" highlight
              subtitle={`${agg.fechAtribuidos} com origem${agg.fechAutoAttrib > 0 ? ` · ${agg.fechAutoAttrib} auto` : ''}`} />
            <KPICard title="CAC" info="Custo de aquisição por cliente: investimento ÷ fechamentos atribuídos." value={agg.cac} format="currency" decimals={2} icon={Wallet} tone="orange"
              subtitle="investimento ÷ fechamentos" />
            <KPICard title="ROAS estimado" info="Retorno sobre o investimento: valor dos contratos atribuídos ÷ investimento." value={agg.roas} format="decimal" decimals={2} suffix="x" icon={DollarSign}
              tone={agg.roas >= 1 ? 'green' : 'red'} subtitle={`receita atribuída ${fmtBRL(agg.receitaAtribuida)}`} />
          </div>
          )}

          {/* Funil + evolução */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {!isAgencia && (
            <div className="glass-card p-5 space-y-4">
              <div>
                <h3 className="font-semibold text-foreground">Funil comercial do período</h3>
                <p className="text-xs text-muted-foreground mt-1">Leads do Liderhub classificados pelo mapeamento de status · fechamentos do CRM</p>
              </div>
              <ConversionFunnel stages={[
                { label: 'Leads', count: agg.leadsTot, tone: 'blue' },
                { label: 'Qualificados', count: agg.qualificados, tone: 'teal' },
                { label: 'MQLs (reunião+)', count: agg.mqls, tone: 'purple' },
                { label: 'Fechamentos', count: agg.fechTotal, tone: 'gold' },
              ]} />
              <p className="text-[11px] text-muted-foreground">
                Conversão lead→fechamento: {agg.leadsTot > 0 ? ((agg.fechTotal / agg.leadsTot) * 100).toFixed(1) : '0'}%
                · perdidos (desistência/recusa): {agg.perdidos}
              </p>
            </div>
            )}

            <div className="glass-card p-5 space-y-4">
              <div>
                <h3 className="font-semibold text-foreground">Evolução diária</h3>
                <p className="text-xs text-muted-foreground mt-1">Investimento (barras) × leads Meta (linha)</p>
              </div>
              {agg.evolucao.length === 0 ? (
                <p className="text-sm text-muted-foreground py-10 text-center">Sem métricas no período — sincronize a Meta</p>
              ) : (
                <div className="h-60">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={agg.evolucao} margin={{ top: 8, right: 0, left: -14, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                      <XAxis dataKey="label" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }} axisLine={false} tickLine={false} />
                      <YAxis yAxisId="l" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }} axisLine={false} tickLine={false} />
                      <YAxis yAxisId="r" orientation="right" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }} axisLine={false} tickLine={false} />
                      <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 12, fontSize: 12 }} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Bar yAxisId="l" dataKey="spend" name="Investimento (R$)" fill="hsl(var(--bi-gold))" radius={[3, 3, 0, 0]} maxBarSize={20} />
                      <Line yAxisId="r" dataKey="leads" name="Leads" stroke="hsl(var(--bi-blue))" strokeWidth={2} dot={false} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          </div>

          {/* Rankings */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {!isAgencia && (
            <RankingCard
              title="Campanhas · mais fechamentos"
              rows={agg.campanhasTable.filter(c => c.fech > 0).sort((a, b) => b.fech - a.fech).slice(0, 5)
                .map(c => ({ nome: c.nome, valor: `${c.fech} fech.`, extra: c.cac ? `CAC ${fmtBRL(c.cac)}` : '' }))}
              empty="Nenhum fechamento atribuído a campanha ainda"
            />
            )}
            <RankingCard
              title="Anúncios · menor CPL"
              rows={agg.adsTable.filter(a => a.cpl !== null && a.leads >= 3).sort((a, b) => (a.cpl! - b.cpl!)).slice(0, 5)
                .map(a => ({ nome: a.nome, valor: fmtBRL(a.cpl!), extra: `${a.leads} leads` }))}
              empty="Sem anúncios com leads suficientes (mín. 3)"
            />
            {!isAgencia && (
            <RankingCard
              title="Criativos · menor CAC"
              rows={agg.adsTable.filter(a => a.cac !== null).sort((a, b) => (a.cac! - b.cac!)).slice(0, 5)
                .map(a => ({ nome: a.nome, valor: fmtBRL(a.cac!), extra: `${a.fech} fech.` }))}
              empty="Nenhum fechamento atribuído a criativo ainda"
            />
            )}
          </div>

          {/* Tabela campanhas */}
          <div className="glass-card overflow-hidden">
            <div className="p-5 pb-3">
              <h3 className="font-semibold text-foreground">Campanhas</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[10px] uppercase tracking-wider text-muted-foreground border-b border-border">
                    <th className="text-left px-5 py-2 font-medium">Campanha</th>
                    <th className="text-right px-3 py-2 font-medium">Invest.</th>
                    <th className="text-right px-3 py-2 font-medium">Leads</th>
                    <th className="text-right px-3 py-2 font-medium">CPL</th>
                    <th className="text-right px-3 py-2 font-medium">Cliques</th>
                    <th className="text-right px-3 py-2 font-medium">Fech.</th>
                    <th className="text-right px-3 py-2 font-medium">CAC</th>
                    <th className="text-right px-5 py-2 font-medium">ROAS</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {agg.campanhasTable.length === 0 ? (
                    <tr><td colSpan={8} className="text-center text-muted-foreground py-8">Sem dados no período</td></tr>
                  ) : agg.campanhasTable.map(c => (
                    <tr key={c.id} className="hover:bg-muted/20 transition-colors">
                      <td className="px-5 py-2.5">
                        <p className="font-medium text-foreground truncate max-w-64">{c.nome}</p>
                        <p className="text-[10px] text-muted-foreground">{c.status}</p>
                      </td>
                      <td className="text-right px-3 py-2.5 tabular-nums text-bi-gold font-semibold">{fmtBRL(c.spend)}</td>
                      <td className="text-right px-3 py-2.5 tabular-nums">{fmtNum(c.leads)}</td>
                      <td className="text-right px-3 py-2.5 tabular-nums">{c.cpl != null ? fmtBRL(c.cpl) : '—'}</td>
                      <td className="text-right px-3 py-2.5 tabular-nums">{fmtNum(c.clicks)}</td>
                      <td className="text-right px-3 py-2.5 tabular-nums font-semibold">{c.fech || '—'}</td>
                      <td className="text-right px-3 py-2.5 tabular-nums">{c.cac != null ? fmtBRL(c.cac) : '—'}</td>
                      <td className={`text-right px-5 py-2.5 tabular-nums font-semibold ${c.roas != null && c.roas >= 1 ? 'text-bi-green' : 'text-muted-foreground'}`}>
                        {c.roas != null ? `${c.roas.toFixed(2)}x` : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Tabela anúncios/criativos — CPL e CAC por criativo */}
          <div className="glass-card overflow-hidden">
            <div className="p-5 pb-3">
              <h3 className="font-semibold text-foreground">CPL e CAC por criativo</h3>
              <p className="text-xs text-muted-foreground mt-1">CPL pelos leads da Meta · Qualif./Fech. atribuídos por telefone (central) · CAC = investimento ÷ fechamentos</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[10px] uppercase tracking-wider text-muted-foreground border-b border-border">
                    <th className="text-left px-5 py-2 font-medium">Anúncio</th>
                    <th className="text-left px-3 py-2 font-medium hidden md:table-cell">Campanha</th>
                    <th className="text-right px-3 py-2 font-medium">Invest.</th>
                    <th className="text-right px-3 py-2 font-medium">Leads</th>
                    <th className="text-right px-3 py-2 font-medium">CPL</th>
                    <th className="text-right px-3 py-2 font-medium">Qualif.</th>
                    <th className="text-right px-3 py-2 font-medium">Fech.</th>
                    <th className="text-right px-3 py-2 font-medium">CAC</th>
                    <th className="text-right px-5 py-2 font-medium">ROAS</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {agg.adsTable.length === 0 ? (
                    <tr><td colSpan={9} className="text-center text-muted-foreground py-8">Sem dados no período</td></tr>
                  ) : agg.adsTable.slice(0, 40).map(a => (
                    <tr key={a.id} className="hover:bg-muted/20 transition-colors">
                      <td className="px-5 py-2.5">
                        <div className="flex items-center gap-2.5 min-w-0">
                          {a.thumb ? (
                            <img src={a.thumb} alt="" className="w-9 h-9 rounded-lg object-cover shrink-0 border border-border" loading="lazy" />
                          ) : (
                            <div className="w-9 h-9 rounded-lg bg-muted/40 flex items-center justify-center shrink-0"><ImageOff className="w-4 h-4 text-muted-foreground" /></div>
                          )}
                          <div className="min-w-0">
                            <p className="font-medium text-foreground truncate max-w-52">{a.nome}</p>
                            <p className="text-[10px] text-muted-foreground truncate max-w-52">{a.conjunto}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-xs text-muted-foreground truncate max-w-40 hidden md:table-cell">{a.campanha}</td>
                      <td className="text-right px-3 py-2.5 tabular-nums text-bi-gold font-semibold">{fmtBRL(a.spend)}</td>
                      <td className="text-right px-3 py-2.5 tabular-nums">{fmtNum(a.leads)}</td>
                      <td className="text-right px-3 py-2.5 tabular-nums">{a.cpl != null ? fmtBRL(a.cpl) : '—'}</td>
                      <td className="text-right px-3 py-2.5 tabular-nums">{a.qual || '—'}</td>
                      <td className="text-right px-3 py-2.5 tabular-nums font-semibold">{a.fech || '—'}</td>
                      <td className="text-right px-3 py-2.5 tabular-nums">{a.cac != null ? fmtBRL(a.cac) : '—'}</td>
                      <td className={`text-right px-5 py-2.5 tabular-nums font-semibold ${a.roas != null && a.roas >= 1 ? 'text-bi-green' : 'text-muted-foreground'}`}>
                        {a.roas != null ? `${a.roas.toFixed(2)}x` : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function RankingCard({ title, rows, empty }: { title: string; rows: { nome: string; valor: string; extra?: string }[]; empty: string }) {
  return (
    <div className="glass-card p-5 space-y-3">
      <h3 className="font-semibold text-foreground text-sm flex items-center gap-2"><Trophy className="w-4 h-4 text-primary" /> {title}</h3>
      {rows.length === 0 ? (
        <p className="text-xs text-muted-foreground py-4">{empty}</p>
      ) : (
        <div className="space-y-2">
          {rows.map((r, i) => (
            <div key={r.nome + i} className="flex items-center gap-2">
              <span className={`text-xs font-bold w-4 text-center ${i === 0 ? 'text-primary' : 'text-muted-foreground'}`}>{i + 1}</span>
              <p className="flex-1 min-w-0 text-xs text-foreground truncate">{r.nome}</p>
              <span className="text-xs font-semibold text-primary tabular-nums whitespace-nowrap">{r.valor}</span>
              {r.extra && <span className="text-[10px] text-muted-foreground whitespace-nowrap">{r.extra}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
