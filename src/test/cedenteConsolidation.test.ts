import { describe, expect, it } from "vitest";
import { consolidateCedentes, type IssuedRow } from "@/lib/cedenteConsolidation";
const a = { id: "a", razon_social: "Cedente A", rif: "J-1" };
const b = { id: "b", razon_social: "Cedente B", rif: "J-2" };
const row = (date: string, amount: number, cedente = a): IssuedRow => ({ fecha_emision: date, valor_nominal_usd: amount, cedentes: cedente, programas: null });
describe("Issued totals per cedente", () => {
  it("consolidates nominal issued amounts separately by cedente and month", () => {
    const result = consolidateCedentes([row("2026-11-01", 100), row("2026-11-05", 250), row("2026-11-05", 700, b), row("2026-10-31", 50)], "month");
    expect(result.find(r => r.cedenteId === "a" && r.start === "2026-11-01")).toMatchObject({ nominal: 350, count: 2 });
    expect(result.find(r => r.cedenteId === "b")?.nominal).toBe(700);
    expect(result.find(r => r.start === "2026-10-01")?.nominal).toBe(50);
  });
  it("groups Monday through Sunday across month boundaries", () => {
    const result = consolidateCedentes([row("2026-10-26", 100), row("2026-11-01", 200), row("2026-11-02", 400)], "week");
    expect(result.find(r => r.start === "2026-10-26")).toMatchObject({ end: "2026-11-01", count: 2, nominal: 300 });
    expect(result.find(r => r.start === "2026-11-02")?.nominal).toBe(400);
  });
  it("includes programless emissions under their direct cedente", () => {
    expect(consolidateCedentes([row("2026-11-05", 150)], "month")[0]).toMatchObject({ cedenteId: "a", nominal: 150 });
  });
  it("resolves the program cedente", () => {
    expect(consolidateCedentes([{ ...row("2026-11-05", 200), cedentes: null, programas: { cedentes: b } }], "week")[0]).toMatchObject({ cedenteId: "b", nominal: 200 });
  });
  it("excludes deleted emissions", () => {
    expect(consolidateCedentes([{ ...row("2026-11-05", 900), deleted_at: "2026-11-05" }, row("2026-11-05", 100)], "month")[0].nominal).toBe(100);
  });
  it("keeps weeks intact across year boundaries", () => {
    expect(consolidateCedentes([row("2026-12-31", 100), row("2027-01-01", 200)], "week")[0]).toMatchObject({ start: "2026-12-28", end: "2027-01-03", nominal: 300, count: 2 });
  });
});