
DROP POLICY IF EXISTS financistas_select_operador ON public.financistas;
CREATE POLICY financistas_select_auth ON public.financistas
  FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS financistas_upd_operador ON public.financistas;
CREATE POLICY financistas_upd_staff ON public.financistas
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'backoffice'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'backoffice'::app_role));

DROP POLICY IF EXISTS financistas_ins_operador ON public.financistas;
CREATE POLICY financistas_ins_staff ON public.financistas
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'backoffice'::app_role));
