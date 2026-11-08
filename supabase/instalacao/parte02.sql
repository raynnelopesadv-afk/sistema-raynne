-- Instalação do banco — parte 2 de 8. Rodar em ordem no SQL Editor do Supabase.

-- ===== 20260427030712_bbb9458c-0bd7-4303-a510-fe87f2497bec.sql
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'sdr';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'closer';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'full_cycle';
