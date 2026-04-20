import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import {
  LayoutDashboard, Users, Building2, BookOpenCheck,
  FilePlus2, FileStack, Upload, ScrollText, LogOut, FileSpreadsheet,
} from "lucide-react";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/", icon: LayoutDashboard, label: "Dashboard", end: true, group: "general" },
  { to: "/emisiones", icon: FileStack, label: "Emisiones", group: "operación" },
  { to: "/emisiones/nueva", icon: FilePlus2, label: "Nueva Emisión", op: true, group: "operación" },
  { to: "/emisiones/masiva", icon: FileSpreadsheet, label: "Emisión Masiva", op: true, group: "operación" },
  { to: "/confirmaciones", icon: Upload, label: "Confirmaciones", group: "operación" },
  { to: "/programas", icon: BookOpenCheck, label: "Programas", group: "maestros" },
  { to: "/cedentes", icon: Building2, label: "Cedentes", group: "maestros" },
  { to: "/financistas", icon: Users, label: "Financistas", group: "maestros" },
  { to: "/auditoria", icon: ScrollText, label: "Auditoría", group: "sistema" },
];

export function AppLayout() {
  const { user, role, signOut, isOperador } = useAuth();
  const navigate = useNavigate();

  const groups = ["general", "operación", "maestros", "sistema"];

  return (
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <aside className="hidden md:flex w-[260px] flex-col bg-sidebar text-sidebar-foreground border-r border-sidebar-border">
        <div className="px-6 pt-7 pb-6 border-b border-sidebar-border">
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-md bg-gradient-gold flex items-center justify-center font-display font-bold text-[15px] text-sidebar-primary-foreground shadow-sm">
              S
            </div>
            <div className="leading-none">
              <h1 className="font-display text-[15px] font-bold text-sidebar-accent-foreground tracking-wide">SICEBOP</h1>
              <p className="text-[10px] uppercase tracking-[0.18em] text-sidebar-foreground/55 mt-1">
                Grupo Bursátil VE
              </p>
            </div>
          </div>
        </div>

        <nav className="flex-1 px-3 py-5 overflow-y-auto">
          {groups.map((g) => {
            const items = NAV.filter(n => n.group === g && (!n.op || isOperador));
            if (items.length === 0) return null;
            return (
              <div key={g} className="mb-5">
                <p className="px-3 mb-2 text-[10px] uppercase tracking-[0.18em] text-sidebar-foreground/40 font-semibold">{g}</p>
                <div className="space-y-0.5">
                  {items.map(({ to, icon: Icon, label, end }) => (
                    <NavLink
                      key={to}
                      to={to}
                      end={end}
                      className={({ isActive }) => cn(
                        "flex items-center gap-3 px-3 py-2 rounded-md text-[13px] font-medium transition-smooth",
                        isActive
                          ? "bg-sidebar-accent text-sidebar-accent-foreground border-l-2 border-sidebar-primary pl-[10px]"
                          : "text-sidebar-foreground/75 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
                      )}
                    >
                      <Icon className="h-[15px] w-[15px]" />
                      {label}
                    </NavLink>
                  ))}
                </div>
              </div>
            );
          })}
        </nav>

        <div className="border-t border-sidebar-border p-4">
          <div className="text-[11px] text-sidebar-foreground/60 mb-2 truncate">{user?.email}</div>
          <div className="flex items-center justify-between">
            <span className={cn(
              "pill",
              role === "admin" ? "bg-sidebar-primary text-sidebar-primary-foreground" : "bg-sidebar-accent text-sidebar-accent-foreground"
            )}>
              {role ?? "—"}
            </span>
            <Button
              size="sm" variant="ghost"
              className="text-sidebar-foreground/70 hover:text-sidebar-accent-foreground hover:bg-sidebar-accent h-8 px-2"
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
        <div className="md:hidden bg-sidebar text-sidebar-foreground px-4 py-3 flex items-center justify-between border-b border-sidebar-border">
          <h1 className="font-display text-base font-bold text-sidebar-accent-foreground">SICEBOP</h1>
          <Button size="sm" variant="ghost" className="text-sidebar-foreground" onClick={async () => { await signOut(); navigate("/auth"); }}>
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex-1 px-5 py-7 md:px-10 md:py-10 max-w-[1480px] w-full mx-auto animate-fade-in">
          <Outlet />
        </div>
        <footer className="px-8 py-4 text-[10px] uppercase tracking-[0.18em] text-muted-foreground border-t border-border">
          SICEBOP · Sistema de Certificados de Financiamiento Bursátil · Grupo Bursátil Venezolano
        </footer>
      </main>
    </div>
  );
}
