import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import { readFileTool } from '../tools/filesystem.js';
import type { ToolContext } from '../tool-schema.js';
import { EventStream } from '@chimera/core';

vi.mock('pdf-parse', () => ({
  default: vi.fn(async () => ({ numpages: 5 })),
}));

let workspaceRoot: string;

function makeContext(): ToolContext {
  return {
    workspaceRoot,
    sessionId: 'test-session',
    eventStream: new EventStream(),
    costTracker: {
      setBudget: () => {},
      recordSpend: () => {},
      getSpend: () => 0,
      getRemaining: () => Infinity,
    } as any,
    permissionCheck: () => 'allow',
  };
}

describe('read_file media (images + PDF)', () => {
  beforeEach(async () => {
    workspaceRoot = path.join('/tmp', `chimera-fs-media-${Date.now()}-${Math.random()}`);
    await fs.mkdir(workspaceRoot, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(workspaceRoot, { recursive: true, force: true });
  });

  it('reads a PNG file and returns media.kind === "image"', async () => {
    const pngSig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const file = path.join(workspaceRoot, 'pixel.png');
    await fs.writeFile(file, pngSig);
    const result = await readFileTool.execute({ path: 'pixel.png' }, makeContext());
    expect(result.content).toBe('');
    expect(result.totalLines).toBe(0);
    expect(result.media?.kind).toBe('image');
    if (result.media?.kind === 'image') {
      expect(result.media.mime).toBe('image/png');
      expect(result.media.bytes).toBe(pngSig.length);
      expect(Buffer.from(result.media.base64, 'base64').equals(pngSig)).toBe(true);
    }
  });

  it('reads a PDF file and returns media.kind === "pdf"', async () => {
    const pdfBody = Buffer.from('%PDF-1.0\n1 0 obj<<>>endobj\nxref\n0 1\n0000000000 65535 f \ntrailer<<>>\nstartxref\n0\n%%EOF\n');
    const file = path.join(workspaceRoot, 'doc.pdf');
    await fs.writeFile(file, pdfBody);
    const result = await readFileTool.execute({ path: 'doc.pdf' }, makeContext());
    expect(result.media?.kind).toBe('pdf');
    if (result.media?.kind === 'pdf') {
      expect(result.media.mime).toBe('application/pdf');
      expect(result.media.bytes).toBe(pdfBody.length);
      expect(result.media.pageCount).toBe(5);
      expect(result.media.pages.length).toBeGreaterThan(0);
    }
  });
});
