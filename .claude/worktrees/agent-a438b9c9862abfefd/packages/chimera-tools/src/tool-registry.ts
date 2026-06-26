import type { ToolDefinition, ToolContext, ToolResult, ValidationResult } from './tool-schema.js';

export class ToolRegistry {
  private tools: Map<string, ToolDefinition> = new Map();

  register(tool: ToolDefinition): void {
    if (this.tools.has(tool.name)) {
      throw new Error(`Tool "${tool.name}" is already registered`);
    }
    this.tools.set(tool.name, tool);
  }

  get(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  getAll(): ToolDefinition[] {
    return Array.from(this.tools.values());
  }

  getByCategory(category: string): ToolDefinition[] {
    return this.getAll().filter((tool) => tool.category === category);
  }

  getByPermissionLevel(level: string): ToolDefinition[] {
    return this.getAll().filter((tool) => tool.permissionLevel === level);
  }

  has(name: string): boolean {
    return this.tools.has(name);
  }

  unregister(name: string): boolean {
    return this.tools.delete(name);
  }

  validateParams(name: string, params: Record<string, unknown>): ValidationResult {
    const tool = this.get(name);
    if (!tool) {
      return { valid: false, errors: [`Tool "${name}" not found`] };
    }

    const result = tool.parameters.safeParse(params);
    if (!result.success) {
      const errors = result.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`);
      return { valid: false, errors };
    }

    return { valid: true };
  }

  /**
   * Parse and validate params, returning the parsed data with schema
   * defaults applied. Use this when invoking a tool so `.default()` values
   * declared in the Zod schema are honored.
   */
  parseParams<T = Record<string, unknown>>(name: string, params: Record<string, unknown>): T {
    const tool = this.get(name);
    if (!tool) {
      throw new Error(`Tool "${name}" not found`);
    }
    return tool.parameters.parse(params) as T;
  }

  async execute(
    name: string,
    params: Record<string, unknown>,
    context: ToolContext,
  ): Promise<ToolResult> {
    const tool = this.get(name);
    if (!tool) {
      return {
        success: false,
        error: `Tool "${name}" not found`,
        duration: 0,
      };
    }

    // Parse with defaults applied (Zod's parse() throws on failure).
    let parsedParams: Record<string, unknown>;
    try {
      parsedParams = tool.parameters.parse(params) as Record<string, unknown>;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        error: `Invalid params: ${message}`,
        duration: 0,
      };
    }

    const startTime = Date.now();

    try {
      const data = await tool.execute(parsedParams as Record<string, never>, context);
      const duration = Date.now() - startTime;

      // Validate return value
      const returnResult = tool.returns.safeParse(data);
      if (!returnResult.success) {
        return {
          success: false,
          error: `Invalid return value: ${returnResult.error.errors.map((e) => e.message).join(', ')}`,
          duration,
        };
      }

      return {
        success: true,
        data: data as Record<string, unknown>,
        duration,
      };
    } catch (err: unknown) {
      const duration = Date.now() - startTime;
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
        duration,
      };
    }
  }
}
