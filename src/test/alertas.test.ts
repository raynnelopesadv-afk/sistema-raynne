import { describe, it, expect } from 'vitest';
import { esperadoAte, mensagemPessoal, mensagemEquipe, montarAlertas } from '../../scripts/lib/alertas.mjs';

describe('alertas de meta no celular', () => {
  it('ritmo esperado ao longo do dia', () => {
    expect(esperadoAte(3, 9)).toBe(0);
    expect(esperadoAte(3, 14)).toBe(1);
    expect(esperadoAte(3, 17)).toBe(3);
    expect(esperadoAte(4, 13)).toBe(2);
  });

  it('mensagem do comercial e do jurídico', () => {
    const c = mensagemPessoal({ setor: 'comercial', feito: 1, meta: 3, hora: 14 });
    expect(c.titulo).toBe('Vai, vencedor(a)!');
    expect(c.corpo).toContain('1 de 3 contratos');
    expect(c.corpo).toContain('Faltam 2');
    const j = mensagemPessoal({ setor: 'juridico', feito: 4, meta: 4, hora: 15 });
    expect(j.titulo).toBe('Meta batida!');
    expect(j.corpo).toContain('5º');
  });

  it('mensagem de prazos', () => {
    expect(mensagemPessoal({ setor: 'prazos', feito: 0, meta: 0, hora: 14, prazos: { total: 6, feitos: 3 } }).corpo)
      .toContain('3 de 6 prazos');
    expect(mensagemPessoal({ setor: 'prazos', feito: 0, meta: 0, hora: 16, prazos: { total: 2, feitos: 2 } }).titulo)
      .toBe('Prazos zerados!');
  });

  it('aviso da equipe mostra só o próprio setor e quem está abaixo do ritmo', () => {
    const pessoas = [
      { userId: 'a', nome: 'Ana', setor: 'comercial', meta: 3, feito: 0 },
      { userId: 'b', nome: 'Bia', setor: 'lider', meta: 3, feito: 2 },
      { userId: 'c', nome: 'Caio', setor: 'juridico', meta: 4, feito: 0 },
    ];
    const m = mensagemEquipe({ setor: 'comercial', pessoas, prazos: { total: 0, feitos: 0 }, hora: 14, euId: 'x' });
    expect(m.corpo).toContain('Ana: 0/3');
    expect(m.corpo).not.toContain('Bia');
    expect(m.corpo).not.toContain('Caio');
    const g = mensagemEquipe({ setor: 'gestao', pessoas, prazos: { total: 5, feitos: 1 }, hora: 14, euId: 'x' });
    expect(g.corpo).toContain('Caio: 0/4 protocolos');
    expect(g.corpo).toContain('Prazos: 1 de 5');
  });

  it('monta tudo e inclui o resumo às 17h', () => {
    const inscricoes = [
      { userId: 'a', nome: 'Ana', setor: 'comercial', alertaHora: true, alertaEquipe: true, resumoDia: true },
      { userId: 'r', nome: 'Raynne', setor: 'gestao', alertaHora: true, alertaEquipe: true, resumoDia: true },
    ];
    const s = montarAlertas({ hora: 17, inscricoes, feitos: { a: 3 }, prazos: { total: 0, feitos: 0 } });
    expect(s.find(x => x.userId === 'a' && x.tipo === 'pessoal').titulo).toBe('Meta batida!');
    expect(s.find(x => x.userId === 'r' && x.tipo === 'resumo').corpo).toContain('3 de 3 contratos');
    expect(s.some(x => x.userId === 'r' && x.tipo === 'pessoal')).toBe(false);
  });
});
