import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db/database.types";
import { toPostgrestError } from "@/lib/db/postgrest-error";

type ShareLinkRow = Database["public"]["Tables"]["album_share_links"]["Row"];
type ShareLinkInsert =
  Database["public"]["Tables"]["album_share_links"]["Insert"];

export interface ShareLinksRepository {
  insert(input: ShareLinkInsert): Promise<ShareLinkRow>;
  findByTokenHash(tokenHash: string): Promise<ShareLinkRow | null>;
  listByAlbum(albumId: string): Promise<ShareLinkRow[]>;
  findByIdAndAlbum(id: string, albumId: string): Promise<ShareLinkRow | null>;
  revoke(id: string): Promise<ShareLinkRow | null>;
}

export function createShareLinksRepository(
  client: SupabaseClient<Database>,
): ShareLinksRepository {
  const db = client.schema("public");

  return {
    async insert(input) {
      const { data, error } = await db
        .from("album_share_links")
        .insert(input)
        .select("*")
        .single();

      if (error) throw toPostgrestError(error);
      return data;
    },

    async findByTokenHash(tokenHash) {
      const { data, error } = await db
        .from("album_share_links")
        .select("*")
        .eq("token_hash", tokenHash)
        .maybeSingle();

      if (error) throw toPostgrestError(error);
      return data;
    },

    async listByAlbum(albumId) {
      const { data, error } = await db
        .from("album_share_links")
        .select("*")
        .eq("album_id", albumId)
        .order("created_at", { ascending: false });

      if (error) throw toPostgrestError(error);
      return data;
    },

    async findByIdAndAlbum(id, albumId) {
      const { data, error } = await db
        .from("album_share_links")
        .select("*")
        .eq("id", id)
        .eq("album_id", albumId)
        .maybeSingle();

      if (error) throw toPostgrestError(error);
      return data;
    },

    async revoke(id) {
      const { data, error } = await db
        .from("album_share_links")
        .update({ revoked_at: new Date().toISOString() })
        .eq("id", id)
        .is("revoked_at", null)
        .select("*")
        .maybeSingle();

      if (error) throw toPostgrestError(error);
      return data;
    },
  };
}
