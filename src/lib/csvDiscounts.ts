export interface DiscountProgram {
  id: string;
  descuento_base: number;
  programa_descuentos?: { descuento: number; activo: boolean }[];
}

export interface DiscountRow {
  programa_id?: string;
  descuento_decimal: number;
}

const normalizedDiscount = (value: number) => Math.round(Number(value) * 1e6) / 1e6;

/** Deduplicate by program and decimal discount, never substituting program defaults. */
export function missingCsvDiscounts(rows: DiscountRow[], programs: DiscountProgram[], etiqueta: string) {
  const pending = new Map<string, { programa_id: string; descuento: number; etiqueta: string; es_default: boolean; activo: boolean }>();
  for (const row of rows) {
    const program = programs.find(p => p.id === row.programa_id);
    if (!program || !Number.isFinite(row.descuento_decimal) || row.descuento_decimal < 0 || row.descuento_decimal >= 1) continue;
    const discount = normalizedDiscount(row.descuento_decimal);
    const registered = [program.descuento_base, ...(program.programa_descuentos ?? []).filter(d => d.activo).map(d => d.descuento)];
    if (registered.some(d => normalizedDiscount(d) === discount)) continue;
    pending.set(`${program.id}|${discount}`, { programa_id: program.id, descuento: discount, etiqueta, es_default: false, activo: true });
  }
  return [...pending.values()];
}