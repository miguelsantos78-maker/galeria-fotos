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
  /** Só o número de envios falhados, sem trazer as linhas (dashboard). */
  countFailedForAlbumIds(albumIds: string[]): Promise<number>;
  /**
   * Apaga sessões de envio já concluídas ou caducadas há mais do que
   * `olderThan` (`server/use-cases/maintenance.ts`). Nunca apaga
   * fotografias — `upload_jobs` é só o registo temporário do envio em
   * curso. Devolve quantas foram apagadas.
   */
  deleteFinishedBefore(olderThan: Date): Promise<number>;
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

    async deleteFinishedBefore(olderThan) {
      const { data, error } = await db
        .from("upload_jobs")
        .delete()
        .lt("created_at", olderThan.toISOString())
        .in("status", ["completed", "failed", "expired"])
        .select("id");

      if (error) throw error;
      return data?.length ?? 0;
    },

    async countFailedForAlbumIds(albumIds) {
      if (albumIds.length === 0) return 0;

      const { count, error } = await db
        .from("upload_jobs")
        .select("*", { count: "exact", head: true })
        .in("album_id", albumIds)
        .eq("status", "failed");

      if (error) throw error;
      return count ?? 0;
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
