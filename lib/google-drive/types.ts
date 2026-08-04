/**
 * Interface do adaptador de armazenamento no Google Drive (secção 12).
 * Isola a camada de domínio da biblioteca `googleapis`, para poder
 * evoluir o transporte (ex.: upload retomável) sem tocar nos casos de
 * uso, e para permitir um adaptador falso nos testes
 * (`tests/unit/fakes/drive-provider.ts`).
 */

export interface UploadOriginalInput {
  parentFolderId: string;
  filename: string;
  mimeType: string;
  body: NodeJS.ReadableStream | Buffer;
  appProperties: Record<string, string>;
}

export interface DriveFileResult {
  fileId: string;
  name: string;
  mimeType: string;
  size: number | null;
}

export interface ConnectionHealth {
  ok: boolean;
  accountEmail: string | null;
  error?: string;
}

export interface DriveStorageProvider {
  ensureRootFolder(input: { connectionId: string }): Promise<{ folderId: string }>;
  createAlbumFolder(input: {
    parentFolderId: string;
    albumId: string;
    title: string;
  }): Promise<{ folderId: string }>;
  uploadOriginal(input: UploadOriginalInput): Promise<DriveFileResult>;
  getOriginalStream(input: { fileId: string }): Promise<NodeJS.ReadableStream>;
  deleteFile(input: { fileId: string }): Promise<void>;
  verifyConnection(): Promise<ConnectionHealth>;
  /**
   * IDs (`appProperties.liveGalleryPhotoId`) de todas as fotografias
   * ainda presentes (não na reciclagem) no Drive desta ligação — usado
   * para detetar fotografias apagadas diretamente no Drive, fora da
   * aplicação (`server/use-cases/drive-sync.ts`).
   */
  listActivePhotoIds(): Promise<Set<string>>;
}
