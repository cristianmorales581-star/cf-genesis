
-- 1) Tabla de permisos por rol
CREATE TABLE public.role_section_permissions (
  role public.app_role NOT NULL,
  section text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (role, section)
);
GRANT SELECT ON public.role_section_permissions TO authenticated;
GRANT ALL ON public.role_section_permissions TO service_role;
ALTER TABLE public.role_section_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Auth users can read role permissions"
ON public.role_section_permissions FOR SELECT
TO authenticated USING (true);

CREATE POLICY "Only admins can manage role permissions"
ON public.role_section_permissions FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 2) Seed inicial de permisos
-- Secciones: dashboard, emisiones, emisiones_nueva, emisiones_masiva, confirmaciones,
-- portafolio, programas, cedentes, financistas, importar, auditoria, admin_usuarios
INSERT INTO public.role_section_permissions (role, section) VALUES
  ('admin','dashboard'),('admin','emisiones'),('admin','emisiones_nueva'),
  ('admin','emisiones_masiva'),('admin','confirmaciones'),('admin','portafolio'),
  ('admin','programas'),('admin','cedentes'),('admin','financistas'),
  ('admin','importar'),('admin','auditoria'),('admin','admin_usuarios'),
  ('backoffice','dashboard'),('backoffice','emisiones'),('backoffice','emisiones_nueva'),
  ('backoffice','emisiones_masiva'),('backoffice','confirmaciones'),('backoffice','portafolio'),
  ('backoffice','programas'),('backoffice','cedentes'),('backoffice','financistas'),
  ('backoffice','importar'),('backoffice','auditoria');

-- 3) Asignar cmorales@gbv.com.ve como admin
DO $$
DECLARE _uid uuid;
BEGIN
  SELECT id INTO _uid FROM auth.users WHERE lower(email) = 'cmorales@gbv.com.ve' LIMIT 1;
  IF _uid IS NOT NULL THEN
    DELETE FROM public.user_roles WHERE user_id = _uid;
    INSERT INTO public.user_roles (user_id, role) VALUES (_uid, 'admin');
  END IF;
END $$;

-- 4) Migrar al resto de usuarios a 'backoffice' (los que no son admin)
INSERT INTO public.user_roles (user_id, role)
SELECT u.id, 'backoffice'::public.app_role
FROM auth.users u
WHERE NOT EXISTS (
  SELECT 1 FROM public.user_roles ur
  WHERE ur.user_id = u.id AND ur.role = 'admin'
)
ON CONFLICT (user_id, role) DO NOTHING;

-- Eliminar el rol 'operador' de quienes ahora son backoffice/admin
DELETE FROM public.user_roles WHERE role = 'operador';

-- 5) Cambiar default de nuevos usuarios a 'backoffice'
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  user_count INTEGER;
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email));

  SELECT COUNT(*) INTO user_count FROM auth.users;
  IF user_count = 1 THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin');
  ELSE
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'backoffice');
  END IF;
  RETURN NEW;
END;
$function$;
