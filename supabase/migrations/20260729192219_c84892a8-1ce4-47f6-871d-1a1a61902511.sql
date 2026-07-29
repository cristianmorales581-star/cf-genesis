-- Restrict SELECT on master tables to admin/backoffice roles
DROP POLICY IF EXISTS cedentes_select_auth ON public.cedentes;
CREATE POLICY cedentes_select_staff ON public.cedentes
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'backoffice'::app_role));

DROP POLICY IF EXISTS financistas_select_auth ON public.financistas;
CREATE POLICY financistas_select_staff ON public.financistas
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'backoffice'::app_role));

DROP POLICY IF EXISTS programas_select_auth ON public.programas;
CREATE POLICY programas_select_staff ON public.programas
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'backoffice'::app_role));

DROP POLICY IF EXISTS prog_desc_select_auth ON public.programa_descuentos;
CREATE POLICY prog_desc_select_staff ON public.programa_descuentos
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'backoffice'::app_role));

-- Restrict storage reads on cfb-documents to admin/backoffice roles
DROP POLICY IF EXISTS cfb_docs_read_auth ON storage.objects;
CREATE POLICY cfb_docs_read_staff ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'cfb-documents'
    AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'backoffice'::app_role))
  );