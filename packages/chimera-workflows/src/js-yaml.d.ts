// Minimal ambient types for the subset of js-yaml we use (loader only).
// js-yaml v4 ships no bundled type declarations and @types/js-yaml is not a
// project dependency; declaring the shape we rely on keeps typechecking strict
// without adding a new devDependency.
declare module 'js-yaml' {
  export interface LoadOptions {
    schema?: unknown;
    onWarning?(this: unknown, e: unknown): void;
    filename?: string;
    json?: boolean;
    listener?: unknown;
  }
  export function load(input: string, opts?: LoadOptions): unknown;
  const _default: { load: typeof load };
  export default _default;
}
