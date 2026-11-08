-- Solicitação de EXCLUSÃO de fechamento: o usuário (não-gestor) pede a exclusão
-- com um motivo; o gestor aprova na fila de Solicitações e a venda é excluída.
alter table public.solicitacoes_alteracao drop constraint if exists solicitacoes_alteracao_tipo_check;
alter table public.solicitacoes_alteracao add constraint solicitacoes_alteracao_tipo_check
  check (tipo in ('alterar_data','novo_contrato_duplicado','excluir_contrato'));
