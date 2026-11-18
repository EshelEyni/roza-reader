// Focus (EPUB audiobook reader): types and text rules shared by the server and the client.

import type { ThemeId } from './themes';

export interface FocusChapter {
  title: string;
  paragraphs: string[];
}

export interface ChapterDownload {
  state: 'missing' | 'partial' | 'downloading' | 'ready' | 'error';
  completed: number;
  total: number;
  error?: string;
}

/** Saving every chapter of a book, one chapter after another. */
export interface BookDownload {
  state: 'missing' | 'partial' | 'downloading' | 'ready' | 'error';
  completed: number;
  total: number;
  chaptersReady: number;
  chapters: number;
  /** The chapter being saved while downloading (0-based). */
  chapter?: number;
  error?: string;
}

/** Where the listener stopped: a chapter and a word inside it. */
export interface ReadingPosition {
  chapter: number;
  word: number;
}

export interface FocusBookSummary {
  id: string;
  title: string;
  author: string;
  fileName: string;
  importedAt: string;
  hasCover: boolean;
  /** Colors for a drawn cover when the EPUB has none. */
  coverColors: [string, string];
  chapterTitles: string[];
  chapterWordCounts: number[];
  position: ReadingPosition;
}

export interface FocusBook extends FocusBookSummary {
  chapters: FocusChapter[];
}

export interface FocusSettings {
  voiceId: string;
  speed: number;
  exportFolder: string;
  /** The book open last, so the app can return to it after a restart. */
  lastBookId?: string;
  theme?: ThemeId;
  /** Reading text size in pixels. */
  fontSize?: number;
}

export const FONT_SIZES = [16, 18, 20, 22, 24, 27];

export const DEFAULT_FONT_SIZE = 20;

export interface FocusVoice {
  /** Kokoro voice id; the first letter is the language ("a" American, "b" British). */
  id: string;
  name: string;
  language: string;
  gender: 'Female' | 'Male';
}

export const FOCUS_VOICES: FocusVoice[] = [
  { id: 'af_heart', name: 'Heart', language: 'American English', gender: 'Female' },
  { id: 'af_bella', name: 'Bella', language: 'American English', gender: 'Female' },
  { id: 'af_nicole', name: 'Nicole', language: 'American English', gender: 'Female' },
  { id: 'am_michael', name: 'Michael', language: 'American English', gender: 'Male' },
  { id: 'am_adam', name: 'Adam', language: 'American English', gender: 'Male' },
  { id: 'bf_emma', name: 'Emma', language: 'British English', gender: 'Female' },
  { id: 'bf_isabella', name: 'Isabella', language: 'British English', gender: 'Female' },
  { id: 'bm_george', name: 'George', language: 'British English', gender: 'Male' },
  { id: 'bm_lewis', name: 'Lewis', language: 'British English', gender: 'Male' },
];

export const DEFAULT_VOICE_ID = 'af_heart';

export const PLAYBACK_SPEEDS = [0.75, 1, 1.25, 1.5, 1.75, 2];

export const EXPORT_FORMATS = [
  { id: 'm4a', label: 'M4A', detail: 'AAC audio, best for Apple Books' },
  { id: 'mp4', label: 'MP4 audio', detail: 'AAC in an MP4 container' },
  { id: 'mp3', label: 'MP3', detail: 'Plays almost everywhere' },
] as const;

export type ExportFormat = (typeof EXPORT_FORMATS)[number]['id'];

export type ExportScope = 'chapter' | 'book';

export interface ExportRequest {
  bookId: string;
  scope: ExportScope;
  chapter: number;
  format: ExportFormat;
  voiceId: string;
  folder: string;
}

export interface ExportJob {
  id: string;
  state: 'running' | 'done' | 'error' | 'stopped';
  /** 0 to 100. */
  progress: number;
  stage: string;
  filePath?: string;
  error?: string;
}

/** Audio for one sentence, with a time range per word (seconds). */
export interface SentenceAudio {
  url: string;
  duration: number;
  words: { start: number; end: number }[];
}

export interface EngineStatus {
  state: 'missing' | 'stopped' | 'loading' | 'ready' | 'error';
  message?: string;
}

// Text: a chapter splits into sentences, and sentences into words. The narration speaks one
// sentence at a time and times each word, so the server and the client must split the same way.

export interface NarrationWord {
  /** Chapter-wide index. */
  index: number;
  text: string;
  /** The space after the word, kept apart so the word highlight hugs the word. */
  space: string;
}

export interface NarrationSentence {
  index: number;
  words: NarrationWord[];
}

export interface NarrationScript {
  paragraphs: NarrationSentence[][];
  sentences: NarrationSentence[];
  wordCount: number;
}

const SENTENCE_PATTERN = /[^.!?…]+(?:[.!?…]+["'”’)\]]*|$)\s*/g;
const WORD_PATTERN = /(\S+)(\s*)/g;

export function scriptOf(chapter: FocusChapter): NarrationScript {
  let wordIndex = 0;
  const sentences: NarrationSentence[] = [];
  const paragraphs = chapter.paragraphs.map((paragraph) =>
    (paragraph.match(SENTENCE_PATTERN) ?? []).flatMap((text) => {
      const words = [...text.matchAll(WORD_PATTERN)].map(([, word, space]) => ({ index: wordIndex++, text: word, space }));
      if (!words.length) return [];
      const sentence = { index: sentences.length, words };
      sentences.push(sentence);
      return [sentence];
    })
  );
  return { paragraphs, sentences, wordCount: wordIndex };
}

export const sentenceText = (sentence: NarrationSentence) => sentence.words.map((word) => word.text).join(' ');

// A calm narration pace, used for time estimates before the audio exists.
const WORDS_PER_MINUTE = 165;

export const secondsPerWord = (speed = 1) => 60 / (WORDS_PER_MINUTE * speed);

export const isVoiceId = (id: unknown): id is string => FOCUS_VOICES.some((voice) => voice.id === id);
