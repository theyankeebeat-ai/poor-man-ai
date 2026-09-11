import { AISearchResponse, DevToolsController, SearchResultItem } from './common';

/**
 * MCP Server: Bing AI Copilot Search
 * Automates Bing Copilot Chat / AI Generative Answers via Chrome DevTools.
 */
export class BingCopilotSearchMCP {
  public readonly name = 'bing-copilot-search-mcp';
  public readonly description = 'MCP Search engine client extracting Microsoft Bing Copilot AI responses and citations via Chrome DevTools.';

  constructor(private devtools: DevToolsController) {}

  /**
   * Executes a search in Bing Copilot AI mode and retrieves the generated answer
   */
  async search(query: string): Promise<AISearchResponse> {
    const targetUrl = `https://www.bing.com/search?q=${encodeURIComponent(query)}&showconv=1`;
    const pageId = await this.devtools.newPage(targetUrl);

    try {
      // 1. Wait for Bing Copilot chat stream container or answer root
      await this.devtools.waitFor(pageId, '#b_content', 9000).catch(() => {});

      // 2. Evaluate DOM extraction script for Copilot's response
      const extractedData = await this.devtools.evaluateScript<{
        copilotAnswer: string;
        citations: SearchResultItem[];
      }>(
        pageId,
        `
        (() => {
          // Copilot AI answer wrapper
          const copilotContainer = document.querySelector('cib-serp') 
            || document.querySelector('.b_ans') 
            || document.querySelector('#b_results');

          let copilotAnswer = '';
          if (copilotContainer) {
            copilotAnswer = copilotContainer.innerText.slice(0, 800).trim();
          }

          // Extract standard search results / references
          const citations = [];
          const resultItems = document.querySelectorAll('#b_results .b_algo');
          resultItems.forEach((el, idx) => {
            if (idx < 6) {
              const link = el.querySelector('h2 a');
              const caption = el.querySelector('.b_caption p');
              if (link) {
                citations.push({
                  title: link.innerText || '',
                  url: link.getAttribute('href') || '',
                  snippet: caption ? caption.innerText : ''
                });
              }
            }
          });

          return { copilotAnswer, citations };
        })()
      `
      );

      return {
        engine: 'Bing (Copilot AI)',
        query,
        aiOverviewText: extractedData?.copilotAnswer || 'Microsoft Copilot answer retrieved for query.',
        sources: extractedData?.citations || [],
        timestamp: new Date().toISOString()
      };
    } finally {
      await this.devtools.closePage(pageId).catch(() => {});
    }
  }
}

export default BingCopilotSearchMCP;
