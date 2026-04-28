import { describe, expect, it } from "vitest";
import { parseAccountingNumber, parsePastedValues } from "@/lib/excelImport";

describe("Carga masiva — formato numérico accounting americano", () => {
  it("interpreta coma como separador de miles", () => {
    expect(parseAccountingNumber("1,234")).toBe(1234);
    expect(parseAccountingNumber("12,345,678")).toBe(12345678);
  });

  it("interpreta punto como separador decimal", () => {
    expect(parseAccountingNumber("1,234.56")).toBeCloseTo(1234.56, 6);
    expect(parseAccountingNumber("0.92")).toBeCloseTo(0.92, 6);
  });

  it("soporta negativos contables entre paréntesis", () => {
    expect(parseAccountingNumber("(1,234.56)")).toBeCloseTo(-1234.56, 6);
    expect(parseAccountingNumber("-3.5")).toBeCloseTo(-3.5, 6);
  });

  it("permite pegar data en formato CSV", () => {
    const parsed = parsePastedValues('Denominación Social,RIF,PCFB,Vencimiento\n"ZONA TECH C.A.",J-408660180,"CFB-ZONA-CASHEA-2026-A",05/06/2026');
    expect(parsed.cedentes[0].razon_social).toBe("ZONA TECH C.A.");
    expect(parsed.programas[0].codigo_pcfb).toBe("CFB-ZONA-CASHEA-2026-A");
  });
});