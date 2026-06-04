
-- audit_log: admin-only SELECT
DROP POLICY IF EXISTS audit_select_auth ON public.audit_log;
CREATE POLICY audit_select_admin ON public.audit_log
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

-- cedentes: operador/admin SELECT
DROP POLICY IF EXISTS cedentes_select_auth ON public.cedentes;
CREATE POLICY cedentes_select_operador ON public.cedentes
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'operador'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

-- financistas: operador/admin SELECT
DROP POLICY IF EXISTS financistas_select_auth ON public.financistas;
CREATE POLICY financistas_select_operador ON public.financistas
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'operador'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

-- storage: restrict INSERT/UPDATE on cfb-documents to operador/admin
DROP POLICY IF EXISTS cfb_docs_ins_auth ON storage.objects;
CREATE POLICY cfb_docs_ins_operador ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'cfb-documents'
    AND (has_role(auth.uid(), 'operador'::app_role) OR has_role(auth.uid(), 'admin'::app_role))
  );

DROP POLICY IF EXISTS cfb_docs_upd_auth ON storage.objects;
CREATE POLICY cfb_docs_upd_operador ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'cfb-documents'
    AND (has_role(auth.uid(), 'operador'::app_role) OR has_role(auth.uid(), 'admin'::app_role))
  )
  WITH CHECK (
    bucket_id = 'cfb-documents'
    AND (has_role(auth.uid(), 'operador'::app_role) OR has_role(auth.uid(), 'admin'::app_role))
  );

-- Revoke public/anon execute on has_role (kept for authenticated for RLS)
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC, anon;
