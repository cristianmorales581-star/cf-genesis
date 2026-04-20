
-- ============================================================
-- SICEBOP schema: roles, cedentes, financistas, programas,
-- emisiones, confirmaciones, audit_log, storage
-- ============================================================

-- Roles enum + table
CREATE TYPE public.app_role AS ENUM ('admin', 'operador');

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Profiles
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  full_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Security-definer role check
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE OR REPLACE FUNCTION public.is_authenticated_user()
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT auth.uid() IS NOT NULL $$;

-- Trigger: first user becomes admin, the rest operador; also create profile
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  user_count INTEGER;
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email));

  SELECT COUNT(*) INTO user_count FROM auth.users;
  IF user_count = 1 THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin');
  ELSE
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'operador');
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- CEDENTES
-- ============================================================
CREATE TABLE public.cedentes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  razon_social TEXT NOT NULL,
  rif TEXT NOT NULL UNIQUE,
  representante_legal TEXT,
  cargo TEXT,
  cedula TEXT,
  nombre_comercial TEXT,
  activo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.cedentes ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- FINANCISTAS
-- ============================================================
CREATE TYPE public.tipo_financista AS ENUM ('natural', 'juridica');

CREATE TABLE public.financistas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  razon_social TEXT NOT NULL,
  rif TEXT,
  tipo tipo_financista NOT NULL DEFAULT 'juridica',
  representante_legal TEXT,
  cargo TEXT,
  cedula TEXT,
  correo TEXT,
  celular TEXT,
  activo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.financistas ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- PROGRAMAS
-- ============================================================
CREATE TABLE public.programas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo_pcfb TEXT NOT NULL UNIQUE,
  cedente_id UUID NOT NULL REFERENCES public.cedentes(id) ON DELETE RESTRICT,
  linea TEXT,
  plazo_ejecucion_dias INTEGER NOT NULL DEFAULT 360,
  descuento_base NUMERIC(6,5) NOT NULL DEFAULT 0,
  plazo_cuotas_dias INTEGER NOT NULL DEFAULT 30,
  fecha_inicio DATE NOT NULL,
  fecha_vencimiento DATE NOT NULL,
  contrato_cesion TEXT,
  activo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (descuento_base >= 0 AND descuento_base <= 0.20),
  CHECK (fecha_vencimiento > fecha_inicio)
);
ALTER TABLE public.programas ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- EMISIONES
-- ============================================================
CREATE TABLE public.emisiones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  simbolo_cfb TEXT NOT NULL UNIQUE,
  programa_id UUID NOT NULL REFERENCES public.programas(id) ON DELETE RESTRICT,
  financista_id UUID REFERENCES public.financistas(id) ON DELETE SET NULL,
  valor_nominal_usd NUMERIC(18,2) NOT NULL,
  cantidad_ordenes_compra INTEGER NOT NULL DEFAULT 1,
  descuento NUMERIC(6,5) NOT NULL,
  precio NUMERIC(7,6) NOT NULL,
  dias_colocados INTEGER NOT NULL,
  fecha_emision DATE NOT NULL,
  fecha_vencimiento DATE NOT NULL,
  rendimiento_anualizado NUMERIC(8,5) NOT NULL,
  tasa_cambio_bs_usd NUMERIC(18,4) NOT NULL,
  monto_efectivo_usd NUMERIC(18,2) NOT NULL,
  valor_efectivo_bs NUMERIC(20,2) NOT NULL,
  estado TEXT NOT NULL DEFAULT 'activa',
  operador_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (descuento >= 0 AND descuento <= 0.20),
  CHECK (fecha_vencimiento > fecha_emision),
  CHECK (valor_nominal_usd > 0)
);
ALTER TABLE public.emisiones ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- CONFIRMACIONES
-- ============================================================
CREATE TYPE public.tipo_confirmacion AS ENUM ('CDC', 'CDV');

CREATE TABLE public.confirmaciones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  emision_id UUID NOT NULL REFERENCES public.emisiones(id) ON DELETE CASCADE,
  tipo tipo_confirmacion NOT NULL,
  contraparte_razon_social TEXT NOT NULL,
  fecha_operacion DATE NOT NULL,
  fecha_valor DATE NOT NULL,
  monto_efectivo_usd NUMERIC(18,2) NOT NULL,
  valor_efectivo_bs NUMERIC(20,2) NOT NULL,
  pdf_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.confirmaciones ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- AUDIT LOG
-- ============================================================
CREATE TABLE public.audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  user_email TEXT,
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id UUID,
  details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_audit_log_created ON public.audit_log(created_at DESC);
CREATE INDEX idx_audit_log_resource ON public.audit_log(resource_type, resource_id);
CREATE INDEX idx_emisiones_fecha_vto ON public.emisiones(fecha_vencimiento);
CREATE INDEX idx_emisiones_programa ON public.emisiones(programa_id);
CREATE INDEX idx_programas_cedente ON public.programas(cedente_id);

-- ============================================================
-- RLS POLICIES — any authenticated user can read; mutations gated by role
-- ============================================================

-- profiles
CREATE POLICY "profiles_select_self_or_admin" ON public.profiles
FOR SELECT TO authenticated
USING (auth.uid() = id OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "profiles_update_self" ON public.profiles
FOR UPDATE TO authenticated USING (auth.uid() = id);

-- user_roles (read self; admin manages)
CREATE POLICY "user_roles_select_self" ON public.user_roles
FOR SELECT TO authenticated USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "user_roles_admin_all" ON public.user_roles
FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- cedentes
CREATE POLICY "cedentes_select_auth" ON public.cedentes FOR SELECT TO authenticated USING (true);
CREATE POLICY "cedentes_ins_operador" ON public.cedentes FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'operador') OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "cedentes_upd_operador" ON public.cedentes FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'operador') OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "cedentes_del_admin" ON public.cedentes FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- financistas
CREATE POLICY "financistas_select_auth" ON public.financistas FOR SELECT TO authenticated USING (true);
CREATE POLICY "financistas_ins_operador" ON public.financistas FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'operador') OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "financistas_upd_operador" ON public.financistas FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'operador') OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "financistas_del_admin" ON public.financistas FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- programas
CREATE POLICY "programas_select_auth" ON public.programas FOR SELECT TO authenticated USING (true);
CREATE POLICY "programas_ins_operador" ON public.programas FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'operador') OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "programas_upd_operador" ON public.programas FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'operador') OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "programas_del_admin" ON public.programas FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- emisiones: only operador/admin create; only admin update; nobody deletes
CREATE POLICY "emisiones_select_auth" ON public.emisiones FOR SELECT TO authenticated USING (true);
CREATE POLICY "emisiones_ins_operador" ON public.emisiones FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'operador') OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "emisiones_upd_admin" ON public.emisiones FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- confirmaciones
CREATE POLICY "confirmaciones_select_auth" ON public.confirmaciones FOR SELECT TO authenticated USING (true);
CREATE POLICY "confirmaciones_ins_operador" ON public.confirmaciones FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'operador') OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "confirmaciones_upd_admin" ON public.confirmaciones FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- audit_log: anyone authenticated can insert their own; everyone can read
CREATE POLICY "audit_select_auth" ON public.audit_log FOR SELECT TO authenticated USING (true);
CREATE POLICY "audit_insert_self" ON public.audit_log FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id OR user_id IS NULL);

-- ============================================================
-- Function: get next simbolo for a programa
-- ============================================================
CREATE OR REPLACE FUNCTION public.next_simbolo_for_programa(_programa_id UUID)
RETURNS TEXT
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  prog_code TEXT;
  next_seq INTEGER;
BEGIN
  SELECT codigo_pcfb INTO prog_code FROM public.programas WHERE id = _programa_id;
  IF prog_code IS NULL THEN RETURN NULL; END IF;

  SELECT COALESCE(MAX(
    NULLIF(regexp_replace(simbolo_cfb, '^.*-(\d+)$', '\1'), '')::INTEGER
  ), 0) + 1
  INTO next_seq
  FROM public.emisiones e
  JOIN public.programas p ON p.id = e.programa_id
  WHERE p.codigo_pcfb = prog_code;

  RETURN prog_code || '-' || lpad(next_seq::text, 4, '0');
END;
$$;

-- ============================================================
-- Storage bucket for PDFs
-- ============================================================
INSERT INTO storage.buckets (id, name, public) VALUES ('cfb-documents', 'cfb-documents', false);

CREATE POLICY "cfb_docs_read_auth" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'cfb-documents');
CREATE POLICY "cfb_docs_ins_auth" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'cfb-documents');
CREATE POLICY "cfb_docs_upd_auth" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'cfb-documents');
CREATE POLICY "cfb_docs_del_admin" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'cfb-documents' AND public.has_role(auth.uid(), 'admin'));
