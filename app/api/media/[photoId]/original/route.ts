import { Readable } from "node:stream";
import { createSupabaseServerClient } from "@/lib/db/supabase-server";
import { createSupabaseAdminClient } from "@/lib/db/supabase-admin";
import { createAlbumsRepository } from "@/server/repositories/albums-repository";
import { createAlbumSessionsRepository } from "@/server/repositories/album-sessions-repository";
import { createGoogleConnectionsRepository } from "@/server/repositories/google-connections-repository";
import { createPhotosRepository } from "@/server/repositories/photos-repository";
import { getOriginalForViewer } from "@/server/use-cases/media";
import { buildContentDispositionHeader } from "@/lib/media/filenames";
import { AppError, jsonError, newRequestId } from "@/lib/api/response";

interface RouteParams {
  params: Promise<{ photoId: string }>;
}

/**
 * Transmite o original a partir do Drive (secção 5.4/14) — nunca devolve
 * um URL do Google ou um token ao cliente. Sem cache partilhado: o
 * acesso depende sempre da sessão de álbum atual, que pode expirar ou
 * ser revogada a qualquer momento.
 */
export async function GET(_request: Request, { params }: RouteParams) {
  const requestId = newRequestId();

  try {
    const { photoId } = await params;

    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      throw new AppError(
        "ALBUM_SESSION_INVALID",
        "Sessão de álbum inválida ou expirada.",
        401,
      );
    }

    const adminClient = createSupabaseAdminClient();
    const media = await getOriginalForViewer(photoId, user.id, {
      photos: createPhotosRepository(adminClient),
      albums: createAlbumsRepository(adminClient),
      sessions: createAlbumSessionsRepository(adminClient),
      connections: createGoogleConnectionsRepository(adminClient),
    });

    const webStream = Readable.toWeb(
      media.stream as Readable,
    ) as ReadableStream<Uint8Array>;

    return new Response(webStream, {
      headers: {
        "Content-Type": media.mimeType,
        "Content-Disposition": buildContentDispositionHeader(media.filename),
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    return jsonError(error, requestId);
  }
}
