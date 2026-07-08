"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MediaBlockSchema = void 0;
const zod_1 = require("zod");
exports.MediaBlockSchema = zod_1.z.discriminatedUnion('kind', [
    zod_1.z.object({
        kind: zod_1.z.literal('image'),
        mime: zod_1.z.string(),
        base64: zod_1.z.string(),
        bytes: zod_1.z.number(),
    }),
    zod_1.z.object({
        kind: zod_1.z.literal('pdf'),
        mime: zod_1.z.literal('application/pdf'),
        base64: zod_1.z.string(),
        bytes: zod_1.z.number(),
        pageCount: zod_1.z.number(),
        pages: zod_1.z.array(zod_1.z.number()),
    }),
]);
//# sourceMappingURL=media-types.js.map