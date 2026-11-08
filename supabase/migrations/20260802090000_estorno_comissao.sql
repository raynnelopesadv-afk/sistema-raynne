-- Estorno de comissão: quando um contrato vira DESQUALIFICADO ou DESISTÊNCIA,
-- o vendedor perde a comissão daquele contrato.
--   - Se ainda no mês da competência: a parcela simplesmente não é paga
--     (o motor já ignora contratos nesses status).
--   - Se em mês posterior: o valor já creditado vira DESCONTO no mês da
--     desqualificação.
-- Para isso precisamos saber QUANDO o contrato foi desqualificado.
-- O gatilho abaixo preenche data_desqualificacao automaticamente, qualquer
-- que seja a tela usada (Processos, edição do contrato, etc.).

create or replace function public.set_data_desqualificacao()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status_qualificacao in ('desqualificado','desistencia')
     and (old.status_qualificacao is distinct from new.status_qualificacao) then
    new.data_desqualificacao := coalesce(new.data_desqualificacao, current_date);
  end if;
  -- voltou a ficar ativo: limpa a data (não há mais estorno)
  if new.status_qualificacao not in ('desqualificado','desistencia')
     and old.status_qualificacao in ('desqualificado','desistencia') then
    new.data_desqualificacao := null;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_set_data_desqualificacao on public.clientes_fechados;
create trigger trg_set_data_desqualificacao
  before update of status_qualificacao on public.clientes_fechados
  for each row execute function public.set_data_desqualificacao();

-- Preenche o histórico: contratos já desqualificados sem data recebem a data
-- da última atualização (melhor aproximação disponível).
update public.clientes_fechados
   set data_desqualificacao = updated_at::date
 where status_qualificacao in ('desqualificado','desistencia')
   and data_desqualificacao is null;
