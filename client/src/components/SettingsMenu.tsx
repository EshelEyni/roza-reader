import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { THEMES, type ThemeId } from '../../../shared/themes';
import { CheckIcon, SettingsIcon } from './icons';

interface Props {
  theme: ThemeId;
  onThemeChange: (theme: ThemeId) => void;
}

export default function SettingsMenu({ theme, onThemeChange }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    const activeOption = menuRef.current?.querySelector<HTMLElement>('[aria-checked="true"]');
    activeOption?.focus();

    const closeOnOutsideClick = (event: MouseEvent) => {
      const isInside = containerRef.current?.contains(event.target as Node);
      if (!isInside) setIsOpen(false);
    };
    document.addEventListener('mousedown', closeOnOutsideClick);
    return () => document.removeEventListener('mousedown', closeOnOutsideClick);
  }, [isOpen]);

  const close = () => {
    setIsOpen(false);
    triggerRef.current?.focus();
  };

  // Arrow keys move between themes, Escape closes and returns focus to the button.
  const handleMenuKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') return close();

    const isArrow = event.key === 'ArrowDown' || event.key === 'ArrowUp';
    if (!isArrow) return;
    event.preventDefault();

    const options = [...(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitemradio"]') ?? [])];
    const currentIndex = options.indexOf(document.activeElement as HTMLElement);
    const step = event.key === 'ArrowDown' ? 1 : -1;
    options[(currentIndex + step + options.length) % options.length]?.focus();
  };

  return (
    <div className="settings" ref={containerRef}>
      <button
        ref={triggerRef}
        type="button"
        className={`settings-trigger ${isOpen ? 'active' : ''}`}
        title="Settings"
        aria-label="Settings"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        onClick={() => setIsOpen(!isOpen)}
      >
        <SettingsIcon />
      </button>

      {isOpen && (
        <div ref={menuRef} className="menu" role="menu" aria-label="Theme" onKeyDown={handleMenuKeyDown}>
          <div className="menu-label">Theme</div>
          {THEMES.map((option) => {
            const isActive = option.id === theme;
            const { bg, panel, accent, text } = option.swatch;

            return (
              <button
                key={option.id}
                type="button"
                role="menuitemradio"
                aria-checked={isActive}
                className={`theme-option ${isActive ? 'active' : ''}`}
                onClick={() => onThemeChange(option.id)}
              >
                <span className="theme-swatch" style={{ background: bg }} aria-hidden="true">
                  <span className="theme-swatch-panel" style={{ background: panel }}>
                    <span className="theme-swatch-line" style={{ background: text }} />
                    <span className="theme-swatch-dot" style={{ background: accent }} />
                  </span>
                </span>
                <span className="theme-text">
                  <span className="theme-name">{option.label}</span>
                  <span className="theme-desc">{option.description}</span>
                </span>
                <span className="theme-check">{isActive && <CheckIcon />}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
