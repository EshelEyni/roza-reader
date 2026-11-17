import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startFocusServer } from '../server/focus/server';

const root = fileURLToPath(new URL('..', import.meta.url));
const dataDir = await mkdtemp(path.join(os.tmpdir(), 'roza-reader-smoke-'));
let exitCode = 0;
try {
  const port = await startFocusServer({ port: 0, dataDir, clientDist: path.join(root, 'client/dist'), desktop: { chooseFolder: async () => dataDir, revealFile: async () => {} } });
  const base = `http://127.0.0.1:${port}`;
  const html = await (await fetch(base)).text();
  assert.match(html, /<title>RozaReader<\/title>/);
  for (const resource of ['/images/favicon.ico', '/images/icon-192x192.png']) {
    const response = await fetch(base + resource);
    assert.equal(response.status, 200);
    assert.ok((await response.arrayBuffer()).byteLength > 0);
  }
  const library = await (await fetch(base + '/api/focus/library')).json();
  assert.deepEqual(library.books, []);
  assert.equal(library.settings.exportFolder, '~/Music/RozaReader');
  const settingsResponse = await fetch(base + '/api/focus/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ speed: 1.25 }) });
  assert.equal(settingsResponse.status, 200);
  const saved = JSON.parse(await readFile(path.join(dataDir, 'focus/library.json'), 'utf8'));
  assert.equal(saved.settings.speed, 1.25);
  const picker = await (await fetch(base + '/api/focus/choose-folder', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).json();
  assert.equal(picker.folder, dataDir);
  const invalid = await fetch(base + '/api/focus/books', { method: 'POST', headers: { 'Content-Type': 'application/epub+zip' }, body: 'invalid epub' });
  assert.equal(invalid.status, 422);
  assert.equal((await fetch(base + '/api/queries')).status, 404);
  const engine = await (await fetch(base + '/api/focus/engine')).json();
  assert.ok(engine.state);
  console.log('PASS: reader page, Roza icons, isolated API, settings persistence, EPUB validation, desktop picker, engine status');
} catch (error) {
  console.error(error);
  exitCode = 1;
} finally {
  await rm(dataDir, { recursive: true, force: true });
  process.exit(exitCode);
}
