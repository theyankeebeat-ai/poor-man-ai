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
   * Types into #sb_form_q, presses Enter, then opens the Copilot nav link.
   * English label is Search or Copilot. Spanish label is Búsqueda. Href starts with /copilotsearch.
   */
  async search(query: string): Promise<AISearchResponse> {
    const pageId = await this.devtools.newPage('https://www.bing.com/?setlang=en');

    try {
      await this.devtools.waitFor(pageId, '#sb_form_q', 8000).catch(() => {});

      const typed = JSON.stringify(query);
      await this.devtools.evaluateScript(
        pageId,
        `(() => {
          const q = document.querySelector('#sb_form_q');
          const form = document.querySelector('#sb_form');
          if (!q || !form) return { submitted: false };
          q.focus();
          q.value = ${typed};
          q.dispatchEvent(new Event('input', { bubbles: true }));
          q.dispatchEvent(new KeyboardEvent('keydown', {
            key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true
          }));
          form.submit();
          return { submitted: true };
        })()`
      ).catch(() => {});

      await this.devtools.waitFor(pageId, '#b_content', 9000).catch(() => {});

      await this.devtools.evaluateScript(
        pageId,
        `(() => {
          const label = (el) => (el.innerText || el.getAttribute('aria-label') || '').replace(/\\s+/g, ' ').trim();
          const nameRe = /^(búsqueda|busqueda|search|copilot|copilot search)$/i;
          const isCopilot = (el) => /copilotsearch/i.test(el.getAttribute('href') || el.href || '');
          const candidates = Array.from(document.querySelectorAll('header nav a, a[href*="copilotsearch"]'));
          const link = candidates.find((el) => nameRe.test(label(el)) && isCopilot(el))
            || candidates.find((el) => isCopilot(el));
          if (!link) return { clicked: false };
          const style = window.getComputedStyle(link);
          const rect = link.getBoundingClientRect();
          if (style.display === 'none' || style.visibility === 'hidden' || rect.width <= 0 || rect.height <= 0) {
            return { clicked: false };
          }
          link.click();
          return { clicked: true };
        })()`
      ).catch(() => {});

      await this.devtools.waitFor(pageId, 'main', 9000).catch(() => {});

      const extractedData = await this.devtools.evaluateScript<{
        copilotAnswer: string;
        citations: SearchResultItem[];
      }>(
        pageId,
        `
        (() => {
          const copilotContainer = document.querySelector('cib-serp')
            || document.querySelector('.b_ans')
            || document.querySelector('#b_results')
            || document.querySelector('main');

          let copilotAnswer = '';
          if (copilotContainer) {
            copilotAnswer = copilotContainer.innerText.trim().slice(0, 4000);
          }

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

      const answer = extractedData?.copilotAnswer || '';
      const sources = extractedData?.citations || [];

      return {
        engine: 'Bing (Copilot AI)',
        query,
        aiOverviewText: answer,
        sources,
        rawText: JSON.stringify({ query, answer, sources }),
        timestamp: new Date().toISOString()
      };
    } finally {
      await this.devtools.closePage(pageId).catch(() => {});
    }
  }
}

export default BingCopilotSearchMCP;
