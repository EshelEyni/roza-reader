import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { createServer } from 'vite';
import { scriptOf } from '../shared/focus';

const executablePath = process.env.CHROME_PATH ?? [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome', '/usr/bin/chromium',
].find(existsSync);
if (!executablePath) throw Error('Set CHROME_PATH to a Chrome/Chromium executable');
const vite = await createServer({ server: { port: 0, strictPort: false } });
await vite.listen();
const browser = await chromium.launch({ executablePath, headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
try {
  const page = await browser.newPage({ viewport: { width: 1100, height: 850 } });
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const chapters = [{ title: 'Long chapter', paragraphs: Array.from({ length: 2000 }, (_, i) => `Paragraph ${i} has several words for reading. Another sentence follows with words to highlight.`) }];
  const script = scriptOf(chapters[0]);
  const book = { id: 'long-book', title: 'Long book', author: 'Test', chapterTitles: ['Long chapter'], chapterWordCounts: [script.wordCount], position: { chapter: 0, word: script.paragraphs[1000][0].words[0].index }, chapters, hasCover: false, coverColors: ['#000', '#fff'] };
  const settings = { voiceId: 'af_heart', speed: 1, exportFolder: '~/Music', lastBookId: book.id };
  // Short local WAVs exercise real HTMLAudioElement transitions without synthesis.
  const wav = Buffer.alloc(44 + 24000);
  wav.write('RIFF', 0); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8);
  wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(24000, 24); wav.writeUInt32LE(48000, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34);
  wav.write('data', 36); wav.writeUInt32LE(wav.length - 44, 40);
  await page.route('**/api/focus/**', async route => {
    const url = new URL(route.request().url());
    const p = url.pathname;
    if (p.endsWith('.wav')) return route.fulfill({ contentType: 'audio/wav', body: wav });
    if (p.endsWith('/library')) return route.fulfill({ json: { books: [book], settings } });
    if (p.endsWith('/long-book')) return route.fulfill({ json: book });
    if (p.endsWith('/audio')) {
      const index = Number(url.searchParams.get('sentence'));
      return route.fulfill({ json: { url: `/api/focus/audio/${index}.wav`, duration: 0.5, words: script.sentences[index].words.map((_, i, words) => ({ start: i * 0.5 / words.length, end: (i + 1) * 0.5 / words.length })) } });
    }
    if (p.endsWith('/download')) return route.fulfill({ json: { state: 'ready', completed: 4000, total: 4000 } });
    if (p.endsWith('/position')) return route.fulfill({ status: 204 });
    if (p.endsWith('/engine') || p.endsWith('/start')) return route.fulfill({ json: { state: 'ready' } });
    return route.fulfill({ json: settings });
  });
  const base = vite.resolvedUrls!.local[0];
  await page.goto(base);
  await page.waitForSelector('.focus-reader');
  await page.waitForTimeout(1000);
  await page.waitForSelector('.focus-word.current', {state:'attached', timeout:5000});
  const inViewport = () => page.evaluate(() => {
    const target = document.querySelector('.focus-sentence.current')!.getBoundingClientRect();
    const view = document.querySelector('.focus-reader-scroll')!.getBoundingClientRect();
    return target.top >= view.top && target.top < view.bottom;
  });
  await page.waitForTimeout(600);
  assert.ok(await inViewport(), 'saved reading position must be restored into view');
  const metrics = await page.evaluate(() => ({ nodes: document.querySelector('.focus-text')!.querySelectorAll('*').length, paragraphs: document.querySelectorAll('.focus-virtual-paragraph').length }));
  assert.equal(metrics.paragraphs, 100);
  assert.ok(metrics.nodes < 600, `too many DOM nodes: ${metrics.nodes}`);
  await page.locator('.focus-reader-scroll').evaluate(el => { el.scrollTop = el.scrollHeight * 0.85; });
  await page.waitForTimeout(300);
  const range = await page.locator('.focus-virtual-paragraph').evaluateAll(nodes => nodes.map(el => Number(el.getAttribute('data-index'))));
  assert.ok(range[0] > 1000, 'scrolling must rotate mounted paragraphs');
  assert.equal(range.length, 100);
  await page.locator('.focus-seek').fill(String(script.paragraphs[100][0].words[0].index));
  await page.waitForTimeout(500);
  assert.ok(await inViewport(), 'seeking must mount and reveal a distant paragraph');
  await page.getByTitle('Larger text (+)').click();
  await page.setViewportSize({ width: 600, height: 850 });
  await page.waitForTimeout(500);
  assert.equal(await page.locator('.focus-virtual-paragraph').count(), 100);
  assert.ok(await inViewport(), 'font and viewport resize must preserve the active sentence in view');
  assert.ok(await page.locator('.focus-reader-scroll').evaluate(el => el.clientHeight > 100 && el.scrollHeight > el.clientHeight));
  await page.locator('.focus-seek').fill('0');
  await page.waitForTimeout(300);
  await page.evaluate(() => {
    (window as any).audioEvents = [];
    const play = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function () {
      (window as any).audioEvents.push({ kind: 'play', time: performance.now(), src: this.src });
      this.addEventListener('ended', () => (window as any).audioEvents.push({ kind: 'ended', time: performance.now() }), { once: true, capture: true });
      return play.call(this);
    };
  });
  await page.locator('.focus-play').click();
  await page.waitForTimeout(2200);
  await page.locator('.focus-play').click();
  const events = await page.evaluate(() => (window as any).audioEvents as { kind: string; time: number }[]);
  const gaps = events.flatMap((event, i) => event.kind === 'ended' && events[i + 1]?.kind === 'play' ? [events[i + 1].time - event.time] : []);
  assert.ok(gaps.length >= 2, 'must play consecutive sentences');
  assert.ok(Math.max(...gaps) < 80, `sentence handoff waited ${Math.max(...gaps)}ms`);
  assert.deepEqual(errors, []);
  console.log(`PASS: 2,000-paragraph chapter, ${metrics.nodes} DOM nodes, 100 mounted paragraphs, saved-position restore, scrolling, seeking, font/viewport resize, sentence handoff max ${Math.max(...gaps).toFixed(1)}ms`);
} finally {
  await browser.close();
  await vite.close();
}
