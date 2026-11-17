import { spawn, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createInterface } from 'node:readline';
import type { ExportFormat, ExportJob, ExportRequest, FocusBook } from '../../shared/focus';

/** Makes sure one sentence has audio and returns its file and length. */
export type EnsureSentence = (chapter: number, sentence: number) => Promise<{ file: string; duration: number }>;

const ENV = { ...process.env, PATH: [process.env.PATH ?? '', '/opt/homebrew/bin', '/usr/local/bin'].join(path.delimiter) };

// 64 kbps is plenty for one voice and keeps a whole book small.
const CODEC_ARGS: Record<ExportFormat, string[]> = {
  m4a: ['-c:a', 'aac', '-b:a', '64k', '-f', 'ipod'],
  mp4: ['-c:a', 'aac', '-b:a', '64k', '-f', 'mp4'],
  mp3: ['-c:a', 'libmp3lame', '-b:a', '64k', '-id3v2_version', '3'],
};

export const expandHome = (folder: string) => (folder === '~' || folder.startsWith('~/') ? path.join(os.homedir(), folder.slice(1)) : folder);

const safeName = (text: string) => text.replace(/[/\\:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120) || 'Audiobook';

function uniquePath(folder: string, name: string, extension: string) {
  let candidate = path.join(folder, `${name}.${extension}`);
  for (let copy = 2; existsSync(candidate); copy++) candidate = path.join(folder, `${name} (${copy}).${extension}`);
  return candidate;
}

const escapeMetadata = (text: string) => text.replace(/([=;#\\\n])/g, '\\$1');

/** Export jobs run in the background; the page polls them by id. */
export function createExporter(tempDir: string) {
  const jobs = new Map<string, ExportJob>();
  const stops = new Map<string, () => void>();

  const run = async (job: ExportJob, book: FocusBook, request: ExportRequest, sentenceCounts: number[], ensure: EnsureSentence) => {
    let isStopped = false;
    let ffmpeg: ChildProcess | null = null;
    stops.set(job.id, () => {
      isStopped = true;
      ffmpeg?.kill();
    });

    const chapters = request.scope === 'chapter' ? [request.chapter] : book.chapters.map((_, index) => index);
    const total = chapters.reduce((sum, chapter) => sum + sentenceCounts[chapter], 0);
    const files: string[] = [];
    const markers: { title: string; start: number; end: number }[] = [];
    let done = 0;
    let elapsed = 0;

    for (const chapter of chapters) {
      const start = elapsed;
      for (let sentence = 0; sentence < sentenceCounts[chapter]; sentence++) {
        if (isStopped) return;
        const audio = await ensure(chapter, sentence);
        files.push(audio.file);
        elapsed += audio.duration;
        done += 1;
        job.progress = Math.floor((done / total) * 85);
        job.stage = `Generating speech… ${done} of ${total} sentences`;
      }
      markers.push({ title: book.chapters[chapter].title, start, end: elapsed });
    }

    const workDir = path.join(tempDir, job.id);
    await mkdir(workDir, { recursive: true });
    const listFile = path.join(workDir, 'list.txt');
    const metadataFile = path.join(workDir, 'chapters.txt');
    await writeFile(listFile, files.map((file) => `file '${file.replace(/'/g, "'\\''")}'`).join('\n'));
    const metadata = [
      ';FFMETADATA1',
      `title=${escapeMetadata(request.scope === 'chapter' ? `${book.title}: ${book.chapters[request.chapter].title}` : book.title)}`,
      `artist=${escapeMetadata(book.author)}`,
      `album=${escapeMetadata(book.title)}`,
      ...markers.flatMap((marker) => [
        '[CHAPTER]',
        'TIMEBASE=1/1000',
        `START=${Math.round(marker.start * 1000)}`,
        `END=${Math.round(marker.end * 1000)}`,
        `title=${escapeMetadata(marker.title)}`,
      ]),
    ];
    await writeFile(metadataFile, `${metadata.join('\n')}\n`);

    const folder = expandHome(request.folder);
    await mkdir(folder, { recursive: true });
    const chapterPart = request.scope === 'chapter' ? ` - ${String(request.chapter + 1).padStart(2, '0')} ${book.chapters[request.chapter].title}` : '';
    const output = uniquePath(folder, safeName(`${book.title}${chapterPart}`), request.format);

    job.stage = `Encoding ${request.format.toUpperCase()}…`;
    await new Promise<void>((resolve, reject) => {
      const args = [
        '-y', '-hide_banner', '-loglevel', 'error', '-progress', 'pipe:1',
        '-f', 'concat', '-safe', '0', '-i', listFile,
        '-i', metadataFile, '-map', '0:a', '-map_metadata', '1', '-map_chapters', '1',
        ...CODEC_ARGS[request.format], output,
      ];
      ffmpeg = spawn('ffmpeg', args, { env: ENV });
      let errorText = '';
      ffmpeg.stderr?.on('data', (chunk) => (errorText += chunk));
      createInterface({ input: ffmpeg.stdout! }).on('line', (line) => {
        const microseconds = Number(line.match(/^out_time_us=(\d+)/)?.[1]);
        if (microseconds && elapsed) job.progress = 85 + Math.min(14, Math.floor((microseconds / 1e6 / elapsed) * 14));
      });
      ffmpeg.on('error', (error) => reject(new Error(`ffmpeg could not start (${error.message}). Run kokoro/setup.sh.`)));
      ffmpeg.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(isStopped ? 'Stopped.' : errorText.trim() || `ffmpeg exit code ${code}`))));
    });

    job.state = 'done';
    job.progress = 100;
    job.stage = 'Saved';
    job.filePath = output;
  };

  const start = (book: FocusBook, request: ExportRequest, sentenceCounts: number[], ensure: EnsureSentence): ExportJob => {
    const job: ExportJob = { id: randomUUID(), state: 'running', progress: 0, stage: 'Starting…' };
    jobs.set(job.id, job);
    run(job, book, request, sentenceCounts, ensure)
      .catch((error: Error) => {
        if (job.state !== 'running') return;
        job.state = 'error';
        job.error = error.message;
      })
      .finally(() => stops.delete(job.id));
    return job;
  };

  const stop = (jobId: string) => {
    const job = jobs.get(jobId);
    if (!job || job.state !== 'running') return job;
    job.state = 'stopped';
    job.stage = 'Stopped';
    stops.get(jobId)?.();
    return job;
  };

  return { start, stop, get: (jobId: string) => jobs.get(jobId) };
}
