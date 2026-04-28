import { describe, it, expect } from "vitest";
import { rendimientoAnualizado, addDaysISO } from "@/lib/format";
import { parseCSVText } from "@/lib/csvParser";

describe("Bug 1 — Normalización de descuento", () => {
  function parseDescuentoDecimal(raw: number, tipo: "Express" | "Masivo" | "Paquetizado"): number {
    if (!isFinite(raw) || raw === 0) return 0;
    if (tipo === "Express") return raw / 10000;
    return raw / 100;
  }

  it("Express 300 → 0.03 (3%)", () => {
    expect(parseDescuentoDecimal(300, "Express")).toBeCloseTo(0.03, 5);
  });
  it("Express 160 → 0.016 (1.6%)", () => {
    expect(parseDescuentoDecimal(160, "Express")).toBeCloseTo(0.016, 5);
  });
  it("Masivo 0.92 → 0.0092 (0.92%)", () => {
    expect(parseDescuentoDecimal(0.92, "Masivo")).toBeCloseTo(0.0092, 6);
  });
  it("Paquetizado 1.49 → 0.0149 (1.49%)", () => {
    expect(parseDescuentoDecimal(1.49, "Paquetizado")).toBeCloseTo(0.0149, 6);
  });
});

describe("Bug 2 — Fecha de vencimiento del CFB", () => {
  it("Emisión 2026-04-15 a 42 días → vence 2026-05-27", () => {
    expect(addDaysISO("2026-04-15", 42)).toBe("2026-05-27");
  });
  it("Emisión 2026-04-15 a 14 días → vence 2026-04-29", () => {
    expect(addDaysISO("2026-04-15", 14)).toBe("2026-04-29");
  });
  it("Emisión 2026-04-15 a 28 días → vence 2026-05-13", () => {
    expect(addDaysISO("2026-04-15", 28)).toBe("2026-05-13");
  });
});

describe("Validación contra vector real del 14/04/2026", () => {
  it("CALPER 24: precio 0.97, 42 días → rendimiento 26.5096%", () => {
    expect(rendimientoAnualizado(0.97, 42)).toBeCloseTo(0.2650957, 5);
  });
  it("SIMAX C4655A: precio 0.9785, 42 días → rendimiento 18.8335%", () => {
    expect(rendimientoAnualizado(0.9785, 42)).toBeCloseTo(0.1883349, 5);
  });
  it("AUTOMERCADOS PLAZA'S: precio 0.984, 14 días → rendimiento 41.8118%", () => {
    expect(rendimientoAnualizado(0.984, 14)).toBeCloseTo(0.4181185, 5);
  });
  it("OPTI-COLOR: precio 0.94, 42 días → rendimiento 54.7112%", () => {
    expect(rendimientoAnualizado(0.94, 42)).toBeCloseTo(0.5471125, 5);
  });
});

describe("Bug 4 — Normalización de RIF para matching", () => {
  function normRif(r: string | null | undefined): string {
    return (r ?? "").replace(/[-\s]/g, "").toUpperCase().trim();
  }
  it("Con guion y sin guion matchean", () => {
    expect(normRif("J-503636742")).toBe(normRif("J503636742"));
  });
  it("Con espacios matchean", () => {
    expect(normRif("J 503636742")).toBe(normRif("J503636742"));
  });
  it("Minúsculas matchean", () => {
    expect(normRif("j-503636742")).toBe(normRif("J503636742"));
  });
});

describe("Emisión masiva — símbolo CFB variable desde CSV", () => {
  it("lee la columna simbolo_cfb como dato variable del lote", () => {
    const csv = [
      "NRO,SIMBOLO CFB,RAZON SOCIAL,RIF,LINEA,TIPO,CANTIDAD,MONTO TOTAL,VENCIMIENTO,PLAZO,DESCUENTO,CERTIFICADOS,PROGRAMA,STATUS",
      "1,C4891A,ACME C.A.,J-123456789,Principal,Express,1,1,000.00,30/04/2026,14 Días,300,ACME C.A.,PCFB-1,OK",
    ].join("\n");

    const { rows } = parseCSVText(csv);

    expect(rows[0].simbolo_cfb).toBe("C4891A");
  });
});
