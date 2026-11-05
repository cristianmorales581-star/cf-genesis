import { addDays, format, parseISO, startOfWeek } from "date-fns";

type Cedente = { id: string; razon_social: string; rif: string };
export type IssuedRow = { fecha_emision: string; valor_nominal_usd: number; deleted_at?: string | null; cedentes: Cedente | null; programas: { cedentes: Cedente | null } | null };
export type ConsolidatedRow = { key: string; cedenteId: string; cedente: string; rif: string; start: string; end: string; count: number; nominal: number };
export function emissionCedente(row: IssuedRow) { return row.programas?.cedentes ?? row.cedentes; }
export function consolidateCedentes(rows: IssuedRow[], mode: "month" | "week"): ConsolidatedRow[] {
  const groups = new Map<string, ConsolidatedRow>();
  for (const row of rows) {
    if (row.deleted_at) continue;
    const cedente = emissionCedente(row);
    const start = mode === "month" ? row.fecha_emision.slice(0, 7) + "-01" : format(startOfWeek(parseISO(row.fecha_emision), { weekStartsOn: 1 }), "yyyy-MM-dd");
    const end = mode === "month" ? "" : format(addDays(parseISO(start), 6), "yyyy-MM-dd");
    const cedenteId = cedente?.id ?? "__missing__";
    const key = `${start}:${cedenteId}`;
    const group = groups.get(key) ?? { key, cedenteId, cedente: cedente?.razon_social ?? "Sin cedente registrado", rif: cedente?.rif ?? "—", start, end, count: 0, nominal: 0 };
    group.count++;
    group.nominal += Number(row.valor_nominal_usd);
    groups.set(key, group);
  }
  return [...groups.values()].sort((a, b) => b.start.localeCompare(a.start) || b.nominal - a.nominal || a.cedente.localeCompare(b.cedente));
}