import { useMemo } from "react";
import { useInsightsTimeframeOptional } from "@/contexts/InsightsTimeframeContext";

function pad(n: number) {
  return String(n).padStart(2, "0");
}
function isoDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function ymKey(y: number, m: number) {
  return `${y}-${pad(m + 1)}`;
}

export interface TimeframeMonth {
  y: number;
  m: number;
  key: string;
  label: string;
}

/**
 * Shared helper that converts the global Insights timeframe (`tf=…`) into
 * concrete date bounds + an inclusive list of months covered by the range.
 * Defaults to the trailing 12 months if no timeframe context is mounted.
 */
export function useTimeframeRange(fallbackMonths = 12) {
  const tf = useInsightsTimeframeOptional();
  return useMemo(() => {
    const now = new Date();
    const startDate = tf?.timeframe?.start
      ? new Date(tf.timeframe.start + "T00:00:00")
      : new Date(now.getFullYear(), now.getMonth() - (fallbackMonths - 1), 1);
    const endDate = tf?.timeframe?.end
      ? new Date(tf.timeframe.end + "T00:00:00")
      : new Date(now.getFullYear(), now.getMonth() + 1, 0);

    const firstMonth = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
    const lastMonth = new Date(endDate.getFullYear(), endDate.getMonth(), 1);
    const months: TimeframeMonth[] = [];
    const cursor = new Date(firstMonth);
    while (cursor <= lastMonth) {
      const y = cursor.getFullYear();
      const m = cursor.getMonth();
      months.push({
        y,
        m,
        key: ymKey(y, m),
        label: cursor.toLocaleString("en-US", { month: "short", year: "2-digit" }),
      });
      cursor.setMonth(cursor.getMonth() + 1);
    }

    // Prior period of the same length for YoY-style comparisons.
    const span = lastMonth.getMonth() - firstMonth.getMonth() +
      (lastMonth.getFullYear() - firstMonth.getFullYear()) * 12 + 1;
    const priorFirst = new Date(firstMonth.getFullYear() - 1, firstMonth.getMonth(), 1);
    const priorEndAnchor = new Date(endDate.getFullYear() - 1, endDate.getMonth(), endDate.getDate());

    return {
      startDate,
      endDate,
      rangeStart: isoDate(firstMonth),
      rangeEnd: isoDate(endDate),
      months,
      spanMonths: span,
      periodLabel: tf?.timeframe?.label ?? "Selected period",
      year: endDate.getFullYear(),
      priorRangeStart: isoDate(priorFirst),
      priorRangeEnd: isoDate(priorEndAnchor),
    };
  }, [tf?.timeframe?.start, tf?.timeframe?.end, tf?.timeframe?.label, fallbackMonths]);
}

export const _timeframeHelpers = { isoDate, ymKey };