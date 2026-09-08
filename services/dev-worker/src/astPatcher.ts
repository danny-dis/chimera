import { Project, SyntaxKind, type SourceFile, type FunctionDeclaration, type ClassDeclaration, type ImportDeclaration } from 'ts-morph';
import pino from 'pino';

const log = pino({ name: 'dev-worker:ast-patcher' });

export interface PatchOperation {
  type: 'add-import' | 'remove-import' | 'add-function' | 'replace-function-body' | 'add-method' | 'replace-method' | 'add-class' | 'modify-property';
  target: string; // file path or symbol name
  code: string;
  options?: Record<string, unknown>;
}

export interface PatchResult {
  success: boolean;
  filesModified: string[];
  errors: string[];
}

export class ASTPatcher {
  private project: Project;

  constructor(private worktreePath: string) {
    this.project = new Project({
      tsConfigFilePath: `${worktreePath}/tsconfig.json`,
      skipAddingFilesFromTsConfig: true,
    });
  }

  async applyPatches(operations: PatchOperation[]): Promise<PatchResult> {
    const filesModified = new Set<string>();
    const errors: string[] = [];

    for (const op of operations) {
      try {
        const result = await this.applyPatch(op);
        if (result.success) {
          filesModified.add(op.target);
        } else {
          errors.push(result.error || `Unknown error for ${op.type} on ${op.target}`);
        }
      } catch (err) {
        errors.push(err instanceof Error ? err.message : String(err));
      }
    }

    // Save all changes
    await this.project.save();

    return {
      success: errors.length === 0,
      filesModified: Array.from(filesModified),
      errors,
    };
  }

  private async applyPatch(op: PatchOperation): Promise<{ success: boolean; error?: string }> {
    const sourceFile = this.project.getSourceFile(op.target) 
      ?? this.project.createSourceFile(op.target, '', { overwrite: true });

    switch (op.type) {
      case 'add-import':
        return this.addImport(sourceFile, op.code);
      case 'remove-import':
        return this.removeImport(sourceFile, op.code);
      case 'add-function':
        return this.addFunction(sourceFile, op.code);
      case 'replace-function-body':
        return this.replaceFunctionBody(sourceFile, op.code, op.options?.functionName as string);
      case 'add-class':
        return this.addClass(sourceFile, op.code);
      default:
        return { success: false, error: `Unknown patch type: ${op.type}` };
    }
  }

  private addImport(sourceFile: SourceFile, importCode: string): { success: boolean; error?: string } {
    try {
      sourceFile.addImportDeclaration({
        namedImports: [importCode],
        moduleSpecifier: importCode.includes('from ') ? importCode.split('from ')[1].replace(/'/g, '') : '.',
      });
      return { success: true };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  private removeImport(sourceFile: SourceFile, importName: string): { success: boolean; error?: string } {
    try {
      const imports = sourceFile.getImportDeclarations();
      for (const imp of imports) {
        const named = imp.getNamedImports();
        for (const n of named) {
          if (n.getName() === importName) {
            n.remove();
          }
        }
      }
      return { success: true };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  private addFunction(sourceFile: SourceFile, functionCode: string): { success: boolean; error?: string } {
    try {
      sourceFile.addFunction({
        name: this.extractFunctionName(functionCode),
        isExported: true,
        statements: functionCode,
      });
      return { success: true };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  private replaceFunctionBody(sourceFile: SourceFile, newBody: string, functionName: string): { success: boolean; error?: string } {
    try {
      const func = sourceFile.getFunction(functionName);
      if (!func) return { success: false, error: `Function ${functionName} not found` };
      func.setBodyText(newBody);
      return { success: true };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  private addClass(sourceFile: SourceFile, classCode: string): { success: boolean; error?: string } {
    try {
      sourceFile.addClass({
        name: this.extractClassName(classCode),
        isExported: true,
        texts: [classCode],
      });
      return { success: true };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  private extractFunctionName(code: string): string {
    const match = code.match(/function\s+(\w+)/);
    return match ? match[1] : 'unnamed';
  }

  private extractClassName(code: string): string {
    const match = code.match(/class\s+(\w+)/);
    return match ? match[1] : 'Unnamed';
  }
}