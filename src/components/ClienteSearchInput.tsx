import { forwardRef, useEffect, useRef } from 'react';
import { Search, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

interface Props {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  /** Habilitar atalho Ctrl+K / Cmd+K para focar */
  enableShortcut?: boolean;
  className?: string;
}

export const ClienteSearchInput = forwardRef<HTMLInputElement, Props>(function ClienteSearchInput(
  { value, onChange, placeholder = 'Buscar por nome do cliente ou CPF...', enableShortcut = true, className },
  ref,
) {
  const innerRef = useRef<HTMLInputElement | null>(null);
  const setRefs = (el: HTMLInputElement | null) => {
    innerRef.current = el;
    if (typeof ref === 'function') ref(el);
    else if (ref) (ref as React.MutableRefObject<HTMLInputElement | null>).current = el;
  };

  useEffect(() => {
    if (!enableShortcut) return;
    const onKey = (e: KeyboardEvent) => {
      const isMod = e.ctrlKey || e.metaKey;
      if (isMod && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        innerRef.current?.focus();
        innerRef.current?.select();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [enableShortcut]);

  return (
    <div className={`relative w-full md:min-w-[400px] md:max-w-2xl ${className ?? ''}`}>
      <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-primary/70" />
      <Input
        ref={setRefs}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            onChange('');
            (e.currentTarget as HTMLInputElement).blur();
          }
        }}
        placeholder={placeholder}
        className="pl-9 pr-10 h-11 bg-card/60 border-border focus-visible:ring-primary/40"
      />
      {value && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Limpar busca"
          className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8 text-muted-foreground hover:text-foreground"
          onClick={() => {
            onChange('');
            innerRef.current?.focus();
          }}
        >
          <X className="w-4 h-4" />
        </Button>
      )}
    </div>
  );
});
