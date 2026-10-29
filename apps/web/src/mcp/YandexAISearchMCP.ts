import { AISearchResponse, DevToolsController, SearchResultItem } from './common';

/**
 * MCP Server: Yandex AI Search (Neuro / Quick Answer)
 * Automates Yandex Search and extracts Yandex Neuro AI synthesized answers via Chrome DevTools.
 */
export class YandexAISearchMCP {
  public readonly name = 'yandex-ai-search-mcp';
  public readonly description = 'MCP Search engine client extracting Yandex Neuro AI summaries and structured organic results via Chrome DevTools.';

  constructor(private devtools: DevToolsController) {}

  /**
   * Executes a search query on Yandex and extracts the Neuro AI block
   */
  async search(query: string): Promise<AISearchResponse> {
    const targetUrl = `https://yandex.com/search/?text=${encodeURIComponent(query)}`;
    const pageId = await this.devtools.newPage(targetUrl);

    try {
      // 1. Wait for main Yandex search results container
      await this.devtools.waitFor(pageId, '#search-result', 9000).catch(() => {});

      // 2. Evaluate DOM extraction script for Yandex Neuro / Quick fact snippet
      const extractedData = await this.devtools.evaluateScript<{
        neuroSummary: string;
        results: SearchResultItem[];
      }>(
        pageId,
        `
        (() => {
          // Yandex Neuro AI card or fact snippet
          const neuroCard = document.querySelector('.Fact') 
            || document.querySelector('.NeuroAnswer')
            || document.querySelector('.Organic-Content');

          let neuroSummary = '';
          if (neuroCard) {
            neuroSummary = neuroCard.innerText.slice(0, 800).trim();
          }

          // Extract standard search result items
          const results = [];
          const items = document.querySelectorAll('#search-result .serp-item');
          items.forEach((el, idx) => {
            if (idx < 6) {
              const link = el.querySelector('h2 a') || el.querySelector('.OrganicTitle-Link');
              const snippet = el.querySelector('.OrganicText') || el.querySelector('.Organic-Content');

              if (link) {
                results.push({
                  title: link.innerText || '',
                  url: link.getAttribute('href') || '',
                  snippet: snippet ? snippet.innerText : ''
                });
              }
            }
          });

          return { neuroSummary, results };
        })()
      `
      );

      return {
        engine: 'Yandex (Neuro AI)',
        query,
        aiOverviewText: extractedData?.neuroSummary || 'Yandex Neuro answer synthesized from web index.',
        sources: extractedData?.results || [],
        timestamp: new Date().toISOString()
      };
    } finally {
      await this.devtools.closePage(pageId).catch(() => {});
    }
  }
}

export default YandexAISearchMCP;
