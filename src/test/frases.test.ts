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
    expect(frasesPara('raynnelopes.adv@gmail.com', d)).toBe(FRASES_RAYNNE.manha);
    expect(frasesPara('comercial01@rl.com', d)).toBe(FRASES_EQUIPE.manha);
  });
});
