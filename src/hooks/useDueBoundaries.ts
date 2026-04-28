import { useEffect, useState } from 'react';
import { buildDueBoundaries, type DueBoundaries } from '@/lib/taskDateGrouping';

/**
 * Returns timezone-aware due-date boundaries that automatically refresh
 * when the local calendar day rolls over (e.g. user leaves the tab open
 * across midnight). All Tasks views should share this single source of
 * truth so "Overdue", "Due Today", and "Upcoming" stay consistent.
 */
export function useDueBoundaries(): DueBoundaries {
  const [boundaries, setBoundaries] = useState<DueBoundaries>(() => buildDueBoundaries());

  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout>;

    const scheduleNextMidnight = () => {
      const now = new Date();
      const nextMidnight = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate() + 1,
        0, 0, 5, // small buffer past midnight
      );
      const ms = Math.max(1000, nextMidnight.getTime() - now.getTime());
      timeoutId = setTimeout(() => {
        setBoundaries(buildDueBoundaries());
        scheduleNextMidnight();
      }, ms);
    };

    // Also refresh when the tab becomes visible again — the boundaries may
    // be stale if the laptop was asleep across midnight.
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        setBoundaries(buildDueBoundaries());
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    scheduleNextMidnight();

    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  return boundaries;
}
