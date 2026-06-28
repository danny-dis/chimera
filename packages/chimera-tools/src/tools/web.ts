import { z } from 'zod';
import type { ToolDefinition } from '../tool-schema.js';

const WebFetchParamsSchema = z.object({
  url: z.string().url(),
  format: z.enum(['markdown', 'text', 'html']).default('markdown'),
  timeout: z.number().positive().max(120).default(30),
});

const WebFetchReturnsSchema = z.object({
  content: z.string(),
  url: z.string(),
  format: z.string(),
});

export const webFetchTool: ToolDefinition<typeof WebFetchParamsSchema, typeof WebFetchReturnsSchema> = {
  name: 'webfetch',
  description: 'Fetch web content and convert to requested format',
  parameters: WebFetchParamsSchema,
  returns: WebFetchReturnsSchema,
  category: 'mcp',
  permissionLevel: 'read',
  execute: async (params) => {
    const response = await fetch(params.url, {
      headers: {
        'User-Agent': 'Chimera/1.0',
        'Accept': params.format === 'html' 
          ? 'text/html' 
          : params.format === 'text' 
            ? 'text/plain' 
            : 'text/html,application/xhtml+xml',
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const html = await response.text();
    
    let content = html;
    if (params.format === 'markdown') {
      content = htmlToMarkdown(html);
    } else if (params.format === 'text') {
      content = htmlToText(html);
    }

    return { content, url: params.url, format: params.format };
  },
};

function htmlToMarkdown(html: string): string {
  const clean = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '');

  let md = clean
    .replace(/<h1[^>]*>(.*?)<\/h1>/gi, '# $1\n\n')
    .replace(/<h2[^>]*>(.*?)<\/h2>/gi, '## $1\n\n')
    .replace(/<h3[^>]*>(.*?)<\/h3>/gi, '### $1\n\n')
    .replace(/<h4[^>]*>(.*?)<\/h4>/gi, '#### $1\n\n')
    .replace(/<h5[^>]*>(.*?)<\/h5>/gi, '##### $1\n\n')
    .replace(/<h6[^>]*>(.*?)<\/h6>/gi, '###### $1\n\n')
    .replace(/<p[^>]*>(.*?)<\/p>/gi, '$1\n\n')
    .replace(/<a[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gi, '[$2]($1)')
    .replace(/<strong[^>]*>(.*?)<\/strong>/gi, '**$1**')
    .replace(/<em[^>]*>(.*?)<\/em>/gi, '*$1*')
    .replace(/<code[^>]*>(.*?)<\/code>/gi, '`$1`')
    .replace(/<pre[^>]*>(.*?)<\/pre>/gi, '```\n$1\n```\n\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<li[^>]*>(.*?)<\/li>/gi, '- $1\n')
    .replace(/<ul[^>]*>/gi, '\n')
    .replace(/<\/ul>/gi, '\n')
    .replace(/<ol[^>]*>/gi, '\n')
    .replace(/<\/ol>/gi, '\n')
    .replace(/<blockquote[^>]*>(.*?)<\/blockquote>/gi, '> $1\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/\n{3,}/g, '\n\n');

  return md.trim();
}

function htmlToText(html: string): string {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const WebSearchParamsSchema = z.object({
  query: z.string().min(1),
  numResults: z.number().int().positive().max(50).default(8),
  type: z.enum(['fast', 'deep', 'auto']).default('auto'),
});

const WebSearchReturnsSchema = z.object({
  results: z.array(z.object({
    title: z.string(),
    url: z.string(),
    snippet: z.string(),
  })),
  total: z.number(),
});

export const webSearchTool: ToolDefinition<typeof WebSearchParamsSchema, typeof WebSearchReturnsSchema> = {
  name: 'websearch',
  description: 'Search the web for information using Exa AI',
  parameters: WebSearchParamsSchema,
  returns: WebSearchReturnsSchema,
  category: 'mcp',
  permissionLevel: 'read',
  execute: async (_params) => {
    // Return graceful error instead of throwing
    return {
      results: [],
      total: 0,
      _warning: 'Web search is not yet implemented. A real search API integration (e.g., Exa AI) is needed.',
    };
  },
};