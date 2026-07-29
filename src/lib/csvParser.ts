// SICEBOP — Parser de CSVs Express / Masivo / Paquetizado
// Detecta formato y normaliza filas a un esquema común.

export interface ParsedRow {
  nro: number;
  simbolo_cfb: string;             // Símbolo asignado por la Bolsa para el lote/día
  razon_social_csv: string;       // Nombre tal como aparece en CSV
  rif_csv: string;
  linea: string;                   // Principal / Cotidiana / Cotidiana (2 cuotas)
  tipo: "Express" | "Masivo" | "Paquetizado";
  cantidad_ordenes: number;
  monto_total_usd: number;         // Valor nominal en USD
  vencimiento_primera_orden: string; // ISO yyyy-mm-dd
  plazo_dias: number;              // 14, 28, 42...
  descuento_decimal: number;       // En decimal (0.03 = 3%)
  certificados_reporte: string;    // Nombre del cedente embebido (Express) o lote (Masivo)
  programa_o_inversionista: string; // Programa CFB-... o Inversionista
  status_csv: string;
  // Sugerencias de mapeo (rellenadas por la pantalla)
  cedente_sugerido_id?: string;
  programa_sugerido_id?: string;
}

export interface ParseResult {
  rows: ParsedRow[];
  detectedFormat: "Express" | "Masivo" | "Paquetizado" | "Desconocido";
  warnings: string[];
}

/** Elimina caracteres mojibake / latin1 mal decodificado y normaliza espacios. */
function clean(s: string): string {
  return (s ?? "")
    .replace(/\uFFFD/g, "")
    .replace(/\u00A0/g, " ")
    .trim();
}

/** Parser CSV minimalista que respeta comillas y separador configurable. */
function parseCSVLine(line: string, sep: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQuotes && line[i + 1] === '"') { cur += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (c === sep && !inQuotes) {
      out.push(cur); cur = "";
    } else {
      cur += c;
    }
  }
  out.push(cur);
  return out.map(clean);
}

/** Detecta el separador (`,` o `;`) y formato. */
function detectSeparator(text: string): string {
  const firstLine = text.split(/\r?\n/)[0] ?? "";
  const semis = (firstLine.match(/;/g) ?? []).length;
  const commas = (firstLine.match(/,/g) ?? []).length;
  return semis > commas ? ";" : ",";
}

/** Parsea fecha dd/MM/yyyy → ISO yyyy-MM-dd */
function parseDateDDMMYYYY(s: string): string {
  const t = clean(s);
  const m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!m) return "";
  const [, d, mo, y] = m;
  const yy = y.length === 2 ? "20" + y : y;
  return `${yy}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
}

/** "42 Días" → 42 */
function parsePlazo(s: string): number {
  const t = clean(s);
  const m = t.match(/(\d+)/);
  return m ? parseInt(m[1], 10) : 0;
}

/** "1,234.56" o " 1,234.56 " o "1234,56" → 1234.56 (asume formato US con miles `,` y decimal `.`) */
function parseNumber(s: string): number {
  const t = clean(s).replace(/[^\d.,-]/g, "");
  if (!t) return 0;
  // Si tiene coma y punto, asumir coma=miles, punto=decimal
  if (t.includes(",") && t.includes(".")) {
    return parseFloat(t.replace(/,/g, ""));
  }
  // Si solo tiene comas: en CSV español puede ser decimal, en estos archivos es miles
  // Revisamos si parece decimal (1-2 dígitos después de la última coma)
  if (t.includes(",") && !t.includes(".")) {
    const parts = t.split(",");
    if (parts[parts.length - 1].length <= 2 && parts.length === 2) {
      return parseFloat(t.replace(",", "."));
    }
    return parseFloat(t.replace(/,/g, ""));
  }
  return parseFloat(t);
}

/**
 * Devuelve el descuento SIEMPRE en formato decimal (0.03 = 3%).
 * El CSV de Cashea trae el descuento con unidades distintas según tipo:
 *  - Express: basis points × 100  (ej: 300 = 3.00%  => 0.03)
 *  - Masivo/Paquetizado: porcentaje directo (ej: 0.92 = 0.92%  => 0.0092)
 */
function parseDescuentoDecimal(raw: string, tipo: "Express" | "Masivo" | "Paquetizado"): number {
  const n = parseNumber(raw);
  if (!isFinite(n) || n === 0) return 0;
  // Los CSV históricos han venido en 3 escalas distintas:
  // 300 → 3.00%, 3 → 3.00%, 0.92 → 0.92%, 0.03 → 3.00%.
  if (n >= 100) return n / 10000;
  if (n > 1) return n / 100;
  if (tipo === "Express") return n;
  return n >= 0.2 ? n / 100 : n;
}

export function parseCSVText(text: string): ParseResult {
  // Quitar BOM UTF-8 si viene
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const sep = detectSeparator(text);
  const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);

  if (lines.length < 2) {
    return { rows: [], detectedFormat: "Desconocido", warnings: ["CSV vacío"] };
  }

  const header = parseCSVLine(lines[0], sep).map(h => h.toUpperCase());
  // Mapear columnas por nombre (tolerando acentos faltantes por encoding)
  const idx = {
    nro: header.findIndex(h => h.startsWith("NRO")),
    simbolo: header.findIndex(h =>
      (h.includes("SIMBOLO") || h.includes("SÍMBOLO")) && h.includes("CFB")
    ),
    razon: header.findIndex(h => h.includes("RAZON SOCIAL")),
    rif: header.findIndex(h => h === "RIF" || h.includes("R.I.F")),
    linea: header.findIndex(h => h.includes("LINEA") || h.includes("L?NEA") || h.includes("L\uFFFDNEA")),
    tipo: header.findIndex(h => h === "TIPO"),
    cant: header.findIndex(h => h.includes("CANTIDAD")),
    monto: header.findIndex(h => h.includes("MONTO TOTAL")),
    venc: header.findIndex(h => h.includes("VENCIMIENTO")),
    plazo: header.findIndex(h => h === "PLAZO"),
    desc: header.findIndex(h => h === "DESCUENTO"),
    certs: header.findIndex(h => h.includes("CERTIFICADOS") || h.includes("REPORTE")),
    progInv: header.findIndex(h => h === "PROGRAMA" || h === "INVERSIONISTA"),
    status: header.findIndex(h => h === "STATUS"),
  };

  const warnings: string[] = [];
  const rows: ParsedRow[] = [];
  let detected: ParseResult["detectedFormat"] = "Desconocido";

  for (let i = 1; i < lines.length; i++) {
    const cols = parseCSVLine(lines[i], sep);
    if (cols.length < 5) continue;
    // Salta filas totalmente vacías (típico de archivos con columnas extra en cero)
    const nonEmpty = cols.filter(c => clean(c) !== "").length;
    if (nonEmpty < 3) continue;
    const tipoRaw = clean(cols[idx.tipo] ?? "");
    // Si el CSV no trae columna TIPO (formato viejo) inferimos "Express" por defecto.
    let tipo: ParsedRow["tipo"] = "Express";
    if (/masivo/i.test(tipoRaw)) tipo = "Masivo";
    else if (/paquetizado/i.test(tipoRaw)) tipo = "Paquetizado";
    if (detected === "Desconocido") detected = tipo;


    const row: ParsedRow = {
      nro: parseInt(clean(cols[idx.nro] ?? "0"), 10) || (i),
      simbolo_cfb: clean(cols[idx.simbolo] ?? ""),
      razon_social_csv: clean(cols[idx.razon] ?? ""),
      rif_csv: clean(cols[idx.rif] ?? "").replace(/\s+/g, ""),
      linea: clean(cols[idx.linea] ?? ""),
      tipo,
      cantidad_ordenes: Math.round(parseNumber(cols[idx.cant] ?? "0")),
      monto_total_usd: parseNumber(cols[idx.monto] ?? "0"),
      vencimiento_primera_orden: parseDateDDMMYYYY(cols[idx.venc] ?? ""),
      plazo_dias: parsePlazo(cols[idx.plazo] ?? ""),
      descuento_decimal: parseDescuentoDecimal(cols[idx.desc] ?? "0", tipo),
      certificados_reporte: clean(cols[idx.certs] ?? ""),
      programa_o_inversionista: clean(cols[idx.progInv] ?? ""),
      status_csv: clean(cols[idx.status] ?? ""),
    };

    if (!row.monto_total_usd) warnings.push(`Fila ${row.nro}: monto inválido`);
    if (!row.vencimiento_primera_orden) warnings.push(`Fila ${row.nro}: fecha inválida`);
    if (!row.simbolo_cfb) warnings.push(`Fila ${row.nro}: símbolo CFB faltante`);

    rows.push(row);
  }

  return { rows, detectedFormat: detected, warnings };
}

/**
 * Para una fila, intenta determinar el cedente "verdadero":
 * - Express: razon_social_csv ya es el cedente
 * - Masivo/Paquetizado: el cedente está embebido en certificados_reporte
 *   (ej: "AEREO TIMB, C.A. - 06/04/2026 - 12/04/2026") o en el programa
 */
export function inferCedenteName(row: ParsedRow): string {
  if (row.tipo === "Express") return row.razon_social_csv;
  // En masivo el cedente real puede estar en certificados_reporte
  const cr = row.certificados_reporte;
  if (cr && cr.includes(" - ")) return cr.split(" - ")[0].trim();
  return row.razon_social_csv;
}

/** Normaliza para comparar nombres (sin tildes, sin punctuación, mayúsculas). */
export function normalizeName(s: string): string {
  return (s ?? "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[.,'#&]/g, "")
    .replace(/\s+/g, " ")
    .toUpperCase()
    .trim();
}

/** Score de similitud simple (substring + tokens compartidos). */
export function nameSimilarity(a: string, b: string): number {
  const A = normalizeName(a), B = normalizeName(b);
  if (!A || !B) return 0;
  if (A === B) return 1;
  if (A.includes(B) || B.includes(A)) return 0.9;
  const ta = new Set(A.split(" ")), tb = new Set(B.split(" "));
  let shared = 0;
  ta.forEach(t => { if (tb.has(t) && t.length > 2) shared++; });
  return shared / Math.max(ta.size, tb.size);
}
