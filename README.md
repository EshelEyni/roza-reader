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

### Offline chapters with word tracking

Open a chapter, choose **Save offline**, then **Download chapter**. RozaReader saves the selected voice’s audio and word timings and shows progress. Keep the app open until it says **Offline ready**; you can close the dialog or read while it saves. **Stop saving** keeps completed sentences, and **Resume download** picks up from that progress, including after restarting the app.

Once ready, use **Play with word tracking** or the normal Play button. Highlighting, seeking, and playback speed work from the saved chapter without internet access or speech generation. Each voice needs its own download. The download icon in the player still exports audio for other apps.

Kokoro requires Python 3.10–3.12. On macOS run `sh kokoro/setup.sh`. On Windows install uv or Python 3.11, then run `powershell -File kokoro/setup.ps1`. The Windows Python packages include eSpeak. The English language model is installed during setup; the voice model (~330 MB) downloads on first use. Audio export requires ffmpeg on PATH.

The Python environment is installed separately and is not bundled in desktop packages. For the packaged Windows app run `powershell -File kokoro/setup.ps1 -RuntimeDir "$env:APPDATA\RozaReader\kokoro"`. RozaReader automatically finds this per-user runtime on subsequent launches. `ROZA_READER_KOKORO_DIR` can override the runtime directory, which contains service.py and a Python environment.

Internal focus API paths and data format are retained for compatibility with existing libraries. To migrate a library, copy the original data/focus folder into this project's data directory before starting.

## Validation

Run `npm run typecheck`, `npm run build`, and `npm run test:smoke`. The smoke test uses a temporary library and checks the reader page, bundled icons, API isolation, settings persistence, EPUB validation, desktop picker integration, and engine status without downloading voice models.

After installing the speech runtime, `npm run test:speech` verifies real narration, word timings, and audio output to a Unicode filesystem path.

`npm run test:offline` checks real chapter downloads and verifies cached playback with timings after restarting the server with the speech runtime unavailable. It also checks stop/resume, voice isolation, input validation, and missing audio detection.
