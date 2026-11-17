import express from 'express';
import { existsSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { registerFocus, type DesktopActions } from './routes';

interface FocusServerOptions {
  port: number;
  dataDir: string;
  clientDist?: string;
  desktop?: DesktopActions;
}

/** The Focus app's own server: only the Focus API, plus the Focus page from the client build. */
export function startFocusServer({ port, dataDir, clientDist, desktop }: FocusServerOptions): Promise<number> {
  const app = express();
  app.use(express.json());
  registerFocus(app, dataDir, desktop);
  app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }));

  const hasClientBuild = clientDist && existsSync(clientDist);
  if (hasClientBuild) {
    app.use(express.static(clientDist, { index: false }));
    app.get('*', (_req, res) => res.sendFile(path.join(clientDist, 'index.html')));
  }

  return new Promise((resolve) => {
    const server = app.listen(port, '127.0.0.1', () => resolve((server.address() as AddressInfo).port));
  });
}
