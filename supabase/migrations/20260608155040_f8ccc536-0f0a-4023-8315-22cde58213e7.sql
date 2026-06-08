
DROP POLICY IF EXISTS "audit_insert_self" ON public.audit_log;
CREATE POLICY "audit_insert_self" ON public.audit_log
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
