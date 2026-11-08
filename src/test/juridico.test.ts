import { describe, it, expect } from 'vitest';
import { lerEmailInss, prazoCorrido } from '../../scripts/lib/inss.mjs';
import { paraPublicacao, ufDoProcesso as ufDjen, mascaraCnj } from '../../scripts/lib/djen.mjs';
import { ufDoProcesso, urgencia } from '@/lib/juridico';

const HTML = `<p></p><table><tbody><tr><td> </td><td><p><b>Requerimento</b></p></td></tr></tbody></table><br /><div><div>##### Esta é uma mensagem automática. Favor não responder esse e-mail. #####</div><br />Prezado(a) Sr(a) <b>SANDRO QUEIROZ GONCALVES</b>,<br /><br /><br />Informamos que o status do seu requerimento foi alterado, conforme detalhes abaixo:<br /><br /><div style="margin-left:1cm"><b>Protocolo</b>: 4574952907579</div><div style="margin-left:1cm"><b>Serviço</b>: AUXÍLIO-ACIDENTE</div><div style="margin-left:1cm"><b>Data do Protocolo</b>: 20/10/2026</div><div style="margin-left:1cm"><b>Unidade responsável</b>: DIGITAL SALVADOR</div><div style="margin-left:1cm"><b>Status atual</b>: PENDENTE</div><br /><br /><div><b>Despacho:</b></div><div><p>Prezado(a) Senhor(a),</p><p><br /></p><p>Verificamos que a perícia já foi agendada e, por isso, o sistema cumpriu a exigência de forma automática.</p><p>Compareça na data e no horário agendados para continuar a análise do seu pedido.<br /></p></div><br /><br /><b>É possível acompanhar o andamento do seu requerimento</b> ligando para o telefone 135</div>`;

describe('e-mail do INSS', () => {
  it('extrai os campos do aviso', () => {
    const a = lerEmailInss({ email_id: 'x', recebido_em: '2026-11-06T20:30:40Z', assunto: '[INSS] O status do requerimento 4574952907579 foi alterado para Pendente', html: HTML });
    expect(a.protocolo).toBe('4574952907579');
    expect(a.cliente).toBe('SANDRO QUEIROZ GONCALVES');
    expect(a.servico).toBe('AUXÍLIO-ACIDENTE');
    expect(a.data_protocolo).toBe('2026-10-20');
    expect(a.unidade).toBe('DIGITAL SALVADOR');
    expect(a.status).toBe('PENDENTE');
    expect(a.exigencia_automatica).toBe(true);
    expect(a.despacho).toContain('perícia já foi agendada');
    expect(a.despacho).not.toContain('É possível acompanhar');
  });
  it('prazo de 30 dias corridos no horário de Brasília', () => {
    expect(prazoCorrido('2026-11-06T20:30:40Z')).toBe('2026-12-06');
    expect(prazoCorrido('2026-11-07T01:00:00Z')).toBe('2026-12-06'); // 22h do dia 06 em Brasília
  });
  it('ignora e-mail que não é do INSS', () => {
    expect(lerEmailInss({ email_id: 'y', recebido_em: '2026-11-06T00:00:00Z', assunto: 'Oi', html: '<p>nada</p>' })).toBeNull();
  });
});

describe('DJEN e processos', () => {
  it('UF pelo número CNJ', () => {
    expect(ufDoProcesso('5001495-49.2024.8.13.0443')).toBe('MG');
    expect(ufDoProcesso('6000149-54.2026.8.16.0132')).toBe('PR');
    expect(ufDjen('51917610220258210001', 'TJRS')).toBe('RS');
    expect(ufDoProcesso('1000000-00.2025.4.06.3800')).toBeNull();
  });
  it('máscara CNJ', () => {
    expect(mascaraCnj('50014954920248130443')).toBe('5001495-49.2024.8.13.0443');
  });
  it('converte comunicação do DJEN', () => {
    const p = paraPublicacao({ id: 123, data_disponibilizacao: '2026-11-06', siglaTribunal: 'TJMG', nomeOrgao: 'Vara', numero_processo: '50014954920248130443', texto: '<b>Intime-se</b>', tipoDocumento: 'Despacho' });
    expect(p).toMatchObject({ fonte: 'djen', id_externo: '123', uf: 'MG', numero_processo: '5001495-49.2024.8.13.0443', texto: 'Intime-se' });
  });
});

describe('urgência', () => {
  const hoje = new Date('2026-11-09T12:00:00');
  it('classifica', () => {
    expect(urgencia('2026-11-08', false, hoje)).toBe('atrasado');
    expect(urgencia('2026-11-09', false, hoje)).toBe('hoje');
    expect(urgencia('2026-11-10', false, hoje)).toBe('amanha');
    expect(urgencia('2026-11-14', false, hoje)).toBe('semana');
    expect(urgencia('2026-12-30', false, hoje)).toBe('futuro');
    expect(urgencia('2026-11-08', true, hoje)).toBe('feito');
  });
});

import { paraLinha, telefone } from '../../scripts/lib/zapsign.mjs';
describe('ZapSign', () => {
  const doc = {
    token: 'd1', name: 'Contrato BPC - Maria', status: 'pending', created_at: '2026-11-03T12:00:00Z', last_update_at: '2026-11-04T12:00:00Z',
    signers: [
      { name: 'Raynne Lopes de Souza', email: 'raynnelopes.adv@gmail.com', status: 'signed', signed_at: '2026-11-03T13:00:00Z', phone_country: '55', phone_number: '31999990000', sign_url: 'x' },
      { name: 'Maria da Silva', email: '', status: 'new', phone_country: '55', phone_number: '(31) 98888-7777', times_viewed: 2, last_view_at: '2026-11-04T10:00:00Z', sign_url: 'https://app.zapsign.com.br/verificar/abc' },
    ],
  };
  it('pega o cliente, não o escritório', () => {
    const l = paraLinha(doc);
    expect(l.cliente_nome).toBe('Maria da Silva');
    expect(l.cliente_telefone).toBe('+5531988887777');
    expect(l.link_assinatura).toContain('verificar');
    expect(l.assinado_em).toBeNull();
  });
  it('data de assinatura quando assinado', () => {
    const l = paraLinha({ ...doc, status: 'signed', signers: [doc.signers[0], { ...doc.signers[1], status: 'signed', signed_at: '2026-11-05T09:00:00Z' }] });
    expect(l.assinado_em).toBe('2026-11-05T09:00:00Z');
  });
  it('telefone vazio', () => { expect(telefone({ phone_number: '' })).toBeNull(); });
});
describe('telefone ZapSign', () => {
  it('remove 55 duplicado', () => { expect(telefone({ phone_country: '55', phone_number: '553199307083' })).toBe('+553199307083'); });
});
