import {
  LayoutDashboard, DollarSign, Calendar, CheckCircle2, Users,
  Search, Megaphone, GitBranch, Package, Settings, LogOut, Wallet, FileCheck2, Percent,
  Gavel, CalendarClock, Newspaper, Landmark, UsersRound, FileSignature, ListTodo, BellRing
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

type Item = { title: string; url: string; icon: typeof Gavel; grupo: 'Jurídico' | 'Comercial' | 'Escritório' };

const navItems: Item[] = [
  { title: 'Painel Jurídico', url: '/', icon: Gavel, grupo: 'Jurídico' },
  { title: 'Prazos e Audiências', url: '/agenda-juridica', icon: CalendarClock, grupo: 'Jurídico' },
  { title: 'Publicações', url: '/publicacoes', icon: Newspaper, grupo: 'Jurídico' },
  { title: 'INSS', url: '/inss', icon: Landmark, grupo: 'Jurídico' },
  { title: 'Tarefas', url: '/tarefas', icon: ListTodo, grupo: 'Escritório' },
  { title: 'Equipe', url: '/equipe', icon: UsersRound, grupo: 'Escritório' },
  { title: 'Meu celular (alertas)', url: '/meu-celular', icon: BellRing, grupo: 'Escritório' },
  { title: 'Painel Comercial', url: '/comercial', icon: LayoutDashboard, grupo: 'Comercial' },
  { title: 'Contratos Fechados', url: '/contratos', icon: FileSignature, grupo: 'Comercial' },
  { title: 'Faturamento', url: '/faturamento', icon: DollarSign, grupo: 'Comercial' },
  { title: 'Fechamento', url: '/fechamento', icon: CheckCircle2, grupo: 'Comercial' },
  { title: 'Comissões', url: '/comissoes', icon: Wallet, grupo: 'Comercial' },
  { title: 'Clientes', url: '/clientes', icon: Users, grupo: 'Comercial' },
  { title: 'Consulta', url: '/consulta', icon: Search, grupo: 'Comercial' },
  { title: 'Meta Ads', url: '/meta-ads', icon: Megaphone, grupo: 'Comercial' },
  { title: 'Funis', url: '/funis', icon: GitBranch, grupo: 'Comercial' },
  { title: 'Produtos', url: '/produtos', icon: Package, grupo: 'Comercial' },
  { title: 'Protocolos', url: '/protocolos', icon: FileCheck2, grupo: 'Jurídico' },
  { title: 'Aproveitamento', url: '/qualificacao', icon: Percent, grupo: 'Comercial' },
  { title: 'Config', url: '/config', icon: Settings, grupo: 'Escritório' },
];

export function AppSidebar() {
  const { state, isMobile, setOpenMobile } = useSidebar();
  const collapsed = state === 'collapsed' && !isMobile;
  const { signOut } = useAuth();
  const { isAgencia } = useUserRole();
  const { can } = usePermissions();
  const pendentes = useSolicitacoesPendentes();
  const ordem = { 'Jurídico': 0, 'Comercial': 1, 'Escritório': 2 } as const;
  const itemsFiltrados = (isAgencia ? navItems.filter(i => i.url === '/meta-ads') : navItems).filter(i => {
    if (i.url === '/faturamento') return can('ver_faturamento');
    if (i.url === '/comissoes') return can('ver_comissoes');
    if (i.url === '/meta-ads') return can('ver_meta_ads');
    return true;
  });
  const grupos = (['Jurídico', 'Comercial', 'Escritório'] as const)
    .map(g => ({ nome: g, itens: itemsFiltrados.filter(i => i.grupo === g) }))
    .filter(g => g.itens.length > 0)
    .sort((a, b) => ordem[a.nome] - ordem[b.nome]);

  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border">
      <div className="p-4 flex items-center gap-3 border-b border-sidebar-border">
        <img src={BRAND.emblemaUrl} alt={BRAND.appName} className={collapsed ? 'h-8 w-auto shrink-0' : 'h-11 w-auto shrink-0'} />
        {!collapsed && (
          <div>
            <p className="marca-rl font-semibold text-[14px] whitespace-nowrap text-[hsl(41_55%_62%)] leading-tight">{BRAND.appName}</p>
            <p className="text-[11px] text-sidebar-foreground leading-snug mt-0.5 whitespace-nowrap">{BRAND.sidebarSubtitle}</p>
          </div>
        )}
      </div>

      <SidebarContent className="menu-rolagem py-1 gap-0">
        {grupos.map(grupo => (
        <SidebarGroup key={grupo.nome} className="py-1">
          {!collapsed && (
            <p className="px-3 pt-3 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-[hsl(42_56%_62%)]/70">{grupo.nome}</p>
          )}
          <SidebarGroupContent>
            <SidebarMenu className="gap-0.5">
              {grupo.itens.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <NavLink
                      to={item.url}
                      end={item.url === '/'}
                      onClick={() => { if (isMobile) setOpenMobile(false); }}
                      className="relative flex items-center gap-3 px-3 py-1.5 rounded-lg text-sidebar-foreground menu-item transition-all duration-200"
                      activeClassName="menu-ativo bg-sidebar-accent text-[hsl(42_56%_66%)] font-semibold"
                    >
                      <span className="relative shrink-0">
                        <item.icon className="w-[18px] h-[18px]" strokeWidth={1.75} />
                        {item.url === '/config' && pendentes > 0 && collapsed && (
                          <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-destructive" />
                        )}
                      </span>
                      {!collapsed && (
                        <span className="text-[13.5px] font-medium tracking-[-0.005em] flex items-center gap-2">
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
        ))}
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
