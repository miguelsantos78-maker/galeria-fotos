import type { PreviewStorage } from "@/lib/media/preview-storage";

export interface FakePreviewStorage extends PreviewStorage {
  uploads: Map<string, Buffer>;
  failNextUpload: boolean;
}

export function createFakePreviewStorage(): FakePreviewStorage {
  const fake: FakePreviewStorage = {
    uploads: new Map<string, Buffer>(),
    failNextUpload: false,
    async upload(path, buffer) {
      if (fake.failNextUpload) {
        fake.failNextUpload = false;
        throw new Error("Falha simulada de armazenamento.");
      }
      fake.uploads.set(path, buffer);
    },
    async remove(paths) {
      for (const path of paths) fake.uploads.delete(path);
    },
  };
  return fake;
}
