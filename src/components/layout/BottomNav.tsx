import {
  Megaphone, Gavel, CalendarClock, CheckCircle2, ListTodo, FileCheck2, Menu
} from 'lucide-react';
import { useSidebar } from '@/components/ui/sidebar';
import { NavLink } from '@/components/NavLink';
import { useUserRole } from '@/hooks/useUserRole';

const bottomItems = [
  { title: 'Painel', url: '/', icon: Gavel },
  { title: 'Tarefas', url: '/tarefas', icon: ListTodo },
  { title: 'Protocolos', url: '/protocolos', icon: FileCheck2 },
  { title: 'Prazos', url: '/agenda-juridica', icon: CalendarClock },
  { title: 'Contratos', url: '/contratos', icon: CheckCircle2 },
];

const agenciaItems = [
  { title: 'Meta Ads', url: '/meta-ads', icon: Megaphone },
];

export function BottomNav() {
  const { isAgencia } = useUserRole();
  const items = isAgencia ? agenciaItems : bottomItems;
  const { setOpenMobile } = useSidebar();
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 md:hidden border-t border-border bg-card/90 backdrop-blur-xl safe-area-bottom">
      <div className="flex items-center justify-around h-16 px-1 gap-0.5">
        {items.map((item) => (
          <NavLink
            key={item.title}
            to={item.url}
            end={item.url === '/'}
            className="flex flex-col items-center gap-0.5 py-1 px-1.5 rounded-xl text-muted-foreground transition-colors"
            activeClassName="text-primary"
          >
            <item.icon className="w-5 h-5" />
            <span className="text-[9px] font-medium">{item.title}</span>
          </NavLink>
        ))}
        {!isAgencia && (
          <button type="button" onClick={() => setOpenMobile(true)}
            className="flex flex-col items-center gap-0.5 py-1 px-1.5 rounded-xl text-muted-foreground transition-colors">
            <Menu className="w-5 h-5" />
            <span className="text-[9px] font-medium">Menu</span>
          </button>
        )}
      </div>
    </nav>
  );
}
