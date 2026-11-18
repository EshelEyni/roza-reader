import { useRef, useState, type CSSProperties } from 'react';
import { CheckIcon } from '../components/icons';
import {
  AudioLinesIcon,
  DownloadIcon,
  FastForwardIcon,
  PauseIcon,
  PlayIcon,
  RewindIcon,
  SkipBackIcon,
  SkipForwardIcon,
  VolumeIcon,
} from './icons';
import { PLAYBACK_SPEEDS, secondsPerWord, type FocusVoice, type NarrationScript } from '../../../shared/focus';
import { formatTime, type Narration } from './narration';
import { useDismiss } from './usePopover';

interface Props {
  narration: Narration;
  script: NarrationScript;
  speed: number;
  volume: number;
  voice: FocusVoice;
  canGoBack: boolean;
  canGoForward: boolean;
  onSpeedChange: (speed: number) => void;
  onVolumeChange: (volume: number) => void;
  onPreviousChapter: () => void;
  onNextChapter: () => void;
  onOpenVoices: () => void;
  onOpenExport: () => void;
}

/** The audiobook player bar. Times are estimates from the word count until the audio exists. */
export default function Player(props: Props) {
  const { narration, script, speed, volume, voice, canGoBack, canGoForward } = props;
  // The level to return to when unmuting.
  const lastVolume = useRef(volume || 1);
  const isMuted = volume === 0;
  const [isSpeedOpen, setIsSpeedOpen] = useState(false);
  const speedRef = useRef<HTMLDivElement>(null);
  useDismiss(isSpeedOpen, () => setIsSpeedOpen(false), speedRef);

  const perWord = secondsPerWord(speed);
  const lastWord = Math.max(script.wordCount - 1, 0);
  const elapsed = narration.wordIndex * perWord;
  const total = script.wordCount * perWord;
  const percent = lastWord ? (narration.wordIndex / lastWord) * 100 : 0;

  return (
    <footer className="focus-player">
      {narration.error && (
        <div className="focus-player-error" role="alert">
          {narration.error}
        </div>
      )}
      <div className="focus-timeline">
        <span className="focus-time">{formatTime(elapsed)}</span>
        <input
          type="range"
          className="focus-seek"
          min={0}
          max={lastWord}
          value={narration.wordIndex}
          onChange={(event) => narration.jumpTo(Number(event.target.value))}
          style={{ '--fill': `${percent}%` } as CSSProperties}
          aria-label="Playback position"
        />
        <span className="focus-time">−{formatTime(Math.max(total - elapsed, 0))}</span>
      </div>

      <div className="focus-controls">
        <div className="focus-controls-side">
          <button type="button" className="focus-voice-button" onClick={props.onOpenVoices} title="Choose voice">
            <AudioLinesIcon />
            <span className="focus-voice-text">
              <span className="focus-voice-name">{voice.name}</span>
              <span className="focus-voice-lang">{voice.language}</span>
            </span>
          </button>
        </div>

        <div className="focus-transport">
          <button type="button" className="focus-round" title="Previous chapter (⇧←)" onClick={props.onPreviousChapter} disabled={!canGoBack}>
            <SkipBackIcon />
          </button>
          <button type="button" className="focus-round" title="Previous sentence (←)" onClick={narration.previousSentence}>
            <RewindIcon />
          </button>
          <button
            type="button"
            className={`focus-play ${narration.isLoading ? 'loading' : ''}`}
            title={narration.isLoading ? 'Preparing the voice…' : narration.isPlaying ? 'Pause (Space)' : 'Play (Space)'}
            aria-pressed={narration.isPlaying}
            onClick={narration.togglePlay}
          >
            {narration.isPlaying ? <PauseIcon /> : <PlayIcon />}
          </button>
          <button type="button" className="focus-round" title="Next sentence (→)" onClick={narration.nextSentence}>
            <FastForwardIcon />
          </button>
          <button type="button" className="focus-round" title="Next chapter (⇧→)" onClick={props.onNextChapter} disabled={!canGoForward}>
            <SkipForwardIcon />
          </button>
        </div>

        <div className="focus-controls-side end">
          <div className="focus-volume">
            <button
              type="button"
              className="focus-round"
              title={isMuted ? 'Unmute' : 'Mute'}
              onClick={() => props.onVolumeChange(isMuted ? lastVolume.current : 0)}
            >
              <VolumeIcon muted={isMuted} />
            </button>
            <input
              type="range"
              className="focus-seek focus-volume-slider"
              min={0}
              max={1}
              step={0.05}
              value={volume}
              onChange={(event) => {
                const next = Number(event.target.value);
                if (next > 0) lastVolume.current = next;
                props.onVolumeChange(next);
              }}
              style={{ '--fill': `${volume * 100}%` } as CSSProperties}
              aria-label="Volume"
              title={`Volume ${Math.round(volume * 100)}%`}
            />
          </div>
          <div className="focus-popover-anchor" ref={speedRef}>
            <button
              type="button"
              className="focus-speed"
              title="Playback speed"
              aria-expanded={isSpeedOpen}
              onClick={() => setIsSpeedOpen(!isSpeedOpen)}
            >
              {speed}×
            </button>
            {isSpeedOpen && (
              <div className="focus-popover focus-speed-menu" role="menu">
                <p className="focus-popover-label">Speed</p>
                {PLAYBACK_SPEEDS.map((option) => (
                  <button
                    key={option}
                    type="button"
                    role="menuitemradio"
                    aria-checked={option === speed}
                    className={option === speed ? 'active' : ''}
                    onClick={() => {
                      props.onSpeedChange(option);
                      setIsSpeedOpen(false);
                    }}
                  >
                    <span>{option}×</span>
                    {option === speed && <CheckIcon />}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button type="button" className="focus-round" title="Download audio" onClick={props.onOpenExport}>
            <DownloadIcon />
          </button>
        </div>
      </div>
    </footer>
  );
}
