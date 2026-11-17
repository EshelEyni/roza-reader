import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import express, { type Express } from 'express';
import {
  DEFAULT_VOICE_ID,
  EXPORT_FORMATS,
  FOCUS_VOICES,
  FONT_SIZES,
  PLAYBACK_SPEEDS,
  isVoiceId,
  scriptOf,
  type ExportRequest,
  type FocusBook,
  type FocusBookSummary,
  type FocusChapter,
  type FocusSettings,
  type SentenceAudio,
} from '../../shared/focus';
import { THEME_IDS } from '../../shared/themes';
import { createJsonStore } from '../jsonStore';
import { route } from '../route';
import { EpubError, parseEpub } from './epub';
import { createExporter, expandHome } from './exporter';
import { createKokoro, type Priority } from './kokoro';
import { createChapterDownloads } from './downloads';

const run = promisify(execFile);

interface FocusLibrary {
  books: FocusBookSummary[];
  settings: FocusSettings;
}

const DEFAULT_SETTINGS: FocusSettings = { voiceId: DEFAULT_VOICE_ID, speed: 1, exportFolder: '~/Music/RozaReader' };

const COVER_COLORS: [string, string][] = [
  ['#2f4858', '#c97b4a'],
  ['#3d2c5a', '#e0a96d'],
  ['#4a5d4f', '#d8c8a8'],
  ['#7a2e2e', '#e9c46a'],
  ['#33415c', '#9db4c0'],
  ['#5c3d2e', '#e0b089'],
];

const COVER_EXTENSIONS: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif', 'image/webp': 'webp', 'image/svg+xml': 'svg' };

const ID_PATTERN = /^[\w-]{1,64}$/;

// Bump when the way clips are made changes; older cached audio is then cleared once.
const AUDIO_CACHE_VERSION = '2';

const PREVIEW_TEXT = (name: string) => `Hi, I'm ${name}. I'd be glad to read this book to you, one chapter at a time.`;

/** RozaReader: EPUB library, Kokoro narration and audio export. Files live in data/focus/. */
export interface DesktopActions {
  chooseFolder: (current: string) => Promise<string | null>;
  revealFile: (file: string) => Promise<void>;
}

export function registerFocus(app: Express, dataDir: string, desktop?: DesktopActions) {
  const focusDir = path.join(dataDir, 'focus');
  const booksDir = path.join(focusDir, 'books');
  const audioDir = path.join(focusDir, 'audio');
  const library = createJsonStore<FocusLibrary>(path.join(focusDir, 'library.json'), { books: [], settings: DEFAULT_SETTINGS });
  const kokoro = createKokoro(process.env.ROZA_READER_KOKORO_DIR ?? path.resolve(dataDir, '..', 'kokoro'));
  const exporter = createExporter(path.join(focusDir, 'exports'));
  const downloads = createChapterDownloads();
  // A sentence is made once even when playback, read-ahead and an export ask for it together.
  const inFlight = new Map<string, Promise<SentenceAudio>>();
  const chapterCache = new Map<string, FocusChapter[]>();

  const readLibrary = async (): Promise<FocusLibrary> => {
    const saved = await library.read();
    return { books: saved.books ?? [], settings: { ...DEFAULT_SETTINGS, ...saved.settings } };
  };

  // Writes go one after another, so two quick updates can't drop each other.
  let updates: Promise<unknown> = Promise.resolve();
  const updateLibrary = <T>(change: (current: FocusLibrary) => { next: FocusLibrary; result: T }) => {
    const result = updates.then(async () => {
      const { next, result: value } = change(await readLibrary());
      await library.write(next);
      return value;
    });
    updates = result.catch(() => {});
    return result;
  };

  const bookDir = (bookId: string) => path.join(booksDir, bookId);

  const loadChapters = async (bookId: string) => {
    const cached = chapterCache.get(bookId);
    if (cached) return cached;
    const chapters: FocusChapter[] = JSON.parse(await readFile(path.join(bookDir(bookId), 'chapters.json'), 'utf8'));
    chapterCache.set(bookId, chapters);
    return chapters;
  };

  const findBook = async (bookId: string) => (await readLibrary()).books.find((book) => book.id === bookId);

  const loadBook = async (bookId: string): Promise<FocusBook | null> => {
    const summary = await findBook(bookId);
    return summary ? { ...summary, chapters: await loadChapters(summary.id) } : null;
  };

  const cachedSentence = async (bookId: string, voice: string, chapter: number, sentence: number): Promise<SentenceAudio | null> => {
    await clearOldAudio;
    const key = `${bookId}/${voice}/${chapter}-${sentence}`;
    try {
      const timing = JSON.parse(await readFile(path.join(audioDir, `${key}.json`), 'utf8'));
      const size = (await stat(path.join(audioDir, `${key}.wav`))).size;
      const expected = scriptOf((await loadChapters(bookId))[chapter]).sentences[sentence]?.words.length;
      const valid = size > 44 && Number.isFinite(timing.duration) && timing.duration > 0 && Array.isArray(timing.words)
        && timing.words.length === expected && timing.words.every((word: { start: number; end: number }) =>
          word && Number.isFinite(word.start) && Number.isFinite(word.end) && word.start >= 0 && word.end >= word.start);
      return valid ? { url: `/api/focus/audio/${key}.wav`, ...timing } : null;
    } catch { return null; }
  };

  /** Speaks one sentence (or returns it from the cache) and gives its file, length and word times. */
  const ensureSentence = async (bookId: string, voice: string, chapterIndex: number, sentenceIndex: number, priority: Priority) => {
    await clearOldAudio;
    const key = `${bookId}/${voice}/${chapterIndex}-${sentenceIndex}`;
    const folder = path.join(audioDir, bookId, voice);
    const wavFile = path.join(folder, `${chapterIndex}-${sentenceIndex}.wav`);
    const timingFile = path.join(folder, `${chapterIndex}-${sentenceIndex}.json`);
    const url = `/api/focus/audio/${key}.wav`;

    const cached = await cachedSentence(bookId, voice, chapterIndex, sentenceIndex);
    if (cached) return { file: wavFile, audio: cached };

    const pending = inFlight.get(key);
    if (pending) return { file: wavFile, audio: await pending };

    const making = (async () => {
      const chapters = await loadChapters(bookId);
      const sentence = scriptOf(chapters[chapterIndex]).sentences[sentenceIndex];
      if (!sentence) throw new Error('No such sentence.');
      const words = sentence.words.map((word) => word.text);
      await mkdir(folder, { recursive: true });
      const result = await kokoro.synthesize({ text: words.join(' '), words, voice, out: wavFile }, priority);
      const timing = { duration: result.duration, words: result.words.map(([start, end]) => ({ start, end })) };
      await writeFile(timingFile, JSON.stringify(timing));
      return { url, ...timing };
    })();
    inFlight.set(key, making);
    try {
      return { file: wavFile, audio: await making };
    } finally {
      inFlight.delete(key);
    }
  };

  // Cached clips made the old way (e.g. with long silences) are dropped on start.
  const clearOldAudio = (async () => {
    const versionFile = path.join(audioDir, 'VERSION');
    const version = existsSync(versionFile) ? (await readFile(versionFile, 'utf8')).trim() : null;
    if (version === AUDIO_CACHE_VERSION) return;
    await rm(audioDir, { recursive: true, force: true });
    await mkdir(audioDir, { recursive: true });
    await writeFile(versionFile, AUDIO_CACHE_VERSION);
  })().catch(() => {});

  app.use('/api/focus/audio', express.static(audioDir, { maxAge: '1d', fallthrough: false }));

  app.get('/api/focus/library', route(async (_req, res) => {
    res.json(await readLibrary());
  }));

  app.post(
    '/api/focus/books',
    express.raw({ type: () => true, limit: '300mb' }),
    route(async (req, res) => {
      const fileName = decodeURIComponent(String(req.header('X-File-Name') ?? 'book.epub'));
      if (!Buffer.isBuffer(req.body) || !req.body.length) return res.status(400).json({ error: 'The file was empty.' });

      let parsed;
      try {
        parsed = parseEpub(req.body);
      } catch (error) {
        const message = error instanceof EpubError ? error.message : `This EPUB could not be read (${(error as Error).message}).`;
        return res.status(422).json({ error: message });
      }

      const id = randomUUID();
      const dir = bookDir(id);
      await mkdir(dir, { recursive: true });
      await writeFile(path.join(dir, 'book.epub'), req.body);
      await writeFile(path.join(dir, 'chapters.json'), JSON.stringify(parsed.chapters));
      const coverExtension = parsed.cover && COVER_EXTENSIONS[parsed.cover.mediaType];
      if (parsed.cover && coverExtension) await writeFile(path.join(dir, `cover.${coverExtension}`), parsed.cover.data);

      const book = await updateLibrary((current) => {
        const summary: FocusBookSummary = {
          id,
          title: parsed.title || fileName.replace(/\.epub$/i, ''),
          author: parsed.author || 'Unknown author',
          fileName,
          importedAt: new Date().toISOString(),
          hasCover: Boolean(coverExtension),
          coverColors: COVER_COLORS[current.books.length % COVER_COLORS.length],
          chapterTitles: parsed.chapters.map((chapter) => chapter.title),
          chapterWordCounts: parsed.chapters.map((chapter) => scriptOf(chapter).wordCount),
          position: { chapter: 0, word: 0 },
        };
        return { next: { ...current, books: [summary, ...current.books] }, result: summary };
      });
      res.status(201).json(book);
    })
  );

  app.get('/api/focus/books/:id', route(async (req, res) => {
    const book = ID_PATTERN.test(req.params.id) ? await loadBook(req.params.id) : null;
    if (!book) return res.status(404).json({ error: 'Book not found' });
    res.json(book);
  }));

  app.get('/api/focus/books/:id/cover', route(async (req, res) => {
    if (!ID_PATTERN.test(req.params.id)) return res.status(404).end();
    const file = Object.values(COVER_EXTENSIONS)
      .map((extension) => path.join(bookDir(req.params.id), `cover.${extension}`))
      .find((candidate) => existsSync(candidate));
    if (!file) return res.status(404).end();
    res.sendFile(file, { maxAge: '7d' });
  }));

  app.delete('/api/focus/books/:id', route(async (req, res) => {
    const { id } = req.params;
    if (!ID_PATTERN.test(id)) return res.status(404).end();
    await downloads.stopBook(id);
    await updateLibrary((current) => ({ next: { ...current, books: current.books.filter((book) => book.id !== id) }, result: null }));
    chapterCache.delete(id);
    await rm(bookDir(id), { recursive: true, force: true });
    await rm(path.join(audioDir, id), { recursive: true, force: true });
    res.status(204).end();
  }));

  app.put('/api/focus/books/:id/position', route(async (req, res) => {
    const { chapter, word } = (req.body ?? {}) as { chapter?: unknown; word?: unknown };
    const isValid = Number.isInteger(chapter) && Number.isInteger(word) && (chapter as number) >= 0 && (word as number) >= 0;
    if (!isValid) return res.status(400).json({ error: 'Send chapter and word as whole numbers' });

    const found = await updateLibrary((current) => {
      const exists = current.books.some((book) => book.id === req.params.id);
      const books = current.books.map((book) =>
        book.id === req.params.id ? { ...book, position: { chapter: chapter as number, word: word as number } } : book
      );
      return { next: { ...current, books }, result: exists };
    });
    if (!found) return res.status(404).json({ error: 'Book not found' });
    res.status(204).end();
  }));

  app.put('/api/focus/settings', route(async (req, res) => {
    const { voiceId, speed, exportFolder, lastBookId, theme, fontSize } = (req.body ?? {}) as Partial<FocusSettings>;
    const isValid =
      (theme === undefined || THEME_IDS.includes(theme)) &&
      (fontSize === undefined || FONT_SIZES.includes(fontSize)) &&
      (lastBookId === undefined || (typeof lastBookId === 'string' && ID_PATTERN.test(lastBookId))) &&
      (voiceId === undefined || isVoiceId(voiceId)) &&
      (speed === undefined || PLAYBACK_SPEEDS.includes(speed)) &&
      (exportFolder === undefined || (typeof exportFolder === 'string' && exportFolder.trim() !== ''));
    if (!isValid) return res.status(400).json({ error: 'Invalid RozaReader settings' });

    const settings = await updateLibrary((current) => {
      const next = {
        ...current.settings,
        ...(voiceId && { voiceId }),
        ...(speed && { speed }),
        ...(exportFolder && { exportFolder: exportFolder.trim() }),
        ...(lastBookId && { lastBookId }),
        ...(theme && { theme }),
        ...(fontSize && { fontSize }),
      };
      return { next: { ...current, settings: next }, result: next };
    });
    res.json(settings);
  }));

  app.get('/api/focus/engine', (_req, res) => {
    res.json(kokoro.status());
  });

  for (const method of ['get', 'post', 'delete'] as const) {
    app[method]('/api/focus/books/:id/chapters/:chapter/download', route(async (req, res) => {
      const chapter = Number(req.params.chapter);
      const voice = String(req.query.voice ?? '');
      if (!ID_PATTERN.test(req.params.id) || !Number.isInteger(chapter) || chapter < 0 || !isVoiceId(voice)) {
        return res.status(400).json({ error: 'Send a valid chapter and voice' });
      }
      const book = await loadBook(req.params.id);
      if (!book) return res.status(404).json({ error: 'Book not found' });
      if (!book.chapters[chapter]) return res.status(404).json({ error: 'Chapter not found' });
      const total = scriptOf(book.chapters[chapter]).sentences.length;
      const key = `${book.id}/${voice}/${chapter}`;
      if (method === 'post') downloads.start(key, total, index => ensureSentence(book.id, voice, chapter, index, 'low'));
      if (method === 'delete') await downloads.stop(key);
      const status = await downloads.status(key, total, async index => Boolean(await cachedSentence(book.id, voice, chapter, index)));
      res.status(method === 'post' && status.state === 'downloading' ? 202 : 200).json(status);
    }));
  }

  // Loads the model in the background so the first Play doesn't wait for it.
  app.post('/api/focus/engine/start', (_req, res) => {
    kokoro.start();
    res.json(kokoro.status());
  });

  app.get('/api/focus/books/:id/audio', route(async (req, res) => {
    const chapter = Number(req.query.chapter);
    const sentence = Number(req.query.sentence);
    const voice = String(req.query.voice ?? '');
    const priority: Priority = req.query.priority === 'low' ? 'low' : 'high';
    const isValid = ID_PATTERN.test(req.params.id) && Number.isInteger(chapter) && Number.isInteger(sentence) && isVoiceId(voice);
    if (!isValid) return res.status(400).json({ error: 'Send chapter, sentence and a known voice' });
    if (!(await findBook(req.params.id))) return res.status(404).json({ error: 'Book not found' });

    try {
      const { audio } = await ensureSentence(req.params.id, voice, chapter, sentence, priority);
      res.json(audio);
    } catch (error) {
      res.status(503).json({ error: (error as Error).message, engine: kokoro.status() });
    }
  }));

  app.get('/api/focus/voices/:voice/preview', route(async (req, res) => {
    const voice = FOCUS_VOICES.find((item) => item.id === req.params.voice);
    if (!voice) return res.status(404).json({ error: 'Unknown voice' });
    await clearOldAudio;
    const folder = path.join(audioDir, '_preview');
    const file = path.join(folder, `${voice.id}.wav`);
    if (!existsSync(file)) {
      await mkdir(folder, { recursive: true });
      const text = PREVIEW_TEXT(voice.name);
      try {
        await kokoro.synthesize({ text, words: text.split(' '), voice: voice.id, out: file }, 'high');
      } catch (error) {
        return res.status(503).json({ error: (error as Error).message, engine: kokoro.status() });
      }
    }
    res.json({ url: `/api/focus/audio/_preview/${voice.id}.wav` });
  }));

  app.post('/api/focus/exports', route(async (req, res) => {
    const request = (req.body ?? {}) as Partial<ExportRequest>;
    const book = typeof request.bookId === 'string' && ID_PATTERN.test(request.bookId) ? await loadBook(request.bookId) : null;
    const isValid =
      book &&
      (request.scope === 'chapter' || request.scope === 'book') &&
      Number.isInteger(request.chapter) &&
      book.chapters[request.chapter as number] &&
      EXPORT_FORMATS.some((format) => format.id === request.format) &&
      isVoiceId(request.voiceId) &&
      typeof request.folder === 'string' &&
      request.folder.trim() !== '';
    if (!isValid || !book) return res.status(400).json({ error: 'Invalid export request' });

    const sentenceCounts = book.chapters.map((chapter) => scriptOf(chapter).sentences.length);
    const voice = request.voiceId as string;
    const job = exporter.start(book, request as ExportRequest, sentenceCounts, async (chapter, sentence) => {
      const { file, audio } = await ensureSentence(book.id, voice, chapter, sentence, 'low');
      return { file, duration: audio.duration };
    });
    res.status(202).json(job);
  }));

  app.get('/api/focus/exports/:id', (req, res) => {
    const job = exporter.get(req.params.id);
    if (!job) return res.status(404).json({ error: 'Export not found' });
    res.json(job);
  });

  app.post('/api/focus/exports/:id/stop', (req, res) => {
    const job = exporter.stop(req.params.id);
    if (!job) return res.status(404).json({ error: 'Export not found' });
    res.json(job);
  });

  app.post('/api/focus/exports/:id/reveal', route(async (req, res) => {
    const filePath = exporter.get(req.params.id)?.filePath;
    if (!filePath || !existsSync(filePath)) return res.status(404).json({ error: 'File not found' });
    if (desktop) await desktop.revealFile(filePath);
    else if (process.platform === 'win32') await run('explorer.exe', [`/select,${filePath}`]);
    else if (process.platform === 'linux') await run('xdg-open', [path.dirname(filePath)]);
    else await run('open', ['-R', filePath]);
    res.status(204).end();
  }));

  // The macOS folder picker, through AppleScript, so it works from the browser and the app alike.
  app.post('/api/focus/choose-folder', route(async (req, res) => {
    const current = expandHome(String((req.body as { folder?: string } | null)?.folder ?? '~'));
    const start = existsSync(current) ? current : expandHome('~');
    if (desktop) {
      res.json({ folder: await desktop.chooseFolder(start) });
      return;
    }
    const script = `POSIX path of (choose folder with prompt "Choose where to save the audio" default location (POSIX file ${JSON.stringify(start)}))`;
    try {
      const { stdout } = await run('osascript', ['-e', script]);
      res.json({ folder: stdout.trim().replace(/\/$/, '') });
    } catch {
      res.json({ folder: null });
    }
  }));

  return { stop: () => kokoro.stop() };
}
