import { useState } from 'react';
import { Cast, Minimize2, Smartphone, Tv, Apple, Monitor } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useTvMode } from '@/hooks/useTvMode';

export function TvModeButton() {
  const { isTvMode, enterTvMode, exitTvMode } = useTvMode();
  const [open, setOpen] = useState(false);

  if (isTvMode) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            onClick={exitTvMode}
            className="text-muted-foreground hover:text-primary"
            aria-label="Sair do modo TV"
          >
            <Minimize2 className="w-5 h-5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Sair do modo TV (ESC)</TooltipContent>
      </Tooltip>
    );
  }

  const handleActivate = async () => {
    setOpen(false);
    await enterTvMode();
  };

  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setOpen(true)}
            className="text-muted-foreground hover:text-primary"
            aria-label="Espelhar em Smart TV"
          >
            <Cast className="w-5 h-5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Espelhar em Smart TV</TooltipContent>
      </Tooltip>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Tv className="w-5 h-5 text-primary" />
              Espelhar BI na Smart TV
            </DialogTitle>
            <DialogDescription>
              O navegador não consegue iniciar o espelhamento sozinho — você precisa
              acioná-lo pelo seu dispositivo. Siga o passo do seu aparelho:
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="rounded-lg border border-border bg-card/50 p-4">
              <div className="flex items-center gap-2 mb-2 text-sm font-semibold">
                <Smartphone className="w-4 h-4 text-primary" />
                Android (Chromecast / Google TV)
              </div>
              <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
                <li>Abra <b>Configurações rápidas</b> (deslize de cima)</li>
                <li>Toque em <b>Transmitir tela</b> ou <b>Smart View</b></li>
                <li>Selecione sua TV</li>
                <li>Volte aqui e ative o <b>Modo TV</b> abaixo</li>
              </ol>
            </div>

            <div className="rounded-lg border border-border bg-card/50 p-4">
              <div className="flex items-center gap-2 mb-2 text-sm font-semibold">
                <Apple className="w-4 h-4 text-primary" />
                iPhone / iPad (AirPlay)
              </div>
              <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
                <li>Abra a <b>Central de Controle</b></li>
                <li>Toque em <b>Espelhamento de Tela</b></li>
                <li>Selecione sua Apple TV ou TV compatível</li>
                <li>Volte aqui e ative o <b>Modo TV</b> abaixo</li>
              </ol>
            </div>

            <div className="rounded-lg border border-border bg-card/50 p-4">
              <div className="flex items-center gap-2 mb-2 text-sm font-semibold">
                <Monitor className="w-4 h-4 text-primary" />
                Desktop (Chrome)
              </div>
              <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
                <li>Menu do Chrome (⋮) → <b>Transmitir…</b></li>
                <li>Selecione sua TV → <b>Transmitir guia</b></li>
                <li>Ative o <b>Modo TV</b> abaixo</li>
              </ol>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleActivate}>
              <Tv className="w-4 h-4 mr-2" />
              Ativar Modo TV
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
