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
   * Types into the English search box, presses Enter, then opens AI Mode.
   * The tab is named “AI Mode” (Spanish: “Modo IA”). jsname="B6rgad" is only a fallback.
   */
  async search(query: string): Promise<AISearchResponse> {
    const pageId = await this.devtools.newPage('https://www.google.com/?hl=en');

    try {
      await this.devtools.waitFor(pageId, 'textarea[name="q"]', 8000).catch(() => {});
      await this.submitQuery(pageId, query);
      await this.devtools.waitFor(pageId, '#search', 9000).catch(() => {});
      await this.clickAiMode(pageId);

      // AI Mode (udm=50) has no classic #search list. Wait for the page root.
      await this.devtools.waitFor(pageId, 'main', 9000).catch(() => {});

      // Visible answer blocks only. Generated classes are a hint for this snapshot.
      const extractedData = await this.devtools.evaluateScript<{
        aiOverview: string;
        paragraphs: string[];
        bullets: string[];
        sources: SearchResultItem[];
      }>(
        pageId,
        `
        (() => {
          const clean = (value) => (value || '').replace(/\\s+/g, ' ').trim();
          const chrome = /^(sign in|share|copy|images|videos|news|maps|all|more|tools|search|ai mode|acceder|compartir|copiar|imágenes|imagenes|noticias|todo|todos|más|mas|herramientas|modo ia)$/i;
          const main = document.querySelector('main') || document.body;
          const paragraphs = [];
          const bullets = [];
          const seen = new Set();
          const push = (list, value) => {
            const text = clean(value);
            if (!text || text.length >= 800 || chrome.test(text) || seen.has(text)) return;
            seen.add(text);
            list.push(text);
          };

          document.querySelectorAll('div.n6owBd').forEach((el) => push(paragraphs, el.innerText));
          document.querySelectorAll('li.Z1qcYe, span.iNqyIf').forEach((el) => push(bullets, el.innerText));

          if (paragraphs.length === 0 && bullets.length === 0) {
            const heading = Array.from(main.querySelectorAll('h1, h2, h3, [role="heading"]'))
              .find((el) => /ai mode response|ai mode answer|respuesta del modo ia|ai mode/i.test(clean(el.innerText)));
            const root = (heading && heading.closest('main, section, [role="region"]')) || main;
            root.querySelectorAll('p').forEach((el) => push(paragraphs, el.innerText));
            root.querySelectorAll('li').forEach((el) => push(bullets, el.innerText));
          }

          if (paragraphs.length === 0 && bullets.length === 0) {
            (main.innerText || '').split('\\n').forEach((line) => push(paragraphs, line));
          }

          const sources = [];
          main.querySelectorAll('a[href]').forEach((anchor) => {
            if (sources.length >= 6) return;
            const title = clean(anchor.innerText);
            const url = anchor.href || '';
            if (!title || title.length > 80 || chrome.test(title)) return;
            if (!/^https?:/i.test(url)) return;
            if (/google\\.[^/]+\\/(search|preferences|webhp)/i.test(url)) return;
            if (sources.some((item) => item.url === url)) return;
            sources.push({ title, url, snippet: '' });
          });

          return {
            aiOverview: paragraphs.concat(bullets).join('\\n'),
            paragraphs,
            bullets,
            sources
          };
        })()
      `
      );

      const paragraphs = extractedData?.paragraphs || [];
      const bullets = extractedData?.bullets || [];
      const sources = extractedData?.sources || [];

      return {
        engine: 'Google (AI Mode)',
        query,
        aiOverviewText: extractedData?.aiOverview || paragraphs.concat(bullets).join('\n'),
        sources,
        rawText: JSON.stringify({ query, paragraphs, bullets, sources }),
        timestamp: new Date().toISOString()
      };
    } finally {
      await this.devtools.closePage(pageId).catch(() => {});
    }
  }

  /**
   * Put the query in the search box and press Enter. Form submit is the same action.
   */
  private async submitQuery(pageId: string, query: string): Promise<void> {
    const typed = JSON.stringify(query);
    await this.devtools.evaluateScript(
      pageId,
      `(() => {
        const box = document.querySelector('textarea[name="q"], input[name="q"]');
        if (!box) return { submitted: false };
        const form = box.closest('form');
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
   * One click on the visible English “AI Mode” tab. A missing control means this
   * page variant has no button. Do not retry or click through a consent wall.
   */
  private async clickAiMode(pageId: string): Promise<boolean> {
    const click = await this.devtools.evaluateScript<{ clicked: boolean }>(
      pageId,
      `(() => {
        const nameRe = /^(ai mode|modo ia)$/i;
        const isVisible = (el) => {
          if (!el || el.hidden) return false;
          const style = window.getComputedStyle(el);
          if (style.display === 'none' || style.visibility === 'hidden') return false;
          const rect = el.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0;
        };
        const label = (el) => (el.innerText || el.getAttribute('aria-label') || '').replace(/\\s+/g, ' ').trim();
        const isAiMode = (el) => /udm=50/.test(el.getAttribute('href') || el.href || '');
        const candidates = Array.from(document.querySelectorAll('a, button, [role="link"], [role="tab"]'));
        const named = candidates.find((el) => nameRe.test(label(el)) && isVisible(el) && isAiMode(el))
          || candidates.find((el) => nameRe.test(label(el)) && isVisible(el));
        const byHref = candidates.find((el) => isAiMode(el) && isVisible(el));
        const fallback = document.querySelector('button[jsname="B6rgad"]');
        const ai = named || byHref || (isVisible(fallback) ? fallback : null);
        if (!ai) return { clicked: false };
        ai.click();
        return { clicked: true };
      })()`
    ).catch(() => ({ clicked: false }));

    return !!click?.clicked;
  }
}

export default GoogleAISearchMCP;
