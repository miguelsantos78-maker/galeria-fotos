import "server-only";
import type { Auth } from "googleapis";
import type { AlbumsRepository } from "@/server/repositories/albums-repository";
import type { PhotosRepository } from "@/server/repositories/photos-repository";
import type { GoogleConnectionsRepository } from "@/server/repositories/google-connections-repository";
import type { AuditLogRepository } from "@/server/repositories/audit-log-repository";
import type { PreviewStorage } from "@/lib/media/preview-storage";
import type { DriveStorageProvider } from "@/lib/google-drive/types";
import { decryptSecret } from "@/lib/security/encryption";
import { createAuthenticatedClient } from "@/lib/google-drive/oauth-client";
import { createDriveStorageProvider } from "@/lib/google-drive/drive-provider";
import { logger } from "@/lib/observability/logger";
import { finalizePhotoRemoval } from "./photo-removal";

interface DriveSyncDeps {
  connections: GoogleConnectionsRepository;
  albums: AlbumsRepository;
  photos: PhotosRepository;
  auditLog: AuditLogRepository;
  previewStorage: PreviewStorage;
  /** Injetável para testes ("adaptador mock" — secção 19/22). */
  driveProviderFactory?: (authClient: Auth.OAuth2Client) => DriveStorageProvider;
}

export interface DriveSyncResult {
  connectionsChecked: number;
  connectionsFailed: number;
  photosChecked: number;
  photosRemoved: number;
}

/**
 * Deteta fotografias apagadas diretamente no Google Drive (fora da
 * aplicação) e reflete essa eliminação aqui — sincronização
 * unidirecional Drive → app. A secção 25 do CLAUDE.md marca
 * "sincronização bidirecional de alterações feitas manualmente no
 * Drive" como fora do âmbito do MVP; isto cobre só o sentido pedido
 * explicitamente pelo administrador (apagar no Drive apaga na app),
 * não o inverso nem a deteção de ficheiros adicionados diretamente lá.
 *
 * Pensado para correr periodicamente (ver
 * app/api/cron/sync-drive-deletions e vercel.json). Cada ligação Google
 * falha de forma independente — um erro numa não impede as restantes.
 */
export async function syncDeletedDrivePhotos(
  deps: DriveSyncDeps,
): Promise<DriveSyncResult> {
  const connections = await deps.connections.listAllActive();

  const result: DriveSyncResult = {
    connectionsChecked: 0,
    connectionsFailed: 0,
    photosChecked: 0,
    photosRemoved: 0,
  };

  for (const connection of connections) {
    result.connectionsChecked += 1;

    try {
      const refreshToken = decryptSecret(
        connection.encrypted_refresh_token,
        connection.token_key_version,
      );
      const authClient = createAuthenticatedClient(refreshToken);
      const provider = (deps.driveProviderFactory ?? createDriveStorageProvider)(
        authClient,
      );

      const activePhotoIds = await provider.listActivePhotoIds();

      const albums = await deps.albums.listByOwner(connection.user_id);
      const albumsById = new Map(albums.map((album) => [album.id, album]));
      const photos = await deps.photos.listForAlbumIds(
        albums.map((album) => album.id),
      );

      for (const photo of photos) {
        result.photosChecked += 1;
        if (activePhotoIds.has(photo.id)) continue;

        const album = albumsById.get(photo.album_id);
        if (!album) continue;

        await finalizePhotoRemoval(
          photo,
          album,
          "photo.deleted_from_drive",
          null,
          deps,
        );
        result.photosRemoved += 1;
      }
    } catch (error) {
      result.connectionsFailed += 1;
      logger.error({
        operation: "driveSync.connection",
        connectionId: connection.id,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return result;
}
