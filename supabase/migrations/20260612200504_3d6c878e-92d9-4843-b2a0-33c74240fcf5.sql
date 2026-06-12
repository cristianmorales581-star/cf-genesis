DROP POLICY IF EXISTS emisiones_ins_operador ON public.emisiones;
CREATE POLICY emisiones_ins_admin ON public.emisiones FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS confirmaciones_ins_operador ON public.confirmaciones;
CREATE POLICY confirmaciones_ins_admin ON public.confirmaciones FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS confirmaciones_del_admin ON public.confirmaciones;
CREATE POLICY confirmaciones_del_admin ON public.confirmaciones FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));