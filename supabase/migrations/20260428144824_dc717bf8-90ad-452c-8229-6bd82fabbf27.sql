CREATE POLICY "emisiones_del_admin"
ON public.emisiones
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));