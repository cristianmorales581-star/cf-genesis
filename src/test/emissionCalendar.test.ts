import { describe, expect, it } from "vitest";
import { canUpdateDocumentStatus, dailySummary, DOCUMENT_STATUS } from "@/lib/emissionCalendar";

describe("Daily emissions calendar", () => {
  it("consolidates by emission date without mixing days", () => {
    const summary = dailySummary([
      { fecha_emision: "2026-10-19", valor_nominal_usd: 100, monto_efectivo_usd: 95 },
      { fecha_emision: "2026-10-19", valor_nominal_usd: 200, monto_efectivo_usd: 180 },
      { fecha_emision: "2026-10-20", valor_nominal_usd: 500, monto_efectivo_usd: 450 },
    ]);
    expect(summary["2026-10-19"]).toEqual({ count: 2, nominal: 300, efectivo: 275 });
    expect(summary["2026-10-20"].count).toBe(1);
  });
  it("maps signed documents to green success status", () => { expect(DOCUMENT_STATUS.firmado.tone).toBe("success"); });
  it("maps partial signatures to yellow warning status", () => { expect(DOCUMENT_STATUS.parcialmente_firmado.tone).toBe("warning"); });
  it("maps pending sending to red danger status", () => { expect(DOCUMENT_STATUS.por_enviar.tone).toBe("danger"); });
  it("allows Admin to update daily signatures", () => { expect(canUpdateDocumentStatus("admin")).toBe(true); });
  it("allows Backoffice to update daily signatures", () => { expect(canUpdateDocumentStatus("backoffice")).toBe(true); });
  it("does not allow other roles or signed-out users to update signatures", () => {
    expect(canUpdateDocumentStatus("operador")).toBe(false);
    expect(canUpdateDocumentStatus(null)).toBe(false);
  });
});