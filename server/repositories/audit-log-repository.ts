import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db/database.types";
import { toPostgrestError } from "@/lib/db/postgrest-error";

type AuditLogInsert = Database["public"]["Tables"]["audit_logs"]["Insert"];

export interface AuditLogRepository {
  record(entry: AuditLogInsert): Promise<void>;
}

/**
 * Trilho de auditoria para ações administrativas destrutivas (secção
 * 15). Nunca guardar segredos ou binários em "metadata".
 */
export function createAuditLogRepository(
  client: SupabaseClient<Database>,
): AuditLogRepository {
  const db = client.schema("public");

  return {
    async record(entry) {
      const { error } = await db.from("audit_logs").insert(entry);
      if (error) throw toPostgrestError(error);
    },
  };
}
