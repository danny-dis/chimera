export type ScriptRuntime = 'bun' | 'uv';
export interface ScriptEntry {
    name: string;
    path: string;
    runtime: ScriptRuntime;
}
export declare function discoverScriptsForCwd(cwd: string): Promise<Map<string, ScriptEntry>>;
//# sourceMappingURL=script-discovery.d.ts.map