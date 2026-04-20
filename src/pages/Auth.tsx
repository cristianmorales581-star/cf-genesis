import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { z } from "zod";

const credSchema = z.object({
  email: z.string().trim().email("Correo inválido").max(255),
  password: z.string().min(8, "Mínimo 8 caracteres").max(72),
});

export default function Auth() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");

  useEffect(() => {
    if (!loading && user) navigate("/", { replace: true });
  }, [user, loading, navigate]);

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    const parsed = credSchema.safeParse({ email, password });
    if (!parsed.success) { toast.error(parsed.error.issues[0].message); return; }
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email: parsed.data.email, password: parsed.data.password });
    setBusy(false);
    if (error) toast.error(error.message); else navigate("/", { replace: true });
  }

  async function handleSignUp(e: React.FormEvent) {
    e.preventDefault();
    const parsed = credSchema.safeParse({ email, password });
    if (!parsed.success) { toast.error(parsed.error.issues[0].message); return; }
    setBusy(true);
    const { error } = await supabase.auth.signUp({
      email: parsed.data.email,
      password: parsed.data.password,
      options: {
        emailRedirectTo: window.location.origin,
        data: { full_name: fullName.trim() || parsed.data.email },
      },
    });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Cuenta creada. Revisa tu correo si la confirmación está activa, o inicia sesión.");
  }

  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-gradient-surface">
      {/* Brand panel */}
      <div className="hidden lg:flex bg-gradient-primary text-primary-foreground p-12 flex-col justify-between relative overflow-hidden">
        <div className="absolute inset-0 opacity-10" style={{
          backgroundImage: "radial-gradient(circle at 20% 30%, hsl(var(--accent)) 1px, transparent 1px)",
          backgroundSize: "32px 32px",
        }} />
        <div className="relative">
          <p className="text-[11px] uppercase tracking-[0.22em] text-primary-foreground/70 font-semibold">
            Grupo Bursátil Venezolano
          </p>
          <h1 className="font-display text-6xl font-bold mt-3 tracking-tight">SICEBOP</h1>
          <p className="text-primary-foreground/80 mt-2 text-lg">
            Sistema de Certificados de Financiamiento Bursátil
          </p>
        </div>
        <div className="relative space-y-4 max-w-md">
          <div className="border-l-2 border-accent pl-5">
            <p className="font-display text-2xl leading-tight">
              Emisión, valoración y administración de instrumentos CFB conforme a normativa <span className="text-accent">SUNAVAL</span>.
            </p>
          </div>
          <p className="text-xs text-primary-foreground/60 uppercase tracking-wider">
            Operación interna · Bolsa de Valores de Caracas
          </p>
        </div>
      </div>

      {/* Form panel */}
      <div className="flex items-center justify-center p-6 lg:p-12">
        <div className="w-full max-w-md">
          <div className="lg:hidden mb-8 text-center">
            <h1 className="font-display text-4xl font-bold text-primary">SICEBOP</h1>
            <p className="text-xs uppercase tracking-widest text-muted-foreground mt-1">Grupo Bursátil Venezolano</p>
          </div>

          <Tabs defaultValue="signin" className="w-full">
            <TabsList className="grid w-full grid-cols-2 bg-secondary">
              <TabsTrigger value="signin">Iniciar sesión</TabsTrigger>
              <TabsTrigger value="signup">Registro</TabsTrigger>
            </TabsList>

            <TabsContent value="signin" className="mt-6">
              <form onSubmit={handleSignIn} className="space-y-4">
                <div>
                  <Label htmlFor="email">Correo</Label>
                  <Input id="email" type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} />
                </div>
                <div>
                  <Label htmlFor="password">Contraseña</Label>
                  <Input id="password" type="password" autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} />
                </div>
                <Button type="submit" className="w-full bg-gradient-primary hover:opacity-95 shadow-elegant" disabled={busy}>
                  {busy ? "Verificando…" : "Ingresar"}
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="signup" className="mt-6">
              <form onSubmit={handleSignUp} className="space-y-4">
                <div>
                  <Label htmlFor="name">Nombre completo</Label>
                  <Input id="name" required value={fullName} onChange={e => setFullName(e.target.value)} maxLength={100} />
                </div>
                <div>
                  <Label htmlFor="email2">Correo</Label>
                  <Input id="email2" type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} />
                </div>
                <div>
                  <Label htmlFor="pwd2">Contraseña</Label>
                  <Input id="pwd2" type="password" autoComplete="new-password" required value={password} onChange={e => setPassword(e.target.value)} minLength={8} />
                  <p className="text-xs text-muted-foreground mt-1">Mínimo 8 caracteres. El primer usuario será administrador.</p>
                </div>
                <Button type="submit" className="w-full bg-gradient-primary hover:opacity-95 shadow-elegant" disabled={busy}>
                  {busy ? "Creando…" : "Crear cuenta"}
                </Button>
              </form>
            </TabsContent>
          </Tabs>

          <p className="text-center text-[11px] text-muted-foreground mt-8 uppercase tracking-wider">
            Acceso restringido · Personal autorizado
          </p>
        </div>
      </div>
    </div>
  );
}
