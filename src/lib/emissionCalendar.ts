export type DocumentStatus = "por_enviar" | "parcialmente_firmado" | "firmado";

export const DOCUMENT_STATUS = {
  por_enviar: { label: "Por enviar", tone: "danger" as const, className: "bg-destructive/15 text-destructive border-destructive/50" },
  parcialmente_firmado: { label: "Parcialmente firmado", tone: "warning" as const, className: "bg-warning/15 text-warning border-warning/50" },
  firmado: { label: "Docs firmados", tone: "success" as const, className: "bg-success/15 text-success border-success/50" },
};

export function canUpdateDocumentStatus(role: string | null) {
  return role === "admin" || role === "backoffice";
}

export function dailySummary(rows: { fecha_emision: string; valor_nominal_usd: number; monto_efectivo_usd: number }[]) {
  const result: Record<string, { count: number; nominal: number; efectivo: number }> = {};
  for (const row of rows) {
    const day = result[row.fecha_emision] ?? { count: 0, nominal: 0, efectivo: 0 };
    day.count++;
    day.nominal += Number(row.valor_nominal_usd);
    day.efectivo += Number(row.monto_efectivo_usd);
    result[row.fecha_emision] = day;
  }
  return result;
}