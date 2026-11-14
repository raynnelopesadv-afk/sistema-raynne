import { ReactNode } from 'react';
import { SidebarProvider, SidebarTrigger, useSidebar } from '@/components/ui/sidebar';
import { AppSidebar } from './AppSidebar';
import { BottomNav } from './BottomNav';
import { TvModeButton } from '@/components/TvModeButton';
import { useTvMode } from '@/hooks/useTvMode';
import { CelebracaoVenda } from '@/components/CelebracaoVenda';
import { usePendenciasEspelhamento } from '@/hooks/usePendenciasEspelhamento';
import { Link } from 'react-router-dom';
import { AlertTriangle } from 'lucide-react';
import { BRAND } from '@/config/brand';
import { AvisoCelularGlobal } from '@/components/AvisoCelularGlobal';
import { FrasesDoDia } from '@/components/FrasesDoDia';

function MarcaDagua() {
  const { state, isMobile } = useSidebar();
  const left = isMobile ? '0' : state === 'collapsed' ? 'var(--sidebar-width-icon)' : 'var(--sidebar-width)';
  return <div aria-hidden className="marca-dagua" style={{ left }} />;
}

export function AppLayout({ children }: { children: ReactNode }) {
  const { isTvMode } = useTvMode();
  const pendencias = usePendenciasEspelhamento();
  return (
    <SidebarProvider>
      <CelebracaoVenda />
      <div className="min-h-screen flex w-full">
        {!isTvMode && <MarcaDagua />}
        {!isTvMode && (
          <AppSidebar />
        )}

        <div className="flex-1 flex flex-col min-w-0">
          {!isTvMode && (
            <header className="h-14 flex items-center gap-3 border-b border-border px-4 bg-card/80 backdrop-blur-xl sticky top-0 z-40">
              <SidebarTrigger className="hidden md:flex text-muted-foreground hover:text-foreground" />
              <div className="flex items-center gap-2 md:hidden">
                <img src={BRAND.emblemaUrl} alt="" className="h-7 w-auto" />
              </div>
              <FrasesDoDia className="flex-1 px-1" />
              <div className="flex items-center gap-2">
                <TvModeButton />
              </div>
            </header>
          )}

          <main className={`relative z-10 flex-1 overflow-auto ${isTvMode ? 'p-8' : 'p-4 md:p-6 pb-20 md:pb-6'}`}>
            {isTvMode && (
              <div className="fixed top-4 right-4 z-50">
                <TvModeButton />
              </div>
            )}
            {!isTvMode && (
              <div className="md:hidden fixed bottom-20 right-4 z-50 rounded-full bg-card/90 backdrop-blur-xl border border-border shadow-lg">
                <TvModeButton />
              </div>
            )}
            {!isTvMode && pendencias > 0 && (
              <Link
                to="/fechamento"
                className="mb-4 flex items-center gap-2 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800 hover:bg-red-100 transition-colors"
              >
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>
                  <span className="font-semibold">{pendencias}</span> {pendencias === 1 ? 'fechamento com pendência' : 'fechamentos com pendência'} — faltam dados (CPF, produto, valor ou closer). Clique para completar.
                </span>
              </Link>
            )}
            {!isTvMode && <AvisoCelularGlobal />}
            {children}
          </main>
        </div>

        {!isTvMode && <BottomNav />}
      </div>
    </SidebarProvider>
  );
}
