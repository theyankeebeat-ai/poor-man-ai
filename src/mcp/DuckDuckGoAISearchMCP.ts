import { AISearchResponse, DevToolsController, SearchResultItem } from './common';

/**
 * MCP Server: DuckDuckGo AI Search
 * Automates DuckDuckGo DuckAssist / AI Chat Mode via Chrome DevTools.
 */
export class DuckDuckGoAISearchMCP {
  public readonly name = 'duckduckgo-ai-search-mcp';
  public readonly description = 'MCP Search engine client extracting DuckDuckGo AI-synthesized answers and organic references via Chrome DevTools.';

  constructor(private devtools: DevToolsController) {}

  /**
   * Executes an AI search query on DuckDuckGo using Chrome DevTools automation
   */
  async search(query: string): Promise<AISearchResponse> {
    const targetUrl = `https://duckduckgo.com/?q=${encodeURIComponent(query)}&ia=chat`;
    const pageId = await this.devtools.newPage(targetUrl);

    try {
      // 1. Wait for DuckDuckGo DuckAssist / AI answer or search layout
      await this.devtools.waitFor(pageId, '[data-testid="mainline"]', 8000).catch(() => {});

      // 2. Scrape synthesized AI summary & reference cards via injected DevTools script
      const extractedData = await this.devtools.evaluateScript<{
        aiSummary: string;
        results: SearchResultItem[];
      }>(
        pageId,
        `
        (() => {
          // Extract DuckDuckGo AI answer text
          const aiBlock = document.querySelector('[data-testid="duckassist-answer"]') 
            || document.querySelector('.module--duckassist')
            || document.querySelector('[data-testid="chat-message-assistant"]');
          const aiSummary = aiBlock ? aiBlock.innerText.trim() : '';

          // Extract standard reference links
          const results = [];
          const links = document.querySelectorAll('article[data-testid="result"]');
          links.forEach((el, index) => {
            if (index < 6) {
              const titleEl = el.querySelector('h2 a');
              const snippetEl = el.querySelector('[data-result="snippet"]');
              if (titleEl) {
                results.push({
                  title: titleEl.innerText || '',
                  url: titleEl.getAttribute('href') || '',
                  snippet: snippetEl ? snippetEl.innerText : ''
                });
              }
            }
          });

          return { aiSummary, results };
        })()
      `
      );

      return {
        engine: 'DuckDuckGo (AI Mode)',
        query,
        aiOverviewText: extractedData?.aiSummary || 'AI answer generated based on top results.',
        sources: extractedData?.results || [],
        timestamp: new Date().toISOString()
      };
    } finally {
      await this.devtools.closePage(pageId).catch(() => {});
    }
  }
}

export default DuckDuckGoAISearchMCP;
