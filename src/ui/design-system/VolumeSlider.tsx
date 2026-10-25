import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { clamp } from '../../core';
import { cx } from './cx';
import styles from './VolumeSlider.module.css';

interface VolumeSliderProps {
  /** 0–1 */
  value: number;
  muted?: boolean;
  label: string;
  /** Called continuously while dragging; the caller decides how often to act on it. */
  onChange(value: number): void;
}

const KEYBOARD_STEP = 0.05;

/** Tall glass capsule filled from the bottom, like the iOS Control Center volume slider. */
export function VolumeSlider({ value, muted = false, label, onChange }: VolumeSliderProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  // While dragging, show the finger's value, not the (slightly delayed) value echoed back by the PC.
  const [dragValue, setDragValue] = useState<number | null>(null);
  const shown = dragValue ?? value;

  function valueAt(clientY: number) {
    const rect = trackRef.current!.getBoundingClientRect();
    return Math.round(clamp(1 - (clientY - rect.top) / rect.height, 0, 1) * 100) / 100;
  }

  function move(event: PointerEvent<HTMLDivElement>) {
    const next = valueAt(event.clientY);
    setDragValue(next);
    onChange(next);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const step = event.key === 'ArrowUp' ? KEYBOARD_STEP : event.key === 'ArrowDown' ? -KEYBOARD_STEP : 0;
    if (step !== 0) onChange(clamp(Math.round((value + step) * 100) / 100, 0, 1));
  }

  return (
    <div
      ref={trackRef}
      className={cx(styles.slider, muted && styles.muted, dragValue !== null && styles.dragging)}
      role="slider"
      tabIndex={0}
      aria-label={label}
      aria-orientation="vertical"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(shown * 100)}
      aria-valuetext={muted ? `Muted, ${Math.round(shown * 100)}%` : `${Math.round(shown * 100)}%`}
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId);
        move(event);
      }}
      onPointerMove={(event) => dragValue !== null && move(event)}
      onPointerUp={() => setDragValue(null)}
      onPointerCancel={() => setDragValue(null)}
      onKeyDown={handleKeyDown}
    >
      <div className={styles.fill} style={{ height: `${shown * 100}%` }} />
      <span className={styles.percent}>{Math.round(shown * 100)}</span>
    </div>
  );
}
