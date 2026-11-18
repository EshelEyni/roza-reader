import { useEffect, useState } from 'react';
import type { BookDownload, ChapterDownload, FocusVoice } from '../../../shared/focus';
import { bookDownload, chapterDownload } from './focusApi';
import { DownloadIcon } from './icons';
import { useDismiss } from './usePopover';

interface Props {
  bookId: string;
  chapter: number;
  title: string;
  voice: FocusVoice;
  isOpen: boolean;
  onOpen: () => void;
  onClose: () => void;
  onPlay: () => void;
}

export default function OfflineChapter(props: Props) {
  const { bookId, chapter, title, voice, isOpen, onOpen, onClose, onPlay } = props;
  const [status, setStatus] = useState<ChapterDownload | null>(null);
  const [bookStatus, setBookStatus] = useState<BookDownload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useDismiss(isOpen, onClose);

  useEffect(() => {
    let cancelled = false;
    let timer: number;
    const poll = async () => {
      try {
        const [next, nextBook] = await Promise.all([chapterDownload(bookId, chapter, voice.id), bookDownload(bookId, voice.id)]);
        if (cancelled) return;
        setStatus(next);
        setBookStatus(nextBook);
        setError(null);
        // The whole-book download fills this chapter too, so both are followed while either runs.
        if (next.state !== 'downloading' && nextBook.state !== 'downloading') return;
      } catch (failure) {
        if (!cancelled) setError((failure as Error).message);
      }
      if (!cancelled) timer = window.setTimeout(poll, 1500);
    };
    poll();
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [bookId, chapter, voice.id, isOpen, status?.state, bookStatus?.state]);

  const act = async (method: 'POST' | 'DELETE') => {
    setBusy(true);
    setError(null);
    try { setStatus(await chapterDownload(bookId, chapter, voice.id, method)); }
    catch (failure) { setError((failure as Error).message); }
    finally { setBusy(false); }
  };
  const actBook = async (method: 'POST' | 'DELETE') => {
    setBusy(true);
    setError(null);
    try { setBookStatus(await bookDownload(bookId, voice.id, method)); }
    catch (failure) { setError((failure as Error).message); }
    finally { setBusy(false); }
  };
  const ready = status?.state === 'ready';
  const running = status?.state === 'downloading';
  const percent = status?.total ? Math.floor(status.completed / status.total * 100) : 0;
  const bookReady = bookStatus?.state === 'ready';
  const bookRunning = bookStatus?.state === 'downloading';
  const bookPercent = bookStatus?.total ? Math.floor(bookStatus.completed / bookStatus.total * 100) : 0;
  const buttonLabel = bookRunning ? `Saving book ${bookPercent}%` : ready ? 'Offline ready' : running ? `Saving ${percent}%` : 'Save offline';
  return <>
    <button type="button" onClick={onOpen} title="Save this chapter for offline reading with word tracking">
      <DownloadIcon />
      <span>{buttonLabel}</span>
    </button>
    {isOpen && <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal focus-modal" role="dialog" aria-modal="true" aria-labelledby="offline-chapter-title" onMouseDown={event => event.stopPropagation()}>
        <h2 id="offline-chapter-title">Save for offline</h2>
        <p className="modal-meta">{title} · read by {voice.name}</p>
        <p>Save this chapter’s audio and word timings on this device. Play it in RozaReader with word highlighting, seeking, and playback speed controls, even without an internet connection.</p>
        <p className="modal-meta">Changing the voice requires a separate download. You can close this dialog while saving; keep RozaReader open until it finishes.</p>
        {status && <div className="focus-export-progress" role="status" aria-live="polite">
          <div className="focus-export-status">
            <span>{ready ? 'Ready for offline reading' : running ? 'Saving chapter…' : status.completed ? 'Partially saved — resume anytime' : 'Not saved yet'}</span>
            <span>{status.completed} / {status.total} sentences</span>
          </div>
          <progress className="focus-offline-progress" max={Math.max(status.total, 1)} value={status.completed} aria-label="Chapter download progress" />
        </div>}
        {(error || status?.error) && <p className="error" role="alert">{error ?? status?.error}</p>}
        <div className="form-actions">
          <button type="button" onClick={onClose}>Close</button>
          {ready ? <button type="button" className="primary" onClick={() => { onPlay(); onClose(); }}>Play with word tracking</button>
            : running ? <button type="button" disabled={busy} onClick={() => act('DELETE')}>{busy ? 'Stopping…' : 'Stop saving'}</button>
            : <button type="button" className="primary" disabled={busy || !status || bookRunning} onClick={() => act('POST')}>
              {busy ? 'Starting…' : status?.completed ? 'Resume download' : 'Download chapter'}
            </button>}
        </div>

        <section className="focus-offline-book" aria-labelledby="offline-book-title">
          <h3 id="offline-book-title">Whole book</h3>
          <p className="modal-meta">
            Saves every chapter in order, one sentence at a time, gently in the background, so the computer stays responsive.
            Each chapter is ready as soon as it finishes. Listening always comes first. Stop anytime; finished audio is kept.
          </p>
          {bookStatus && <div className="focus-export-progress" role="status" aria-live="polite">
            <div className="focus-export-status">
              <span>{bookReady ? 'The whole book is ready offline'
                : bookRunning ? `Saving chapter ${(bookStatus.chapter ?? 0) + 1} of ${bookStatus.chapters}…`
                : bookStatus.completed ? 'Partially saved — resume anytime' : 'Not saved yet'}</span>
              <span>{bookStatus.chaptersReady} / {bookStatus.chapters} chapters</span>
            </div>
            <progress className="focus-offline-progress" max={Math.max(bookStatus.total, 1)} value={bookStatus.completed} aria-label="Book download progress" />
            <span className="modal-meta">{bookPercent}% · {bookStatus.completed.toLocaleString()} / {bookStatus.total.toLocaleString()} sentences</span>
          </div>}
          {bookStatus?.error && !bookRunning && <p className="error" role="alert">{bookStatus.error}</p>}
          <div className="form-actions">
            {bookRunning ? <button type="button" disabled={busy} onClick={() => actBook('DELETE')}>{busy ? 'Stopping…' : 'Stop saving book'}</button>
              : !bookReady && <button type="button" className="primary" disabled={busy || !bookStatus} onClick={() => actBook('POST')}>
                {busy ? 'Starting…' : bookStatus?.completed ? 'Resume whole book' : 'Download whole book'}
              </button>}
          </div>
        </section>
      </div>
    </div>}
  </>;
}
