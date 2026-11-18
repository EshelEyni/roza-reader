import { useSyncExternalStore } from 'react';
import { DEFAULT_VOICE_ID, type FocusBookSummary, type FocusSettings, type ReadingPosition } from '../../../shared/focus';
import { deleteFocusBook, fetchFocusLibrary, saveFocusPosition, saveFocusSettings, uploadEpub } from './focusApi';

// The RozaReader library, loaded from the server once and shared by the library and the reader.

interface LibraryState {
  books: FocusBookSummary[];
  settings: FocusSettings;
  isLoaded: boolean;
  error: string | null;
}

let state: LibraryState = {
  books: [],
  settings: { voiceId: DEFAULT_VOICE_ID, speed: 1, exportFolder: '~/Music/RozaReader' },
  isLoaded: false,
  error: null,
};
const listeners = new Set<() => void>();

const setState = (change: Partial<LibraryState>) => {
  state = { ...state, ...change };
  listeners.forEach((listener) => listener());
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const useLibrary = () => useSyncExternalStore(subscribe, () => state);

let loading: Promise<void> | null = null;

export function loadLibrary() {
  loading ??= fetchFocusLibrary()
    .then(({ books, settings }) => setState({ books, settings, isLoaded: true, error: null }))
    .catch((error: Error) => {
      loading = null;
      setState({ isLoaded: true, error: `Could not load the library: ${error.message}` });
    });
  return loading;
}

const isEpub = (file: File) => file.name.toLowerCase().endsWith('.epub');

export interface ImportResult {
  added: string[];
  failed: { name: string; error: string }[];
  skipped: number;
}

/** Uploads EPUB files one at a time; the server parses and stores them. */
export async function importEpubs(files: File[], onProgress: (done: number, total: number) => void): Promise<ImportResult> {
  const epubs = files.filter(isEpub);
  const result: ImportResult = { added: [], failed: [], skipped: files.length - epubs.length };
  for (const [index, file] of epubs.entries()) {
    onProgress(index, epubs.length);
    try {
      const book = await uploadEpub(file);
      setState({ books: [book, ...state.books.filter((item) => item.id !== book.id)] });
      result.added.push(book.title);
    } catch (error) {
      result.failed.push({ name: file.name, error: (error as Error).message });
    }
  }
  return result;
}

export async function removeBook(bookId: string) {
  await deleteFocusBook(bookId);
  setState({ books: state.books.filter((book) => book.id !== bookId) });
}

// Positions change every word while playing, so they are saved at most this often.
const POSITION_SAVE_DELAY = 1500;
const pendingSaves = new Map<string, { timer: number; position: ReadingPosition }>();

/** Saves waiting positions now: on pause, and when the app closes. */
export function flushPositions() {
  for (const [bookId, { timer, position }] of pendingSaves) {
    window.clearTimeout(timer);
    saveFocusPosition(bookId, position).catch(() => {});
  }
  pendingSaves.clear();
}

export function savePosition(bookId: string, position: ReadingPosition) {
  const book = state.books.find((item) => item.id === bookId);
  const isSame = book?.position.chapter === position.chapter && book.position.word === position.word;
  if (!book || isSame) return;
  setState({ books: state.books.map((item) => (item.id === bookId ? { ...item, position } : item)) });

  // A save already waiting takes the newer position; it doesn't restart the wait.
  const pending = pendingSaves.get(bookId);
  if (pending) {
    pending.position = position;
    return;
  }
  const timer = window.setTimeout(() => {
    const latest = pendingSaves.get(bookId)?.position ?? position;
    pendingSaves.delete(bookId);
    saveFocusPosition(bookId, latest).catch(() => {});
  }, POSITION_SAVE_DELAY);
  pendingSaves.set(bookId, { timer, position });
}

const SETTINGS_SAVE_DELAY = 300;
let pendingSettings: Partial<FocusSettings> = {};
let settingsTimer: number | undefined;

/** Updates the settings at once and saves them shortly after, so a dragged slider sends one save. */
export function saveSettings(change: Partial<FocusSettings>) {
  setState({ settings: { ...state.settings, ...change } });
  pendingSettings = { ...pendingSettings, ...change };
  window.clearTimeout(settingsTimer);
  settingsTimer = window.setTimeout(() => {
    const changes = pendingSettings;
    pendingSettings = {};
    saveFocusSettings(changes).catch(() => {});
  }, SETTINGS_SAVE_DELAY);
}
