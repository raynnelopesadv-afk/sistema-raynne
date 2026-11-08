-- Regra permanente: CPF e telefone são guardados SEMPRE só com dígitos,
-- não importa de onde venham (tela, webhook do CRM, importação futura).
-- A formatação bonita é aplicada na exibição.

create or replace function public.normaliza_documentos()
returns trigger
language plpgsql as $$
begin
  if new.cpf is not null then
    new.cpf := nullif(regexp_replace(new.cpf, '\D', '', 'g'), '');
  end if;
  if new.telefone is not null then
    new.telefone := nullif(regexp_replace(new.telefone, '\D', '', 'g'), '');
  end if;
  return new;
end;
$$;

drop trigger if exists trg_normaliza_documentos on public.clientes_fechados;
create trigger trg_normaliza_documentos
  before insert or update of cpf, telefone on public.clientes_fechados
  for each row execute function public.normaliza_documentos();

-- Padroniza o que já existe (idempotente).
update public.clientes_fechados
   set cpf = regexp_replace(cpf, '\D', '', 'g')
 where cpf is not null and cpf ~ '[^0-9]';

update public.clientes_fechados
   set telefone = regexp_replace(telefone, '\D', '', 'g')
 where telefone is not null and telefone ~ '[^0-9]';
