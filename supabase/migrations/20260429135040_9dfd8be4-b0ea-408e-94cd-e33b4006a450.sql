ALTER TABLE public.emisiones
ADD COLUMN IF NOT EXISTS cedente_id uuid REFERENCES public.cedentes(id);