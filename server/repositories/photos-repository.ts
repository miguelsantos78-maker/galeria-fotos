import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db/database.types";

type PhotoRow = Database["public"]["Tables"]["photos"]["Row"];
type PhotoInsert = Database["public"]["Tables"]["photos"]["Insert"];
type PhotoUpdate = Database["public"]["Tables"]["photos"]["Update"];

export interface ListVisiblePhotosInput {
  albumId: string;
  /** Espelha a política RLS "photos_select_visible_via_session" (secção 8). */
  canModerate: boolean;
  limit: number;
  beforeSortOrder?: number;
}

export type PhotoSortField = "uploaded_at" | "captured_at";

export interface ListPhotosForOwnerInput {
  albumId: string;
  sortBy: PhotoSortField;
  limit: number;
}

/** Limite fixo para a listagem de administração (secção 10.4) — sem
 * paginação por cursor ainda, ver docs/decisions/0007. */
const OWNER_LISTING_MAX = 200;

export interface PhotosRepository {
  insert(input: PhotoInsert): Promise<PhotoRow>;
  findByAlbumAndSha256(
    albumId: string,
    sha256: string,
  ): Promise<PhotoRow | null>;
  findById(id: string): Promise<PhotoRow | null>;
  listVisibleForAlbum(input: ListVisiblePhotosInput): Promise<PhotoRow[]>;
  update(id: string, patch: PhotoUpdate): Promise<PhotoRow | null>;
  /** Todas as fotografias não eliminadas do álbum, para o painel de administração. */
  listForOwner(input: ListPhotosForOwnerInput): Promise<PhotoRow[]>;
  /** Para estatísticas do dashboard (secção 10.4/18) — vários álbuns de um dono. */
  listForAlbumIds(albumIds: string[]): Promise<PhotoRow[]>;
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

    async update(id, patch) {
      const { data, error } = await db
        .from("photos")
        .update(patch)
        .eq("id", id)
        .select("*")
        .maybeSingle();

      if (error) throw error;
      return data;
    },

    async listForOwner({ albumId, sortBy, limit }) {
      const { data, error } = await db
        .from("photos")
        .select("*")
        .eq("album_id", albumId)
        .is("deleted_at", null)
        .order(sortBy, { ascending: false, nullsFirst: false })
        .order("sort_order", { ascending: false })
        .limit(Math.min(limit, OWNER_LISTING_MAX));

      if (error) throw error;
      return data;
    },

    async listForAlbumIds(albumIds) {
      if (albumIds.length === 0) return [];

      const { data, error } = await db
        .from("photos")
        .select("*")
        .in("album_id", albumIds)
        .is("deleted_at", null);

      if (error) throw error;
      return data;
    },
  };
}
