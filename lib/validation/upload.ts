import { z } from "zod";

export const initiateUploadSchema = z.object({
  clientUploadId: z.string().trim().min(1).max(200),
  filename: z.string().trim().min(1).max(255),
  expectedSize: z.number().int().positive(),
});

export type InitiateUploadInput = z.infer<typeof initiateUploadSchema>;
