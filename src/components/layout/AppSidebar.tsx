import {
  LayoutDashboard, DollarSign, Calendar, CheckCircle2, Users,
  Search, Megaphone, GitBranch, Package, Scale, Settings, LogOut, Wallet, FileCheck2, Percent,
  Gavel, CalendarClock, Newspaper, Landmark, UsersRound
} from 'lucide-react';
import { NavLink } from '@/components/NavLink';
import { useAuth } from '@/contexts/AuthContext';
import { useUserRole } from '@/hooks/useUserRole';
import { usePermissions } from '@/hooks/usePermissions';
import { useSolicitacoesPendentes } from '@/hooks/useSolicitacoesPendentes';
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarFooter, useSidebar,
} from '@/components/ui/sidebar';
import { BRAND } from '@/config/brand';

const navItems = [
  { title: 'Painel Jurídico', url: '/', icon: Gavel },
  { title: 'Prazos e Audiências', url: '/agenda-juridica', icon: CalendarClock },
  { title: 'Publicações', url: '/publicacoes', icon: Newspaper },
  { title: 'INSS', url: '/inss', icon: Landmark },
  { title: 'Equipe', url: '/equipe', icon: UsersRound },
  { title: 'Painel Comercial', url: '/comercial', icon: LayoutDashboard },
  { title: 'Faturamento', url: '/faturamento', icon: DollarSign },
  { title: 'Fechamento', url: '/fechamento', icon: CheckCircle2 },
  { title: 'Comissões', url: '/comissoes', icon: Wallet },
  { title: 'Clientes', url: '/clientes', icon: Users },
  { title: 'Consulta', url: '/consulta', icon: Search },
  { title: 'Meta Ads', url: '/meta-ads', icon: Megaphone },
  { title: 'Funis', url: '/funis', icon: GitBranch },
  { title: 'Produtos', url: '/produtos', icon: Package },
  { title: 'Processos', url: '/processos', icon: Scale },
  { title: 'Protocolos', url: '/protocolos', icon: FileCheck2 },
  { title: 'Aproveitamento', url: '/qualificacao', icon: Percent },
  { title: 'Config', url: '/config', icon: Settings },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === 'collapsed';
  const { signOut } = useAuth();
  const { isAgencia } = useUserRole();
  const { can } = usePermissions();
  const pendentes = useSolicitacoesPendentes();
  const items = (isAgencia ? navItems.filter(i => i.url === '/meta-ads') : navItems).filter(i => {
    if (i.url === '/faturamento') return can('ver_faturamento');
    if (i.url === '/comissoes') return can('ver_comissoes');
    if (i.url === '/meta-ads') return can('ver_meta_ads');
    return true;
  });

  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border">
      <div className="p-4 flex items-center gap-3 border-b border-sidebar-border">
        <img src={BRAND.logoUrl} alt={BRAND.appName} className="w-10 h-10 rounded-full object-cover shrink-0 ring-1 ring-primary/40" />
        {!collapsed && (
          <div>
            <p className="font-semibold text-sm text-sidebar-accent-foreground">{BRAND.appName}</p>
            <p className="text-xs text-sidebar-foreground">{BRAND.companyName}</p>
          </div>
        )}
      </div>

      <SidebarContent className="py-1 gap-0">
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu className="gap-0.5">
              {items.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <NavLink
                      to={item.url}
                      end={item.url === '/'}
                      className="flex items-center gap-2.5 px-3 py-1 rounded-lg text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors"
                      activeClassName="bg-primary/10 text-primary font-medium"
                    >
                      <span className="relative shrink-0">
                        <item.icon className="w-5 h-5" />
                        {item.url === '/config' && pendentes > 0 && collapsed && (
                          <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-destructive" />
                        )}
                      </span>
                      {!collapsed && (
                        <span className="text-sm flex items-center gap-2">
                          {item.title}
                          {item.url === '/config' && pendentes > 0 && (
                            <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-destructive text-white text-[10px] font-bold">
                              {pendentes}
                            </span>
                          )}
                        </span>
                      )}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="p-3 border-t border-sidebar-border">
        <button
          onClick={signOut}
          className="flex items-center gap-3 px-3 py-2 rounded-xl text-sidebar-foreground hover:bg-destructive/10 hover:text-destructive transition-colors w-full"
        >
          <LogOut className="w-5 h-5 shrink-0" />
          {!collapsed && <span className="text-sm">Sair</span>}
        </button>
      </SidebarFooter>
    </Sidebar>
  );
}
