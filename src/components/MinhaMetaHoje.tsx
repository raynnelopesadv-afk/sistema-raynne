import { useNavigate } from 'react-router-dom';
import { BellRing, Trophy } from 'lucide-react';
import { useMinhaMeta } from '@/hooks/useMinhaMeta';
import { SETORES } from '@/lib/alertas';

/** Cartão "Minha meta do dia" da tela inicial (ou o convite para ativar os alertas). */
export function MinhaMetaHoje() {
  const nav = useNavigate();
  const { inscricao, carregando, progresso } = useMinhaMeta();
  if (carregando) return null;

  if (!inscricao) {
    return (
      <button
        type="button"
        onClick={() => nav('/meu-celular')}
        className="w-full text-left rounded-2xl p-4 bg-[hsl(222_47%_15%)] text-white flex items-center gap-3 hover:opacity-95"
      >
        <BellRing className="w-6 h-6 text-[hsl(41_55%_62%)] shrink-0" />
        <span className="flex-1">
          <span className="block font-bold">Ative os alertas da sua meta no celular</span>
          <span className="block text-sm text-white/75">De hora em hora: "Vai, vencedor(a)! Bora pra meta!"</span>
        </span>
        <span className="text-sm font-semibold text-[hsl(41_55%_62%)]">Ativar</span>
      </button>
    );
  }

  if (inscricao.setor_meta === 'gestao' || !progresso) return null;
  const { feito, meta, unidade } = progresso;
  const prazos = inscricao.setor_meta === 'prazos';
  const batida = meta > 0 ? feito >= meta : prazos;
  const pct = meta > 0 ? Math.min(100, Math.round((feito / meta) * 100)) : 100;
  const faltam = Math.max(0, meta - feito);
  const info = SETORES.find(s => s.valor === inscricao.setor_meta);

  return (
    <section className="rounded-2xl p-4 bg-[hsl(222_47%_15%)] text-white space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm text-white/75 font-medium">Minha meta do dia · {info?.label}</span>
        {batida && <span className="inline-flex items-center gap-1 text-xs font-bold text-[hsl(41_55%_62%)]"><Trophy className="w-4 h-4" /> Meta batida!</span>}
      </div>
      <p className="text-3xl font-extrabold">
        {prazos && meta === 0 ? 'Sem prazos hoje' : <>{feito} <span className="text-lg text-white/70">/ {meta} {unidade}</span></>}
      </p>
      <div className="h-2.5 rounded-full bg-white/15 overflow-hidden">
        <div className="h-full bg-[hsl(41_55%_62%)] transition-all" style={{ width: `${pct}%` }} />
      </div>
      <p className="text-sm text-[hsl(41_55%_72%)]">
        {batida
          ? 'Aqui só tem os melhores. Bora pro próximo!'
          : `${faltam === 1 ? 'Falta só 1' : `Faltam ${faltam}`} — você consegue, bora pra meta!`}
      </p>
    </section>
  );
}
