import { app, BrowserWindow, dialog, shell } from 'electron';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { startFocusServer } from '../server/focus/server';
import { DEFAULT_THEME, themeById } from '../shared/themes';

app.setName('RozaReader');
const DEV_URL = process.env.ELECTRON_DEV_URL;
const DEV_SERVER_PORT = 3002;
const APP_DIR = path.join(__dirname, '..');
const DATA_DIR = process.env.ROZA_READER_DATA_DIR ?? (app.isPackaged ? app.getPath('userData') : path.join(APP_DIR, 'data'));
const USER_KOKORO_DIR = path.join(app.getPath('userData'), 'kokoro');
const KOKORO_DIR = app.isPackaged
  ? (existsSync(path.join(USER_KOKORO_DIR, 'service.py')) ? USER_KOKORO_DIR : path.join(process.resourcesPath, 'kokoro'))
  : path.join(APP_DIR, 'kokoro');
process.env.ROZA_READER_KOKORO_DIR ??= KOKORO_DIR;

// Matches the window to the saved theme so it doesn't flash a different color before the page paints.
function savedThemeBackground() {
  try {
    const { settings } = JSON.parse(readFileSync(path.join(DATA_DIR, 'focus', 'library.json'), 'utf8'));
    return themeById(settings?.theme ?? DEFAULT_THEME).swatch.bg;
  } catch {
    return themeById(DEFAULT_THEME).swatch.bg;
  }
}

function createWindow(url: string) {
  const window = new BrowserWindow({
    width: 1100,
    height: 820,
    minWidth: 560,
    minHeight: 480,
    title: 'RozaReader',
    icon: path.join(APP_DIR, 'assets', process.platform === 'win32' ? 'icon.ico' : 'icon.png'),
    backgroundColor: savedThemeBackground(),
  });

  window.webContents.setWindowOpenHandler(({ url: externalUrl }) => {
    shell.openExternal(externalUrl);
    return { action: 'deny' };
  });

  window.loadURL(url);
}

app.whenReady().then(async () => {
  mkdirSync(DATA_DIR, { recursive: true });

  const port = await startFocusServer({
    port: DEV_URL ? DEV_SERVER_PORT : 0,
    dataDir: DATA_DIR,
    clientDist: path.join(APP_DIR, 'client', 'dist'),
    desktop: {
      chooseFolder: async (defaultPath) => {
        const result = await dialog.showOpenDialog({ defaultPath, properties: ['openDirectory', 'createDirectory'] });
        return result.canceled ? null : result.filePaths[0] ?? null;
      },
      revealFile: async (file) => { shell.showItemInFolder(file); },
    },
  });
  const url = DEV_URL ?? `http://127.0.0.1:${port}`;

  createWindow(url);

  app.on('activate', () => {
    const hasNoWindows = BrowserWindow.getAllWindows().length === 0;
    if (hasNoWindows) createWindow(url);
  });
});

// Narration keeps the app busy on purpose; closing the window on macOS keeps RozaReader in the Dock.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
