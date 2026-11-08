import { ReactNode } from 'react';
import { SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { AppSidebar } from './AppSidebar';
import { BottomNav } from './BottomNav';
import { TvModeButton } from '@/components/TvModeButton';
import { useTvMode } from '@/hooks/useTvMode';
import { CelebracaoVenda } from '@/components/CelebracaoVenda';
import { usePendenciasEspelhamento } from '@/hooks/usePendenciasEspelhamento';
import { Link } from 'react-router-dom';
import { AlertTriangle } from 'lucide-react';
import { BRAND } from '@/config/brand';

export function AppLayout({ children }: { children: ReactNode }) {
  const { isTvMode } = useTvMode();
  const pendencias = usePendenciasEspelhamento();
  return (
    <SidebarProvider>
      <CelebracaoVenda />
      <div className="min-h-screen flex w-full">
        {!isTvMode && (
          <div className="hidden md:block">
            <AppSidebar />
          </div>
        )}

        <div className="flex-1 flex flex-col min-w-0">
          {!isTvMode && (
            <header className="h-14 flex items-center gap-3 border-b border-border px-4 bg-card/50 backdrop-blur-xl sticky top-0 z-40">
              <SidebarTrigger className="hidden md:flex text-muted-foreground hover:text-foreground" />
              <h2 className="text-sm font-semibold text-foreground md:hidden">{BRAND.appName}</h2>
              <div className="ml-auto flex items-center gap-2">
                <TvModeButton />
              </div>
            </header>
          )}

          <main className={`flex-1 overflow-auto ${isTvMode ? 'p-8' : 'p-4 md:p-6 pb-20 md:pb-6'}`}>
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
                className="mb-4 flex items-center gap-2 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300 hover:bg-red-500/15 transition-colors"
              >
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>
                  <span className="font-semibold">{pendencias}</span> {pendencias === 1 ? 'fechamento com pendência' : 'fechamentos com pendência'} — faltam dados (CPF, produto, valor ou closer). Clique para completar.
                </span>
              </Link>
            )}
            {children}
          </main>
        </div>

        {!isTvMode && <BottomNav />}
      </div>
    </SidebarProvider>
  );
}
