import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { BrowserHandle } from './types.js';

// We import playwright lazily so the package loads even if playwright
// isn't installed yet (the CLI will prompt the user to install it).
type PlaywrightModule = typeof import('playwright');
type BrowserContext = Awaited<ReturnType<PlaywrightModule['chromium']['launchPersistentContext']>>;

/**
 * Browser Manager — per-agent isolated browser profile.
 *
 * Each agent gets its own persistentContext (user data dir), so cookies,
 * localStorage, and sessions are isolated between agents. No need for
 * separate browser processes per agent — persistentContext is lightweight.
 */
export class BrowserManager {
  private playwright: PlaywrightModule | null = null;

  constructor(private baseProfileDir: string) {}

  /**
   * Lazily load playwright.
   */
  private async getPlaywright(): Promise<PlaywrightModule> {
    if (!this.playwright) {
      try {
        this.playwright = await import('playwright');
      } catch {
        throw new Error(
          'playwright is required for browser isolation. Install it: npm install playwright && npx playwright install chromium'
        );
      }
    }
    return this.playwright;
  }

  /**
   * Create an isolated browser context for an agent.
   */
  async createBrowser(agentId: string): Promise<BrowserHandle> {
    const playwright = await this.getPlaywright();
    const profileDir = resolve(this.baseProfileDir, `agent-${agentId}`);
    await mkdir(profileDir, { recursive: true });

    const context = await playwright.chromium.launchPersistentContext(profileDir, {
      headless: true,
      // ponytail: minimal args — no GPU, no sandbox (we're not running untrusted
      // code at the browser level; the agent's own code runs in a separate process).
      args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
    });

    return {
      close: async () => {
        await context.close();
      },
      getCdpEndpoint: () => {
        // CDP endpoint isn't directly exposed by persistentContext,
        // but we can get it from the browser instance
        const browser = context.browser();
        return browser ? null : null; // Simplified — full CDP would need websocket endpoint
      },
    };
  }

  /**
   * Get the profile directory path for an agent.
   */
  getProfileDir(agentId: string): string {
    return resolve(this.baseProfileDir, `agent-${agentId}`);
  }

  /**
   * Get the base profile directory.
   */
  getBaseDir(): string {
    return this.baseProfileDir;
  }
}
