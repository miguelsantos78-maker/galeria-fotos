import { requireAdminApi } from "@/lib/auth/dal";
import { createSupabaseAdminClient } from "@/lib/db/supabase-admin";
import { createAlbumsRepository } from "@/server/repositories/albums-repository";
import { createShareLinksRepository } from "@/server/repositories/share-links-repository";
import { createAuditLogRepository } from "@/server/repositories/audit-log-repository";
import {
  createShareLink,
  listShareLinksForAlbum,
  toPublicShareLink,
} from "@/server/use-cases/share-links";
import { createShareLinkSchema } from "@/lib/validation/share-link";
import { jsonError, jsonOk, newRequestId } from "@/lib/api/response";

interface RouteParams {
  params: Promise<{ albumId: string }>;
}

export async function GET(_request: Request, { params }: RouteParams) {
  const requestId = newRequestId();

  try {
    const profile = await requireAdminApi();
    const { albumId } = await params;
    const supabase = createSupabaseAdminClient();

    const links = await listShareLinksForAlbum(albumId, profile.id, {
      albums: createAlbumsRepository(supabase),
      shareLinks: createShareLinksRepository(supabase),
    });

    return jsonOk(links.map(toPublicShareLink));
  } catch (error) {
    return jsonError(error, requestId);
  }
}

export async function POST(request: Request, { params }: RouteParams) {
  const requestId = newRequestId();

  try {
    const profile = await requireAdminApi();
    const { albumId } = await params;
    const input = createShareLinkSchema.parse(await request.json());
    const supabase = createSupabaseAdminClient();

    const { link, token } = await createShareLink(albumId, profile.id, input, {
      albums: createAlbumsRepository(supabase),
      shareLinks: createShareLinksRepository(supabase),
      auditLog: createAuditLogRepository(supabase),
    });

    // O token só é devolvido nesta resposta — a partir daqui só o hash existe.
    return jsonOk({ link: toPublicShareLink(link), token }, { status: 201 });
  } catch (error) {
    return jsonError(error, requestId);
  }
}
