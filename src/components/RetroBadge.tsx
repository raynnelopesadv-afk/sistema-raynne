import { History } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface Props {
  registradoEm?: string | null;
  registradoPor?: string | null;
  className?: string;
}

export function RetroBadge({ registradoEm, registradoPor, className = '' }: Props) {
  const data = registradoEm
    ? new Date(registradoEm).toLocaleDateString('pt-BR')
    : null;
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className={`inline-flex items-center justify-center w-4 h-4 rounded-full bg-muted-foreground/15 border border-[#6B7280]/40 text-muted-foreground ${className}`}
            aria-label="Cadastro retroativo"
          >
            <History className="w-2.5 h-2.5" />
          </span>
        </TooltipTrigger>
        <TooltipContent>
          <p className="text-xs">
            Cadastro retroativo{data ? ` — registrado em ${data}` : ''}
            {registradoPor ? ` por ${registradoPor}` : ''}
          </p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
