import type { ChapterDownload } from '../../shared/focus';

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
  const stopBook = async (bookId: string) => {
    await Promise.all([...jobs.keys()].filter(key => key.startsWith(`${bookId}/`)).map(stop));
  };
  return { status, start, stop, stopBook };
}
