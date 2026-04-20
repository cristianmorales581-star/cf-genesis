import { useState, type ReactNode } from "react";

export function PageHeader({ title, subtitle, children }: { title: string; subtitle?: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-6 pb-5 border-b border-border">
      <div>
        <h1 className="font-display text-3xl md:text-4xl font-semibold text-primary tracking-tight">{title}</h1>
        {subtitle && <p className="text-muted-foreground mt-1.5 text-sm">{subtitle}</p>}
      </div>
      {children && <div className="flex items-center gap-2">{children}</div>}
    </div>
  );
}

export function StatCard({ label, value, hint, accent }: { label: string; value: string; hint?: string; accent?: boolean }) {
  return (
    <div className={`rounded-lg border bg-card p-5 shadow-sm-elegant ${accent ? "border-accent/40 bg-gradient-to-br from-card to-accent-soft/30" : "border-border"}`}>
      <div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground font-semibold">{label}</div>
      <div className="font-display text-3xl font-semibold text-primary mt-2">{value}</div>
      {hint && <div className="text-xs text-muted-foreground mt-1.5">{hint}</div>}
    </div>
  );
}

export function EmptyState({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-border bg-card/50 px-8 py-14 text-center">
      <p className="font-display text-lg text-primary">{title}</p>
      {hint && <p className="text-sm text-muted-foreground mt-1">{hint}</p>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

// Use inside table cells for prominent numeric figures
export function Numeric({ children }: { children: ReactNode }) {
  return <span className="font-mono tabular-nums text-sm">{children}</span>;
}

export function useToggleArchive() {
  const [busy, setBusy] = useState(false);
  return { busy, setBusy };
}
