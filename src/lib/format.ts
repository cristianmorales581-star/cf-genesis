// Formatters for SICEBOP
import { format } from "date-fns";
import { es } from "date-fns/locale";

export const round2 = (n: number) => Math.round(n * 100) / 100;
export const round4 = (n: number) => Math.round(n * 10000) / 10000;
export const round5 = (n: number) => Math.round(n * 100000) / 100000;

export const fmtUSD = (n: number | null | undefined) =>
  n == null ? "—" : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 }).format(n);

export const fmtBs = (n: number | null | undefined) =>
  n == null ? "—" : new Intl.NumberFormat("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n) + " Bs.";

export const fmtPct = (n: number | null | undefined, decimals = 4) =>
  n == null ? "—" : (n * 100).toFixed(decimals) + " %";

export const fmtNumber = (n: number | null | undefined, decimals = 2) =>
  n == null ? "—" : new Intl.NumberFormat("es-VE", { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(n);

export const fmtDate = (d: string | Date | null | undefined) =>
  !d ? "—" : format(typeof d === "string" ? new Date(d + "T12:00:00") : d, "dd/MM/yyyy");

/** Caracas legal date format: "13 de Abr. de 2026" */
export const fmtFechaCaracas = (d: string | Date) => {
  const date = typeof d === "string" ? new Date(d + "T12:00:00") : d;
  const day = format(date, "d", { locale: es });
  const month = format(date, "MMM", { locale: es });
  const year = format(date, "yyyy");
  const monthCap = month.charAt(0).toUpperCase() + month.slice(1).replace(/\.$/, "");
  return `${day} de ${monthCap}. de ${year}`;
};

/** Days between two ISO date strings (yyyy-mm-dd) */
export const diffDays = (from: string, to: string): number => {
  const a = new Date(from + "T12:00:00").getTime();
  const b = new Date(to + "T12:00:00").getTime();
  return Math.round((b - a) / (1000 * 60 * 60 * 24));
};

/** Add days to ISO date string and return ISO date */
export const addDaysISO = (iso: string, days: number): string => {
  const d = new Date(iso + "T12:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
};

/**
 * Zero-coupon annualized yield: ((1 - precio) / precio) * (360 / dias)
 */
export const rendimientoAnualizado = (precio: number, dias: number): number => {
  if (precio <= 0 || dias <= 0) return 0;
  return ((1 - precio) / precio) * (360 / dias);
};

/**
 * Monto efectivo USD = VN_USD * precio, rounded to 2 decimals.
 * Valor efectivo Bs = monto_efectivo_usd * tasa, rounded to 2 decimals.
 * IMPORTANT: monto USD must be rounded BEFORE multiplying by tasa.
 */
export const calcMontos = (vnUsd: number, precio: number, tasa: number) => {
  const montoUsd = round2(vnUsd * precio);
  const valorBs = round2(montoUsd * tasa);
  return { montoUsd, valorBs };
};

export const todayISO = () => new Date().toISOString().slice(0, 10);
