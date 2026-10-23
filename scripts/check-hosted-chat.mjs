import { pathToFileURL } from 'node:url';
import { writeFile } from 'node:fs/promises';

const { chromium } = process.env.PLAYWRIGHT_PATH
  ? await import(pathToFileURL(process.env.PLAYWRIGHT_PATH).href)
  : await import('playwright');
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage();
const errors = [];
const requests = [];
const geminiRequests = [];
page.on('pageerror', error => errors.push(error.message));
page.on('request', request => {
  if (/generativelanguage\.googleapis\.com|aiplatform\.googleapis\.com/.test(request.url())) geminiRequests.push(request.url());
  if (request.url().endsWith('/chat') && request.method() === 'POST') {
    const body = request.postDataJSON();
    requests.push({ message: body.message, historyTurns: body.history?.length || 0 });
  }
});
const results = [];
try {
  await page.goto('https://ai.usavisible.com/chat', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.locator('textarea').waitFor();
  for (const question of ['What is 12 times 8?', 'Now divide that result by 4.', 'Explain why the answer is correct.']) {
    const before = requests.length;
    await page.locator('textarea').fill(question);
    const responseReady = page.waitForResponse(r => r.url().endsWith('/chat') && r.request().method() === 'POST', { timeout: 90000 });
    await page.getByTitle('Send message', { exact: true }).click();
    const response = await responseReady;
    await response.finished();
    await page.waitForFunction(() => {
      const sessions = JSON.parse(localStorage.getItem('poor_man_chat_sessions_v2') || '[]');
      const id = localStorage.getItem('poor_man_active_session_v2');
      const current = sessions.find(s => s.id === id) || sessions[0];
      const last = current?.messages?.at(-1);
      return last?.sender === 'assistant' && !!last.content?.trim();
    }, null, { timeout: 90000 });
    await page.waitForTimeout(1500);
    const answer = await page.evaluate(() => {
      const sessions = JSON.parse(localStorage.getItem('poor_man_chat_sessions_v2') || '[]');
      const id = localStorage.getItem('poor_man_active_session_v2');
      return (sessions.find(s => s.id === id) || sessions[0])?.messages?.at(-1)?.content || '';
    });
    results.push({ question, answer, httpStatus: response.status(), request: requests[before] });
    console.log(JSON.stringify(results.at(-1)));
  }
  await page.screenshot({ path: 'hosted-chat-check.png', fullPage: true });
  if (!results[0]?.answer.includes('96') || !results[1]?.answer.includes('24') || !results[2]?.answer.includes('24 multiplied by 4 equals 96')) {
    throw new Error('The hosted arithmetic follow-up chain did not pass; see hosted-chat-results.json');
  }
  if (errors.length || geminiRequests.length) throw new Error('Unexpected browser errors or Gemini requests');
} finally {
  await writeFile('hosted-chat-results.json', JSON.stringify({ results, errors, geminiRequests }, null, 2));
  await browser.close();
}
