import { supabase } from "@/integrations/supabase/client";

export type AuditAction =
  | "create" | "update" | "delete" | "disable" | "enable"
  | "issue" | "cancel" | "download" | "upload" | "generate_pdf"
  | "import_excel";

export async function logAudit(params: {
  action: AuditAction;
  resource_type: string;
  resource_id?: string | null;
  details?: Record<string, unknown>;
}) {
  const { data: { user } } = await supabase.auth.getUser();
  await supabase.from("audit_log").insert({
    user_id: user?.id ?? null,
    user_email: user?.email ?? null,
    action: params.action,
    resource_type: params.resource_type,
    resource_id: params.resource_id ?? null,
    details: (params.details ?? {}) as never,
  });
}
