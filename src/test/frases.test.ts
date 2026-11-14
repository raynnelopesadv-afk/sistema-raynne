import { describe, it, expect } from 'vitest';
import { momentoDoDia, frasesPara, FRASES_RAYNNE, FRASES_EQUIPE, FRASE_CLOSER, orientacaoCloser, ehRaynne } from '@/lib/frases';

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
  it('logins da equipe com "+" no Gmail da Dra. Raynne NÃO recebem as frases dela', () => {
    const d = new Date(2026, 10, 14, 9);
    expect(ehRaynne('raynnelopes.adv@gmail.com')).toBe(true);
    expect(ehRaynne('raynnelsouza@gmail.com')).toBe(true);
    for (const login of ['comercial01', 'comercial02', 'lider', 'juridico01', 'juridico02', 'juridico03']) {
      const email = `raynnelopes.adv+${login}@gmail.com`;
      expect(ehRaynne(email)).toBe(false);
      expect(frasesPara(email, d)).not.toContain(FRASES_RAYNNE.manha[0]);
    }
  });
  it('closers recebem "Cada não te deixa mais perto do sim"; jurídico não', () => {
    const d = new Date(2026, 10, 14, 9);
    expect(frasesPara('comercial01@rl.com', d, null, 'comercial')).toContain(FRASE_CLOSER);
    expect(frasesPara('lider@rl.com', d, null, 'lider')).toContain(FRASE_CLOSER);
    expect(frasesPara('juridico01@rl.com', d, null, 'juridico')).not.toContain(FRASE_CLOSER);
  });
  it('closer: liga, liga, liga de manhã; à tarde só os quentes, sempre na rotação', () => {
    const manha = frasesPara('c@rl.com', new Date(2026, 10, 14, 9), null, 'comercial');
    const tarde = frasesPara('c@rl.com', new Date(2026, 10, 14, 15), null, 'comercial');
    expect(orientacaoCloser(new Date(2026, 10, 14, 9))).toContain('LIGA, LIGA, LIGA');
    expect(orientacaoCloser(new Date(2026, 10, 14, 15))).toContain('QUENTES');
    expect(manha.filter((_, i) => i % 2 === 0).every(f => f === orientacaoCloser(new Date(2026, 10, 14, 9)) || f === FRASE_CLOSER)).toBe(true);
    expect(tarde).toContain(orientacaoCloser(new Date(2026, 10, 14, 15)));
  });
});
