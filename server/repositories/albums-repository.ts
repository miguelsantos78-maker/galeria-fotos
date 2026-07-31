import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db/database.types";

type AlbumRow = Database["public"]["Tables"]["albums"]["Row"];
type AlbumInsert = Database["public"]["Tables"]["albums"]["Insert"];
type AlbumUpdate = Database["public"]["Tables"]["albums"]["Update"];

export interface AlbumsRepository {
  insert(input: AlbumInsert): Promise<AlbumRow>;
  findById(id: string): Promise<AlbumRow | null>;
  findBySlug(slug: string): Promise<AlbumRow | null>;
  listByOwner(ownerId: string): Promise<AlbumRow[]>;
  update(id: string, patch: AlbumUpdate): Promise<AlbumRow | null>;
  delete(id: string): Promise<void>;
}

/** Implementação sobre o Supabase (cliente com service role). */
export function createAlbumsRepository(
  client: SupabaseClient<Database>,
): AlbumsRepository {
  const db = client.schema("public");

  return {
    async insert(input) {
      const { data, error } = await db
        .from("albums")
        .insert(input)
        .select("*")
        .single();

      if (error) throw error;
      return data;
    },

    async findById(id) {
      const { data, error } = await db
        .from("albums")
        .select("*")
        .eq("id", id)
        .maybeSingle();

      if (error) throw error;
      return data;
    },

    async findBySlug(slug) {
      const { data, error } = await db
        .from("albums")
        .select("*")
        .eq("slug", slug)
        .maybeSingle();

      if (error) throw error;
      return data;
    },

    async listByOwner(ownerId) {
      const { data, error } = await db
        .from("albums")
        .select("*")
        .eq("owner_id", ownerId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data;
    },

    async update(id, patch) {
      const { data, error } = await db
        .from("albums")
        .update(patch)
        .eq("id", id)
        .select("*")
        .maybeSingle();

      if (error) throw error;
      return data;
    },

    async delete(id) {
      const { error } = await db.from("albums").delete().eq("id", id);
      if (error) throw error;
    },
  };
}
