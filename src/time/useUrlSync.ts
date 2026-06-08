// Keeps the URL query string in sync with date + viewport, throttled so rapid
// slider drags and map moves don't spam history.replaceState.

import { useEffect } from 'react';
import { useStore } from '../store';
import { writeUrl } from './url';

const THROTTLE_MS = 200;

export function useUrlSync(): void {
  useEffect(() => {
    let timer: number | undefined;
    let pending = false;

    const flush = () => {
      timer = undefined;
      if (!pending) return;
      pending = false;
      const { date, viewport } = useStore.getState();
      writeUrl(date, viewport);
    };

    const schedule = () => {
      pending = true;
      if (timer === undefined) timer = window.setTimeout(flush, THROTTLE_MS);
    };

    // Write once on mount, then on every relevant change.
    writeUrl(useStore.getState().date, useStore.getState().viewport);
    const unsub = useStore.subscribe(schedule);

    return () => {
      unsub();
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, []);
}
