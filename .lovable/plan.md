# Editar certificados desde la tabla de emisiones + corregir financista faltante

## Lo que muestran los datos (verificado)

- Julio 2026: 280 certificados, 234 con financista y **46 sin financista**.
- Esos 46 tienen `fecha_emision` de julio (15 y 29) pero fueron **escritos en la base el 4 de agosto** (símbolos C5336A y C5371A–C5425A). No fueron sobrescritos: son registros nuevos creados ese día.
- Junio: 36 sin financista, escritos el 12 de junio. Todo lo previo a junio (carga inicial) tampoco tiene financista.
- El único camino de creación que guarda el financista vacío es **Carga Histórica** (`financista_id: null` fijo). La emisión individual y la masiva sí lo guardan.
- La tabla de **Emisiones hoy no tiene diálogo de edición** — solo eliminar; por eso no hay forma de corregirlo a mano.

## Cambios propuestos

1. **Lápiz de edición en la tabla de Emisiones** (igual al de Programas, solo admin): diálogo caso por caso para corregir todos los campos que componen el título — financista, cedente/programa, símbolo, fecha de emisión y vencimiento, plazo, valor nominal, precio/descuento, rendimiento, tasa de cambio y cantidad de órdenes — recalculando monto efectivo y valor en Bs al guardar. Queda registrado en auditoría.
2. **Financista obligatorio**: no se podrá guardar ni emitir un título sin financista, en emisión individual, emisión masiva, carga histórica y en el diálogo de edición.
3. **Asignación masiva de financista**: con filas seleccionadas, asignar un financista a todas de una vez (útil para los ~1.170 registros vacíos).
4. **Filtro "sin financista"** en el panel de filtros, para ubicarlos rápido.
5. **Carga Histórica**: selector de financista obligatorio para el lote (por defecto Grupo Cashea Ve, C.A.) y, si el archivo trae columna de inversionista/RIF, usarla por fila; al sobrescribir un símbolo existente no borrar el financista ya registrado.
6. **Reporte RAS**: aviso con el conteo de certificados del mes sin financista y resaltado de esas filas en la vista previa, para no descargar compradores en blanco.


## Detalles técnicos

- `src/pages/Emisiones.tsx`: estado `editing`, `Dialog` con formulario, `supabase.from("emisiones").update(...)` por id, acción masiva `.in("id", selected)`, y `logAudit` como en el resto.
- `src/pages/CargaHistorica.tsx`: cargar financistas, estado `financistaId`, mapeo por RIF si existe la columna, payload sin `financista_id: null` fijo.
- `src/pages/ReporteRas.tsx`: contador y resaltado; `src/lib/rasXlsx.ts` sin cambios de formato.
- Sin cambios de esquema en base de datos.
