import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createKokoro } from '../server/focus/kokoro';

const runtime = process.env.ROZA_READER_KOKORO_DIR ?? (process.platform === 'win32'
  ? path.join(process.env.APPDATA!, 'RozaReader', 'kokoro')
  : path.resolve('kokoro'));
const engine = createKokoro(runtime);
const directory = await mkdtemp(path.join(os.tmpdir(), 'roza-עברית-'));
const output = path.join(directory, 'בדיקה.wav');
const words = ['Roza', 'Reader', 'is', 'ready.'];
const timeout = setTimeout(() => { engine.stop(); }, 120_000);
try {
  const result = await engine.synthesize({ text: words.join(' '), words, voice: 'af_heart', out: output }, 'high');
  assert.ok(result.duration > 0);
  assert.equal(result.words.length, words.length);
  const wav = await readFile(output);
  assert.equal(wav.subarray(0, 4).toString(), 'RIFF');
  assert.ok(wav.length > 44);
  console.log(`PASS: real Kokoro speech, ${result.words.length} word timings, Unicode output path (${result.duration}s)`);
} finally {
  clearTimeout(timeout);
  engine.stop();
  await rm(directory, { recursive: true, force: true });
}
