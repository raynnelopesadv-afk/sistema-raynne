-- Status de "desistência" (perda distinta de desqualificado).
-- Perda de contrato = desqualificado + desistência.
alter type public.cliente_status add value if not exists 'desistencia';
