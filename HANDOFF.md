# Handoff: RozaReader

Read this first. It explains the app, how to work on it, and where things stand.

## 1. What the app is

1. A Mac app called **RozaReader**: an EPUB reader that narrates the book with **Kokoro** speech, running locally.
2. It highlights the current sentence and the spoken word. It has themes, saved reading positions, offline audio and audiobook export.
3. Stack: Electron + an Express server + a React/TypeScript client (Vite). Kokoro runs as a Python service.
4. It grew out of "Focus", which used to be a tab in the Personal Assistant app (`~/qbiq/db-queries`). That code is disabled there now. **All reader work happens here.**
5. Internal API paths still say `/api/focus/...`, and the data folder is still called `focus/`. That's on purpose, to stay compatible with the old library.

## 2. Where things are

1. Code: `~/qbiq/roza-reader`. Read `README.md` too.
2. GitHub: `EshelEyni/roza-reader` (private). Branch: `main` only. Latest: `bdaa100`.
3. Installed app: `/Applications/RozaReader.app`.
4. The packaged app's folder: `~/Library/Application Support/RozaReader/`
   1. `focus/`: the **live library** (books, positions, settings, cached audio). Treat it as user data.
   2. `kokoro/`: the speech runtime. It holds `service.py` plus a Python `.venv`.
5. In dev, data lives in `./data/focus/` and Kokoro in `./kokoro/` (that needs its own `.venv` from `sh kokoro/setup.sh`).
6. Overrides: `ROZA_READER_DATA_DIR`, `ROZA_READER_KOKORO_DIR`, `FOCUS_PORT` (dev API, default 3002).

## 3. Rules the user set (follow every time)

1. The library in Application Support is **live user data**. Test on a scratch copy, never on it.
2. **Only stage changes.** Commit only when the user says "Commit". Push only when asked.
3. Never create or switch branches. Commit on `main`.
4. Never force-push without explicit approval for that push.
5. After changes, rebuild and reinstall the app (section 5).
6. Answers: short, simple sentences, and numbered lists.

## 4. GitHub account setup (important)

1. This repo pushes as the **personal** account `EshelEyni`, through a local credential helper (`gh auth token --user EshelEyni`).
2. Every other repo, and `gh` itself, use the **work** account `EshelQbiq`. Never run `gh auth switch`.
3. Local author: `EshelEyni <109594932+EshelEyni@users.noreply.github.com>`.
4. `gh` commands against this repo need `GH_TOKEN=$(gh auth token --user EshelEyni)`.

## 5. Rebuild and install the Mac app

1. `npm run typecheck`
2. `npm run package`. This builds `release/mac-arm64/RozaReader.app`.
3. Quit the app: `osascript -e 'quit app "RozaReader"'`
4. **If `kokoro/service.py` changed**, copy it into the app's runtime. The app runs that copy, not the repo's:
   `cp kokoro/service.py "$HOME/Library/Application Support/RozaReader/kokoro/service.py"`
5. Replace and open: `rm -rf /Applications/RozaReader.app && cp -R release/mac-arm64/RozaReader.app /Applications/ && open -a RozaReader`
6. Check that it started: find its port with `lsof -a -p <pid> -iTCP -sTCP:LISTEN`, then `curl /api/focus/library` and `/api/focus/engine`.

## 6. How speech works (read before touching it)

1. **One Kokoro process** (`server/focus/kokoro.ts`) makes **one sentence at a time**. Requests wait in two lines: `high` (what the listener is waiting for) and `low` (read-ahead, downloads, exports). High always goes first.
2. `service.py` runs Kokoro with **4 threads at low priority** (`nice 10`). That's still about 16× faster than real time on this M4 Pro (10 threads were 18.5×). This keeps the Mac responsive and the audio from stuttering. Don't remove it.
3. Each sentence clip is trimmed to a short breath (about 0.04 s before, 0.16 s after). Word times are shifted to match.
4. Clips are cached as `<chapter>-<sentence>.wav` + `.json` under `focus/audio/<bookId>/<voice>/`. An audio cache `VERSION` file clears old clips when the format changes.
5. Starting several downloads at once is **not** faster. They all share the one line.

## 7. Offline audio

1. **Save offline** in the reader's top bar opens the dialog (`client/src/focus/OfflineChapter.tsx`).
2. **Chapter:** saves one chapter's audio and word times.
3. **Whole book** (newest feature, `bdaa100`):
   1. Saves every chapter in order. Each chapter is ready as soon as it finishes.
   2. It can stop and resume. Finished audio is kept.
   3. A failed sentence is skipped. Three failures in a row stop it.
   4. Server: `POST|GET|DELETE /api/focus/books/:id/download?voice=…` (`server/focus/routes.ts`, `server/focus/downloads.ts`).
   5. Downloads are **per voice**.
4. The user's current book: 95 chapters, about 84,000 words, about 8.5 hours of speech. A whole-book save should take about 30–60 minutes and 1.5 GB.

## 8. Testing

1. `npm run test:smoke`: fast, uses a temp library, downloads no voices. Passed at `bdaa100`.
2. `npm run test:speech`, `test:offline`, `test:reader`: real speech or Chrome. See the README.
3. A safe manual test server, on scratch data:
   1. Make a scratch folder with `data/` and `kokoro/`. Copy `service.py` in, and symlink `.venv` to the app's runtime `.venv`.
   2. Set `ROZA_READER_KOKORO_DIR` to it, and call `startFocusServer({ port, dataDir, clientDist })` from `server/focus/server.ts`.
4. In the browser, audio only plays after a **real click** (a script click is blocked). Use the browser tool's click, not `element.click()`, for Play.
5. The user's Mac is often muted. Verify playback with logs (for example, log each clip's `play`/`ended`), not by ear.

## 9. Open items

1. **Repeated last word bug:** the user heard the end of a sentence's last word repeat several times. The clips and play order were checked and are clean. The likely cause is CPU starvation of audio output while Kokoro worked on every core. The 4-thread, low-priority fix is applied but **not confirmed by ear**. If it comes back, ask whether it also happens on already-cached parts. If it does, the cause is something else.
2. The whole-book download has been tested on a small book, not yet on the user's real 95-chapter book.

## 10. Gotchas

1. The Mac's disk ignores case. `library.ts` and `Library.tsx` would clash. Use different names.
2. React runs in StrictMode in dev, so effects run twice. Don't change module state during render.
3. The packaged app starts with a bare `PATH`. The server adds `/opt/homebrew/bin` for `espeak-ng` and `ffmpeg`.
4. A browser `play()` interrupted by a newer action throws `AbortError`. That's not a failure, so don't show it as an error.
