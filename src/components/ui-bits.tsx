import { useState, type ReactNode } from "react";

export function PageHeader({ title, subtitle, children }: { title: string; subtitle?: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-8 pb-6 border-b border-border">
      <div>
        <p className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground/80 font-semibold mb-2">SICEBOP</p>
        <h1 className="font-display text-[28px] md:text-[34px] font-semibold text-foreground tracking-tight leading-none">{title}</h1>
        {subtitle && <p className="text-muted-foreground mt-2 text-sm">{subtitle}</p>}
      </div>
      {children && <div className="flex items-center gap-2">{children}</div>}
    </div>
  );
}

export function StatCard({ label, value, hint, accent }: { label: string; value: string; hint?: string; accent?: boolean }) {
  return (
    <div className={`surface-card p-5 ${accent ? "glow-ring" : ""}`}>
      <div className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground font-semibold">{label}</div>
      <div className="font-display text-[28px] font-semibold text-foreground mt-2 tabular-nums">{value}</div>
      {hint && <div className="text-[11px] text-muted-foreground mt-1.5 uppercase tracking-wider">{hint}</div>}
    </div>
  );
}

export function EmptyState({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-border bg-card/40 px-8 py-14 text-center">
      <p className="font-display text-base text-foreground">{title}</p>
      {hint && <p className="text-sm text-muted-foreground mt-1">{hint}</p>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

export function Numeric({ children }: { children: ReactNode }) {
  return <span className="font-mono tabular-nums text-sm">{children}</span>;
}

export function Pill({ children, tone = "default" }: { children: ReactNode; tone?: "default" | "success" | "warning" | "danger" | "accent" }) {
  const map = {
    default: "bg-secondary text-secondary-foreground",
    success: "bg-success/15 text-success",
    warning: "bg-warning/15 text-warning",
    danger: "bg-destructive/15 text-destructive",
    accent: "bg-accent/15 text-accent",
  };
  return <span className={`pill ${map[tone]}`}>{children}</span>;
}

export function useToggleArchive() {
  const [busy, setBusy] = useState(false);
  return { busy, setBusy };
}
