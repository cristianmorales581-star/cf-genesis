import { useEffect, useMemo, useState } from "react";
import { addMonths, eachDayOfInterval, endOfMonth, endOfWeek, format, startOfMonth, startOfWeek } from "date-fns";
import { es } from "date-fns/locale";
import { CalendarDays, ChevronLeft, ChevronRight, Loader2, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { PageHeader, Pill, StatCard } from "@/components/ui-bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { fmtDate, fmtUSD } from "@/lib/format";
import { canUpdateDocumentStatus, dailySummary, DOCUMENT_STATUS, type DocumentStatus } from "@/lib/emissionCalendar";
import { logAudit } from "@/lib/audit";
import { toast } from "sonner";
import Emisiones from "./Emisiones";

type SummaryRow = { fecha_emision: string; valor_nominal_usd: number; monto_efectivo_usd: number };

export default function CalendarioEmisiones() {
  const { role } = useAuth();
  const [month, setMonth] = useState(() => new Date(new Intl.DateTimeFormat("en-CA", { timeZone: "America/Caracas" }).format(new Date()) + "T12:00:00"));
  const [rows, setRows] = useState<SummaryRow[]>([]);
  const [statuses, setStatuses] = useState<Record<string, DocumentStatus>>({});
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [revision, setRevision] = useState(0);
  const monthKey = format(month, "yyyy-MM");
  const from = format(startOfMonth(month), "yyyy-MM-dd");
  const to = format(endOfMonth(month), "yyyy-MM-dd");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError("");
      try {
        const collected: SummaryRow[] = [];
        for (let offset = 0; ; offset += 1000) {
          const { data, error } = await supabase.from("emisiones")
            .select("fecha_emision, valor_nominal_usd, monto_efectivo_usd")
            .is("deleted_at", null).gte("fecha_emision", from).lte("fecha_emision", to)
            .order("fecha_emision").order("id").range(offset, offset + 999);
          if (error) throw error;
          collected.push(...(data ?? []));
          if (!data || data.length < 1000) break;
        }
        const { data, error } = await supabase.from("emision_dia_documentos")
          .select("fecha_emision, estado").gte("fecha_emision", from).lte("fecha_emision", to);
        if (error) throw error;
        if (!cancelled) {
          setRows(collected);
          setStatuses(Object.fromEntries((data ?? []).map(r => [r.fecha_emision, r.estado as DocumentStatus])));
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "No se pudo cargar el calendario");
      } finally { if (!cancelled) setLoading(false); }
    }
    load();
    return () => { cancelled = true; };
  }, [from, to, revision]);

  const summary = useMemo(() => dailySummary(rows), [rows]);
  const days = eachDayOfInterval({ start: startOfWeek(startOfMonth(month), { weekStartsOn: 1 }), end: endOfWeek(endOfMonth(month), { weekStartsOn: 1 }) });
  const totals = rows.reduce((acc, r) => ({ nominal: acc.nominal + Number(r.valor_nominal_usd), efectivo: acc.efectivo + Number(r.monto_efectivo_usd) }), { nominal: 0, efectivo: 0 });
  const selectedStatus = selectedDay ? statuses[selectedDay] ?? "por_enviar" : "por_enviar";

  function changeMonth(date: Date) { setMonth(date); setSelectedDay(null); }

  async function updateStatus(value: DocumentStatus) {
    if (!selectedDay || !canUpdateDocumentStatus(role) || saving) return;
    const day = selectedDay;
    setSaving(true);
    try {
      const { data, error } = await supabase.from("emision_dia_documentos")
        .upsert({ fecha_emision: day, estado: value }, { onConflict: "fecha_emision" })
        .select("estado").single();
      if (error) throw error;
      setStatuses(prev => ({ ...prev, [day]: data.estado as DocumentStatus }));
      await logAudit({ action: "update", resource_type: "emision_dia_documentos", details: { fecha_emision: day, estado: value } });
      toast.success("Estado de documentos actualizado");
    } catch (err) { toast.error(err instanceof Error ? err.message : "No se pudo guardar el estado"); }
    finally { setSaving(false); }
  }

  return <>
    <PageHeader title="Calendario de emisiones" />
    <div className="flex flex-wrap justify-between items-center gap-4 mb-6">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="icon" aria-label="Mes anterior" onClick={() => changeMonth(addMonths(month, -1))}><ChevronLeft /></Button>
        <h2 className="text-xl font-display font-semibold capitalize min-w-[180px] text-center">{format(month, "MMMM yyyy", { locale: es })}</h2>
        <Button variant="outline" size="icon" aria-label="Mes siguiente" onClick={() => changeMonth(addMonths(month, 1))}><ChevronRight /></Button>
        <Input type="month" aria-label="Seleccionar mes" value={monthKey} className="w-44" onChange={e => { if (e.target.value) changeMonth(new Date(e.target.value + "-01T12:00:00")); }} />
        <Button variant="ghost" onClick={() => changeMonth(new Date())}>Hoy</Button>
      </div>
      <div className="flex flex-wrap gap-2">{Object.values(DOCUMENT_STATUS).map(s => <Pill key={s.label} tone={s.tone}>{s.label}</Pill>)}</div>
    </div>
    {error ? <div role="alert" className="py-8 text-destructive">No se pudo cargar el calendario. <Button variant="outline" onClick={() => setRevision(r => r + 1)}>Reintentar</Button></div>
      : loading ? <div className="flex items-center justify-center gap-3 min-h-[400px] text-muted-foreground"><Loader2 className="animate-spin h-5 w-5" /> Cargando emisiones…</div>
      : <>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <StatCard label="CFB del mes" value={String(rows.length)} />
          <StatCard label="Días con emisiones" value={String(Object.keys(summary).length)} />
          <StatCard label="Nominal USD" value={fmtUSD(totals.nominal)} />
          <StatCard label="Efectivo USD" value={fmtUSD(totals.efectivo)} />
        </div>
        <div className="overflow-x-auto mb-8">
          <div className="min-w-[700px] border border-border rounded-md overflow-hidden">
            <div className="grid grid-cols-7 bg-secondary/60">{["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"].map(d => <div key={d} className="text-center text-xs font-semibold py-3">{d}</div>)}</div>
            <div className="grid grid-cols-7">{days.map(day => {
              const iso = format(day, "yyyy-MM-dd");
              const inMonth = iso.slice(0, 7) === monthKey;
              const item = inMonth ? summary[iso] : undefined;
              const status = DOCUMENT_STATUS[statuses[iso] ?? "por_enviar"];
              return <div key={iso} className={`min-h-[146px] min-w-0 border-t border-r border-border p-2 ${inMonth ? "bg-background/40" : "bg-muted/30 text-muted-foreground/40"} ${selectedDay === iso ? "ring-2 ring-inset ring-primary" : ""}`}>
                <div className="text-xs tabular-nums font-semibold mb-2">{format(day, "d")}</div>
                {item && <Button variant="ghost" aria-label={`Ver emisiones del ${fmtDate(iso)}`} aria-expanded={selectedDay === iso}
                  onClick={() => setSelectedDay(iso)} className={`h-auto w-full min-w-0 flex-col items-start gap-1 whitespace-normal text-left rounded-md border p-2 hover:bg-secondary ${status.className}`}>
                  <span className="font-semibold text-xs">{item.count} CFB</span>
                  <span className="text-[11px] break-all text-foreground tabular-nums">{fmtUSD(item.nominal)}</span>
                  <span className="text-[10px] leading-tight">{status.label}</span>
                </Button>}
              </div>;
            })}</div>
          </div>
        </div>
        {selectedDay && <section aria-label={`Emisiones del ${fmtDate(selectedDay)}`} className="border-t border-border pt-6">
          <div className="flex flex-wrap items-center justify-between gap-4 mb-5">
            <div><h2 className="text-xl font-display font-semibold flex items-center gap-2"><CalendarDays className="h-5 w-5 text-primary" /> {fmtDate(selectedDay)}</h2>
              <p className="text-sm text-muted-foreground mt-2">{summary[selectedDay]?.count ?? 0} CFB · Nominal {fmtUSD(summary[selectedDay]?.nominal ?? 0)} · Efectivo {fmtUSD(summary[selectedDay]?.efectivo ?? 0)}</p>
            </div>
            <div className="flex items-center gap-3">
              {canUpdateDocumentStatus(role) ? <Select value={selectedStatus} disabled={saving} onValueChange={v => updateStatus(v as DocumentStatus)}>
                <SelectTrigger aria-label="Estado de documentos del día" className="w-[220px]"><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(DOCUMENT_STATUS).map(([value, status]) => <SelectItem key={value} value={value}>{status.label}</SelectItem>)}</SelectContent>
              </Select> : <Pill tone={DOCUMENT_STATUS[selectedStatus].tone}>{DOCUMENT_STATUS[selectedStatus].label}</Pill>}
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              <Button variant="ghost" size="icon" aria-label="Cerrar tabla del día" onClick={() => setSelectedDay(null)}><X /></Button>
            </div>
          </div>
          <Emisiones key={selectedDay} fechaEmision={selectedDay} embedded onChanged={() => setRevision(r => r + 1)} />
        </section>}
      </>}
  </>;
}