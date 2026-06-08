GRANT SELECT, INSERT, UPDATE, DELETE ON public.programa_descuentos TO authenticated;
GRANT ALL ON public.programa_descuentos TO service_role;

-- Corregir estados: programas vencidos que quedaron como 'inactiva'
UPDATE public.programas
   SET estado = 'vencida', activo = false
 WHERE fecha_vencimiento < CURRENT_DATE
   AND estado <> 'vencida';

-- Reactivar programas con fechas futuras que quedaron como 'inactiva' por error
UPDATE public.programas
   SET estado = 'activa', activo = true
 WHERE fecha_vencimiento >= CURRENT_DATE
   AND estado = 'inactiva';