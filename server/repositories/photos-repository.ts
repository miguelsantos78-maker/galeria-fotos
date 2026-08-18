import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db/database.types";
import { toPostgrestError } from "@/lib/db/postgrest-error";

type PhotoRow = Database["public"]["Tables"]["photos"]["Row"];
type PhotoInsert = Database["public"]["Tables"]["photos"]["Insert"];
type PhotoUpdate = Database["public"]["Tables"]["photos"]["Update"];

/**
 * Posição exata onde a página anterior terminou.
 *
 * `sort_order` sozinho não chega: o valor por omissão é o relógio em
 * milissegundos (ver migração 0001), por isso fotografias enviadas no
 * mesmo milissegundo — o que acontece de verdade quando há dezenas de
 * convidados a enviar ao mesmo tempo — partilham o mesmo valor. Com um
 * cursor só de `sort_order`, um `< cursor` saltava por cima de todas as
 * que empatassem com a última da página: desapareciam da galeria, em
 * silêncio, sem nunca mais serem alcançáveis (ver docs/decisions/0043).
 *
 * O `id` serve de desempate e torna a posição única.
 */
export interface PhotoCursor {
  sortOrder: number;
  id: string;
}

export interface ListVisiblePhotosInput {
  albumId: string;
  /** Espelha a política RLS "photos_select_visible_via_session" (secção 8). */
  canModerate: boolean;
  limit: number;
  before?: PhotoCursor;
  /** Só as fotografias enviadas por este utilizador (filtro "as minhas"). */
  uploadedBy?: string;
}

export type PhotoSortField = "uploaded_at" | "captured_at";

export interface ListPhotosForOwnerInput {
  albumId: string;
  sortBy: PhotoSortField;
  limit: number;
  offset?: number;
}

/**
 * Teto por página da listagem de administração (secção 10.4) — protege
 * contra um `limit` absurdo vindo do pedido, mas já não limita o total
 * visível: acima disto, o painel pagina (ver `offset`). Antes era um
 * limite absoluto de 200, o que tornava as restantes fotografias de um
 * álbum grande invisíveis e impossíveis de gerir.
 */
const OWNER_PAGE_MAX = 100;

/**
 * Tamanho de cada volta em `listForAlbumIds`. Abaixo do teto por
 * omissão do PostgREST (1000), para a paginação continuar a funcionar
 * mesmo que esse limite venha a ser configurado mais para baixo.
 */
const LIST_ALL_PAGE_SIZE = 500;

export interface PhotosRepository {
  insert(input: PhotoInsert): Promise<PhotoRow>;
  findByAlbumAndSha256(
    albumId: string,
    sha256: string,
  ): Promise<PhotoRow | null>;
  findById(id: string): Promise<PhotoRow | null>;
  listVisibleForAlbum(input: ListVisiblePhotosInput): Promise<PhotoRow[]>;
  /**
   * Só o total, sem trazer nenhuma linha — para o contador da galeria.
   * Mesmos filtros de visibilidade de `listVisibleForAlbum`.
   */
  countVisibleForAlbum(input: {
    albumId: string;
    canModerate: boolean;
    uploadedBy?: string;
  }): Promise<number>;
  update(id: string, patch: PhotoUpdate): Promise<PhotoRow | null>;
  /** Todas as fotografias não eliminadas do álbum, para o painel de administração. */
  listForOwner(input: ListPhotosForOwnerInput): Promise<PhotoRow[]>;
  /**
   * Todas as fotografias não eliminadas de vários álbuns. Usado pela
   * sincronização com o Drive (`drive-sync.ts`), que precisa mesmo de
   * percorrer cada linha — para *contar*, usar `countForAlbumIds`.
   */
  listForAlbumIds(albumIds: string[]): Promise<PhotoRow[]>;
  /** Só o total, para o dashboard (secção 10.4/18) — sem trazer linhas. */
  countForAlbumIds(albumIds: string[]): Promise<number>;
  /** As `limit` fotografias mais recentes, para "uploads recentes". */
  listRecentForAlbumIds(albumIds: string[], limit: number): Promise<PhotoRow[]>;
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

      if (error) throw toPostgrestError(error);
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

      if (error) throw toPostgrestError(error);
      return data;
    },

    async findById(id) {
      const { data, error } = await db
        .from("photos")
        .select("*")
        .eq("id", id)
        .maybeSingle();

      if (error) throw toPostgrestError(error);
      return data;
    },

    async listVisibleForAlbum({
      albumId,
      canModerate,
      limit,
      before,
      uploadedBy,
    }) {
      let query = db
        .from("photos")
        .select("*")
        .eq("album_id", albumId)
        .is("deleted_at", null);

      query = canModerate
        ? query.in("status", ["ready", "pending_review"])
        : query.eq("status", "ready");

      if (uploadedBy !== undefined) {
        query = query.eq("uploaded_by", uploadedBy);
      }

      if (before !== undefined) {
        // Comparação por par (sort_order, id), na forma que o PostgREST
        // consegue exprimir: ou o `sort_order` é menor, ou é igual e o
        // `id` desempata. Sem o segundo ramo, as fotografias empatadas
        // com a última da página anterior eram saltadas.
        query = query.or(
          `sort_order.lt.${before.sortOrder},` +
            `and(sort_order.eq.${before.sortOrder},id.lt.${before.id})`,
        );
      }

      const { data, error } = await query
        .order("sort_order", { ascending: false })
        .order("id", { ascending: false })
        .limit(limit);

      if (error) throw toPostgrestError(error);
      return data;
    },

    async countVisibleForAlbum({ albumId, canModerate, uploadedBy }) {
      // head: true — o Postgres devolve só a contagem, nenhuma linha
      // atravessa a rede.
      let query = db
        .from("photos")
        .select("*", { count: "exact", head: true })
        .eq("album_id", albumId)
        .is("deleted_at", null);

      query = canModerate
        ? query.in("status", ["ready", "pending_review"])
        : query.eq("status", "ready");

      if (uploadedBy !== undefined) {
        query = query.eq("uploaded_by", uploadedBy);
      }

      const { count, error } = await query;

      if (error) throw toPostgrestError(error);
      return count ?? 0;
    },

    async update(id, patch) {
      const { data, error } = await db
        .from("photos")
        .update(patch)
        .eq("id", id)
        .select("*")
        .maybeSingle();

      if (error) throw toPostgrestError(error);
      return data;
    },

    async listForOwner({ albumId, sortBy, limit, offset = 0 }) {
      // Paginação por deslocamento (não por cursor como na galeria
      // pública): `captured_at` pode ser nulo, o que torna um cursor
      // sobre esse campo ambíguo. Aceitável aqui — é uma listagem de
      // administração, com um álbum de cada vez e um número de páginas
      // pequeno; a regra de "cursor, não offset" da secção 14 aplica-se
      // à galeria, que continua por cursor.
      const pageSize = Math.min(limit, OWNER_PAGE_MAX);
      const { data, error } = await db
        .from("photos")
        .select("*")
        .eq("album_id", albumId)
        .is("deleted_at", null)
        .order(sortBy, { ascending: false, nullsFirst: false })
        .order("sort_order", { ascending: false })
        .range(offset, offset + pageSize - 1);

      if (error) throw toPostgrestError(error);
      return data;
    },

    async listForAlbumIds(albumIds) {
      if (albumIds.length === 0) return [];

      // Paginado à mão porque o PostgREST impõe um teto de linhas por
      // resposta (`max-rows`, 1000 por omissão no Supabase) e **não
      // sinaliza** que truncou: uma consulta sem `range` a um álbum com
      // mais de 1000 fotografias devolvia só as primeiras 1000, sem
      // erro nenhum. Quem consome isto é a sincronização com o Drive,
      // que trata ausência como eliminação — uma lista truncada era
      // exatamente o input que a salvaguarda da ADR 0038 recusa. Melhor
      // não a truncar de todo.
      const all: PhotoRow[] = [];
      let offset = 0;

      for (;;) {
        const { data, error } = await db
          .from("photos")
          .select("*")
          .in("album_id", albumIds)
          .is("deleted_at", null)
          .order("id", { ascending: true })
          .range(offset, offset + LIST_ALL_PAGE_SIZE - 1);

        if (error) throw toPostgrestError(error);
        if (!data || data.length === 0) break;

        all.push(...data);
        if (data.length < LIST_ALL_PAGE_SIZE) break;
        offset += LIST_ALL_PAGE_SIZE;
      }

      return all;
    },

    async countForAlbumIds(albumIds) {
      if (albumIds.length === 0) return 0;

      const { count, error } = await db
        .from("photos")
        .select("*", { count: "exact", head: true })
        .in("album_id", albumIds)
        .is("deleted_at", null);

      if (error) throw toPostgrestError(error);
      return count ?? 0;
    },

    async listRecentForAlbumIds(albumIds, limit) {
      if (albumIds.length === 0) return [];

      const { data, error } = await db
        .from("photos")
        .select("*")
        .in("album_id", albumIds)
        .is("deleted_at", null)
        .order("uploaded_at", { ascending: false })
        .limit(limit);

      if (error) throw toPostgrestError(error);
      return data;
    },
  };
}
