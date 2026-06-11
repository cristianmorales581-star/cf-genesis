import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";

export function ProtectedRoute({
  children,
  requireAdmin = false,
  section,
}: {
  children: React.ReactNode;
  requireAdmin?: boolean;
  section?: string;
}) {
  const { user, loading, isAdmin, canAccess } = useAuth();
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-surface">
        <div className="text-muted-foreground text-sm">Cargando…</div>
      </div>
    );
  }
  if (!user) return <Navigate to="/auth" replace />;
  if (requireAdmin && !isAdmin) return <Navigate to="/" replace />;
  if (section && !canAccess(section)) return <Navigate to="/" replace />;
  return <>{children}</>;
}
