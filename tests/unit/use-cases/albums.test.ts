import { describe, expect, it } from "vitest";
import {
  createAlbum,
  deleteAlbum,
  getAlbumForOwner,
  listAlbumsForOwner,
  updateAlbum,
} from "@/server/use-cases/albums";
import {
  createFakeAlbumsRepository,
  createFakeAuditLogRepository,
  makeAlbumRow,
} from "../fakes/repositories";

describe("createAlbum", () => {
  it("cria o álbum com um slug derivado do título", async () => {
    const albums = createFakeAlbumsRepository();
    const auditLog = createFakeAuditLogRepository();

    const album = await createAlbum(
      {
        title: "Casamento da Ana e João",
        visibility: "unlisted",
        uploadEnabled: true,
        moderationEnabled: false,
        downloadEnabled: true,
        googleConnectionId: "conn-1",
        driveFolderId: "drive-folder-1",
      },
      { ownerId: "owner-1" },
      { albums, auditLog },
    );

    expect(album.slug).toBe("casamento-da-ana-e-joao");
    expect(album.owner_id).toBe("owner-1");
    expect(auditLog.entries).toHaveLength(1);
    expect(auditLog.entries[0].action).toBe("album.created");
  });

  it("resolve colisões de slug com um sufixo aleatório", async () => {
    const albums = createFakeAlbumsRepository([
      makeAlbumRow({ slug: "festa" }),
    ]);
    const auditLog = createFakeAuditLogRepository();

    const album = await createAlbum(
      {
        title: "Festa",
        visibility: "unlisted",
        uploadEnabled: true,
        moderationEnabled: false,
        downloadEnabled: true,
        googleConnectionId: "conn-1",
        driveFolderId: "drive-folder-1",
      },
      { ownerId: "owner-1" },
      { albums, auditLog },
    );

    expect(album.slug).not.toBe("festa");
    expect(album.slug.startsWith("festa-")).toBe(true);
  });
});

describe("getAlbumForOwner", () => {
  it("lança NOT_FOUND para um álbum inexistente", async () => {
    const albums = createFakeAlbumsRepository();
    await expect(
      getAlbumForOwner("nope", "owner-1", { albums }),
    ).rejects.toMatchObject({
      code: "ALBUM_NOT_FOUND",
    });
  });

  it("lança FORBIDDEN quando o álbum pertence a outro dono", async () => {
    const album = makeAlbumRow({ owner_id: "owner-1" });
    const albums = createFakeAlbumsRepository([album]);

    await expect(
      getAlbumForOwner(album.id, "owner-2", { albums }),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("devolve o álbum ao dono correto", async () => {
    const album = makeAlbumRow({ owner_id: "owner-1" });
    const albums = createFakeAlbumsRepository([album]);

    const result = await getAlbumForOwner(album.id, "owner-1", { albums });
    expect(result.id).toBe(album.id);
  });
});

describe("listAlbumsForOwner", () => {
  it("só lista álbuns do dono indicado", async () => {
    const albums = createFakeAlbumsRepository([
      makeAlbumRow({ owner_id: "owner-1" }),
      makeAlbumRow({ owner_id: "owner-2" }),
    ]);

    const result = await listAlbumsForOwner("owner-1", { albums });
    expect(result).toHaveLength(1);
    expect(result[0].owner_id).toBe("owner-1");
  });
});

describe("updateAlbum", () => {
  it("atualiza campos e regista auditoria", async () => {
    const album = makeAlbumRow({ owner_id: "owner-1", title: "Antigo" });
    const albums = createFakeAlbumsRepository([album]);
    const auditLog = createFakeAuditLogRepository();

    const updated = await updateAlbum(
      album.id,
      "owner-1",
      { title: "Novo" },
      { albums, auditLog },
    );

    expect(updated.title).toBe("Novo");
    expect(auditLog.entries[0].action).toBe("album.updated");
  });

  it("lança FORBIDDEN ao tentar atualizar o álbum de outro dono", async () => {
    const album = makeAlbumRow({ owner_id: "owner-1" });
    const albums = createFakeAlbumsRepository([album]);
    const auditLog = createFakeAuditLogRepository();

    await expect(
      updateAlbum(album.id, "owner-2", { title: "Hack" }, { albums, auditLog }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("deleteAlbum", () => {
  it("é idempotente: eliminar duas vezes não gera erro", async () => {
    const album = makeAlbumRow({ owner_id: "owner-1" });
    const albums = createFakeAlbumsRepository([album]);
    const auditLog = createFakeAuditLogRepository();

    await deleteAlbum(album.id, "owner-1", { albums, auditLog });
    await expect(
      deleteAlbum(album.id, "owner-1", { albums, auditLog }),
    ).resolves.toBeUndefined();

    expect(auditLog.entries).toHaveLength(1);
  });

  it("lança FORBIDDEN se não for o dono", async () => {
    const album = makeAlbumRow({ owner_id: "owner-1" });
    const albums = createFakeAlbumsRepository([album]);
    const auditLog = createFakeAuditLogRepository();

    await expect(
      deleteAlbum(album.id, "owner-2", { albums, auditLog }),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
});
