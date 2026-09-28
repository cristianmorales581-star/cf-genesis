# Corregir casillas de ODC y ODV

## Cambios
- Agregar al expediente de cedentes el campo **Tipo de persona**, con las opciones Natural y Jurídica; los registros existentes quedarán como Jurídica.
- Usar el tipo registrado del financista en la ODC y el tipo registrado del cedente en la ODV.
- Marcar siempre **Dólares ($)**.
- Marcar **Mercado Primario** por defecto; en una ODC generada después de la fecha de emisión, marcar **Mercado Secundario**.
- Hacer visible la marca de las casillas en los PDF y mantener el formato centrado de una página.
- Aplicar la misma lógica en descarga individual, ZIP y generación masiva.

## Verificación
- Probar una ODV jurídica y una ODC natural/jurídica.
- Probar una ODC en fecha de emisión y otra posterior, confirmando Primario/Secundario.
- Revisar visualmente los PDF para confirmar que las marcas se ven y el contenido no se corta.

## Detalles técnicos
- Se añadirá `tipo` al expediente de cedentes con valor predeterminado `juridica`.
- Las funciones de documentos recibirán el tipo real de cada contraparte y calcularán el mercado usando la fecha de generación frente a `fecha_emision`.
