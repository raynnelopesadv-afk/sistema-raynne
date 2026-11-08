import type { AppRole } from '@/hooks/useUserRole';

// Catálogo de permissões do sistema.
// O papel do usuário define o PADRÃO; a tabela user_permissoes guarda exceções
// (permitido = true libera, false bloqueia). Deve espelhar a função SQL
// public.tem_permissao (migration 20260719090000).

export type PermissaoChave =
  | 'lancar_venda'
  | 'editar_pendentes'
  | 'qualificar'
  | 'editar_cpf'
  | 'sincronizar_meta'
  | 'ver_faturamento'
  | 'ver_comissoes'
  | 'ver_meta_ads';

export interface PermissaoDef {
  chave: PermissaoChave;
  label: string;
  descricao: string;
}

export const PERMISSOES: PermissaoDef[] = [
  { chave: 'ver_faturamento', label: 'Ver Faturamento', descricao: 'Acessa a página Faturamento (receita e projeções do escritório).' },
  { chave: 'ver_comissoes', label: 'Ver Comissões', descricao: 'Acessa a página Comissões, com os valores de todos os closers.' },
  { chave: 'ver_meta_ads', label: 'Ver Meta Ads', descricao: 'Acessa a página de métricas de tráfego pago.' },
  { chave: 'lancar_venda', label: 'Lançar venda', descricao: 'Registra novos fechamentos.' },
  { chave: 'editar_pendentes', label: 'Editar contratos pendentes', descricao: 'Edita/exclui contratos ainda pendentes na aba Fechamento.' },
  { chave: 'qualificar', label: 'Qualificar e protocolar', descricao: 'Qualifica, desqualifica, protocola e registra resultado/recebimento (aba Processos).' },
  { chave: 'editar_cpf', label: 'Editar CPF de clientes', descricao: 'Altera o CPF nos registros de clientes.' },
  { chave: 'sincronizar_meta', label: 'Sincronizar Meta/Liderhub', descricao: 'Dispara a importação manual de dados das integrações.' },
];

const VENDAS: AppRole[] = ['sdr', 'closer', 'full_cycle'];

/** Padrão da permissão conforme os papéis do usuário (espelha o SQL). */
export function padraoDaPermissao(chave: PermissaoChave, roles: AppRole[]): boolean {
  const gestor = roles.includes('gestor');
  const operador = roles.includes('operador_tecnico');
  const vendas = roles.some(r => VENDAS.includes(r));
  const agencia = roles.includes('agencia');
  switch (chave) {
    case 'lancar_venda': return !agencia;
    case 'editar_pendentes': return gestor || operador || vendas;
    case 'qualificar': return gestor || operador;
    case 'editar_cpf': return gestor;
    case 'sincronizar_meta': return gestor;
    case 'ver_faturamento': return !agencia;
    case 'ver_comissoes': return !agencia;
    case 'ver_meta_ads': return true;
    default: return false;
  }
}
