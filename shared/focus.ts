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
  /** Narration volume, from 0 to 1. */
  volume?: number;
}

export const FONT_SIZES = [16, 18, 20, 22, 24, 27];

export const DEFAULT_FONT_SIZE = 20;

export interface FocusVoice {
  /** Kokoro voice id; the first letter is the language ("a" American, "b" British). */
  id: string;
  name: string;
  language: string;
  nationality: 'American' | 'British';
  gender: 'Female' | 'Male';
}

export const FOCUS_VOICES: FocusVoice[] = [
  { id: 'af_heart', name: 'Heart', language: 'American English', nationality: 'American', gender: 'Female' },
  { id: 'af_alloy', name: 'Alloy', language: 'American English', nationality: 'American', gender: 'Female' },
  { id: 'af_aoede', name: 'Aoede', language: 'American English', nationality: 'American', gender: 'Female' },
  { id: 'af_bella', name: 'Bella', language: 'American English', nationality: 'American', gender: 'Female' },
  { id: 'af_jessica', name: 'Jessica', language: 'American English', nationality: 'American', gender: 'Female' },
  { id: 'af_kore', name: 'Kore', language: 'American English', nationality: 'American', gender: 'Female' },
  { id: 'af_nicole', name: 'Nicole', language: 'American English', nationality: 'American', gender: 'Female' },
  { id: 'af_nova', name: 'Nova', language: 'American English', nationality: 'American', gender: 'Female' },
  { id: 'af_river', name: 'River', language: 'American English', nationality: 'American', gender: 'Female' },
  { id: 'af_sarah', name: 'Sarah', language: 'American English', nationality: 'American', gender: 'Female' },
  { id: 'af_sky', name: 'Sky', language: 'American English', nationality: 'American', gender: 'Female' },
  { id: 'am_adam', name: 'Adam', language: 'American English', nationality: 'American', gender: 'Male' },
  { id: 'am_echo', name: 'Echo', language: 'American English', nationality: 'American', gender: 'Male' },
  { id: 'am_eric', name: 'Eric', language: 'American English', nationality: 'American', gender: 'Male' },
  { id: 'am_fenrir', name: 'Fenrir', language: 'American English', nationality: 'American', gender: 'Male' },
  { id: 'am_liam', name: 'Liam', language: 'American English', nationality: 'American', gender: 'Male' },
  { id: 'am_michael', name: 'Michael', language: 'American English', nationality: 'American', gender: 'Male' },
  { id: 'am_onyx', name: 'Onyx', language: 'American English', nationality: 'American', gender: 'Male' },
  { id: 'am_puck', name: 'Puck', language: 'American English', nationality: 'American', gender: 'Male' },
  { id: 'am_santa', name: 'Santa', language: 'American English', nationality: 'American', gender: 'Male' },
  { id: 'bf_alice', name: 'Alice', language: 'British English', nationality: 'British', gender: 'Female' },
  { id: 'bf_emma', name: 'Emma', language: 'British English', nationality: 'British', gender: 'Female' },
  { id: 'bf_isabella', name: 'Isabella', language: 'British English', nationality: 'British', gender: 'Female' },
  { id: 'bf_lily', name: 'Lily', language: 'British English', nationality: 'British', gender: 'Female' },
  { id: 'bm_daniel', name: 'Daniel', language: 'British English', nationality: 'British', gender: 'Male' },
  { id: 'bm_fable', name: 'Fable', language: 'British English', nationality: 'British', gender: 'Male' },
  { id: 'bm_george', name: 'George', language: 'British English', nationality: 'British', gender: 'Male' },
  { id: 'bm_lewis', name: 'Lewis', language: 'British English', nationality: 'British', gender: 'Male' },
];

export const DEFAULT_VOICE_ID = 'af_heart';

export const DEFAULT_VOLUME = 1;

export const isVolume = (value: unknown): value is number => typeof value === 'number' && value >= 0 && value <= 1;

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

// Pacing: Kokoro reads every sentence the same way, so the book gets its rhythm from the
// silence after each sentence and a slightly slower pace for short, dramatic lines.

export interface SentencePacing {
  /** Seconds of silence after the spoken words. */
  pause: number;
  /** Kokoro's speaking speed; 1 is normal. */
  speed: number;
}

const PAUSE = {
  sentence: 0.35,
  question: 0.45,
  trailing: 0.6,
  paragraph: 0.75,
  speakerChange: 0.9,
  sceneBreak: 1.4,
  chapterEnd: 1.5,
};

const SHORT_SENTENCE_WORDS = 5;
const SHORT_SENTENCE_SPEED = 0.92;
const TRAILING_SPEED = 0.95;

const OPENING_QUOTE = /^["'“‘«]/;
const ANY_QUOTE = /["“”«»]/;
const HAS_LETTERS = /[\p{L}\p{N}]/u;
const TRAILING_END = /(…|\.\.\.|[—–-])["'”’)\]]*$/;
const QUESTION_END = /[!?]["'”’)\]]*$/;

const paragraphText = (paragraph: NarrationSentence[]) => paragraph.map(sentenceText).join(' ');

/** True when the sentence is spoken by a character: it has a quote mark, or a quote opened earlier is still open. */
function isQuoted(paragraph: NarrationSentence[], sentenceIndex: number) {
  let isOpen = false;
  for (const item of paragraph) {
    const text = sentenceText(item);
    if (item.index === sentenceIndex) return isOpen || ANY_QUOTE.test(text);
    for (const char of text) {
      if (char === '“' || char === '«') isOpen = true;
      else if (char === '”' || char === '»') isOpen = false;
      else if (char === '"') isOpen = !isOpen;
    }
  }
  return false;
}

/** How long to pause after a sentence, and how fast to say it, from where it sits in the chapter. */
export function pacingOf(script: NarrationScript, sentenceIndex: number): SentencePacing {
  const sentence = script.sentences[sentenceIndex];
  const text = sentence ? sentenceText(sentence) : '';
  const isSceneBreak = !HAS_LETTERS.test(text);
  if (isSceneBreak) return { pause: PAUSE.sceneBreak, speed: 1 };

  const isLastInChapter = sentenceIndex === script.sentences.length - 1;
  const paragraphIndex = script.paragraphs.findIndex((paragraph) => paragraph.some((item) => item.index === sentenceIndex));
  const paragraph = script.paragraphs[paragraphIndex] ?? [];
  const isParagraphEnd = paragraph[paragraph.length - 1]?.index === sentenceIndex;
  const nextParagraph = script.paragraphs.slice(paragraphIndex + 1).find((item) => item.length) ?? [];
  const isDialogue = OPENING_QUOTE.test(paragraphText(paragraph));
  const isNextDialogue = OPENING_QUOTE.test(paragraphText(nextParagraph));
  const isTrailing = TRAILING_END.test(text);
  // Short narration lines ("Or yesterday.") land harder a little slower; quick dialogue stays quick.
  const isShortNarration = sentence.words.length <= SHORT_SENTENCE_WORDS && !isQuoted(paragraph, sentenceIndex);

  const speed = isTrailing ? TRAILING_SPEED : isShortNarration ? SHORT_SENTENCE_SPEED : 1;
  if (isLastInChapter) return { pause: PAUSE.chapterEnd, speed };
  if (isParagraphEnd && isDialogue && isNextDialogue) return { pause: PAUSE.speakerChange, speed };
  if (isParagraphEnd) return { pause: PAUSE.paragraph, speed };
  if (isTrailing) return { pause: PAUSE.trailing, speed };
  if (QUESTION_END.test(text)) return { pause: PAUSE.question, speed };
  return { pause: PAUSE.sentence, speed };
}
