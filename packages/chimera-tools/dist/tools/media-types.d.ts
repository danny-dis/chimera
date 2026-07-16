import { z } from 'zod';
export declare const MediaBlockSchema: z.ZodDiscriminatedUnion<"kind", [z.ZodObject<{
    kind: z.ZodLiteral<"image">;
    mime: z.ZodString;
    base64: z.ZodString;
    bytes: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    base64?: string;
    kind?: "image";
    mime?: string;
    bytes?: number;
}, {
    base64?: string;
    kind?: "image";
    mime?: string;
    bytes?: number;
}>, z.ZodObject<{
    kind: z.ZodLiteral<"pdf">;
    mime: z.ZodLiteral<"application/pdf">;
    base64: z.ZodString;
    bytes: z.ZodNumber;
    pageCount: z.ZodNumber;
    pages: z.ZodArray<z.ZodNumber, "many">;
}, "strip", z.ZodTypeAny, {
    base64?: string;
    kind?: "pdf";
    mime?: "application/pdf";
    bytes?: number;
    pageCount?: number;
    pages?: number[];
}, {
    base64?: string;
    kind?: "pdf";
    mime?: "application/pdf";
    bytes?: number;
    pageCount?: number;
    pages?: number[];
}>]>;
export type MediaBlock = z.infer<typeof MediaBlockSchema>;
//# sourceMappingURL=media-types.d.ts.map