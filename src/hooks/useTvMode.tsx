import { createContext, useCallback, useContext, useEffect, useRef, useState, ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useLocation, useNavigate } from 'react-router-dom';

const REFRESH_INTERVAL_MS = 2 * 60 * 1000;
// Rotação automática entre páginas no modo TV
// Apenas telas de métricas agregadas (vendas, faturamento, protocolos) —
// telas com listas nominais de clientes ficam fora do telão.
const TV_ROUTES = ['/', '/faturamento', '/protocolos'];
const SECTION_DURATION_MS = 35_000; // tempo por seção visível (35s)

interface TvModeContextValue {
  isTvMode: boolean;
  toggleTvMode: () => void;
  enterTvMode: () => Promise<void>;
  exitTvMode: () => Promise<void>;
}

const TvModeContext = createContext<TvModeContextValue | null>(null);

export function TvModeProvider({ children }: { children: ReactNode }) {
  const [isTvMode, setIsTvMode] = useState(false);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const routeIdxRef = useRef(0);

  const enterTvMode = useCallback(async () => {
    // Ativa o layout ampliado SEMPRE — fullscreen é opcional/best-effort.
    // No iOS Safari a Fullscreen API tem suporte limitado, mas o modo TV
    // (sidebar oculta, fontes maiores, auto-refresh) funciona mesmo assim,
    // o que é o que importa pra espelhamento via AirPlay/Chromecast.
    setIsTvMode(true);
    try {
      const el: any = document.documentElement;
      if (el.requestFullscreen) {
        await el.requestFullscreen();
      } else if (el.webkitRequestFullscreen) {
        await el.webkitRequestFullscreen();
      }
    } catch (e) {
      console.info('Fullscreen indisponível neste dispositivo — modo TV segue ativo.');
    }
  }, []);

  const exitTvMode = useCallback(async () => {
    try {
      const doc: any = document;
      if (document.fullscreenElement && document.exitFullscreen) {
        await document.exitFullscreen();
      } else if (doc.webkitFullscreenElement && doc.webkitExitFullscreen) {
        await doc.webkitExitFullscreen();
      }
    } catch (e) { console.warn(e); }
    setIsTvMode(false);
  }, []);

  const toggleTvMode = useCallback(() => {
    if (isTvMode) exitTvMode();
    else enterTvMode();
  }, [isTvMode, enterTvMode, exitTvMode]);

  useEffect(() => {
    const handler = () => {
      const doc: any = document;
      if (document.fullscreenElement || doc.webkitFullscreenElement) return;
      if (document.body.classList.contains('tv-mode')) return;
      setIsTvMode(false);
    };
    document.addEventListener('fullscreenchange', handler);
    document.addEventListener('webkitfullscreenchange', handler);
    return () => {
      document.removeEventListener('fullscreenchange', handler);
      document.removeEventListener('webkitfullscreenchange', handler);
    };
  }, []);

  useEffect(() => {
    if (isTvMode) document.body.classList.add('tv-mode');
    else document.body.classList.remove('tv-mode');
    return () => document.body.classList.remove('tv-mode');
  }, [isTvMode]);

  useEffect(() => {
    if (!isTvMode) return;
    const id = setInterval(() => {
      queryClient.invalidateQueries();
    }, REFRESH_INTERVAL_MS);
    return () => clearInterval(id);
  }, [isTvMode, queryClient]);

  // Rotação por seções: a cada SECTION_DURATION_MS, scrolla 1 viewport.
  // Quando passa do fim da página, avança para a próxima rota da rotação TV.
  useEffect(() => {
    if (!isTvMode) return;
    routeIdxRef.current = Math.max(0, TV_ROUTES.indexOf(location.pathname));

    const main = document.querySelector('main') as HTMLElement | null;
    const getScroller = () => {
      if (main && main.scrollHeight - main.clientHeight > 4) {
        return {
          el: main as HTMLElement | Window,
          max: main.scrollHeight - main.clientHeight,
          step: main.clientHeight * 0.85,
          scrollTo: (top: number) => main.scrollTo({ top, behavior: 'smooth' }),
          current: () => main.scrollTop,
        };
      }
      const docEl = (document.scrollingElement || document.documentElement) as HTMLElement;
      return {
        el: window as any,
        max: docEl.scrollHeight - window.innerHeight,
        step: window.innerHeight * 0.85,
        scrollTo: (top: number) => window.scrollTo({ top, behavior: 'smooth' }),
        current: () => window.scrollY,
      };
    };

    // reset para o topo ao entrar na página
    window.scrollTo({ top: 0, behavior: 'auto' });
    main?.scrollTo({ top: 0, behavior: 'auto' });

    let atBottom = false;
    const id = setInterval(() => {
      const s = getScroller();
      if (s.max <= 4) {
        routeIdxRef.current = (routeIdxRef.current + 1) % TV_ROUTES.length;
        navigate(TV_ROUTES[routeIdxRef.current]);
        return;
      }
      // se já estávamos no fim na iteração anterior, agora avança a rota
      if (atBottom || s.current() >= s.max - 4) {
        if (atBottom) {
          atBottom = false;
          routeIdxRef.current = (routeIdxRef.current + 1) % TV_ROUTES.length;
          navigate(TV_ROUTES[routeIdxRef.current]);
          return;
        }
      }
      const next = s.current() + s.step;
      if (next >= s.max) {
        // garante que o último pedaço fique visível por um ciclo inteiro
        s.scrollTo(s.max);
        atBottom = true;
      } else {
        s.scrollTo(next);
      }
    }, SECTION_DURATION_MS);

    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isTvMode, location.pathname]);

  return (
    <TvModeContext.Provider value={{ isTvMode, toggleTvMode, enterTvMode, exitTvMode }}>
      {children}
    </TvModeContext.Provider>
  );
}

export function useTvMode() {
  const ctx = useContext(TvModeContext);
  if (!ctx) throw new Error('useTvMode must be used within TvModeProvider');
  return ctx;
}
