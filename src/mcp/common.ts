/**
 * Shared Chrome DevTools automation client and types for search engines.
 * Communicates with Chrome DevTools Protocol / MCP tools.
 */

export interface SearchResultItem {
  title: string;
  url: string;
  snippet: string;
}

export interface AISearchResponse {
  engine: string;
  query: string;
  aiOverviewText?: string;
  sources: SearchResultItem[];
  rawText?: string;
  timestamp: string;
}

export interface DevToolsController {
  newPage(url: string): Promise<string>;
  navigatePage(pageId: string, url: string): Promise<void>;
  waitFor(pageId: string, selector: string, timeoutMs?: number): Promise<void>;
  evaluateScript<T = any>(pageId: string, script: string): Promise<T>;
  takeScreenshot(pageId: string): Promise<string>;
  closePage(pageId: string): Promise<void>;
}
