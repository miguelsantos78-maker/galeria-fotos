import { requireAdminApi } from "@/lib/auth/dal";
import { createSupabaseAdminClient } from "@/lib/db/supabase-admin";
import { createAlbumsRepository } from "@/server/repositories/albums-repository";
import { createGoogleConnectionsRepository } from "@/server/repositories/google-connections-repository";
import { listAlbumsForOwner } from "@/server/use-cases/albums";
import { createAlbumSchema } from "@/lib/validation/album";
import { AppError, jsonError, jsonOk, newRequestId } from "@/lib/api/response";

export async function GET() {
  const requestId = newRequestId();

  try {
    const profile = await requireAdminApi();
    const supabase = createSupabaseAdminClient();
    const albums = await listAlbumsForOwner(profile.id, {
      albums: createAlbumsRepository(supabase),
    });

    return jsonOk(albums);
  } catch (error) {
    return jsonError(error, requestId);
  }
}

export async function POST(request: Request) {
  const requestId = newRequestId();

  try {
    const profile = await requireAdminApi();
    createAlbumSchema.parse(await request.json());

    const supabase = createSupabaseAdminClient();
    const connections = createGoogleConnectionsRepository(supabase);
    const connection = await connections.findActiveByUser(profile.id);

    if (!connection) {
      throw new AppError(
        "GOOGLE_DRIVE_NOT_CONNECTED",
        "Ligue o Google Drive antes de criar um álbum.",
        409,
      );
    }

    // TODO(Fase 3): chamar DriveStorageProvider.createAlbumFolder() para obter
    // um drive_folder_id real e só então chamar server/use-cases/albums.ts#createAlbum().
    // Enquanto essa integração não existir, é mais seguro recusar o pedido do
    // que gravar um drive_folder_id inventado.
    throw new AppError(
      "GOOGLE_DRIVE_INTEGRATION_PENDING",
      "A criação de pastas no Google Drive ainda não está implementada. Esta funcionalidade fica disponível na Fase 3.",
      501,
    );
  } catch (error) {
    return jsonError(error, requestId);
  }
}
