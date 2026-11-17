import { useEffect, useState } from 'react';
import {
  EXPORT_FORMATS,
  type ExportFormat,
  type ExportJob,
  type ExportScope,
  type FocusBook,
  type FocusVoice,
} from '../../../shared/focus';
import { CheckIcon } from '../components/icons';
import { chooseFolder, fetchExport, revealExport, startExport, stopExport } from './focusApi';
import { FolderIcon } from './icons';
import { saveSettings, useLibrary } from './libraryStore';
import { estimatedSeconds, formatTime } from './narration';
import { useDismiss } from './usePopover';

interface Props {
  book: FocusBook;
  chapterIndex: number;
  voice: FocusVoice;
  onClose: () => void;
}

// Speech is encoded at 64 kbps; the size is an estimate from the word count.
const BYTES_PER_SECOND = 8000;

/** Exports narrated audio with Kokoro and ffmpeg. Closing the dialog keeps a running export going. */
export default function ExportDialog({ book, chapterIndex, voice, onClose }: Props) {
  const { settings } = useLibrary();
  const [scope, setScope] = useState<ExportScope>('chapter');
  const [format, setFormat] = useState<ExportFormat>('m4a');
  const [job, setJob] = useState<ExportJob | null>(null);
  const [error, setError] = useState<string | null>(null);
  useDismiss(true, onClose);

  const isRunning = job?.state === 'running';
  const isDone = job?.state === 'done';
  const folder = settings.exportFolder;

  // Follows the export while it runs.
  useEffect(() => {
    if (!job || job.state !== 'running') return;
    const timer = window.setTimeout(() => {
      fetchExport(job.id)
        .then(setJob)
        .catch((pollError: Error) => setError(pollError.message));
    }, 500);
    return () => window.clearTimeout(timer);
  }, [job]);

  const chapterWords = book.chapterWordCounts[chapterIndex];
  const bookWords = book.chapterWordCounts.reduce((sum, count) => sum + count, 0);
  const seconds = estimatedSeconds(scope === 'chapter' ? chapterWords : bookWords);
  const megabytes = ((seconds * BYTES_PER_SECOND) / 1_000_000).toFixed(1);

  const scopes: { id: ExportScope; label: string; detail: string }[] = [
    { id: 'chapter', label: 'Current chapter', detail: `${book.chapters[chapterIndex].title} · about ${formatTime(estimatedSeconds(chapterWords))}` },
    { id: 'book', label: 'Entire book', detail: `${book.chapters.length} chapters · about ${formatTime(estimatedSeconds(bookWords))}` },
  ];

  const pickFolder = async () => {
    try {
      const { folder: picked } = await chooseFolder(folder);
      if (picked) saveSettings({ exportFolder: picked });
    } catch (pickError) {
      setError((pickError as Error).message);
    }
  };

  const handleExport = async () => {
    setError(null);
    try {
      setJob(await startExport({ bookId: book.id, scope, chapter: chapterIndex, format, voiceId: voice.id, folder }));
    } catch (exportError) {
      setError((exportError as Error).message);
    }
  };

  const handleStop = async () => {
    if (!job) return;
    setJob(await stopExport(job.id).catch(() => job));
  };

  const statusText = () => {
    if (!job) return '';
    if (job.state === 'done') return 'Saved';
    if (job.state === 'stopped') return 'Stopped';
    if (job.state === 'error') return 'Export failed';
    return job.stage;
  };

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal focus-modal" role="dialog" aria-labelledby="focus-export-title" onMouseDown={(event) => event.stopPropagation()}>
        <h2 id="focus-export-title">Download audio</h2>
        <p className="modal-meta">
          {book.title} · read by {voice.name}
        </p>

        <fieldset className="focus-fieldset" disabled={isRunning}>
          <legend>What to export</legend>
          <div className="focus-choice-grid">
            {scopes.map((option) => (
              <label key={option.id} className={`focus-choice ${scope === option.id ? 'selected' : ''}`}>
                <input type="radio" name="focus-scope" checked={scope === option.id} onChange={() => setScope(option.id)} />
                <span className="focus-choice-label">{option.label}</span>
                <span className="focus-choice-detail">{option.detail}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className="focus-fieldset" disabled={isRunning}>
          <legend>Format</legend>
          <div className="focus-choice-grid three">
            {EXPORT_FORMATS.map((option) => (
              <label key={option.id} className={`focus-choice ${format === option.id ? 'selected' : ''}`}>
                <input type="radio" name="focus-format" checked={format === option.id} onChange={() => setFormat(option.id)} />
                <span className="focus-choice-label">{option.label}</span>
                <span className="focus-choice-detail">{option.detail}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className="focus-fieldset" disabled={isRunning}>
          <legend>Destination folder</legend>
          <div className="focus-folder">
            <FolderIcon />
            <span className="focus-folder-path">{folder}</span>
            <button type="button" onClick={pickFolder}>
              Choose…
            </button>
          </div>
          <p className="focus-file-preview">
            {format.toUpperCase()} · 64 kbps · about {megabytes} MB{scope === 'book' ? ' · with chapter markers' : ''}
          </p>
        </fieldset>

        {error && <div className="error">{error}</div>}

        {job && (
          <div className="focus-export-progress" role="status">
            <div className="focus-export-status">
              <span>{statusText()}</span>
              <span>{job.progress}%</span>
            </div>
            <div className="focus-meter large">
              <span style={{ width: `${job.progress}%` }} />
            </div>
            {isDone && job.filePath && <p className="focus-file-preview">{job.filePath}</p>}
            {job.state === 'error' && <p className="modal-meta">{job.error}</p>}
            {isRunning && <p className="modal-meta">You can close this window; the export keeps going.</p>}
          </div>
        )}

        <div className="form-actions">
          {isRunning ? (
            <button type="button" onClick={handleStop}>
              Stop
            </button>
          ) : (
            <button type="button" onClick={onClose}>
              {isDone ? 'Close' : 'Cancel'}
            </button>
          )}
          {isDone ? (
            <button type="button" className="primary done" onClick={() => revealExport(job.id).catch(() => {})}>
              <CheckIcon />
              <span>Show in Finder</span>
            </button>
          ) : (
            <button type="button" className="primary" onClick={handleExport} disabled={isRunning}>
              {isRunning ? 'Exporting…' : 'Export'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
