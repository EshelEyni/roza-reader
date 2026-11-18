import type { BookDownload, ChapterDownload } from '../../shared/focus';

// A whole-book download skips a sentence that fails; this many failures in a row stop it (e.g. the engine is down).
const MAX_FAILURES_IN_A_ROW = 3;

interface BookJob {
  stopped: boolean;
  chapter: number;
  error?: string;
  task?: Promise<void>;
}

/** Jobs only coordinate generation; saved audio and timings are the source of truth. */
export function createChapterDownloads() {
  const jobs = new Map<string, { stopped: boolean; error?: string; task?: Promise<void> }>();
  const status = async (key: string, total: number, cached: (sentence: number) => Promise<boolean>): Promise<ChapterDownload> => {
    const completed = (await Promise.all(Array.from({ length: total }, (_, index) => cached(index)))).filter(Boolean).length;
    const job = jobs.get(key);
    return {
      state: completed === total ? 'ready' : job?.task && !job.stopped ? 'downloading' : job?.error ? 'error' : completed ? 'partial' : 'missing',
      completed, total,
      ...(job?.error && completed !== total ? { error: job.error } : {}),
    };
  };
  const start = (key: string, total: number, ensure: (sentence: number) => Promise<unknown>) => {
    if (jobs.get(key)?.task) return;
    const job: { stopped: boolean; error?: string; task?: Promise<void> } = { stopped: false };
    jobs.set(key, job);
    job.task = (async () => {
      try {
        for (let index = 0; index < total && !job.stopped; index++) await ensure(index);
      } catch (error) {
        job.error = (error as Error).message;
      } finally {
        job.task = undefined;
      }
    })();
  };
  const stop = async (key: string) => {
    const job = jobs.get(key);
    if (job) job.stopped = true;
    // A sentence already being generated is allowed to finish and remains saved.
    await job?.task;
  };
  const bookJobs = new Map<string, BookJob>();

  /** Saves every chapter in order, so each one becomes ready for offline reading as soon as it can. */
  const startBook = (key: string, chapterSizes: number[], ensure: (chapter: number, sentence: number) => Promise<unknown>) => {
    if (bookJobs.get(key)?.task) return;
    const job: BookJob = { stopped: false, chapter: 0 };
    bookJobs.set(key, job);
    job.task = (async () => {
      let failures = 0;
      for (let chapter = 0; chapter < chapterSizes.length && !job.stopped; chapter++) {
        job.chapter = chapter;
        for (let sentence = 0; sentence < chapterSizes[chapter] && !job.stopped; sentence++) {
          try {
            await ensure(chapter, sentence);
            failures = 0;
          } catch (error) {
            failures += 1;
            job.error = (error as Error).message;
            if (failures >= MAX_FAILURES_IN_A_ROW) job.stopped = true;
          }
        }
      }
    })().finally(() => {
      job.task = undefined;
    });
  };

  const stopBookDownload = async (key: string) => {
    const job = bookJobs.get(key);
    if (job) job.stopped = true;
    await job?.task;
  };

  /** `saved[chapter]` is how many of that chapter's sentences are saved. */
  const bookStatus = (key: string, chapterSizes: number[], saved: number[]): BookDownload => {
    const job = bookJobs.get(key);
    const total = chapterSizes.reduce((sum, size) => sum + size, 0);
    const completed = saved.reduce((sum, count) => sum + count, 0);
    const chaptersReady = chapterSizes.filter((size, chapter) => saved[chapter] >= size).length;
    const isRunning = Boolean(job?.task) && !job?.stopped;
    const state = completed >= total ? 'ready' : isRunning ? 'downloading' : job?.error ? 'error' : completed ? 'partial' : 'missing';
    return {
      state, completed, total, chaptersReady, chapters: chapterSizes.length,
      ...(isRunning && job ? { chapter: job.chapter } : {}),
      ...(job?.error && completed < total ? { error: job.error } : {}),
    };
  };

  const stopBook = async (bookId: string) => {
    await Promise.all([...jobs.keys()].filter(key => key.startsWith(`${bookId}/`)).map(stop));
    await Promise.all([...bookJobs.keys()].filter(key => key.startsWith(`${bookId}/`)).map(stopBookDownload));
  };
  return { status, start, stop, stopBook, startBook, stopBookDownload, bookStatus };
}
