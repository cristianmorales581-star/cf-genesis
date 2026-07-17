ALTER TABLE public.emisiones ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE public.emisiones ADD COLUMN IF NOT EXISTS deleted_by uuid;
CREATE INDEX IF NOT EXISTS emisiones_deleted_at_idx ON public.emisiones(deleted_at);