import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { DEFAULT_VOLUME, scriptOf, type FocusBook } from '../../../shared/focus';
import { fetchFocusBook } from './focusApi';
import { flushPositions, loadLibrary, saveSettings, savePosition, useLibrary } from './libraryStore';
import { EMPTY_SCRIPT, useNarration, type Narration } from './narration';

interface FocusPlayer {
  book: FocusBook | null;
  chapterIndex: number;
  narration: Narration;
  /** Makes this book the one playing, at its saved position. Another book stops first. */
  open: (book: FocusBook) => void;
  goToChapter: (index: number) => void;
  /** Stops and unloads the book, which hides the header controls. */
  close: () => void;
}

const FocusPlayerContext = createContext<FocusPlayer | null>(null);

export function useFocusPlayer() {
  const player = useContext(FocusPlayerContext);
  if (!player) throw new Error('useFocusPlayer needs a FocusPlayerProvider');
  return player;
}

/**
 * The one Focus player for the whole app. It lives above the pages, so narration keeps going
 * on other tabs and the header can show its controls.
 */
export function FocusPlayerProvider({ children }: { children: ReactNode }) {
  const { settings, isLoaded } = useLibrary();
  const [book, setBook] = useState<FocusBook | null>(null);
  const [chapterIndex, setChapterIndex] = useState(0);
  const bookRef = useRef(book);
  bookRef.current = book;

  const chapter = book?.chapters[chapterIndex];
  const script = useMemo(() => (chapter ? scriptOf(chapter) : EMPTY_SCRIPT), [chapter]);
  const isLastChapter = !book || chapterIndex >= book.chapters.length - 1;

  const narration = useNarration({
    bookId: book?.id ?? '',
    chapter: chapterIndex,
    script,
    voice: settings.voiceId,
    speed: settings.speed,
    volume: settings.volume ?? DEFAULT_VOLUME,
    initialWord: 0,
    // At the end of a chapter, playback moves on to the next one.
    onEnd: () => {
      if (isLastChapter) return false;
      setChapterIndex(chapterIndex + 1);
      return true;
    },
  });

  useEffect(() => {
    loadLibrary();
  }, []);

  // After a restart the last book waits, paused, where reading stopped.
  useEffect(() => {
    if (!isLoaded || book || !settings.lastBookId) return;
    fetchFocusBook(settings.lastBookId)
      .then((last) => {
        // A book opened meanwhile wins.
        if (!bookRef.current) open(last);
      })
      .catch(() => {});
  }, [isLoaded]);

  useEffect(() => {
    if (book) savePosition(book.id, { chapter: chapterIndex, word: narration.wordIndex });
  }, [book, chapterIndex, narration.wordIndex]);

  // A pause is a natural place to stop, so its position is saved at once.
  useEffect(() => {
    if (!narration.isPlaying) flushPositions();
  }, [narration.isPlaying]);

  useEffect(() => {
    window.addEventListener('pagehide', flushPositions);
    return () => window.removeEventListener('pagehide', flushPositions);
  }, []);

  const open = (next: FocusBook) => {
    if (book?.id === next.id) return;
    narration.pause();
    const startChapter = Math.min(next.position.chapter, next.chapters.length - 1);
    setBook(next);
    setChapterIndex(startChapter);
    narration.place(next.id, startChapter, next.position.word);
    if (settings.lastBookId !== next.id) saveSettings({ lastBookId: next.id });
  };

  const goToChapter = (index: number) => {
    if (book?.chapters[index]) setChapterIndex(index);
  };

  const close = () => {
    narration.pause();
    flushPositions();
    setBook(null);
  };

  return (
    <FocusPlayerContext.Provider value={{ book, chapterIndex, narration, open, goToChapter, close }}>
      {children}
    </FocusPlayerContext.Provider>
  );
}

/** Loads a book by id and opens it in the player; used to restore the last book. */
export async function openBookById(player: FocusPlayer, bookId: string) {
  if (player.book?.id === bookId) return player.book;
  const book = await fetchFocusBook(bookId);
  player.open(book);
  return book;
}
