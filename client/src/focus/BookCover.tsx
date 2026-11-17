import { useState } from 'react';
import type { FocusBookSummary } from '../../../shared/focus';

/** The EPUB's own cover, or a drawn one from the book's colors when it has none. */
export default function BookCover({ book }: { book: FocusBookSummary }) {
  const [hasImageFailed, setHasImageFailed] = useState(false);
  const [from, to] = book.coverColors;

  if (book.hasCover && !hasImageFailed) {
    return (
      <div className="focus-cover image">
        <img src={`/api/focus/books/${book.id}/cover`} alt="" loading="lazy" onError={() => setHasImageFailed(true)} />
      </div>
    );
  }

  return (
    <div className="focus-cover" style={{ background: `linear-gradient(155deg, ${from} 0%, ${from} 45%, ${to} 140%)` }}>
      <span className="focus-cover-spine" />
      <span className="focus-cover-title">{book.title}</span>
      <span className="focus-cover-author">{book.author}</span>
    </div>
  );
}
