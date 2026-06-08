GRANT SELECT, INSERT, UPDATE, DELETE ON public.programas TO authenticated;
GRANT ALL ON public.programas TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.programa_descuentos TO authenticated;
GRANT ALL ON public.programa_descuentos TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cedentes TO authenticated;
GRANT ALL ON public.cedentes TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.audit_log TO authenticated;
GRANT ALL ON public.audit_log TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.financistas TO authenticated;
GRANT ALL ON public.financistas TO service_role;