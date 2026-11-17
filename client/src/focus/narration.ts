import { useEffect, useMemo, useRef, useState } from 'react';
import {
  secondsPerWord,
  type FocusBookSummary,
  type NarrationScript,
  type SentenceAudio,
} from '../../../shared/focus';
import { fetchSentenceAudio } from './focusApi';

export const estimatedSeconds = (wordCount: number, speed = 1) => wordCount * secondsPerWord(speed);

export const bookWordCount = (book: FocusBookSummary) => book.chapterWordCounts.reduce((sum, count) => sum + count, 0);

/** Share of the book behind the reading position, from 0 to 1. */
export function bookProgress(book: FocusBookSummary): number {
  const { chapter, word } = book.position;
  const total = bookWordCount(book);
  if (!total) return 0;
  const before = book.chapterWordCounts.slice(0, chapter).reduce((sum, count) => sum + count, 0);
  return Math.min((before + word) / total, 1);
}

export function formatTime(totalSeconds: number): string {
  const seconds = Math.round(totalSeconds);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = String(seconds % 60).padStart(2, '0');
  return hours ? `${hours}:${String(minutes).padStart(2, '0')}:${rest}` : `${minutes}:${rest}`;
}

// Three sentences ahead are made and loaded, so the next one can start the moment one ends.
const READ_AHEAD = 3;

// A cached sentence loads in a few milliseconds; the spinner shows only for a real wait.
const SPINNER_DELAY = 200;

/** A sentence ready to play: its own audio element, already loaded, and its word times. */
interface Prepared {
  element: HTMLAudioElement;
  clip: SentenceAudio;
}

interface Options {
  bookId: string;
  /** A new chapter starts at its first word. */
  chapter: number;
  script: NarrationScript;
  voice: string;
  speed: number;
  initialWord: number;
  /** Called after the last sentence. Returning true keeps playing (into the next chapter). */
  onEnd: () => boolean;
}

export const EMPTY_SCRIPT: NarrationScript = { paragraphs: [], sentences: [], wordCount: 0 };

/**
 * Narration with Kokoro: plays the book one sentence at a time and follows the spoken word
 * with the word times from the server. Upcoming sentences wait in their own loaded audio
 * elements, so playback flows from one sentence into the next without a gap.
 */
export function useNarration({ bookId, chapter, script, voice, speed, initialWord, onEnd }: Options) {
  const [position, setPosition] = useState({ bookId, chapter, word: initialWord });
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The playing sentence; the word highlight follows its audio.
  const [active, setActive] = useState<{ key: string; chapter: number; sentence: number; element: HTMLAudioElement; clip: SentenceAudio } | null>(null);

  const prepared = useRef(new Map<string, Promise<Prepared>>());
  const ready = useRef(new Map<string, Prepared>());

  const lastWord = Math.max(script.wordCount - 1, 0);
  const isSamePlace = position.bookId === bookId && position.chapter === chapter;
  const wordIndex = isSamePlace ? Math.min(position.word, lastWord) : 0;
  const sentenceOfWord = useMemo(() => {
    const map: number[] = [];
    script.sentences.forEach((sentence) => sentence.words.forEach((word) => (map[word.index] = sentence.index)));
    return map;
  }, [script]);
  const sentenceIndex = sentenceOfWord[wordIndex] ?? 0;
  const sentence = script.sentences[sentenceIndex];

  const keyOf = (chapterIndex: number, index: number) => `${bookId}/${voice}/${chapterIndex}-${index}`;
  const currentKey = keyOf(chapter, sentenceIndex);

  // Event handlers read the latest values through this ref.
  const latest = useRef({ bookId, wordIndex, sentenceIndex, script, onEnd, chapter, speed, active, voice });
  latest.current = { bookId, wordIndex, sentenceIndex, script, onEnd, chapter, speed, active, voice };
  const startRef = useRef<(item: Prepared, key: string, chapter: number, sentence: number, word: number) => Promise<void>>(async () => {});

  /** Makes the sentence (or takes it from the cache) and loads it into its own audio element. */
  const prepare = (chapterIndex: number, index: number, priority: 'high' | 'low') => {
    const key = keyOf(chapterIndex, index);
    const existing = prepared.current.get(key);
    if (existing) return existing;
    const promise = fetchSentenceAudio(bookId, chapterIndex, index, voice, priority).then(async (clip) => {
      const element = new Audio();
      element.preload = 'auto';
      // Read-ahead must include loading the media, not just its timing JSON.
      await new Promise<void>((resolve, reject) => {
        const cleanup = () => { window.clearTimeout(timeout); element.oncanplay = null; element.onerror = null; };
        const timeout = window.setTimeout(() => { cleanup(); reject(new Error('Audio loading timed out. Try Play again.')); }, 30000);
        element.oncanplay = () => { cleanup(); resolve(); };
        element.onerror = () => { cleanup(); reject(new Error('Could not load sentence audio. Try Play again.')); };
        element.src = clip.url;
        element.load();
      });
      const item = { element, clip };
      ready.current.set(key, item);
      return item;
    });
    prepared.current.set(key, promise);
    promise.catch(() => prepared.current.delete(key));
    return promise;
  };

  // Frees the loaded sentences that are no longer near the reading position.
  const release = (keep: Set<string>) => {
    for (const [key, item] of ready.current) {
      if (keep.has(key) || item.element === latest.current.active?.element) continue;
      item.element.removeAttribute('src');
      ready.current.delete(key);
      prepared.current.delete(key);
    }
  };

  // At the end of a sentence the next one follows, or the next chapter.
  const handleEnded = () => {
    const { bookId: currentBook, script: current, sentenceIndex: index, onEnd: end, chapter: currentChapter, voice: currentVoice } = latest.current;
    const next = current.sentences[index + 1];
    if (next) {
      const word = next.words[0].index;
      const key = `${currentBook}/${currentVoice}/${currentChapter}-${next.index}`;
      const loaded = ready.current.get(key);
      // Start preloaded audio directly in the ended event. A React render and
      // scrolling/highlighting no longer sit between two spoken sentences.
      if (loaded) startRef.current(loaded, key, currentChapter, next.index, word).catch((failure: Error) => {
        setError(failure.message); setIsPlaying(false);
      });
      setPosition({ bookId: currentBook, chapter: currentChapter, word });
      return;
    }
    const keepsPlaying = end();
    if (!keepsPlaying) setIsPlaying(false);
  };
  const handleEndedRef = useRef(handleEnded);
  handleEndedRef.current = handleEnded;

  const start = (item: Prepared, key: string, chapterIndex: number, index: number, word = latest.current.wordIndex) => {
    const previous = latest.current.active;
    if (previous && previous.element !== item.element) previous.element.pause();
    const { element, clip } = item;
    element.onended = () => handleEndedRef.current();
    element.defaultPlaybackRate = latest.current.speed;
    element.playbackRate = latest.current.speed;
    // Starting mid-sentence (after a seek) starts at that word.
    const offset = word - latest.current.script.sentences[index].words[0].index;
    element.currentTime = offset > 0 ? (clip.words[offset]?.start ?? 0) : 0;
    const nextActive = { key, chapter: chapterIndex, sentence: index, element, clip };
    latest.current.active = nextActive;
    setActive(nextActive);
    return element.play();
  };
  startRef.current = start;

  useEffect(() => {
    const element = active?.element;
    if (!element) return;
    element.defaultPlaybackRate = speed;
    element.playbackRate = speed;
  }, [active, speed]);

  // Stops everything when the reader closes.
  useEffect(
    () => () => {
      for (const item of ready.current.values()) {
        item.element.pause();
        item.element.removeAttribute('src');
      }
    },
    []
  );

  // Plays the current sentence whenever it, the chapter or the voice changes, and loads the next ones.
  useEffect(() => {
    if (!sentence) {
      // No book (or an empty chapter): nothing may keep playing.
      latest.current.active?.element.pause();
      return;
    }
    const keep = new Set([currentKey]);
    for (let ahead = 1; ahead <= READ_AHEAD; ahead++) {
      const index = sentenceIndex + ahead;
      if (!script.sentences[index]) break;
      keep.add(keyOf(chapter, index));
      prepare(chapter, index, 'low').catch(() => {});
    }
    release(keep);

    if (!isPlaying) {
      latest.current.active?.element.pause();
      // Ready before Play is pressed, so playback starts at once.
      prepare(chapter, sentenceIndex, 'low').catch(() => {});
      return;
    }

    const playing = latest.current.active;
    if (playing?.key === currentKey) {
      if (playing.element.paused) playing.element.play().catch(() => {});
      return;
    }

    const fail = (loadError: Error) => {
      // A newer action (a seek, the next sentence, Pause) cut this start short; that is not a failure.
      const isInterrupted = loadError.name === 'AbortError';
      if (isInterrupted) return;
      setIsPlaying(false);
      setError(loadError.message);
    };

    const loaded = ready.current.get(currentKey);
    if (loaded) {
      start(loaded, currentKey, chapter, sentenceIndex).catch(fail);
      return;
    }

    let isCancelled = false;
    setError(null);
    const spinner = window.setTimeout(() => setIsLoading(true), SPINNER_DELAY);
    prepare(chapter, sentenceIndex, 'high')
      .then((item) => (isCancelled ? undefined : start(item, currentKey, chapter, sentenceIndex)))
      .catch((loadError: Error) => !isCancelled && fail(loadError))
      .finally(() => {
        window.clearTimeout(spinner);
        if (!isCancelled) setIsLoading(false);
      });
    return () => {
      isCancelled = true;
      window.clearTimeout(spinner);
      setIsLoading(false);
    };
  }, [isPlaying, bookId, chapter, sentenceIndex, voice]);

  // While a sentence plays, the highlight follows the word being spoken.
  useEffect(() => {
    const isCurrent = active?.key === currentKey;
    if (!isPlaying || !active || !isCurrent) return;
    let frame = 0;
    const firstWord = script.sentences[active.sentence].words[0].index;
    const follow = () => {
      const time = active.element.currentTime;
      let offset = 0;
      active.clip.words.forEach((word, index) => {
        if (word.start <= time + 0.03) offset = index;
      });
      const word = firstWord + offset;
      if (word !== latest.current.wordIndex) setPosition({ bookId, chapter: active.chapter, word });
      frame = requestAnimationFrame(follow);
    };
    frame = requestAnimationFrame(follow);
    return () => cancelAnimationFrame(frame);
  }, [isPlaying, active, currentKey, script]);

  /** Moves to a word; inside the playing sentence it seeks the audio instead of reloading. */
  const jumpTo = (word: number) => {
    const target = Math.max(0, Math.min(word, lastWord));
    setPosition({ bookId, chapter, word: target });
    const targetSentence = sentenceOfWord[target];
    if (active?.key !== keyOf(chapter, targetSentence)) return;
    const offset = target - script.sentences[targetSentence].words[0].index;
    active.element.currentTime = active.clip.words[offset]?.start ?? 0;
  };

  const startOf = (index: number) => script.sentences[index]?.words[0]?.index;

  // Like audiobook apps: back goes to the start of this sentence, or to the one before if already there.
  const previousSentence = () => {
    const isAtSentenceStart = !sentence || wordIndex <= sentence.words[0].index + 1;
    jumpTo((isAtSentenceStart ? startOf(sentenceIndex - 1) : startOf(sentenceIndex)) ?? 0);
  };

  const nextSentence = () => {
    const target = startOf(sentenceIndex + 1);
    if (target !== undefined) jumpTo(target);
  };

  return {
    wordIndex,
    sentenceIndex,
    isPlaying,
    isLoading,
    error,
    togglePlay: () => {
      setError(null);
      setIsPlaying(!isPlaying);
    },
    pause: () => setIsPlaying(false),
    /** Puts the reading position somewhere new, e.g. when another book opens. */
    place: (book: string, chapterIndex: number, word: number) => setPosition({ bookId: book, chapter: chapterIndex, word }),
    jumpTo,
    previousSentence,
    nextSentence,
  };
}

export type Narration = ReturnType<typeof useNarration>;
