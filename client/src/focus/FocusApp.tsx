import { useEffect, useState } from 'react';
import { Navigate, NavLink, Route, Routes, useNavigate, useParams } from 'react-router-dom';
import type { FocusBook } from '../../../shared/focus';
import type { ThemeId } from '../../../shared/themes';
import SettingsMenu from '../components/SettingsMenu';
import { applyTheme, cachedTheme } from '../theme';
import { fetchFocusBook, startEngine } from './focusApi';
import { FocusPlayerProvider } from './FocusPlayer';
import { BookOpenIcon } from './icons';
import Library from './Library';
import { loadLibrary, saveSettings, useLibrary } from './libraryStore';
import MiniPlayer from './MiniPlayer';
import { bookPath } from './paths';
import Reader from './Reader';

// The first visit after the app starts returns to the last book; later visits show the library.
let hasRestoredLastBook = false;

function Home() {
  const { books, settings, isLoaded } = useLibrary();
  const navigate = useNavigate();
  const [isRestoreDone, setIsRestoreDone] = useState(hasRestoredLastBook);

  useEffect(() => {
    if (!isLoaded || hasRestoredLastBook) return setIsRestoreDone(hasRestoredLastBook);
    hasRestoredLastBook = true;
    const lastBook = books.find((item) => item.id === settings.lastBookId);
    if (lastBook) navigate(bookPath(lastBook.id), { replace: true });
    setIsRestoreDone(true);
  }, [isLoaded]);

  if (!isRestoreDone) return null;
  return <Library />;
}

function BookRoute() {
  const { bookId = '' } = useParams();
  const [book, setBook] = useState<FocusBook | null>(null);
  const [isMissing, setIsMissing] = useState(false);

  useEffect(() => {
    hasRestoredLastBook = true;
    setBook(null);
    setIsMissing(false);
    fetchFocusBook(bookId)
      .then(setBook)
      .catch(() => setIsMissing(true));
  }, [bookId]);

  if (isMissing) return <Navigate to="/" replace />;
  if (!book) return <div className="focus-reader focus-reader-loading">Opening book…</div>;
  return <Reader key={book.id} book={book} />;
}

/** RozaReader: an EPUB audiobook reader narrated by Kokoro, as its own app and window. */
export default function FocusApp() {
  const { settings, isLoaded } = useLibrary();
  const theme = settings.theme ?? cachedTheme();

  // Loads the voice model in the background, so the first Play doesn't wait for it.
  useEffect(() => {
    loadLibrary();
    startEngine().catch(() => {});
  }, []);

  useEffect(() => {
    if (isLoaded && settings.theme) applyTheme(settings.theme);
  }, [isLoaded, settings.theme]);

  const changeTheme = (next: ThemeId) => {
    applyTheme(next);
    saveSettings({ theme: next });
  };

  return (
    <FocusPlayerProvider>
      <div className="shell">
        <header className="header">
          <NavLink to="/" className="brand">
            <span className="brand-icon">
              <img src="/images/icon-192x192.png?v=reader-dog" alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
            </span>{' '}
            RozaReader
          </NavLink>
          <MiniPlayer />
          <SettingsMenu theme={theme} onThemeChange={changeTheme} />
        </header>
        <div className="shell-body">
          <Routes>
            <Route index element={<Home />} />
            <Route path="book/:bookId" element={<BookRoute />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
      </div>
    </FocusPlayerProvider>
  );
}
