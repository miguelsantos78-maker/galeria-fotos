import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db/database.types";

type UploadJobRow = Database["public"]["Tables"]["upload_jobs"]["Row"];
type UploadJobInsert = Database["public"]["Tables"]["upload_jobs"]["Insert"];
type UploadJobUpdate = Database["public"]["Tables"]["upload_jobs"]["Update"];

/** Máximo para as estatísticas do dashboard (secção 10.4/18). */
const OWNER_LISTING_MAX = 200;

export interface UploadJobsRepository {
  insert(input: UploadJobInsert): Promise<UploadJobRow>;
  findById(id: string): Promise<UploadJobRow | null>;
  update(id: string, patch: UploadJobUpdate): Promise<UploadJobRow | null>;
  /** Para "uploads recentes e erros" no dashboard — vários álbuns de um dono. */
  listForAlbumIds(albumIds: string[]): Promise<UploadJobRow[]>;
}

export function createUploadJobsRepository(
  client: SupabaseClient<Database>,
): UploadJobsRepository {
  const db = client.schema("public");

  return {
    async insert(input) {
      const { data, error } = await db
        .from("upload_jobs")
        .insert(input)
        .select("*")
        .single();

      if (error) throw error;
      return data;
    },

    async findById(id) {
      const { data, error } = await db
        .from("upload_jobs")
        .select("*")
        .eq("id", id)
        .maybeSingle();

      if (error) throw error;
      return data;
    },

    async update(id, patch) {
      const { data, error } = await db
        .from("upload_jobs")
        .update(patch)
        .eq("id", id)
        .select("*")
        .maybeSingle();

      if (error) throw error;
      return data;
    },

    async listForAlbumIds(albumIds) {
      if (albumIds.length === 0) return [];

      const { data, error } = await db
        .from("upload_jobs")
        .select("*")
        .in("album_id", albumIds)
        .order("created_at", { ascending: false })
        .limit(OWNER_LISTING_MAX);

      if (error) throw error;
      return data;
    },
  };
}
