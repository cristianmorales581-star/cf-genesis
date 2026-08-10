# Corregir financista faltante en el Reporte RAS

Tienes razón: no todos vienen de la carga histórica antigua. Verifiqué la base de datos y el origen real es la pantalla **Carga Histórica**, que guarda el financista siempre vacío.

## Lo que muestran los datos

- Julio 2026: 280 certificados, 234 con financista y **46 sin financista**.
- Esos 46 fueron escritos el 4 de agosto (símbolos C5336A–C5425A), es decir por una corrida de Carga Histórica, no por la emisión masiva del día.
- Junio: 36 sin financista, escritos el 12 de junio (misma pantalla).
- Todo lo anterior a junio (carga inicial masiva) tampoco tiene financista.
- Causa exacta: la carga histórica inserta `financista_id` en blanco y, con la opción "sobrescribir si el símbolo existe", **borra el financista de títulos que ya lo tenían** correctamente emitidos.

## Cambios propuestos

1. **Carga Histórica**: agregar un selector de financista para el lote (por defecto Grupo Cashea Ve, C.A.) y, si el archivo trae una columna de inversionista/RIF, usarla por fila.
2. **Sobrescritura sin pérdida**: al sobrescribir un símbolo existente, no borrar el financista ya registrado si el lote no aporta uno.
3. **Corregir lo ya cargado**: asignar el financista correcto a los certificados que hoy están vacíos (Grupo Cashea Ve, C.A. salvo que indiques otro criterio), para que el RAS deje de emitir filas de compra sin nombre ni identificación.
4. **Reporte RAS**: mostrar un aviso con el conteo de certificados del mes sin financista y marcar esas filas en la vista previa, para que nunca se descargue un archivo con compradores en blanco.

## Detalles técnicos

- `src/pages/CargaHistorica.tsx`: estado `financistaId`, carga de financistas, mapeo por RIF de la columna del archivo, y payload sin `financista_id: null` fijo; en modo upsert omitir la clave cuando no haya valor.
- Backfill mediante actualización de datos sobre `emisiones` donde `financista_id is null` y `deleted_at is null`.
- `src/pages/ReporteRas.tsx`: contador de filas incompletas + resaltado; `src/lib/rasXlsx.ts` sin cambios de formato.

## Pregunta pendiente

Para el backfill de los ~1.170 certificados sin financista, ¿confirmas que todos deben quedar como **Grupo Cashea Ve, C.A.**, o hay meses que corresponden a **Cashea Valores, C.A.** u otro inversionista?
