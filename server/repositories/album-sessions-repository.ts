import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db/database.types";
import { toPostgrestError } from "@/lib/db/postgrest-error";

type AlbumSessionRow = Database["public"]["Tables"]["album_sessions"]["Row"];
type AlbumSessionInsert =
  Database["public"]["Tables"]["album_sessions"]["Insert"];

export interface AlbumSessionsRepository {
  insert(input: AlbumSessionInsert): Promise<AlbumSessionRow>;
  expireByShareLink(shareLinkId: string): Promise<void>;
  findValidForUser(
    albumId: string,
    userId: string,
  ): Promise<AlbumSessionRow | null>;
  /**
   * Apaga sessões expiradas há mais do que `olderThan` — cada abertura
   * de um link cria uma linha nova, por isso sem isto a tabela cresce
   * indefinidamente (`server/use-cases/maintenance.ts`). Devolve
   * quantas foram apagadas.
   */
  deleteExpiredBefore(olderThan: Date): Promise<number>;
}

export function createAlbumSessionsRepository(
  client: SupabaseClient<Database>,
): AlbumSessionsRepository {
  const db = client.schema("public");

  return {
    async insert(input) {
      const { data, error } = await db
        .from("album_sessions")
        .insert(input)
        .select("*")
        .single();

      if (error) throw toPostgrestError(error);
      return data;
    },

    async expireByShareLink(shareLinkId) {
      const { error } = await db
        .from("album_sessions")
        .update({ expires_at: new Date().toISOString() })
        .eq("share_link_id", shareLinkId)
        .gt("expires_at", new Date().toISOString());

      if (error) throw toPostgrestError(error);
    },

    async deleteExpiredBefore(olderThan) {
      const { data, error } = await db
        .from("album_sessions")
        .delete()
        .lt("expires_at", olderThan.toISOString())
        .select("id");

      if (error) throw toPostgrestError(error);
      return data?.length ?? 0;
    },

    async findValidForUser(albumId, userId) {
      const { data, error } = await db
        .from("album_sessions")
        .select("*")
        .eq("album_id", albumId)
        .eq("user_id", userId)
        .gt("expires_at", new Date().toISOString())
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw toPostgrestError(error);
      return data;
    },
  };
}
