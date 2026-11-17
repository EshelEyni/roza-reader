import { useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { scriptOf } from '../../../shared/focus';
import { CloseIcon } from '../components/icons';
import { useFocusPlayer } from './FocusPlayer';
import { FastForwardIcon, PauseIcon, PlayIcon, RewindIcon } from './icons';
import { bookPath } from './paths';

/** Small player controls in the header, shown while a book is loaded and its reader is not open. */
export default function MiniPlayer() {
  const { book, chapterIndex, narration, close } = useFocusPlayer();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const chapter = book?.chapters[chapterIndex];
  const wordCount = useMemo(() => (chapter ? scriptOf(chapter).wordCount : 0), [chapter]);

  const isReaderOpen = Boolean(book) && pathname === bookPath(book?.id ?? '');
  if (!book || !chapter || isReaderOpen) return null;

  const percent = wordCount ? Math.round((narration.wordIndex / wordCount) * 100) : 0;
  const [from, to] = book.coverColors;

  return (
    <div className="focus-mini" role="group" aria-label="RozaReader player">
      <button type="button" className="focus-mini-book" title={`Open ${book.title}`} onClick={() => navigate(bookPath(book.id))}>
        {book.hasCover ? (
          <img className="focus-mini-cover" src={`/api/focus/books/${book.id}/cover`} alt="" />
        ) : (
          <span className="focus-mini-cover" style={{ background: `linear-gradient(155deg, ${from}, ${to})` }} />
        )}
        <span className="focus-mini-text">
          <span className="focus-mini-title">{book.title}</span>
          <span className="focus-mini-chapter">{chapter.title}</span>
        </span>
      </button>
      <button type="button" className="focus-mini-control" title="Previous sentence" onClick={narration.previousSentence}>
        <RewindIcon />
      </button>
      <button
        type="button"
        className={`focus-mini-play ${narration.isLoading ? 'loading' : ''}`}
        title={narration.isPlaying ? 'Pause' : 'Play'}
        aria-pressed={narration.isPlaying}
        onClick={narration.togglePlay}
      >
        {narration.isPlaying ? <PauseIcon /> : <PlayIcon />}
      </button>
      <button type="button" className="focus-mini-control" title="Next sentence" onClick={narration.nextSentence}>
        <FastForwardIcon />
      </button>
      <button type="button" className="focus-mini-control" title="Stop and close" onClick={close}>
        <CloseIcon />
      </button>
      <span className="focus-mini-progress" style={{ width: `${percent}%` }} />
    </div>
  );
}
