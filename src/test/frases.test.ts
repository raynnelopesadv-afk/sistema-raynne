import { describe, it, expect } from 'vitest';
import { momentoDoDia, frasesPara, FRASES_RAYNNE, FRASES_EQUIPE } from '@/lib/frases';

describe('frases do dia', () => {
  it('muda conforme o horário', () => {
    expect(momentoDoDia(new Date(2026, 10, 14, 9))).toBe('manha');
    expect(momentoDoDia(new Date(2026, 10, 14, 14))).toBe('tarde');
    expect(momentoDoDia(new Date(2026, 10, 14, 19))).toBe('noite');
  });
  it('Dra. Raynne recebe as frases dela; equipe recebe as de meta', () => {
    const d = new Date(2026, 10, 14, 9);
    const dela = frasesPara('raynnelopes.adv@gmail.com', d);
    expect(dela).toContain(FRASES_RAYNNE.manha[0]);
    expect(dela.some(f => f.includes('Sl 91:7'))).toBe(true);
    const equipe = frasesPara('comercial01@rl.com', d, { meta: 3, feito: 1 });
    expect(equipe).toContain(FRASES_EQUIPE.manha[0]);
    expect(equipe).toContain('Vai, vencedor(a)! Faltam 2, bora pra meta!');
    expect(frasesPara('comercial01@rl.com', d, { meta: 3, feito: 3 })).toContain('Meta batida! Aqui só tem os melhores!');
  });
});
