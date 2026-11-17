import { useEffect, useRef, type RefObject } from 'react';

/** Calls `onClose` on Escape, and on a click outside `ref` when one is given. */
export function useDismiss(isOpen: boolean, onClose: () => void, ref?: RefObject<HTMLElement | null>) {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (event: KeyboardEvent) => event.key === 'Escape' && onCloseRef.current();
    const handleClick = (event: MouseEvent) => {
      const isOutside = ref?.current && !ref.current.contains(event.target as Node);
      if (isOutside) onCloseRef.current();
    };
    document.addEventListener('keydown', handleKey);
    document.addEventListener('mousedown', handleClick);
    return () => {
      document.removeEventListener('keydown', handleKey);
      document.removeEventListener('mousedown', handleClick);
    };
  }, [isOpen, ref]);
}
