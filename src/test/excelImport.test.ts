import { describe, expect, it } from "vitest";
import { parseLatinNumber } from "@/lib/excelImport";

describe("Carga masiva — formato numérico latino", () => {
  it("interpreta punto como separador de miles", () => {
    expect(parseLatinNumber("1.234")).toBe(1234);
    expect(parseLatinNumber("12.345.678")).toBe(12345678);
  });

  it("interpreta coma como separador decimal", () => {
    expect(parseLatinNumber("1.234,56")).toBeCloseTo(1234.56, 6);
    expect(parseLatinNumber("0,92")).toBeCloseTo(0.92, 6);
  });

  it("mantiene decimales con punto cuando no hay patrón de miles", () => {
    expect(parseLatinNumber("0.92")).toBeCloseTo(0.92, 6);
    expect(parseLatinNumber("3.5")).toBeCloseTo(3.5, 6);
  });
});