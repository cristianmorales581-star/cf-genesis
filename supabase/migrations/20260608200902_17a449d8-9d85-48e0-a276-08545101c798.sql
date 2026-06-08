GRANT SELECT, INSERT, UPDATE, DELETE ON public.programas TO authenticated;
GRANT ALL ON public.programas TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.programa_descuentos TO authenticated;
GRANT ALL ON public.programa_descuentos TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cedentes TO authenticated;
GRANT ALL ON public.cedentes TO service_role;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'programas' AND policyname = 'programas_select_auth'
  ) THEN
    CREATE POLICY programas_select_auth ON public.programas FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'programas' AND policyname = 'programas_ins_operador'
  ) THEN
    CREATE POLICY programas_ins_operador ON public.programas FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'programas' AND policyname = 'programas_upd_operador'
  ) THEN
    CREATE POLICY programas_upd_operador ON public.programas FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'programas' AND policyname = 'programas_del_admin'
  ) THEN
    CREATE POLICY programas_del_admin ON public.programas FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
  END IF;
END $$;