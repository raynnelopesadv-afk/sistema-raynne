import { useEffect, useState } from 'react';
import { Sparkles, PhoneCall } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { frasesPara, orientacaoCloser, ehRaynne } from '@/lib/frases';
import { useMinhaMeta } from '@/hooks/useMinhaMeta';
import { useUserRole } from '@/hooks/useUserRole';

const INTERVALO_MS = 10000;

// Faixa no topo da tela: frases que vão passando e mudam com o momento do dia.
export function FrasesDoDia({ className = '' }: { className?: string }) {
  const { user } = useAuth();
  const { progresso, inscricao } = useMinhaMeta();
  const { isVendas } = useUserRole();
  const setor = inscricao?.setor_meta ?? (isVendas ? 'comercial' : null);
  const [agora, setAgora] = useState(() => new Date());
  const [i, setI] = useState(() => Math.floor(Math.random() * 5));
  const [visivel, setVisivel] = useState(true);

  useEffect(() => {
    const t = setInterval(() => {
      setVisivel(false);
      setTimeout(() => {
        setAgora(new Date());
        setI(n => n + 1);
        setVisivel(true);
      }, 450);
    }, INTERVALO_MS);
    return () => clearInterval(t);
  }, []);

  const frases = frasesPara(user?.email, agora, progresso, setor);
  const frase = frases[i % frases.length];

  return (
    <div className={`flex items-center justify-center gap-2 min-w-0 ${className}`} aria-live="polite">
      {(setor === 'comercial' || setor === 'lider') && !ehRaynne(user?.email) && (
        <span className="hidden lg:inline-flex items-center gap-1.5 shrink-0 rounded-full bg-primary text-primary-foreground px-3 py-1 text-xs font-bold">
          <PhoneCall className="w-3.5 h-3.5" /> {orientacaoCloser(agora)}
        </span>
      )}
      <Sparkles className="w-4 h-4 shrink-0 text-primary" />
      <span
        className={`frase-dia line-clamp-2 md:truncate leading-tight font-semibold text-[13px] md:text-sm transition-all duration-500 ${visivel ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-1'}`}
      >
        {frase}
      </span>
    </div>
  );
}
