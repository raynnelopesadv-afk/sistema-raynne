import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { useUserRole } from "@/hooks/useUserRole";
import { TvModeProvider } from "@/hooks/useTvMode";
import { AppLayout } from "@/components/layout/AppLayout";
import Login from "./pages/Login";
import ResetPassword from "./pages/ResetPassword";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import Faturamento from "./pages/Faturamento";
import Agendamentos from "./pages/Agendamentos";
import Fechamento from "./pages/Fechamento";
import Clientes from "./pages/Clientes";
import Consulta from "./pages/Consulta";
import MetaAds from "./pages/MetaAds";
import Funis from "./pages/Funis";
import Produtos from "./pages/Produtos";
import Protocolos from "./pages/Protocolos";
import Qualificacao from "./pages/Qualificacao";
import Config from "./pages/Config";
import Comissoes from "./pages/Comissoes";
import PainelJuridico from "./pages/PainelJuridico";
import AgendaJuridica from "./pages/AgendaJuridica";
import Publicacoes from "./pages/Publicacoes";
import Inss from "./pages/Inss";
import Equipe from "./pages/Equipe";
import ContratosZapsign from "./pages/ContratosZapsign";
import Tarefas from "./pages/Tarefas";
import MeuCelular from "./pages/MeuCelular";

const queryClient = new QueryClient();

function AuthGate() {
  const { session, loading } = useAuth();
  const { isAgencia, isLoading: rolesLoading } = useUserRole();
  const isResetRoute = window.location.pathname === '/reset-password' ||
    window.location.hash.includes('type=recovery');

  if (isResetRoute) return <ResetPassword />;

  const spinner = (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );

  if (loading) return spinner;

  if (!session) return <Login />;

  if (rolesLoading) return spinner;

  // Agência: acesso restrito só à aba Meta Ads (tráfego). Qualquer rota cai nela.
  if (isAgencia) {
    return (
      <AppLayout>
        <Routes>
          <Route path="*" element={<MetaAds />} />
        </Routes>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <Routes>
        <Route path="/" element={<PainelJuridico />} />
        <Route path="/agenda-juridica" element={<AgendaJuridica />} />
        <Route path="/publicacoes" element={<Publicacoes />} />
        <Route path="/inss" element={<Inss />} />
        <Route path="/equipe" element={<Equipe />} />
        <Route path="/tarefas" element={<Tarefas />} />
        <Route path="/meu-celular" element={<MeuCelular />} />
        <Route path="/contratos" element={<ContratosZapsign />} />
        <Route path="/comercial" element={<Index />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/faturamento" element={<Faturamento />} />
        <Route path="/agendamentos" element={<Agendamentos />} />
        <Route path="/fechamento" element={<Fechamento />} />
        <Route path="/clientes" element={<Clientes />} />
        <Route path="/consulta" element={<Consulta />} />
        <Route path="/meta-ads" element={<MetaAds />} />
        <Route path="/funis" element={<Funis />} />
        <Route path="/produtos" element={<Produtos />} />
        <Route path="/processos" element={<Navigate to="/protocolos?aba=fila" replace />} />
        <Route path="/protocolos" element={<Protocolos />} />
        <Route path="/qualificacao" element={<Qualificacao />} />
        <Route path="/config" element={<Config />} />
        <Route path="/comissoes" element={<Comissoes />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </AppLayout>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <AuthProvider>
        <BrowserRouter>
          <TvModeProvider>
            <AuthGate />
          </TvModeProvider>
        </BrowserRouter>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
