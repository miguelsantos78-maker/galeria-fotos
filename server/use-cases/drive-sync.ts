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
  driveProviderFactory?: (
    authClient: Auth.OAuth2Client,
  ) => DriveStorageProvider;
}

/**
 * Proporção máxima do álbum que uma única sincronização pode remover.
 * Acima disto, a passagem é recusada por inteiro (ver `assessRemoval`).
 */
const MAX_REMOVAL_RATIO = 0.2;

/**
 * Mesmo em coleções pequenas, permite sempre remover até este número —
 * sem isto, num álbum de 3 fotografias 20% arredondaria a zero e a
 * sincronização nunca chegaria a fazer nada.
 */
const MIN_REMOVAL_ALLOWANCE = 5;

export interface DriveSyncResult {
  connectionsChecked: number;
  connectionsFailed: number;
  /**
   * Ligações onde a sincronização foi recusada por precaução (ver
   * `assessRemoval`) — não é uma falha, é o mecanismo de segurança a
   * funcionar. Contado à parte de `connectionsFailed` para os dois
   * casos não se confundirem nos logs.
   */
  connectionsSkipped: number;
  photosChecked: number;
  photosRemoved: number;
}

/**
 * Decide se o resultado desta passagem é credível ao ponto de se agir
 * sobre ele.
 *
 * Esta sincronização infere eliminações por AUSÊNCIA: tudo o que não
 * aparecer na listagem do Drive é tratado como apagado. É uma inferência
 * perigosa, porque uma listagem vazia ou truncada — sem lançar erro
 * nenhum — é indistinguível de "o dono apagou tudo à mão". E a remoção
 * destrói o preview e a miniatura na Storage, de forma irreversível.
 *
 * O caso realista que motiva isto: o âmbito `drive.file` só dá acesso
 * aos ficheiros criados pela própria aplicação naquela conta. Se o
 * administrador reconectar o Drive escolhendo por engano outra conta
 * Google (cenário nada teórico — a ligação expira ao fim de 7 dias
 * enquanto o consentimento OAuth estiver em "Testing", ADR 0031), a
 * listagem passa a vir vazia e a passagem seguinte apagaria o álbum
 * inteiro, sozinha, de madrugada.
 *
 * Na dúvida, não apagar: uma fotografia a mais na galeria é um
 * incómodo, um álbum de casamento apagado não tem recuperação simples.
 */
function assessRemoval(
  missingCount: number,
  totalCount: number,
): { safe: true } | { safe: false; reason: string } {
  if (missingCount === 0) return { safe: true };

  if (missingCount === totalCount) {
    return {
      safe: false,
      reason: "drive_listing_empty",
    };
  }

  const allowance = Math.max(
    MIN_REMOVAL_ALLOWANCE,
    Math.floor(totalCount * MAX_REMOVAL_RATIO),
  );
  if (missingCount > allowance) {
    return { safe: false, reason: "removal_ratio_exceeded" };
  }

  return { safe: true };
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
    connectionsSkipped: 0,
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
      const provider = (
        deps.driveProviderFactory ?? createDriveStorageProvider
      )(authClient);

      const activePhotoIds = await provider.listActivePhotoIds();

      const albums = await deps.albums.listByOwner(connection.user_id);
      const albumsById = new Map(albums.map((album) => [album.id, album]));
      const photos = await deps.photos.listForAlbumIds(
        albums.map((album) => album.id),
      );

      result.photosChecked += photos.length;

      // Primeiro decidir, só depois apagar: a avaliação precisa do
      // total em falta, que só se conhece depois de percorrer tudo.
      const missing = photos.filter((photo) => !activePhotoIds.has(photo.id));
      const assessment = assessRemoval(missing.length, photos.length);

      if (!assessment.safe) {
        result.connectionsSkipped += 1;
        logger.error({
          operation: "driveSync.abortedUnsafe",
          connectionId: connection.id,
          reason: assessment.reason,
          missingCount: missing.length,
          totalCount: photos.length,
          message:
            "Sincronização recusada por precaução: nenhuma fotografia foi removida.",
        });
        await deps.auditLog.record({
          actor_user_id: null,
          action: "drive_sync.aborted_unsafe",
          metadata: {
            connectionId: connection.id,
            reason: assessment.reason,
            missingCount: missing.length,
            totalCount: photos.length,
          },
        });
        continue;
      }

      for (const photo of missing) {
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
