import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AppLayout } from "@/components/AppLayout";
import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import Cedentes from "./pages/Cedentes";
import Financistas from "./pages/Financistas";
import Programas from "./pages/Programas";
import Placeholder from "./pages/Placeholder";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/auth" element={<Auth />} />
            <Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
              <Route path="/" element={<Dashboard />} />
              <Route path="/cedentes" element={<Cedentes />} />
              <Route path="/financistas" element={<Financistas />} />
              <Route path="/programas" element={<Programas />} />
              <Route path="/emisiones" element={<Placeholder title="Emisiones" subtitle="Listado completo de emisiones CFB" />} />
              <Route path="/emisiones/nueva" element={<Placeholder title="Nueva Emisión" subtitle="Registro de una nueva emisión CFB" />} />
              <Route path="/emisiones/:id" element={<Placeholder title="Detalle de Emisión" subtitle="Documentos y operaciones asociadas" />} />
              <Route path="/confirmaciones" element={<Placeholder title="Confirmaciones" subtitle="Carga masiva del vector SIBE y generación de CDC/CDV" />} />
              <Route path="/auditoria" element={<Placeholder title="Auditoría" subtitle="Registro de todas las acciones del sistema" />} />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
