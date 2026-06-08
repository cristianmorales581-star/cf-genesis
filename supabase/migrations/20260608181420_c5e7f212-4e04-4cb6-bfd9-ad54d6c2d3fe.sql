GRANT SELECT, INSERT, UPDATE, DELETE ON public.programas TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.programa_descuentos TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cedentes TO authenticated;

GRANT ALL ON public.programas TO service_role;
GRANT ALL ON public.programa_descuentos TO service_role;
GRANT ALL ON public.cedentes TO service_role;