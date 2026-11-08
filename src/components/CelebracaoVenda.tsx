import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { celebrateSale } from '@/lib/celebrate';
import { useTvMode } from '@/hooks/useTvMode';
import { tierPorOrdem, anelStyleDoTier, badgeStyleDoTier } from '@/lib/nivelTier';

const DURACAO_MS = 7_000;

interface Celebracao {
  closerNome: string;
  fotoUrl: string | null;
  nivel: string | null;
  nivelOrdem: number | null;
  produto: string;
  valor: number;
  ia: boolean;
}

function brl(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0 });
}

function iniciais(nome: string) {
  return nome
    .replace(/\[.*?\]\s*/g, '')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map(p => p[0]?.toUpperCase() ?? '')
    .join('');
}

/**
 * Telão de parabéns no modo apresentação (TV): quando uma venda é lançada,
 * mostra foto, nome, nível, produto e valor do vendedor, com confete e som.
 */
export function CelebracaoVenda() {
  const { isTvMode } = useTvMode();
  const [atual, setAtual] = useState<Celebracao | null>(null);
  const fila = useRef<Celebracao[]>([]);
  const exibindo = useRef(false);

  useEffect(() => {
    const exibirProxima = () => {
      const prox = fila.current.shift();
      if (!prox) { exibindo.current = false; return; }
      exibindo.current = true;
      setAtual(prox);
      celebrateSale();
      setTimeout(() => { setAtual(null); setTimeout(exibirProxima, 600); }, DURACAO_MS);
    };

    // Monta os dados da celebração a partir de uma venda (closer_id, product_id, valor, ia)
    const montar = async (row: { closer_id: string | null; product_id: string | null; valor: number; fechado_por_ia?: boolean }) => {
      const [closerRes, produtoRes] = await Promise.all([
        row.closer_id
          ? supabase.from('closers').select('nome, foto_url, career_level_id').eq('id', row.closer_id).maybeSingle()
          : Promise.resolve({ data: null }),
        row.product_id
          ? supabase.from('products').select('nome').eq('id', row.product_id).maybeSingle()
          : Promise.resolve({ data: null }),
      ]);
      let nivel: string | null = null;
      let nivelOrdem: number | null = null;
      const levelId = (closerRes.data as { career_level_id?: string | null } | null)?.career_level_id;
      if (levelId) {
        const { data: lv } = await supabase.from('career_levels').select('nome, ordem').eq('id', levelId).maybeSingle();
        nivel = lv?.nome ?? null;
        nivelOrdem = (lv as { ordem?: number } | null)?.ordem ?? null;
      }
      fila.current.push({
        closerNome: (closerRes.data as { nome?: string } | null)?.nome ?? 'Vendedor',
        fotoUrl: (closerRes.data as { foto_url?: string | null } | null)?.foto_url ?? null,
        nivel,
        nivelOrdem,
        produto: (produtoRes.data as { nome?: string } | null)?.nome ?? '—',
        valor: Number(row.valor) || 0,
        ia: !!row.fechado_por_ia,
      });
      if (!exibindo.current) exibirProxima();
    };

    // 1) Evento local: quem acabou de lançar a venda vê o telão na própria tela
    const onLocal = (e: Event) => {
      const d = (e as CustomEvent).detail as { closer_id: string | null; product_id: string | null; valor: number; fechado_por_ia?: boolean };
      if (d) montar(d);
    };
    window.addEventListener('bi:venda-celebrar', onLocal);

    // 2) Modo apresentação (TV): verifica vendas novas a cada 8s e celebra.
    //    Robusto — não depende de Realtime estar habilitado no banco.
    let timer: ReturnType<typeof setInterval> | null = null;
    if (isTvMode) {
      let desde = new Date().toISOString(); // só celebra vendas a partir de agora
      const verificar = async () => {
        const { data } = await supabase
          .from('clientes_fechados')
          .select('closer_id, product_id, valor, fechado_por_ia, cadastro_retroativo, created_at')
          .eq('cadastro_retroativo', false)
          .eq('origem', 'datacrazy')
          .eq('incompleto', false)
          .gt('created_at', desde)
          .order('created_at', { ascending: true })
          .limit(10);
        for (const row of (data ?? []) as Array<{ closer_id: string | null; product_id: string | null; valor: number; fechado_por_ia?: boolean; created_at: string }>) {
          montar(row);
          if (row.created_at > desde) desde = row.created_at;
        }
      };
      timer = setInterval(verificar, 8000);
    }

    return () => {
      window.removeEventListener('bi:venda-celebrar', onLocal);
      if (timer) clearInterval(timer);
    };
  }, [isTvMode]);

  if (!atual) return null;

  const tier = tierPorOrdem(atual.nivelOrdem);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in duration-500">
      <div className="text-center space-y-6 px-8 animate-in zoom-in-95 duration-700">
        <p className="text-2xl md:text-3xl font-bold tracking-[0.3em] text-primary uppercase">🎉 Parabéns! 🎉</p>

        <div
          className="mx-auto w-44 h-44 md:w-60 md:h-60 rounded-full p-2 animate-[spin_12s_linear_infinite]"
          style={tier ? anelStyleDoTier(tier) : { background: '#B8892B', boxShadow: '0 0 60px rgba(245,197,24,0.45)' }}
        >
          <div className="w-full h-full rounded-full overflow-hidden bg-card flex items-center justify-center animate-[spin_12s_linear_infinite_reverse] border-4 border-black/40">
            {atual.fotoUrl ? (
              <img src={atual.fotoUrl} alt={atual.closerNome} className="w-full h-full object-cover" />
            ) : (
              <span className="text-6xl md:text-7xl font-bold" style={{ color: tier?.cor ?? '#B8892B' }}>{iniciais(atual.closerNome)}</span>
            )}
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-4xl md:text-6xl font-bold text-white">{atual.closerNome.replace(/\[.*?\]\s*/g, '')}</p>
          <div className="flex items-center justify-center gap-2 flex-wrap">
            {atual.nivel && (
              <span
                className="px-4 py-1.5 rounded-full text-sm md:text-base font-semibold"
                style={tier ? badgeStyleDoTier(tier) : { background: 'rgba(245,197,24,0.15)', color: '#B8892B', border: '1px solid rgba(245,197,24,0.4)' }}
              >
                {tier ? `${tier.nome} · ` : ''}{atual.nivel}
              </span>
            )}
            {atual.ia && (
              <span className="px-4 py-1.5 rounded-full text-sm md:text-base font-semibold bg-purple-500/15 text-purple-300 border border-purple-500/40">
                🤖 assumiu venda da IA
              </span>
            )}
          </div>
        </div>

        <div className="space-y-1">
          <p className="text-xl md:text-2xl text-muted-foreground">fechou <span className="font-semibold text-white">{atual.produto}</span></p>
          <p className="text-5xl md:text-7xl font-bold text-primary tabular-nums">{brl(atual.valor)}</p>
        </div>
      </div>
    </div>
  );
}
