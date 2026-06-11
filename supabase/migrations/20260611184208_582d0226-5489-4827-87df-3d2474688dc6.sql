
-- CEDENTES
DROP POLICY IF EXISTS cedentes_ins_auth ON public.cedentes;
DROP POLICY IF EXISTS cedentes_upd_auth ON public.cedentes;

CREATE POLICY cedentes_ins_staff ON public.cedentes
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'backoffice'));

CREATE POLICY cedentes_upd_staff ON public.cedentes
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'backoffice'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'backoffice'));

-- PROGRAMAS
DROP POLICY IF EXISTS programas_ins_operador ON public.programas;
DROP POLICY IF EXISTS programas_upd_operador ON public.programas;

CREATE POLICY programas_ins_staff ON public.programas
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'backoffice'));

CREATE POLICY programas_upd_staff ON public.programas
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'backoffice'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'backoffice'));

-- PROGRAMA_DESCUENTOS
DROP POLICY IF EXISTS prog_desc_ins_operador ON public.programa_descuentos;
DROP POLICY IF EXISTS prog_desc_upd_operador ON public.programa_descuentos;
DROP POLICY IF EXISTS prog_desc_del_operador ON public.programa_descuentos;

CREATE POLICY prog_desc_ins_staff ON public.programa_descuentos
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'backoffice'));

CREATE POLICY prog_desc_upd_staff ON public.programa_descuentos
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'backoffice'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'backoffice'));

CREATE POLICY prog_desc_del_staff ON public.programa_descuentos
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'backoffice'));
