import { Fragment, memo, useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { useVirtualizer, type Range } from '@tanstack/react-virtual';
import type { NarrationScript, NarrationSentence } from '../../../shared/focus';

// Keep roughly 50 paragraphs on either side of the visible reading position.
export function readingRange(range: Range) {
  const start = Math.max(0, Math.min(range.startIndex - 45, range.count - 100));
  const end = Math.min(range.count, Math.max(start + 100, range.endIndex + 1));
  return Array.from({ length: end - start }, (_, index) => start + index);
}

const Sentence = memo(function Sentence({ sentence, active, word, jump }: {
  sentence: NarrationSentence; active: boolean; word: number; jump: (word: number) => void;
}) {
  return <span data-sentence={sentence.index} className={`focus-sentence${active ? ' current' : ''}`}
    title="Read from here" onClick={() => jump(sentence.words[0].index)}>
    {active ? sentence.words.map(item => <Fragment key={item.index}>
      <span className={item.index === word ? 'focus-word current' : undefined}>{item.text}</span>{item.space}
    </Fragment>) : sentence.words.map(item => item.text + item.space).join('')}
  </span>;
});

const Paragraph = memo(function Paragraph({ sentences, sentence, word, jump }: {
  sentences: NarrationSentence[]; sentence: number; word: number; jump: (word: number) => void;
}) {
  return <p>{sentences.map(item => <Sentence key={item.index} sentence={item} active={item.index === sentence}
    word={item.index === sentence ? word : -1} jump={jump} />)}</p>;
});

export default function VirtualText({ script, scrollRef, sentence, word, playing, fontSize, jump }: {
  script: NarrationScript; scrollRef: RefObject<HTMLDivElement>; sentence: number; word: number;
  playing: boolean; fontSize: number; jump: (word: number) => void;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const [margin, setMargin] = useState(0);
  const [resizeVersion, setResizeVersion] = useState(0);
  const pausedUntil = useRef(0);
  const latestJump = useRef(jump);
  latestJump.current = jump;
  const stableJump = useMemo(() => (index: number) => latestJump.current(index), []);
  const paragraphOfSentence = useMemo(() => {
    const result: number[] = [];
    script.paragraphs.forEach((paragraph, index) => paragraph.forEach(item => result[item.index] = index));
    return result;
  }, [script]);
  const activeParagraph = paragraphOfSentence[sentence] ?? 0;
  const virtualizer = useVirtualizer({
    count: script.paragraphs.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: index => {
      const characters = script.paragraphs[index].reduce((sum, item) => sum + item.words.reduce((n, w) => n + w.text.length + w.space.length, 0), 0);
      const width = listRef.current?.clientWidth ?? 596;
      return Math.max(1, Math.ceil(characters * fontSize * 0.5 / width)) * fontSize * 1.75 + fontSize * 1.15;
    },
    rangeExtractor: readingRange,
    scrollMargin: margin,
    useAnimationFrameWithResizeObserver: true,
  });
  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;
    const pause = () => { pausedUntil.current = Date.now() + 4000; };
    container.addEventListener('wheel', pause, { passive: true });
    container.addEventListener('touchmove', pause, { passive: true });
    container.addEventListener('pointerdown', pause, { passive: true });
    return () => {
      container.removeEventListener('wheel', pause);
      container.removeEventListener('touchmove', pause);
      container.removeEventListener('pointerdown', pause);
    };
  }, [scrollRef]);
  useEffect(() => {
    const container = scrollRef.current;
    const list = listRef.current;
    if (!container || !list) return;
    const update = () => {
      const view = container.getBoundingClientRect();
      const current = container.querySelector('.focus-sentence.current')?.getBoundingClientRect();
      if (current && current.top >= view.top && current.top < view.bottom) setResizeVersion(version => version + 1);
      setMargin(list.getBoundingClientRect().top - container.getBoundingClientRect().top + container.scrollTop);
      virtualizer.measure();
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(container);
    return () => observer.disconnect();
  }, [fontSize, virtualizer, scrollRef]);
  const restored = useRef(false);
  const previousSentence = useRef(sentence);
  const previousFont = useRef(fontSize);
  const previousResize = useRef(resizeVersion);
  useLayoutEffect(() => {
    let frame = requestAnimationFrame(() => {
      if (!virtualizer.scrollElement) return;
      const initial = !restored.current;
      restored.current = true;
      const sought = previousSentence.current !== sentence && (!playing || Math.abs(previousSentence.current - sentence) > 1);
      const resized = previousFont.current !== fontSize || previousResize.current !== resizeVersion;
      previousSentence.current = sentence;
      previousFont.current = fontSize;
      previousResize.current = resizeVersion;
      if (!initial && !sought && !resized && (!playing || Date.now() < pausedUntil.current)) return;
      const container = scrollRef.current;
      if (!container) return;
      const reveal = (attempt: number) => {
        const target = container.querySelector('[data-sentence="' + sentence + '"]');
        const view = container.getBoundingClientRect();
        const rect = target?.getBoundingClientRect();
        if (rect && rect.top >= view.top + view.height * 0.15 && rect.bottom <= view.top + view.height * 0.7) return;
        if (rect) container.scrollBy({ top: rect.top - view.top - view.height * 0.3, behavior: initial || sought || resized ? 'instant' : 'smooth' });
        else if (attempt < 4) {
          virtualizer.scrollToIndex(activeParagraph, { align: 'center' });
          frame = requestAnimationFrame(() => reveal(attempt + 1));
        }
      };
      reveal(0);
    });
    return () => cancelAnimationFrame(frame);
  }, [sentence, playing, activeParagraph, virtualizer, margin, fontSize, resizeVersion]);
  return <div ref={listRef} className="focus-virtual-text" style={{ height: virtualizer.getTotalSize() }}>
    {virtualizer.getVirtualItems().map(item => {
      const active = item.index === activeParagraph;
      return <div key={item.key} data-index={item.index} ref={virtualizer.measureElement} className="focus-virtual-paragraph"
        style={{ transform: `translateY(${item.start - virtualizer.options.scrollMargin}px)` }}>
        <Paragraph sentences={script.paragraphs[item.index]} sentence={active ? sentence : -1} word={active ? word : -1} jump={stableJump} />
      </div>;
    })}
  </div>;
}
