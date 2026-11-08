-- Celebração de vendas no modo apresentação (TV)
--   - closers.foto_url: foto do vendedor exibida no telão de parabéns
--   - bucket 'avatars' para armazenar as fotos

alter table public.closers
  add column if not exists foto_url text;

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

drop policy if exists "avatars read public" on storage.objects;
create policy "avatars read public" on storage.objects
  for select to public using (bucket_id = 'avatars');

drop policy if exists "avatars upload auth" on storage.objects;
create policy "avatars upload auth" on storage.objects
  for insert to authenticated with check (bucket_id = 'avatars');

drop policy if exists "avatars update auth" on storage.objects;
create policy "avatars update auth" on storage.objects
  for update to authenticated using (bucket_id = 'avatars');
