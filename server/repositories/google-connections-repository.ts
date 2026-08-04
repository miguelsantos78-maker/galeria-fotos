import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db/database.types";

type GoogleConnectionRow = Database["public"]["Tables"]["google_connections"]["Row"];
type GoogleConnectionInsert = Database["public"]["Tables"]["google_connections"]["Insert"];
type GoogleConnectionUpdate = Database["public"]["Tables"]["google_connections"]["Update"];

export interface GoogleConnectionsRepository {
  findActiveByUser(userId: string): Promise<GoogleConnectionRow | null>;
  findLatestByUser(userId: string): Promise<GoogleConnectionRow | null>;
  findById(id: string): Promise<GoogleConnectionRow | null>;
  /** Todas as ligações ativas, de qualquer utilizador — usado pela
   * sincronização periódica (`server/use-cases/drive-sync.ts`). */
  listAllActive(): Promise<GoogleConnectionRow[]>;
  insert(input: GoogleConnectionInsert): Promise<GoogleConnectionRow>;
  update(id: string, patch: GoogleConnectionUpdate): Promise<GoogleConnectionRow | null>;
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

    async findLatestByUser(userId) {
      const { data, error } = await db
        .from("google_connections")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      return data;
    },

    async findById(id) {
      const { data, error } = await db
        .from("google_connections")
        .select("*")
        .eq("id", id)
        .maybeSingle();

      if (error) throw error;
      return data;
    },

    async listAllActive() {
      const { data, error } = await db
        .from("google_connections")
        .select("*")
        .eq("status", "active");

      if (error) throw error;
      return data;
    },

    async insert(input) {
      const { data, error } = await db
        .from("google_connections")
        .insert(input)
        .select("*")
        .single();

      if (error) throw error;
      return data;
    },

    async update(id, patch) {
      const { data, error } = await db
        .from("google_connections")
        .update(patch)
        .eq("id", id)
        .select("*")
        .maybeSingle();

      if (error) throw error;
      return data;
    },
  };
}
