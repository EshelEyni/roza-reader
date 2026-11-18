import { useEffect, useMemo, useState } from 'react';
import { FOCUS_VOICES, type FocusVoice } from '../../../shared/focus';
import { CheckIcon } from '../components/icons';
import { fetchVoicePreview } from './focusApi';
import { PauseIcon, PlayIcon } from './icons';
import { useDismiss } from './usePopover';

interface Props {
  selectedId: string;
  onApply: (voiceId: string) => void;
  onClose: () => void;
}

const languages = [...new Set(FOCUS_VOICES.map((voice) => voice.language))];

const ALL = 'All';
const GENDERS = [ALL, 'Female', 'Male'] as const;
const NATIONALITIES = [ALL, ...new Set(FOCUS_VOICES.map((voice) => voice.nationality))];

type GenderFilter = (typeof GENDERS)[number];

interface FilterProps<T extends string> {
  label: string;
  options: readonly T[];
  value: T;
  onChange: (value: T) => void;
}

function FilterChips<T extends string>({ label, options, value, onChange }: FilterProps<T>) {
  return (
    <div className="focus-voice-filter" role="radiogroup" aria-label={label}>
      <span className="focus-popover-label">{label}</span>
      {options.map((option) => (
        <button
          key={option}
          type="button"
          role="radio"
          aria-checked={option === value}
          className={option === value ? 'active' : ''}
          onClick={() => onChange(option)}
        >
          {option}
        </button>
      ))}
    </div>
  );
}

/** Picks a Kokoro voice, with a short spoken preview of each. The choice only applies on Apply. */
export default function VoiceDialog({ selectedId, onApply, onClose }: Props) {
  const [choice, setChoice] = useState(selectedId);
  const [preview, setPreview] = useState<{ voice: string; state: 'loading' | 'playing' } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [gender, setGender] = useState<GenderFilter>(ALL);
  const [nationality, setNationality] = useState<string>(ALL);
  const audio = useMemo(() => new Audio(), []);
  useDismiss(true, onClose);

  useEffect(() => {
    const handleEnded = () => setPreview(null);
    audio.addEventListener('ended', handleEnded);
    return () => {
      audio.removeEventListener('ended', handleEnded);
      audio.pause();
    };
  }, [audio]);

  const togglePreview = async (voice: string) => {
    audio.pause();
    if (preview?.voice === voice) return setPreview(null);
    setError(null);
    setPreview({ voice, state: 'loading' });
    try {
      const { url } = await fetchVoicePreview(voice);
      audio.src = url;
      await audio.play();
      setPreview((current) => (current?.voice === voice ? { voice, state: 'playing' } : current));
    } catch (previewError) {
      setPreview(null);
      setError(`Could not play the preview: ${(previewError as Error).message}`);
    }
  };

  const matchesFilters = (voice: FocusVoice) => {
    const isGenderMatch = gender === ALL || voice.gender === gender;
    const isNationalityMatch = nationality === ALL || voice.nationality === nationality;
    return isGenderMatch && isNationalityMatch;
  };
  const shownVoices = FOCUS_VOICES.filter(matchesFilters);
  const shownLanguages = languages.filter((language) => shownVoices.some((voice) => voice.language === language));

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal focus-modal" role="dialog" aria-labelledby="focus-voice-title" onMouseDown={(event) => event.stopPropagation()}>
        <h2 id="focus-voice-title">Choose a voice</h2>
        <p className="modal-meta">Kokoro runs on this Mac. Press play to hear a voice; the first preview takes a few seconds.</p>
        {error && <div className="error">{error}</div>}

        <div className="focus-voice-filters">
          <FilterChips label="Gender" options={GENDERS} value={gender} onChange={setGender} />
          <FilterChips label="Nationality" options={NATIONALITIES} value={nationality} onChange={setNationality} />
        </div>

        <div className="focus-voice-list">
          {shownLanguages.length === 0 && <p className="modal-meta">No voices match these filters.</p>}
          {shownLanguages.map((language) => (
            <section key={language} role="radiogroup" aria-label={language}>
              <p className="focus-popover-label">{language}</p>
              <div className="focus-voice-grid">
                {shownVoices.filter((voice) => voice.language === language).map((voice) => {
                  const isSelected = voice.id === choice;
                  const previewState = preview?.voice === voice.id ? preview.state : null;
                  return (
                    <div
                      key={voice.id}
                      role="radio"
                      tabIndex={0}
                      aria-checked={isSelected}
                      className={`focus-voice-option ${isSelected ? 'selected' : ''}`}
                      onClick={() => setChoice(voice.id)}
                      onDoubleClick={() => onApply(voice.id)}
                      onKeyDown={(event) => (event.key === 'Enter' || event.key === ' ') && setChoice(voice.id)}
                    >
                      <button
                        type="button"
                        className={`focus-voice-avatar ${previewState ?? ''}`}
                        title={previewState === 'playing' ? 'Stop preview' : `Hear ${voice.name}`}
                        onClick={(event) => {
                          event.stopPropagation();
                          togglePreview(voice.id);
                        }}
                      >
                        {previewState === 'playing' ? <PauseIcon /> : <PlayIcon />}
                      </button>
                      <span className="focus-voice-text">
                        <span className="focus-voice-name">{voice.name}</span>
                        <span className="focus-voice-lang">
                          {voice.gender} · <code>{voice.id}</code>
                        </span>
                      </span>
                      {isSelected && (
                        <span className="focus-voice-check">
                          <CheckIcon />
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>

        <div className="form-actions">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="primary" onClick={() => onApply(choice)}>
            Apply
          </button>
        </div>
      </div>
    </div>
  );
}
