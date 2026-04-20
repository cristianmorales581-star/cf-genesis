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
import NotFound from "./pages/NotFound";
import NuevaEmision from "./pages/NuevaEmision";
import Emisiones from "./pages/Emisiones";
import EmisionDetalle from "./pages/EmisionDetalle";
import Confirmaciones from "./pages/Confirmaciones";
import Auditoria from "./pages/Auditoria";

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
              <Route path="/emisiones" element={<Emisiones />} />
              <Route path="/emisiones/nueva" element={<NuevaEmision />} />
              <Route path="/emisiones/:id" element={<EmisionDetalle />} />
              <Route path="/confirmaciones" element={<Confirmaciones />} />
              <Route path="/auditoria" element={<Auditoria />} />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
