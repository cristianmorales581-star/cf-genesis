CREATE TABLE public.emision_dia_documentos (
 fecha_emision date PRIMARY KEY,
 estado text NOT NULL DEFAULT 'por_enviar' CHECK (estado IN ('por_enviar', 'parcialmente_firmado', 'firmado')),
 updated_at timestamptz NOT NULL DEFAULT now(),
 updated_by uuid DEFAULT auth.uid()
);
GRANT SELECT, INSERT, UPDATE ON public.emision_dia_documentos TO authenticated;
GRANT ALL ON public.emision_dia_documentos TO service_role;
ALTER TABLE public.emision_dia_documentos ENABLE ROW LEVEL SECURITY;
CREATE POLICY dia_docs_select ON public.emision_dia_documentos FOR SELECT TO authenticated USING (true);
CREATE POLICY dia_docs_insert_staff ON public.emision_dia_documentos FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'backoffice'));
CREATE POLICY dia_docs_update_staff ON public.emision_dia_documentos FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'backoffice')) WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'backoffice'));
CREATE FUNCTION public.stamp_emision_dia_documentos() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$ BEGIN NEW.updated_at = now(); NEW.updated_by = auth.uid(); RETURN NEW; END; $$;
CREATE TRIGGER stamp_emision_dia_documentos BEFORE INSERT OR UPDATE ON public.emision_dia_documentos FOR EACH ROW EXECUTE FUNCTION public.stamp_emision_dia_documentos();