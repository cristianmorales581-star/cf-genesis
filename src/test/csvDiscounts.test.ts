import { describe, expect, it } from "vitest";
import { parseCSVText } from "@/lib/csvParser";
import { missingCsvDiscounts } from "@/lib/csvDiscounts";

const header = "NRO,RAZON SOCIAL,RIF,TIPO,CANTIDAD DE ÓRDENES DE COMPRA,MONTO TOTAL DE LAS ORDENES (NOMINAL),VENCIMIENTO DE LA PRIMERA ORDEN,PLAZO,CUOTAS,PRECIO,DESCUENTO (%),CAPITAL (NOMINAL x PRECIO),TASA ANUAL (%),EMISIÓN,VENCIMIENTO CERTIFICADO,VALIDACIÓN,OBSERVACIÓN";
function csv(discount: number, price: number) {
  return `\uFEFF${header}\n1,"REDVITAL COMERCIALIZADORA, C.A.",J-500328800,sweep,49996,"2,860,727.94",19/10/2026,14 Días,1,${price},${discount},2849285.02,10.33,19/10/2026,2/11/2026,OK,`;
}

describe("Nuevo CSV — descuentos porcentuales explícitos", () => {
  it.each([[4, 0.96, 0.04], [3.5, 0.965, 0.035], [1.6, 0.984, 0.016], [0.4, 0.996, 0.004], [1, 0.99, 0.01], [0, 1, 0]])("interpreta %s%% sin usar la escala histórica", (discount, price, decimal) => {
    const { rows } = parseCSVText(csv(discount, price));
    expect(rows[0].descuento_decimal).toBeCloseTo(decimal, 8);
    expect(1 - rows[0].descuento_decimal).toBeCloseTo(price, 8);
  });
  it("lee nominal, cantidad y primer vencimiento del archivo nuevo", () => {
    const { rows, warnings } = parseCSVText(csv(0.4, 0.996));
    expect(rows[0].monto_total_usd).toBe(2860727.94);
    expect(rows[0].cantidad_ordenes).toBe(49996);
    expect(rows[0].vencimiento_primera_orden).toBe("2026-10-19");
    expect(warnings).toEqual([]);
  });
  it.each([["Express", 300, 0.03], ["Masivo", 0.92, 0.0092], ["Paquetizado", 1.49, 0.0149]])("conserva formato anterior %s", (type, discount, decimal) => {
    const { rows } = parseCSVText(`NRO,RAZON SOCIAL,RIF,TIPO,MONTO TOTAL,DESCUENTO\n1,ACME,J1,${type},100,${discount}`);
    expect(rows[0].descuento_decimal).toBeCloseTo(decimal, 8);
  });
});

describe("Registro de descuentos CSV por programa", () => {
  const programs = [{ id: "p1", descuento_base: 0.03, programa_descuentos: [{ descuento: 0.016, activo: true }] }, { id: "p2", descuento_base: 0.02 }];
  it("registra el descuento CSV y fecha, sin reemplazarlo por el base", () => {
    const row = { programa_id: "p1", descuento_decimal: parseCSVText(csv(0.4, 0.996)).rows[0].descuento_decimal };
    expect(missingCsvDiscounts([row, row], programs, "26/10/2026")).toEqual([{ programa_id: "p1", descuento: 0.004, etiqueta: "26/10/2026", es_default: false, activo: true }]);
    expect(row.descuento_decimal).toBe(0.004);
  });
  it("no duplica descuentos base o activos registrados", () => {
    expect(missingCsvDiscounts([{ programa_id: "p1", descuento_decimal: 0.03 }, { programa_id: "p1", descuento_decimal: 0.01600000001 }], programs, "26/10/2026")).toEqual([]);
  });
  it("conserva el descuento al cambiar el programa y lo agrega al nuevo", () => {
    const row = { programa_id: "p1", descuento_decimal: 0.004 };
    const reassigned = { ...row, programa_id: "p2" };
    expect(missingCsvDiscounts([reassigned], programs, "26/10/2026")[0]).toMatchObject({ programa_id: "p2", descuento: 0.004 });
  });
});