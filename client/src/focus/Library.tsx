import { useEffect, useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import type { EngineStatus, FocusBookSummary } from '../../../shared/focus';
import { TrashIcon } from '../components/icons';
import BookCover from './BookCover';
import { fetchEngineStatus } from './focusApi';
import { BookOpenIcon, UploadIcon } from './icons';
import { importEpubs, removeBook, useLibrary, type ImportResult } from './libraryStore';
import { bookPath } from './paths';
import { bookProgress, bookWordCount, estimatedSeconds, formatTime } from './narration';

const EPUB_ACCEPT = '.epub,application/epub+zip';

const hasFiles = (event: DragEvent) => event.dataTransfer.types.includes('Files');

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;

function progressLabel(book: FocusBookSummary) {
  const percent = Math.round(bookProgress(book) * 100);
  if (percent === 0) return `Not started · about ${formatTime(estimatedSeconds(bookWordCount(book)))}`;
  return `${percent}% · Chapter ${book.position.chapter + 1} of ${book.chapterTitles.length}`;
}

function importMessage({ added, failed, skipped }: ImportResult) {
  const parts = [
    added.length ? `Imported ${added.length === 1 ? `“${added[0]}”` : plural(added.length, 'book')}.` : '',
    ...failed.map((item) => `${item.name}: ${item.error}`),
    skipped ? `Skipped ${plural(skipped, 'file')} that ${skipped === 1 ? 'is' : 'are'} not EPUB.` : '',
  ];
  return parts.filter(Boolean).join(' ');
}

const ENGINE_LABELS: Record<EngineStatus['state'], string> = {
  missing: 'Voice engine not installed',
  stopped: 'Voice engine idle',
  loading: 'Loading voice engine…',
  ready: 'Voice engine ready',
  error: 'Voice engine error',
};

/** Shows whether Kokoro is ready, and checks again while it loads. */
function EngineBadge() {
  const [status, setStatus] = useState<EngineStatus | null>(null);

  useEffect(() => {
    let timer = 0;
    const check = () =>
      fetchEngineStatus()
        .then((next) => {
          setStatus(next);
          if (next.state === 'loading') timer = window.setTimeout(check, 1500);
        })
        .catch(() => {});
    check();
    return () => window.clearTimeout(timer);
  }, []);

  if (!status) return null;
  return (
    <span className={`focus-engine ${status.state}`} title={status.message ?? ''}>
      <span className="focus-engine-dot" />
      {ENGINE_LABELS[status.state]}
    </span>
  );
}

export default function Library() {
  const { books, isLoaded, error } = useLibrary();
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  // Drag events fire on every child; counting enter/leave keeps the overlay from flickering.
  const dragDepth = useRef(0);
  const [isDragging, setIsDragging] = useState(false);
  const [importing, setImporting] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ text: string; isError: boolean } | null>(null);

  const importFiles = async (files: File[]) => {
    if (importing || !files.length) return;
    setNotice(null);
    const result = await importEpubs(files, (done, total) =>
      setImporting(total > 1 ? `Importing ${done + 1} of ${total}…` : 'Importing…')
    );
    setImporting(null);
    setNotice({ text: importMessage(result), isError: result.failed.length > 0 && !result.added.length });
  };

  const handlePick = (event: ChangeEvent<HTMLInputElement>) => {
    importFiles([...(event.target.files ?? [])]);
    event.target.value = '';
  };

  const dropProps = {
    onDragEnter: (event: DragEvent) => {
      if (!hasFiles(event)) return;
      dragDepth.current += 1;
      setIsDragging(true);
    },
    onDragOver: (event: DragEvent) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'copy';
    },
    onDragLeave: () => {
      dragDepth.current = Math.max(0, dragDepth.current - 1);
      if (dragDepth.current === 0) setIsDragging(false);
    },
    onDrop: (event: DragEvent) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      dragDepth.current = 0;
      setIsDragging(false);
      importFiles([...event.dataTransfer.files]);
    },
  };

  const handleRemove = async (book: FocusBookSummary) => {
    const isConfirmed = window.confirm(`Remove "${book.title}" and its saved audio from your library?`);
    if (!isConfirmed) return;
    try {
      await removeBook(book.id);
    } catch (removeError) {
      setNotice({ text: `Could not remove the book: ${(removeError as Error).message}`, isError: true });
    }
  };

  const openPicker = () => inputRef.current?.click();

  return (
    <div className={`focus-library ${isDragging ? 'dragging' : ''}`} {...dropProps}>
      <input ref={inputRef} type="file" accept={EPUB_ACCEPT} multiple hidden onChange={handlePick} />

      <div className="focus-library-inner">
        <div className="focus-library-head">
          <div>
            <h1>Library</h1>
            <p className="focus-subtitle">
              {plural(books.length, 'book')} · Drop EPUB files anywhere here to import · <EngineBadge />
            </p>
          </div>
          <button type="button" className="primary" onClick={openPicker} disabled={Boolean(importing)}>
            <UploadIcon />
            <span>{importing ?? 'Import EPUB'}</span>
          </button>
        </div>

        {error && <div className="error">{error}</div>}
        {notice && (
          <div className={`focus-notice ${notice.isError ? 'error-notice' : ''}`} role="status">
            <span>{notice.text}</span>
            <button type="button" className="icon-plain" onClick={() => setNotice(null)}>
              Dismiss
            </button>
          </div>
        )}

        {isLoaded && books.length === 0 && (
          <div className="focus-empty">
            <span className="focus-empty-icon">
              <BookOpenIcon />
            </span>
            <h2>Your library is empty</h2>
            <p>Import your first EPUB to start listening. You can also drop files here.</p>
            <button type="button" className="primary" onClick={openPicker} disabled={Boolean(importing)}>
              <UploadIcon />
              <span>{importing ?? 'Import EPUB'}</span>
            </button>
          </div>
        )}

        {books.length > 0 && (
          <div className="focus-grid">
            {books.map((book) => {
              const percent = Math.round(bookProgress(book) * 100);
              const open = () => navigate(bookPath(book.id));
              return (
                <article
                  key={book.id}
                  className="focus-book"
                  role="button"
                  tabIndex={0}
                  title={`Open ${book.title}`}
                  onClick={open}
                  onKeyDown={(event) => event.key === 'Enter' && open()}
                >
                  <BookCover book={book} />
                  <div className="focus-book-info">
                    <h3>{book.title}</h3>
                    <p className="focus-book-author">{book.author}</p>
                    <div className="focus-meter" aria-label={`${percent}% listened`}>
                      <span style={{ width: `${percent}%` }} />
                    </div>
                    <p className="focus-book-meta">{progressLabel(book)}</p>
                  </div>
                  <div className="focus-book-actions" onClick={(event) => event.stopPropagation()}>
                    <button type="button" className="primary" onClick={open}>
                      {percent > 0 ? 'Continue' : 'Open'}
                    </button>
                    <button type="button" className="icon-ghost" title="Remove book" onClick={() => handleRemove(book)}>
                      <TrashIcon />
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>

      {isDragging && (
        <div className="focus-drop-overlay">
          <UploadIcon />
          <span>Drop EPUB files to import</span>
        </div>
      )}
    </div>
  );
}
