ALTER TABLE public.cedentes
ADD COLUMN tipo public.tipo_financista NOT NULL DEFAULT 'juridica'::public.tipo_financista;