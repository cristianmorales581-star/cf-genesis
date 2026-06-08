DROP POLICY IF EXISTS programas_select_auth ON public.programas;
DROP POLICY IF EXISTS programas_ins_operador ON public.programas;
DROP POLICY IF EXISTS programas_upd_operador ON public.programas;
DROP POLICY IF EXISTS programas_del_admin ON public.programas;

CREATE POLICY programas_select_auth
ON public.programas
FOR SELECT
TO authenticated
USING (auth.uid() IS NOT NULL);

CREATE POLICY programas_ins_operador
ON public.programas
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY programas_upd_operador
ON public.programas
FOR UPDATE
TO authenticated
USING (auth.uid() IS NOT NULL)
WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY programas_del_admin
ON public.programas
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS prog_desc_select_auth ON public.programa_descuentos;
DROP POLICY IF EXISTS prog_desc_ins_operador ON public.programa_descuentos;
DROP POLICY IF EXISTS prog_desc_upd_operador ON public.programa_descuentos;
DROP POLICY IF EXISTS prog_desc_del_operador ON public.programa_descuentos;

CREATE POLICY prog_desc_select_auth
ON public.programa_descuentos
FOR SELECT
TO authenticated
USING (auth.uid() IS NOT NULL);

CREATE POLICY prog_desc_ins_operador
ON public.programa_descuentos
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY prog_desc_upd_operador
ON public.programa_descuentos
FOR UPDATE
TO authenticated
USING (auth.uid() IS NOT NULL)
WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY prog_desc_del_operador
ON public.programa_descuentos
FOR DELETE
TO authenticated
USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS cedentes_select_operador ON public.cedentes;
DROP POLICY IF EXISTS cedentes_ins_operador ON public.cedentes;
DROP POLICY IF EXISTS cedentes_upd_operador ON public.cedentes;
DROP POLICY IF EXISTS cedentes_del_admin ON public.cedentes;

CREATE POLICY cedentes_select_auth
ON public.cedentes
FOR SELECT
TO authenticated
USING (auth.uid() IS NOT NULL);

CREATE POLICY cedentes_ins_auth
ON public.cedentes
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY cedentes_upd_auth
ON public.cedentes
FOR UPDATE
TO authenticated
USING (auth.uid() IS NOT NULL)
WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY cedentes_del_admin
ON public.cedentes
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.programas TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.programa_descuentos TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cedentes TO authenticated;
GRANT ALL ON public.programas TO service_role;
GRANT ALL ON public.programa_descuentos TO service_role;
GRANT ALL ON public.cedentes TO service_role;