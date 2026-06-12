// SICEBOP — Create user (admin only)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type Role = "admin" | "backoffice";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader) return json({ error: "No autorizado" }, 401);

    // Verify caller is admin
    const userClient = createClient(SUPABASE_URL, ANON, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) return json({ error: "Sesión inválida" }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    const { data: isAdmin } = await admin.rpc("has_role", {
      _user_id: userData.user.id,
      _role: "admin",
    });
    if (!isAdmin) return json({ error: "Solo administradores pueden crear usuarios" }, 403);

    const body = await req.json();
    const email = String(body?.email ?? "").trim().toLowerCase();
    const password = String(body?.password ?? "");
    const full_name = body?.full_name ? String(body.full_name).trim() : null;
    const role: Role = body?.role === "admin" ? "admin" : "backoffice";

    if (!email || !email.includes("@")) return json({ error: "Email inválido" }, 400);
    if (password.length < 8) return json({ error: "La contraseña debe tener al menos 8 caracteres" }, 400);

    // Create user (auto-confirmed)
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: full_name ? { full_name } : {},
    });
    if (createErr || !created.user) return json({ error: createErr?.message ?? "No se pudo crear el usuario" }, 400);

    const newId = created.user.id;

    // handle_new_user trigger creates profile + default role; override role if needed
    if (role === "admin") {
      await admin.from("user_roles").delete().eq("user_id", newId);
      const { error: roleErr } = await admin.from("user_roles").insert({ user_id: newId, role: "admin" });
      if (roleErr) return json({ error: roleErr.message }, 400);
    }

    if (full_name) {
      await admin.from("profiles").update({ full_name }).eq("id", newId);
    }

    return json({ ok: true, user: { id: newId, email, full_name, role } });
  } catch (e) {
    return json({ error: (e as Error).message ?? "Error interno" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
