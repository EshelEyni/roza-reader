import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { createInterface } from 'node:readline';
import type { EngineStatus } from '../../shared/focus';

export interface SynthesisRequest {
  text: string;
  words: string[];
  voice: string;
  out: string;
}

export interface SynthesisResult {
  duration: number;
  words: [number, number][];
}

/** "high" is what the listener waits for; "low" is read-ahead and exports. */
export type Priority = 'high' | 'low';

interface Job {
  id: string;
  request: SynthesisRequest;
  resolve: (result: SynthesisResult) => void;
  reject: (error: Error) => void;
}

// The packaged app starts with a bare PATH; Homebrew holds espeak-ng.
const ENV = { ...process.env, PATH: [process.env.PATH ?? '', '/opt/homebrew/bin', '/usr/local/bin'].join(path.delimiter), PYTHONUNBUFFERED: '1' };

/**
 * Runs kokoro/service.py as one long-lived process and feeds it one sentence at a time,
 * so a sentence the listener is waiting for can jump ahead of read-ahead and exports.
 */
export function createKokoro(kokoroDir: string) {
  const python = path.join(kokoroDir, '.venv', process.platform === 'win32' ? 'Scripts' : 'bin', process.platform === 'win32' ? 'python.exe' : 'python');
  const script = path.join(kokoroDir, 'service.py');
  const queues: Record<Priority, Job[]> = { high: [], low: [] };
  let child: ChildProcessWithoutNullStreams | null = null;
  let status: EngineStatus = { state: 'stopped' };
  let running: Job | null = null;
  let nextId = 1;
  let recentErrors: string[] = [];

  const isInstalled = () => existsSync(python) && existsSync(script);

  const failAll = (message: string) => {
    const jobs = [...(running ? [running] : []), ...queues.high, ...queues.low];
    running = null;
    queues.high = [];
    queues.low = [];
    jobs.forEach((job) => job.reject(new Error(message)));
  };

  const pump = () => {
    if (running || !child || status.state !== 'ready') return;
    const job = queues.high.shift() ?? queues.low.shift();
    if (!job) return;
    running = job;
    child.stdin.write(`${JSON.stringify({ id: job.id, ...job.request })}\n`);
  };

  const start = () => {
    if (child) return;
    if (!isInstalled()) {
      status = { state: 'missing', message: 'Kokoro is not installed. Run kokoro/setup.sh in the project folder.' };
      return;
    }
    status = { state: 'loading', message: 'Loading the Kokoro voice model…' };
    recentErrors = [];
    const process_ = spawn(python, [script], { env: ENV, cwd: kokoroDir });
    child = process_;

    createInterface({ input: process_.stdout }).on('line', (line) => {
      let message: { event?: string; id?: string; ok?: boolean; error?: string } & Partial<SynthesisResult>;
      try {
        message = JSON.parse(line);
      } catch {
        return;
      }
      if (message.event === 'ready') {
        status = { state: 'ready' };
        pump();
        return;
      }
      const job = running;
      if (!job || message.id !== job.id) return;
      running = null;
      if (message.ok) job.resolve({ duration: message.duration ?? 0, words: message.words ?? [] });
      else job.reject(new Error(message.error ?? 'Kokoro could not read this sentence.'));
      pump();
    });

    // Keeps the last few log lines, so a crash can say why.
    createInterface({ input: process_.stderr }).on('line', (line) => {
      recentErrors = [...recentErrors, line].slice(-5);
    });

    process_.on('exit', (code) => {
      if (child !== process_) return;
      child = null;
      const reason = recentErrors.filter((line) => line.trim()).at(-1) ?? `exit code ${code}`;
      status = code === 0 ? { state: 'stopped' } : { state: 'error', message: `Kokoro stopped: ${reason}` };
      failAll(status.message ?? 'Kokoro stopped.');
    });
  };

  const synthesize = (request: SynthesisRequest, priority: Priority) =>
    new Promise<SynthesisResult>((resolve, reject) => {
      start();
      if (!child) return reject(new Error(status.message ?? 'Kokoro is not running.'));
      queues[priority].push({ id: String(nextId++), request, resolve, reject });
      pump();
    });

  const stop = () => {
    child?.kill();
    child = null;
    status = { state: 'stopped' };
    failAll('Kokoro was stopped.');
  };

  return {
    start,
    stop,
    synthesize,
    status: (): EngineStatus => (child || status.state !== 'stopped' || isInstalled() ? status : { state: 'missing' }),
  };
}

export type Kokoro = ReturnType<typeof createKokoro>;
