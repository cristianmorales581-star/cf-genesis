
-- 1. Tabla de descuentos por programa
CREATE TABLE public.programa_descuentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  programa_id uuid NOT NULL REFERENCES public.programas(id) ON DELETE CASCADE,
  descuento numeric(6,5) NOT NULL CHECK (descuento >= 0 AND descuento <= 0.20),
  etiqueta text,
  es_default boolean NOT NULL DEFAULT false,
  activo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (programa_id, descuento)
);

CREATE INDEX idx_programa_descuentos_prog ON public.programa_descuentos(programa_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.programa_descuentos TO authenticated;
GRANT ALL ON public.programa_descuentos TO service_role;

ALTER TABLE public.programa_descuentos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "prog_desc_select_auth" ON public.programa_descuentos
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "prog_desc_ins_operador" ON public.programa_descuentos
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'operador') OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "prog_desc_upd_operador" ON public.programa_descuentos
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'operador') OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "prog_desc_del_operador" ON public.programa_descuentos
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'operador') OR public.has_role(auth.uid(),'admin'));

-- 2. Sembrar descuentos default desde descuento_base existente
INSERT INTO public.programa_descuentos (programa_id, descuento, etiqueta, es_default, activo)
SELECT id, descuento_base, 'Base', true, true FROM public.programas
ON CONFLICT DO NOTHING;

-- 3. Columna estado en programas (calculada según fecha_vencimiento + activo)
ALTER TABLE public.programas
  ADD COLUMN IF NOT EXISTS estado text NOT NULL DEFAULT 'activa'
  CHECK (estado IN ('activa','vencida','inactiva'));

-- Inicializar estado actual
UPDATE public.programas SET estado = CASE
  WHEN NOT activo THEN 'inactiva'
  WHEN fecha_vencimiento < CURRENT_DATE THEN 'vencida'
  ELSE 'activa'
END;

-- 4. Función para marcar vencidos (callable from app on load)
CREATE OR REPLACE FUNCTION public.refresh_programas_estado()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE n integer;
BEGIN
  UPDATE public.programas
     SET estado = 'vencida', activo = false
   WHERE fecha_vencimiento < CURRENT_DATE
     AND estado <> 'vencida';
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

GRANT EXECUTE ON FUNCTION public.refresh_programas_estado() TO authenticated;
