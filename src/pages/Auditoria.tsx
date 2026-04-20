import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, EmptyState, Pill } from "@/components/ui-bits";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";

interface Log {
  id: string; action: string; resource_type: string; resource_id: string | null;
  user_email: string | null; created_at: string; details: Record<string, unknown> | null;
}

export default function Auditoria() {
  const [rows, setRows] = useState<Log[]>([]);
  const [q, setQ] = useState("");

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("audit_log").select("*").order("created_at", { ascending: false }).limit(500);
      setRows((data ?? []) as Log[]);
    })();
  }, []);

  const filtered = rows.filter(r => {
    if (!q) return true;
    const t = q.toLowerCase();
    return r.action.includes(t) || r.resource_type.includes(t) || (r.user_email?.toLowerCase().includes(t) ?? false);
  });

  const tone = (a: string) =>
    a === "issue" || a === "create" ? "success" :
    a === "delete" || a === "cancel" ? "danger" :
    a === "disable" ? "warning" :
    a === "generate_pdf" || a === "download" ? "accent" : "default";

  return (
    <>
      <PageHeader title="Auditoría" subtitle="Registro completo de acciones del sistema" />
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar por acción, recurso o usuario…" className="pl-9 max-w-md" />
      </div>
      <div className="surface-card overflow-hidden">
        {filtered.length === 0 ? <EmptyState title="Sin registros" /> : (
          <table className="w-full text-sm">
            <thead className="bg-secondary/40 text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
              <tr>
                <th className="text-left px-5 py-3">Fecha</th>
                <th className="text-left px-5 py-3">Usuario</th>
                <th className="text-left px-5 py-3">Acción</th>
                <th className="text-left px-5 py-3">Recurso</th>
                <th className="text-left px-5 py-3">Detalles</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(r => (
                <tr key={r.id} className="border-t border-border hover:bg-secondary/30">
                  <td className="px-5 py-2.5 text-xs text-muted-foreground whitespace-nowrap">{new Date(r.created_at).toLocaleString("es-VE")}</td>
                  <td className="px-5 py-2.5 text-xs">{r.user_email ?? "—"}</td>
                  <td className="px-5 py-2.5"><Pill tone={tone(r.action) as never}>{r.action}</Pill></td>
                  <td className="px-5 py-2.5 text-xs uppercase tracking-wider text-muted-foreground">{r.resource_type}</td>
                  <td className="px-5 py-2.5 text-xs font-mono text-muted-foreground truncate max-w-md">
                    {r.details ? JSON.stringify(r.details) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
