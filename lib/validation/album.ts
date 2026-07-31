import { z } from "zod";

export const albumVisibilitySchema = z.enum(["private", "unlisted", "public"]);
export const albumStatusSchema = z.enum(["draft", "published", "archived"]);

export const createAlbumSchema = z.object({
  title: z.string().trim().min(1, "O título é obrigatório.").max(200),
  description: z.string().trim().max(2000).optional(),
  visibility: albumVisibilitySchema.default("unlisted"),
  uploadEnabled: z.boolean().default(true),
  moderationEnabled: z.boolean().default(false),
  downloadEnabled: z.boolean().default(true),
  eventStartAt: z.iso.datetime().optional(),
  eventEndAt: z.iso.datetime().optional(),
});

export type CreateAlbumInput = z.infer<typeof createAlbumSchema>;

export const updateAlbumSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  visibility: albumVisibilitySchema.optional(),
  uploadEnabled: z.boolean().optional(),
  moderationEnabled: z.boolean().optional(),
  downloadEnabled: z.boolean().optional(),
  eventStartAt: z.iso.datetime().nullable().optional(),
  eventEndAt: z.iso.datetime().nullable().optional(),
  status: albumStatusSchema.optional(),
});

export type UpdateAlbumInput = z.infer<typeof updateAlbumSchema>;
