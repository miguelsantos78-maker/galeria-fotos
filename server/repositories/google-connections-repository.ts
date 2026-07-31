import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db/database.types";

type GoogleConnectionRow =
  Database["public"]["Tables"]["google_connections"]["Row"];

export interface GoogleConnectionsRepository {
  findActiveByUser(userId: string): Promise<GoogleConnectionRow | null>;
}

export function createGoogleConnectionsRepository(
  client: SupabaseClient<Database>,
): GoogleConnectionsRepository {
  const db = client.schema("public");

  return {
    async findActiveByUser(userId) {
      const { data, error } = await db
        .from("google_connections")
        .select("*")
        .eq("user_id", userId)
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      return data;
    },
  };
}
