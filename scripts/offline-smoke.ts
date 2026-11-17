import assert from 'node:assert/strict';
import express from 'express';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { registerFocus } from '../server/focus/routes';
import { createChapterDownloads } from '../server/focus/downloads';

// Check de-duplication and stopping without discarding a completed sentence.
const jobs = createChapterDownloads();
let release!: () => void;
let calls = 0;
let completed = 0;
const gate = new Promise<void>(resolve => { release = resolve; });
const ensure = async () => { calls++; await gate; completed++; };
jobs.start('book/voice/0', 2, ensure);
jobs.start('book/voice/0', 2, ensure);
assert.equal(calls, 1);
const stopping = jobs.stop('book/voice/0');
release();
await stopping;
assert.equal(calls, 1);
assert.equal((await jobs.status('book/voice/0', 2, async index => index < completed)).state, 'partial');
jobs.start('book/voice/0', 2, async index => { completed = Math.max(completed, index + 1); });
await new Promise(resolve => setTimeout(resolve, 0));
assert.equal((await jobs.status('book/voice/0', 2, async index => index < completed)).state, 'ready');

const dataDir = await mkdtemp(path.join(os.tmpdir(), 'roza-offline-'));
const previousRuntime = process.env.ROZA_READER_KOKORO_DIR;
process.env.ROZA_READER_KOKORO_DIR = previousRuntime ?? (process.platform === 'win32'
  ? path.join(process.env.APPDATA!, 'RozaReader', 'kokoro') : path.resolve('kokoro'));
let close: (() => Promise<void>) | undefined;
async function open() {
  const app = express();
  app.use(express.json());
  const controls = registerFocus(app, dataDir);
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  close = async () => { controls.stop(); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); };
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}
try {
  await mkdir(path.join(dataDir, 'focus/books/offline-test'), { recursive: true });
  await writeFile(path.join(dataDir, 'focus/books/offline-test/chapters.json'), JSON.stringify([{ title: 'Offline test', paragraphs: ['Hello reader. This chapter works offline.'] }]));
  await writeFile(path.join(dataDir, 'focus/library.json'), JSON.stringify({ settings: {}, books: [{ id: 'offline-test', title: 'Test', chapterTitles: ['Offline test'], chapterWordCounts: [6], position: { chapter: 0, word: 0 } }] }));
  let base = await open();
  const route = '/api/focus/books/offline-test/chapters/0/download?voice=af_heart';
  assert.equal((await (await fetch(base + route)).json()).state, 'missing');
  assert.equal((await fetch(base + route.replace('/0/', '/-1/'))).status, 400);
  assert.equal((await fetch(base + route.replace('af_heart', 'invalid'))).status, 400);
  assert.equal((await fetch(base + route.replace('/0/', '/5/'))).status, 404);
  await fetch(base + route, { method: 'POST' });
  let state;
  const deadline = Date.now() + 120_000;
  do {
    state = await (await fetch(base + route)).json();
    if (state.state === 'error') throw Error(state.error);
    if (state.state === 'ready') break;
    await new Promise(resolve => setTimeout(resolve, 300));
  } while (Date.now() < deadline);
  assert.equal(state.state, 'ready');
  assert.equal(state.completed, 2);
  await close!();
  // Reopen the server with no speech runtime at all. Every sentence must still
  // return audio and timings from disk; no generation can succeed in this phase.
  process.env.ROZA_READER_KOKORO_DIR = path.join(dataDir, 'missing-runtime');
  base = await open();
  assert.equal((await (await fetch(base + route)).json()).state, 'ready');
  assert.equal((await (await fetch(base + route.replace('af_heart', 'bf_emma'))).json()).state, 'missing');
  for (let sentence = 0; sentence < 2; sentence++) {
    const response = await fetch(base + `/api/focus/books/offline-test/audio?chapter=0&sentence=${sentence}&voice=af_heart`);
    assert.equal(response.status, 200);
    const clip = await response.json();
    assert.ok(clip.words.length > 0);
    assert.ok(clip.duration > 0);
    const audio = await fetch(base + clip.url);
    assert.equal(audio.status, 200);
    assert.equal(Buffer.from(await audio.arrayBuffer()).subarray(0, 4).toString(), 'RIFF');
  }
  assert.equal((await (await fetch(base + '/api/focus/engine')).json()).state, 'missing');
  // A missing clip must never continue to report ready.
  await rm(path.join(dataDir, 'focus/audio/offline-test/af_heart/0-1.wav'));
  assert.equal((await (await fetch(base + route)).json()).state, 'partial');
  assert.ok(JSON.parse(await readFile(path.join(dataDir, 'focus/audio/offline-test/af_heart/0-0.json'), 'utf8')).words.length);
  console.log('PASS: download, progress, validation, stop/resume, voice isolation, restart, offline audio with word timings, missing clip detection');
} finally {
  await close?.();
  if (previousRuntime === undefined) delete process.env.ROZA_READER_KOKORO_DIR;
  else process.env.ROZA_READER_KOKORO_DIR = previousRuntime;
  await rm(dataDir, { recursive: true, force: true });
}
