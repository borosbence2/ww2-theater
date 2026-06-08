// Bottom timeline control: scrub slider, step/play controls, speed, and the
// current-date readout. Playback advances the date via requestAnimationFrame.

import { useEffect, useRef } from 'react';
import { SPEEDS, useStore } from '../store';
import {
  TIMELINE_END,
  TIMELINE_START,
  TOTAL_DAYS,
  addDays,
  diffDays,
  formatLong,
} from '../time/dates';

export function TimeBar() {
  const date = useStore((s) => s.date);
  const playing = useStore((s) => s.playing);
  const speed = useStore((s) => s.speed);

  const setDate = useStore((s) => s.setDate);
  const stepDays = useStore((s) => s.stepDays);
  const togglePlay = useStore((s) => s.togglePlay);
  const setSpeed = useStore((s) => s.setSpeed);

  // Playback loop: accumulate fractional days and step whole days as they pass.
  const rafRef = useRef<number>();
  const lastRef = useRef<number>();
  const accRef = useRef(0);

  useEffect(() => {
    if (!playing) return;
    lastRef.current = undefined;
    accRef.current = 0;

    const tick = (t: number) => {
      if (lastRef.current !== undefined) {
        const dt = (t - lastRef.current) / 1000;
        accRef.current += dt * useStore.getState().speed;
        if (accRef.current >= 1) {
          const whole = Math.floor(accRef.current);
          accRef.current -= whole;
          useStore.getState().stepDays(whole);
        }
      }
      lastRef.current = t;
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [playing]);

  const dayIndex = diffDays(TIMELINE_START, date);
  const atEnd = diffDays(date, TIMELINE_END) === 0;

  return (
    <div className="timebar">
      <div className="timebar-controls">
        <button title="Previous day" onClick={() => stepDays(-1)}>
          ‹
        </button>
        <button
          className="play"
          title={playing ? 'Pause' : 'Play'}
          onClick={togglePlay}
          disabled={atEnd && !playing}
        >
          {playing ? '❚❚' : '►'}
        </button>
        <button title="Next day" onClick={() => stepDays(1)}>
          ›
        </button>
      </div>

      <input
        className="timebar-slider"
        type="range"
        min={0}
        max={TOTAL_DAYS}
        step={1}
        value={dayIndex}
        onChange={(e) => setDate(addDays(TIMELINE_START, Number(e.target.value)))}
        aria-label="Date"
      />

      <div className="timebar-date">{formatLong(date)}</div>

      <select
        className="timebar-speed"
        value={speed}
        onChange={(e) => setSpeed(Number(e.target.value))}
        aria-label="Playback speed"
      >
        {SPEEDS.map((s) => (
          <option key={s} value={s}>
            {s} d/s
          </option>
        ))}
      </select>
    </div>
  );
}
