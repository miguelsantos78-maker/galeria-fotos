import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db/database.types";

type PhotoRow = Database["public"]["Tables"]["photos"]["Row"];
type PhotoInsert = Database["public"]["Tables"]["photos"]["Insert"];

export interface ListVisiblePhotosInput {
  albumId: string;
  /** Espelha a política RLS "photos_select_visible_via_session" (secção 8). */
  canModerate: boolean;
  limit: number;
  beforeSortOrder?: number;
}

export interface PhotosRepository {
  insert(input: PhotoInsert): Promise<PhotoRow>;
  findByAlbumAndSha256(
    albumId: string,
    sha256: string,
  ): Promise<PhotoRow | null>;
  findById(id: string): Promise<PhotoRow | null>;
  listVisibleForAlbum(input: ListVisiblePhotosInput): Promise<PhotoRow[]>;
}

/**
 * Implementação sobre o Supabase (cliente com service role) — usada a
 * partir de Route Handlers que já validaram autorização (secção 8: a
 * escrita em `photos` nunca acontece diretamente do cliente). Como o
 * cliente com service role ignora RLS, `listVisibleForAlbum` replica
 * manualmente o mesmo filtro que a política `photos_select_visible_via_session`
 * aplicaria.
 */
export function createPhotosRepository(
  client: SupabaseClient<Database>,
): PhotosRepository {
  const db = client.schema("public");

  return {
    async insert(input) {
      const { data, error } = await db
        .from("photos")
        .insert(input)
        .select("*")
        .single();

      if (error) throw error;
      return data;
    },

    async findByAlbumAndSha256(albumId, sha256) {
      const { data, error } = await db
        .from("photos")
        .select("*")
        .eq("album_id", albumId)
        .eq("sha256", sha256)
        .is("deleted_at", null)
        .maybeSingle();

      if (error) throw error;
      return data;
    },

    async findById(id) {
      const { data, error } = await db
        .from("photos")
        .select("*")
        .eq("id", id)
        .maybeSingle();

      if (error) throw error;
      return data;
    },

    async listVisibleForAlbum({
      albumId,
      canModerate,
      limit,
      beforeSortOrder,
    }) {
      let query = db
        .from("photos")
        .select("*")
        .eq("album_id", albumId)
        .is("deleted_at", null);

      query = canModerate
        ? query.in("status", ["ready", "pending_review"])
        : query.eq("status", "ready");

      if (beforeSortOrder !== undefined) {
        query = query.lt("sort_order", beforeSortOrder);
      }

      const { data, error } = await query
        .order("sort_order", { ascending: false })
        .limit(limit);

      if (error) throw error;
      return data;
    },
  };
}
