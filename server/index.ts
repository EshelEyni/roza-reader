import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startFocusServer } from './focus/server';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const port = await startFocusServer({
  port: Number(process.env.FOCUS_PORT ?? 3002),
  dataDir: path.join(ROOT_DIR, 'data'),
  clientDist: path.join(ROOT_DIR, 'client', 'dist'),
});

console.log(`RozaReader server running on http://localhost:${port}`);
