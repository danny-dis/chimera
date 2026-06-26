import { z } from 'zod';

export const MediaBlockSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('image'),
    mime: z.string(),
    base64: z.string(),
    bytes: z.number(),
  }),
  z.object({
    kind: z.literal('pdf'),
    mime: z.literal('application/pdf'),
    base64: z.string(),
    bytes: z.number(),
    pageCount: z.number(),
    pages: z.array(z.number()),
  }),
]);

export type MediaBlock = z.infer<typeof MediaBlockSchema>;
