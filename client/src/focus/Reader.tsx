import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { DEFAULT_FONT_SIZE, FOCUS_VOICES, FONT_SIZES, scriptOf, type FocusBook } from '../../../shared/focus';
import ExportDialog from './ExportDialog';
import { useFocusPlayer } from './FocusPlayer';
import { ChevronLeftIcon, ChevronRightIcon, ListIcon } from './icons';
import { saveSettings, useLibrary } from './libraryStore';
import { bookProgress } from './narration';
import { LIBRARY_PATH } from './paths';
import Player from './Player';
import { useDismiss } from './usePopover';
import VoiceDialog from './VoiceDialog';
import OfflineChapter from './OfflineChapter';
import VirtualText from './VirtualText';

const isTyping = (target: EventTarget | null) =>
  target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));

/** Opens the book in the app-wide player (if another is playing, it stops), then shows it. */
export default function Reader({ book }: { book: FocusBook }) {
  const player = useFocusPlayer();
  const isOpen = player.book?.id === book.id;

  useEffect(() => {
    player.open(book);
  }, [book.id]);

  if (!isOpen || !player.book) return <div className="focus-reader focus-reader-loading">Opening book…</div>;
  return <ReaderView book={player.book} />;
}

function ReaderView({ book }: { book: FocusBook }) {
  const { settings } = useLibrary();
  const { chapterIndex, narration, goToChapter: playChapter } = useFocusPlayer();
  const [dialog, setDialog] = useState<'voice' | 'export' | 'offline' | null>(null);
  const [isContentsOpen, setIsContentsOpen] = useState(false);
  const contentsRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const chapter = book.chapters[chapterIndex];
  const script = useMemo(() => scriptOf(chapter), [chapter]);
  const isFirstChapter = chapterIndex === 0;
  const isLastChapter = chapterIndex === book.chapters.length - 1;

  useDismiss(isContentsOpen, () => setIsContentsOpen(false), contentsRef);

  const fontIndex = Math.max(FONT_SIZES.indexOf(settings.fontSize ?? DEFAULT_FONT_SIZE), 0);
  const changeFontSize = (step: number) => {
    const next = Math.min(Math.max(fontIndex + step, 0), FONT_SIZES.length - 1);
    if (next !== fontIndex) saveSettings({ fontSize: FONT_SIZES[next] });
  };

  const goToChapter = (index: number) => {
    playChapter(index);
    setIsContentsOpen(false);
  };

  // Space plays and pauses, arrows move by sentence (Shift: chapter), + and − change the text size.
  const shortcuts = useRef<(event: KeyboardEvent) => void>(() => {});
  shortcuts.current = (event: KeyboardEvent) => {
    if (dialog || isTyping(event.target) || event.metaKey || event.ctrlKey || event.altKey) return;
    const actions: Record<string, () => void> = {
      ' ': narration.togglePlay,
      ArrowLeft: () => (event.shiftKey ? goToChapter(chapterIndex - 1) : narration.previousSentence()),
      ArrowRight: () => (event.shiftKey ? goToChapter(chapterIndex + 1) : narration.nextSentence()),
      '+': () => changeFontSize(1),
      '=': () => changeFontSize(1),
      '-': () => changeFontSize(-1),
    };
    const action = actions[event.key];
    if (!action) return;
    event.preventDefault();
    // A focused button would also click on Space and undo the toggle.
    if (event.target instanceof HTMLButtonElement) event.target.blur();
    action();
  };

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => shortcuts.current(event);
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, []);

  const percent = Math.round(bookProgress({ ...book, position: { chapter: chapterIndex, word: narration.wordIndex } }) * 100);
  const voice = FOCUS_VOICES.find((item) => item.id === settings.voiceId) ?? FOCUS_VOICES[0];

  return (
    <div className="focus-reader">
      <header className="focus-reader-bar">
        <Link to={LIBRARY_PATH} className="button focus-back">
          <ChevronLeftIcon />
          <span>Library</span>
        </Link>

        <div className="focus-reader-titles">
          <span className="focus-reader-book">{book.title}</span>
          <span className="focus-reader-chapter">{chapter.title}</span>
        </div>

        <div className="focus-reader-tools">
          <OfflineChapter key={`${book.id}/${chapterIndex}/${voice.id}`} bookId={book.id} chapter={chapterIndex} title={chapter.title} voice={voice}
            isOpen={dialog === 'offline'} onOpen={() => setDialog('offline')} onClose={() => setDialog(null)}
            onPlay={() => { if (!narration.isPlaying) narration.togglePlay(); }} />
          <div className="focus-popover-anchor" ref={contentsRef}>
            <button type="button" onClick={() => setIsContentsOpen(!isContentsOpen)} aria-expanded={isContentsOpen}>
              <ListIcon />
              <span>Contents</span>
            </button>
            {isContentsOpen && (
              <div className="focus-popover focus-contents" role="menu">
                <p className="focus-popover-label">Chapters</p>
                {book.chapters.map((item, index) => (
                  <button
                    key={index}
                    type="button"
                    role="menuitem"
                    className={index === chapterIndex ? 'active' : ''}
                    onClick={() => goToChapter(index)}
                  >
                    <span className="focus-contents-number">{index + 1}</span>
                    <span>{item.title}</span>
                  </button>
                ))}
                <p className="focus-shortcuts">Space play · ← → sentence · ⇧← ⇧→ chapter · + − text size</p>
              </div>
            )}
          </div>
          <div className="focus-font-size" role="group" aria-label="Text size">
            <button type="button" title="Smaller text (−)" onClick={() => changeFontSize(-1)} disabled={fontIndex === 0}>
              A<sup>−</sup>
            </button>
            <button type="button" title="Larger text (+)" onClick={() => changeFontSize(1)} disabled={fontIndex === FONT_SIZES.length - 1}>
              A<sup>+</sup>
            </button>
          </div>
        </div>
      </header>

      <div className="focus-reader-progress" title={`${percent}% of the book`}>
        <span style={{ width: `${percent}%` }} />
      </div>

      <div className="focus-reader-scroll" ref={scrollRef}>
        <article className="focus-text" style={{ fontSize: FONT_SIZES[fontIndex] }}>
          <p className="focus-kicker">
            Chapter {chapterIndex + 1} of {book.chapters.length} · {percent}% of book
          </p>
          <h1>{chapter.title}</h1>

          <VirtualText key={chapterIndex} script={script} scrollRef={scrollRef}
            sentence={narration.sentenceIndex} word={narration.wordIndex} playing={narration.isPlaying}
            fontSize={FONT_SIZES[fontIndex]} jump={narration.jumpTo} />

          <nav className="focus-chapter-nav">
            <button type="button" onClick={() => goToChapter(chapterIndex - 1)} disabled={isFirstChapter}>
              <ChevronLeftIcon />
              <span>Previous chapter</span>
            </button>
            <button type="button" onClick={() => goToChapter(chapterIndex + 1)} disabled={isLastChapter}>
              <span>Next chapter</span>
              <ChevronRightIcon />
            </button>
          </nav>
        </article>
      </div>

      <Player
        narration={narration}
        script={script}
        speed={settings.speed}
        voice={voice}
        canGoBack={!isFirstChapter}
        canGoForward={!isLastChapter}
        onSpeedChange={(speed) => saveSettings({ speed })}
        onPreviousChapter={() => goToChapter(chapterIndex - 1)}
        onNextChapter={() => goToChapter(chapterIndex + 1)}
        onOpenVoices={() => setDialog('voice')}
        onOpenExport={() => setDialog('export')}
      />

      {dialog === 'voice' && (
        <VoiceDialog
          selectedId={settings.voiceId}
          onApply={(voiceId) => {
            saveSettings({ voiceId });
            setDialog(null);
          }}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === 'export' && <ExportDialog book={book} chapterIndex={chapterIndex} voice={voice} onClose={() => setDialog(null)} />}
    </div>
  );
}
