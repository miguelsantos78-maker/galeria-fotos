/**
 * Caminhos determinísticos para os derivados no bucket `photo-previews`
 * (secção 13.11). Só `preview_path` é persistido em `photos` — o
 * caminho da thumbnail é sempre derivável a partir de `albumId`/`photoId`
 * (já conhecidos sempre que o preview é), pelo que não precisa de coluna
 * própria (ver docs/decisions/0005-fase-4-upload-processamento.md).
 */

export function buildPreviewPath(albumId: string, photoId: string): string {
  return `albums/${albumId}/${photoId}/preview.webp`;
}

export function buildThumbnailPath(albumId: string, photoId: string): string {
  return `albums/${albumId}/${photoId}/thumbnail.webp`;
}
