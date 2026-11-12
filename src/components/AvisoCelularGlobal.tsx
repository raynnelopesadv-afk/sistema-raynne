import { Link, useLocation } from 'react-router-dom';
import { BellRing } from 'lucide-react';
import { useMinhaInscricao } from '@/hooks/useMinhaMeta';
import { useUserRole } from '@/hooks/useUserRole';

/** Aviso em TODAS as telas para quem ainda não cadastrou o celular nos alertas da meta. */
export function AvisoCelularGlobal() {
  const { pathname } = useLocation();
  const { isAgencia } = useUserRole();
  const insc = useMinhaInscricao();
  if (isAgencia || pathname === '/meu-celular' || insc.isLoading || insc.data) return null;
  return (
    <Link
      to="/meu-celular"
      className="mb-4 flex items-center gap-3 rounded-xl px-4 py-3 text-sm bg-[hsl(222_47%_15%)] text-white hover:opacity-95 transition-opacity"
    >
      <BellRing className="w-5 h-5 shrink-0 text-[hsl(41_55%_62%)]" />
      <span className="flex-1">
        <span className="font-bold">Cadastre seu celular para receber os alertas da meta.</span>{' '}
        <span className="text-white/75">De hora em hora: "Vai, vencedor(a)! Bora pra meta!"</span>
      </span>
      <span className="font-semibold text-[hsl(41_55%_62%)] shrink-0">Cadastrar</span>
    </Link>
  );
}
