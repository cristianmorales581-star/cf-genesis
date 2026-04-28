import { describe, expect, it } from "vitest";
import { parseAccountingNumber } from "@/lib/excelImport";

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
});