-- Instalação do banco — parte 4 de 8. Rodar em ordem no SQL Editor do Supabase.

-- ===== 20260708130000_desistencia_status.sql
-- Status de "desistência" (perda distinta de desqualificado).
-- Perda de contrato = desqualificado + desistência.
alter type public.cliente_status add value if not exists 'desistencia';

