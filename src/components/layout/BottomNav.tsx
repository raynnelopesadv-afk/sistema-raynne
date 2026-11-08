import {
  Settings, Megaphone, Gavel, CalendarClock, Newspaper, Landmark, CheckCircle2
} from 'lucide-react';
import { NavLink } from '@/components/NavLink';
import { TvModeButton } from '@/components/TvModeButton';
import { useUserRole } from '@/hooks/useUserRole';

const bottomItems = [
  { title: 'Painel', url: '/', icon: Gavel },
  { title: 'Prazos', url: '/agenda-juridica', icon: CalendarClock },
  { title: 'Publicações', url: '/publicacoes', icon: Newspaper },
  { title: 'INSS', url: '/inss', icon: Landmark },
  { title: 'Contratos', url: '/contratos', icon: CheckCircle2 },
  { title: 'Config', url: '/config', icon: Settings },
];

const agenciaItems = [
  { title: 'Meta Ads', url: '/meta-ads', icon: Megaphone },
];

export function BottomNav() {
  const { isAgencia } = useUserRole();
  const items = isAgencia ? agenciaItems : bottomItems;
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
        <div className="flex flex-col items-center gap-0.5 py-1 px-1.5 rounded-xl text-primary transition-colors">
          <TvModeButton />
          <span className="text-[9px] font-medium -mt-1">TV</span>
        </div>
      </div>
    </nav>
  );
}
