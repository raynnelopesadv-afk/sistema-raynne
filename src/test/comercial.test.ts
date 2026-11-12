import { describe, it, expect } from 'vitest';
import { analisarComercial, textoRelatorio, diasUteis, proximoDiaUtil } from '../../scripts/lib/comercial.mjs';

describe('relatório comercial de fim do dia', () => {
  it('dias úteis e próximo dia útil', () => {
    expect(diasUteis('2026-11-01', '2026-11-30').length).toBe(21);
    expect(proximoDiaUtil('2026-11-13')).toBe('2026-11-16'); // sexta → segunda
  });

  it('aponta o vendedor fraco e calcula o necessário por dia', () => {
    const a = analisarComercial({
      hoje: '2026-11-12', metaEquipeDia: 3,
      vendedores: [{ id: 'a', nome: 'Ana', metaMes: 0 }, { id: 'b', nome: 'Bia', metaMes: 0 }],
      fechamentos: [
        ...Array.from({ length: 12 }, (_, i) => ({ vendedorId: 'a', dia: `2026-11-${String(3 + (i % 9)).padStart(2, '0')}` })),
        { vendedorId: 'b', dia: '2026-11-03' },
        { vendedorId: 'a', dia: '2026-11-12' },
      ],
      zapsign: { pendentes: 4, assinadosHoje: 1 },
    });
    expect(a.equipe.metaMes).toBe(63);
    expect(a.equipe.mes).toBe(14);
    expect(a.amanha).toBe('2026-11-13');
    const bia = a.vendedores.find((v: { nome: string }) => v.nome === 'Bia');
    expect(bia.situacao).toBe('vermelho');
    expect(bia.diasSemFechar).toBeGreaterThanOrEqual(2);
    expect(a.vendedores[0].nome).toBe('Bia'); // mais fraco primeiro
    const txt = textoRelatorio(a);
    expect(txt).toContain('Bia');
    expect(txt).toContain('4 assinaturas pendentes');
  });

  it('usa o ZapSign quando tem mais assinados que lançados', () => {
    const a = analisarComercial({
      hoje: '2026-11-12', metaEquipeDia: 3, vendedores: [{ id: 'a', nome: 'Ana', metaMes: 0 }],
      fechamentos: [{ vendedorId: 'a', dia: '2026-11-12' }],
      zapsign: { pendentes: 0, assinadosHoje: 2, assinadosMes: 20 },
    });
    expect(a.equipe.mes).toBe(20);
    expect(a.equipe.hoje).toBe(2);
    expect(textoRelatorio(a)).toContain('19 contrato(s) assinado(s) ainda não lançado(s)');
  });
});
