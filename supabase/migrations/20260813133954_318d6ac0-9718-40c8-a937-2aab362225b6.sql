ALTER TABLE public.cedentes ADD COLUMN IF NOT EXISTS codigo_cliente text;
ALTER TABLE public.financistas ADD COLUMN IF NOT EXISTS codigo_cliente text;