import { requireAdminApi } from "@/lib/auth/dal";
import { createSupabaseAdminClient } from "@/lib/db/supabase-admin";
import { createAlbumsRepository } from "@/server/repositories/albums-repository";
import { createShareLinksRepository } from "@/server/repositories/share-links-repository";
import { createAlbumSessionsRepository } from "@/server/repositories/album-sessions-repository";
import { createAuditLogRepository } from "@/server/repositories/audit-log-repository";
import {
  revokeShareLink,
  toPublicShareLink,
} from "@/server/use-cases/share-links";
import { jsonError, jsonOk, newRequestId } from "@/lib/api/response";

interface RouteParams {
  params: Promise<{ albumId: string; linkId: string }>;
}

export async function DELETE(_request: Request, { params }: RouteParams) {
  const requestId = newRequestId();

  try {
    const profile = await requireAdminApi();
    const { albumId, linkId } = await params;
    const supabase = createSupabaseAdminClient();

    const link = await revokeShareLink(albumId, linkId, profile.id, {
      albums: createAlbumsRepository(supabase),
      shareLinks: createShareLinksRepository(supabase),
      sessions: createAlbumSessionsRepository(supabase),
      auditLog: createAuditLogRepository(supabase),
    });

    return jsonOk(toPublicShareLink(link));
  } catch (error) {
    return jsonError(error, requestId);
  }
}
