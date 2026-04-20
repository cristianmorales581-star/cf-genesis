import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import {
  LayoutDashboard, FileText, Users, Building2, BookOpenCheck,
  FilePlus2, FileStack, Upload, ScrollText, LogOut,
} from "lucide-react";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/", icon: LayoutDashboard, label: "Dashboard", end: true },
  { to: "/emisiones", icon: FileStack, label: "Emisiones" },
  { to: "/emisiones/nueva", icon: FilePlus2, label: "Nueva Emisión", op: true },
  { to: "/programas", icon: BookOpenCheck, label: "Programas" },
  { to: "/cedentes", icon: Building2, label: "Cedentes" },
  { to: "/financistas", icon: Users, label: "Financistas" },
  { to: "/confirmaciones", icon: Upload, label: "Confirmaciones" },
  { to: "/auditoria", icon: ScrollText, label: "Auditoría" },
];

export function AppLayout() {
  const { user, role, signOut, isOperador } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="flex min-h-screen bg-gradient-surface">
      {/* Sidebar */}
      <aside className="hidden md:flex w-64 flex-col bg-sidebar text-sidebar-foreground">
        <div className="px-6 pt-7 pb-5 border-b border-sidebar-border">
          <div className="flex items-baseline gap-2">
            <h1 className="font-display text-2xl font-bold text-sidebar-primary tracking-tight">SICEBOP</h1>
          </div>
          <p className="text-[11px] uppercase tracking-[0.18em] text-sidebar-foreground/60 mt-1">
            Grupo Bursátil Venezolano
          </p>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
          {NAV.filter(n => !n.op || isOperador).map(({ to, icon: Icon, label, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) => cn(
                "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-smooth",
                isActive
                  ? "bg-sidebar-accent text-sidebar-accent-foreground border-l-2 border-sidebar-primary"
                  : "text-sidebar-foreground/80 hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground"
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-sidebar-border p-4">
          <div className="text-xs text-sidebar-foreground/70 mb-2 truncate">{user?.email}</div>
          <div className="flex items-center justify-between">
            <span className={cn(
              "inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider",
              role === "admin" ? "bg-sidebar-primary text-sidebar-primary-foreground" : "bg-sidebar-accent text-sidebar-accent-foreground"
            )}>
              {role ?? "—"}
            </span>
            <Button
              size="sm" variant="ghost"
              className="text-sidebar-foreground/80 hover:text-sidebar-accent-foreground hover:bg-sidebar-accent h-8 px-2"
              onClick={async () => { await signOut(); navigate("/auth"); }}
            >
              <LogOut className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 flex flex-col min-w-0">
        {/* Mobile bar */}
        <div className="md:hidden bg-sidebar text-sidebar-foreground px-4 py-3 flex items-center justify-between">
          <h1 className="font-display text-lg font-bold text-sidebar-primary">SICEBOP</h1>
          <Button size="sm" variant="ghost" className="text-sidebar-foreground" onClick={async () => { await signOut(); navigate("/auth"); }}>
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex-1 p-4 md:p-8 max-w-[1400px] w-full mx-auto animate-fade-in">
          <Outlet />
        </div>
        <footer className="px-8 py-4 text-[11px] text-muted-foreground border-t border-border bg-card">
          SICEBOP · Sistema de Certificados de Financiamiento Bursátil · Grupo Bursátil Venezolano
        </footer>
      </main>
    </div>
  );
}
