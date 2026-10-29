import { AISearchResponse, DevToolsController } from './common';

/**
 * MCP Server: Brave Ask
 * Types a query, presses Enter for web search, then opens the English Ask tab.
 * Ask is the AI-mode control. button#submit-button-hidden submits web search.
 */
export class BraveAskSearchMCP {
  public readonly name = 'brave-ask-mcp';
  public readonly description = 'MCP client that searches Brave, clicks the English Ask tab, and extracts the answer text via Chrome DevTools.';

  constructor(private devtools: DevToolsController) {}

  /**
   * Fill #searchbox, press Enter, then click the visible Ask control once.
   */
  async search(query: string): Promise<AISearchResponse> {
    const pageId = await this.devtools.newPage('https://search.brave.com/');

    try {
      await this.devtools.waitFor(pageId, '#searchbox', 8000).catch(() => {});
      await this.submitQuery(pageId, query);
      await this.devtools.waitFor(pageId, 'a[href*="/ask"]', 9000).catch(() => {});
      await this.clickAsk(pageId);

      await this.devtools.waitFor(pageId, 'main', 9000).catch(() => {});

      const typed = JSON.stringify(query);
      const extracted = await this.devtools.evaluateScript<{ answer: string }>(
        pageId,
        `(() => {
          const q = ${typed};
          const text = document.body ? document.body.innerText : '';
          const titled = q ? q.charAt(0).toUpperCase() + q.slice(1) : '';
          let start = titled ? text.indexOf(titled + '\\n') : -1;
          if (start < 0 && q) start = text.toLowerCase().indexOf(q.toLowerCase());
          if (start < 0) return { answer: '' };
          const end = text.indexOf('View all');
          const slice = text.slice(start, end > start ? end : undefined);
          const chrome = /^(new conversation|ask|preguntar|images|news|videos|goggles|search|all|maps|copy|try again|elaborate)$/i;
          const answer = slice.split('\\n').map((line) => line.trim()).filter((line) => {
            if (!line) return false;
            if (chrome.test(line)) return false;
            if (/encrypted/i.test(line)) return false;
            return true;
          }).join('\\n');
          return { answer };
        })()`
      ).catch(() => ({ answer: '' }));

      const answer = extracted?.answer || '';
      return {
        engine: 'Brave (Ask)',
        query,
        aiOverviewText: answer,
        sources: [],
        rawText: JSON.stringify({ query, answer }),
        timestamp: new Date().toISOString()
      };
    } finally {
      await this.devtools.closePage(pageId).catch(() => {});
    }
  }

  /**
   * Put the query in #searchbox and press Enter. Submitting #searchform is the same action.
   */
  private async submitQuery(pageId: string, query: string): Promise<void> {
    const typed = JSON.stringify(query);
    await this.devtools.evaluateScript(
      pageId,
      `(() => {
        const box = document.querySelector('#searchbox')
          || document.querySelector('textarea[name="q"][aria-label="Search"]');
        if (!box) return { submitted: false };
        const form = document.querySelector('#searchform') || box.closest('form');
        box.focus();
        box.value = ${typed};
        box.dispatchEvent(new Event('input', { bubbles: true }));
        box.dispatchEvent(new KeyboardEvent('keydown', {
          key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true
        }));
        if (form) form.submit();
        return { submitted: true };
      })()`
    ).catch(() => {});
  }

  /**
   * One click on the visible English “Ask” tab. Href contains /ask.
   * button#submit-llm-button is only a fallback. Do not retry.
   */
  private async clickAsk(pageId: string): Promise<boolean> {
    const click = await this.devtools.evaluateScript<{ clicked: boolean }>(
      pageId,
      `(() => {
        const nameRe = /^(ask|preguntar)$/i;
        const isVisible = (el) => {
          if (!el || el.hidden) return false;
          const style = window.getComputedStyle(el);
          if (style.display === 'none' || style.visibility === 'hidden') return false;
          const rect = el.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0;
        };
        const label = (el) => (el.innerText || el.getAttribute('aria-label') || '').replace(/\\s+/g, ' ').trim();
        const isAsk = (el) => (el.getAttribute('href') || el.href || '').indexOf('/ask') !== -1;
        const candidates = Array.from(document.querySelectorAll('a, button, [role="link"], [role="tab"]'));
        const named = candidates.find((el) => nameRe.test(label(el)) && isVisible(el) && isAsk(el))
          || candidates.find((el) => nameRe.test(label(el)) && isVisible(el));
        const byHref = candidates.find((el) => isAsk(el) && isVisible(el));
        const fallback = document.querySelector('button#submit-llm-button');
        const ask = named || byHref || (isVisible(fallback) ? fallback : null);
        if (!ask) return { clicked: false };
        ask.click();
        return { clicked: true };
      })()`
    ).catch(() => ({ clicked: false }));

    return !!click?.clicked;
  }
}

export default BraveAskSearchMCP;
