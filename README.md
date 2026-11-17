# RozaReader

Standalone EPUB reader with Kokoro narration, word highlighting, themes, reading progress, and audiobook export. The Roza icons are bundled locally for the web app and Electron. No sibling repository is required.

## Run

Requires Node.js 22+.

```sh
npm ci
npm run dev
```

Open http://localhost:5174. The API uses port 3002 (override with FOCUS_PORT). For production: npm run build, then npm start and open http://localhost:3002.

## Desktop

- npm run electron:dev — desktop with frontend hot reload.
- npm run electron — build and launch.
- npm run package — package for the current operating system with the Roza icon.

Development data lives in data/focus/. Packaged apps store data in Electron's per-user RozaReader directory, so the installation can move. ROZA_READER_DATA_DIR overrides the desktop data location.

## Speech and audio export

Kokoro requires Python 3.10–3.12, espeak-ng, and ffmpeg (for exports). On macOS run sh kokoro/setup.sh. On Windows install Python 3.11, espeak-ng and ffmpeg on PATH, then run powershell -File kokoro/setup.ps1. The voice model (~330 MB) downloads on first use.

The Python environment is installed separately and is not bundled in desktop packages. For packaged apps set ROZA_READER_KOKORO_DIR to the absolute path of a configured kokoro folder containing service.py and .venv.

Internal focus API paths and data format are retained for compatibility with existing libraries. To migrate a library, copy the original data/focus folder into this project's data directory before starting.

## Validation

Run `npm run typecheck`, `npm run build`, and `npm run test:smoke`. The smoke test uses a temporary library and checks the reader page, bundled icons, API isolation, settings persistence, EPUB validation, desktop picker integration, and engine status without downloading voice models.
