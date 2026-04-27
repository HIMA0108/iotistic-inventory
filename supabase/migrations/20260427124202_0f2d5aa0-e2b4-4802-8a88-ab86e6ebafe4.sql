ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'manager';

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS display_title text;