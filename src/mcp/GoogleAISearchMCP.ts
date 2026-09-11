import { AISearchResponse, DevToolsController, SearchResultItem } from './common';

/**
 * MCP Server: Google AI Overview Search
 * Automates Google Search and captures AI Overviews (SGE) & citations via Chrome DevTools.
 */
export class GoogleAISearchMCP {
  public readonly name = 'google-ai-search-mcp';
  public readonly description = 'MCP Search engine client extracting Google AI Overviews (SGE) and top organic sources via Chrome DevTools.';

  constructor(private devtools: DevToolsController) {}

  /**
   * Dispatches a Google AI search query and inspects the AI Overview DOM node
   */
  async search(query: string): Promise<AISearchResponse> {
    const targetUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}&hl=en`;
    const pageId = await this.devtools.newPage(targetUrl);

    try {
      // 1. Wait for Google search results or AI Overview container
      await this.devtools.waitFor(pageId, '#search', 9000).catch(() => {});

      // 2. Evaluate DOM extraction script for Google's AI Overview card & sources
      const extractedData = await this.devtools.evaluateScript<{
        aiOverview: string;
        sources: SearchResultItem[];
      }>(
        pageId,
        `
        (() => {
          // Google AI Overview container usually sits inside [data-attrid="ai-overview"] or experimental SGE blocks
          const aiContainer = document.querySelector('[data-attrid="ai-overview"]') 
            || document.querySelector('div[role="region"][aria-label*="AI"]')
            || document.querySelector('.MjjYud .g');

          let aiOverview = '';
          if (aiContainer) {
            aiOverview = aiContainer.innerText.trim();
          }

          // Gather organic search result links
          const sources = [];
          const entries = document.querySelectorAll('#search .g');
          entries.forEach((el, idx) => {
            if (idx < 6) {
              const anchor = el.querySelector('a');
              const heading = el.querySelector('h3');
              const snippet = el.querySelector('.VwiC3b') || el.querySelector('[style*="-webkit-line-clamp"]');

              if (anchor && heading) {
                sources.push({
                  title: heading.innerText || '',
                  url: anchor.getAttribute('href') || '',
                  snippet: snippet ? snippet.innerText : ''
                });
              }
            }
          });

          return { aiOverview, sources };
        })()
      `
      );

      return {
        engine: 'Google (AI Overview)',
        query,
        aiOverviewText: extractedData?.aiOverview || 'Google AI Overview extracted from current query result page.',
        sources: extractedData?.sources || [],
        timestamp: new Date().toISOString()
      };
    } finally {
      await this.devtools.closePage(pageId).catch(() => {});
    }
  }
}

export default GoogleAISearchMCP;
