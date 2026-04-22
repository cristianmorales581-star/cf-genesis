-- Secuencia global de símbolo CFB. Arranca en 4675 (último conocido: C4674A).
CREATE SEQUENCE IF NOT EXISTS public.simbolo_cfb_seq
  START WITH 4675
  INCREMENT BY 1
  NO CYCLE;

-- Función global thread-safe
CREATE OR REPLACE FUNCTION public.next_simbolo_cfb()
RETURNS TEXT
LANGUAGE SQL SECURITY DEFINER SET search_path = public
AS $$
  SELECT 'C' || nextval('public.simbolo_cfb_seq')::text || 'A';
$$;

-- Compatibilidad: la función vieja delega a la nueva
CREATE OR REPLACE FUNCTION public.next_simbolo_for_programa(_programa_id UUID)
RETURNS TEXT
LANGUAGE SQL SECURITY DEFINER SET search_path = public
AS $$
  SELECT public.next_simbolo_cfb();
$$;

GRANT EXECUTE ON FUNCTION public.next_simbolo_cfb() TO authenticated;
GRANT EXECUTE ON FUNCTION public.next_simbolo_for_programa(UUID) TO authenticated;