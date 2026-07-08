import { z } from 'zod';
declare const SecretDetectionResultSchema: z.ZodObject<{
    found: z.ZodBoolean;
    secrets: z.ZodArray<z.ZodObject<{
        type: z.ZodString;
        location: z.ZodString;
        maskedValue: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        type: string;
        location: string;
        maskedValue: string;
    }, {
        type: string;
        location: string;
        maskedValue: string;
    }>, "many">;
}, "strip", z.ZodTypeAny, {
    found: boolean;
    secrets: {
        type: string;
        location: string;
        maskedValue: string;
    }[];
}, {
    found: boolean;
    secrets: {
        type: string;
        location: string;
        maskedValue: string;
    }[];
}>;
export type SecretDetectionResult = z.infer<typeof SecretDetectionResultSchema>;
export declare class SecretDetector {
    private patterns;
    constructor();
    scan(text: string): SecretDetectionResult;
    maskSecrets(text: string): string;
    addPattern(name: string, pattern: RegExp): void;
    private registerBuiltInPatterns;
    private maskValue;
    private deduplicateSecrets;
}
export {};
//# sourceMappingURL=secret-detector.d.ts.map