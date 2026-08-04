import { Readable } from "node:stream";
import type {
  ConnectionHealth,
  DriveStorageProvider,
} from "@/lib/google-drive/types";

let counter = 0;
function nextId(prefix: string): string {
  counter += 1;
  return `${prefix}-${counter}`;
}

interface FakeDriveState {
  health: ConnectionHealth;
  ensureRootFolderCalls: { connectionId: string }[];
  createAlbumFolderCalls: { parentFolderId: string; albumId: string; title: string }[];
  deletedFileIds: string[];
  originalContentByFileId: Map<string, Buffer>;
  /** IDs devolvidos por `listActivePhotoIds()` — mutável nos testes para
   * simular fotografias apagadas diretamente no Drive. */
  activePhotoIds: Set<string>;
}

/** Adaptador falso para testes (secção 19/22) — não chama a API real do Google. */
export function createFakeDriveStorageProvider(
  overrides: Partial<{ health: ConnectionHealth; activePhotoIds: Set<string> }> = {},
): DriveStorageProvider & { state: FakeDriveState } {
  const state: FakeDriveState = {
    health: overrides.health ?? { ok: true, accountEmail: "owner@example.com" },
    ensureRootFolderCalls: [],
    createAlbumFolderCalls: [],
    deletedFileIds: [],
    originalContentByFileId: new Map(),
    activePhotoIds: overrides.activePhotoIds ?? new Set(),
  };

  return {
    state,
    async ensureRootFolder({ connectionId }) {
      state.ensureRootFolderCalls.push({ connectionId });
      return { folderId: nextId("root-folder") };
    },
    async createAlbumFolder({ parentFolderId, albumId, title }) {
      state.createAlbumFolderCalls.push({ parentFolderId, albumId, title });
      return { folderId: nextId("album-folder") };
    },
    async uploadOriginal({ filename, mimeType }) {
      return {
        fileId: nextId("file"),
        name: filename,
        mimeType,
        size: null,
      };
    },
    async getOriginalStream({ fileId }) {
      const content =
        state.originalContentByFileId.get(fileId) ??
        Buffer.from("conteúdo de teste", "utf8");
      return Readable.from(content);
    },
    async deleteFile({ fileId }) {
      state.deletedFileIds.push(fileId);
    },
    async verifyConnection() {
      return state.health;
    },
    async listActivePhotoIds() {
      return state.activePhotoIds;
    },
  };
}
