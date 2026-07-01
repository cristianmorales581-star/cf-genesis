
DROP POLICY IF EXISTS financistas_ins_operador ON public.financistas;
DROP POLICY IF EXISTS financistas_upd_operador ON public.financistas;

CREATE POLICY financistas_ins_operador ON public.financistas
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'backoffice'::app_role) OR public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY financistas_upd_operador ON public.financistas
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'backoffice'::app_role) OR public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS cfb_docs_ins_operador ON storage.objects;
DROP POLICY IF EXISTS cfb_docs_upd_operador ON storage.objects;

CREATE POLICY cfb_docs_ins_operador ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'cfb-documents' AND (public.has_role(auth.uid(), 'backoffice'::app_role) OR public.has_role(auth.uid(), 'admin'::app_role)));

CREATE POLICY cfb_docs_upd_operador ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'cfb-documents' AND (public.has_role(auth.uid(), 'backoffice'::app_role) OR public.has_role(auth.uid(), 'admin'::app_role)))
  WITH CHECK (bucket_id = 'cfb-documents' AND (public.has_role(auth.uid(), 'backoffice'::app_role) OR public.has_role(auth.uid(), 'admin'::app_role)));
