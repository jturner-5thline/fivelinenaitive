/**
 * formatSlots — render a list of meeting slots as draft-ready text.
 * Slots are inserted as plain prose (no booking links).
 */
import { getRelativeDateLabel } from './relativeDate';

export type SlotFormat = 'bulleted' | 'inline' | 'numbered';

export interface FormatSlot {
  start: Date;
  end: Date;
}

function fmtTime(d: Date, tz: string): string {
  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric', minute: '2-digit', hour12: true, timeZone: tz,
  }).format(d);
}
function tzAbbr(d: Date, tz: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, timeZoneName: 'short',
  }).formatToParts(d);
  return parts.find((p) => p.type === 'timeZoneName')?.value || tz;
}

/** "Tomorrow · 5:15 – 5:45 PM EDT" */
function renderSlotLine(s: FormatSlot, tz: string, now: Date, recipientTz?: string | null): string {
  const day = getRelativeDateLabel(s.start, now, tz);
  const main = `${day} \u00b7 ${fmtTime(s.start, tz)} \u2013 ${fmtTime(s.end, tz)} ${tzAbbr(s.start, tz)}`;
  const second = recipientTz && recipientTz !== tz
    ? ` (\u2248 ${fmtTime(s.start, recipientTz)} \u2013 ${fmtTime(s.end, recipientTz)} ${tzAbbr(s.start, recipientTz)})`
    : '';
  return `${main}${second}`;
}

export interface FormatOptions {
  format: SlotFormat;
  tz: string;
  recipientTz?: string | null;
  intro?: string;
  outro?: string;
  /** Reference "now" for relative-date labels. Defaults to new Date(). */
  now?: Date;
}

const DEFAULT_INTRO =
  "Here are a few times that work on my end \u2014 let me know which is easiest for you:";
const DEFAULT_OUTRO =
  "Happy to send a calendar invite once we pick a time.";

export function formatSlotsAsText(slots: FormatSlot[], opts: FormatOptions): string {
  const intro = opts.intro ?? DEFAULT_INTRO;
  const outro = opts.outro ?? DEFAULT_OUTRO;
  const now = opts.now ?? new Date();
  if (slots.length === 0) return '';

  if (opts.format === 'inline') {
    const joined = slots.map((s) => renderSlotLine(s, opts.tz, now, opts.recipientTz)).join(', ');
    return `${intro} ${joined}.\n\n${outro}`;
  }

  const lines = slots.map((s, i) => {
    const prefix = opts.format === 'numbered' ? `${i + 1}.` : '\u2022';
    return `${prefix} ${renderSlotLine(s, opts.tz, now, opts.recipientTz)}`;
  });
  return `${intro}\n\n${lines.join('\n')}\n\n${outro}`;
}

/**
 * HTML version — plain text, no anchor links. Bulleted/numbered render
 * as semantic <ul>/<ol> so TipTap-style editors keep proper list nodes.
 */
export function formatSlotsAsHtml(slots: FormatSlot[], opts: FormatOptions): string {
  const intro = opts.intro ?? DEFAULT_INTRO;
  const outro = opts.outro ?? DEFAULT_OUTRO;
  const now = opts.now ?? new Date();
  if (slots.length === 0) return '';

  if (opts.format === 'inline') {
    const parts = slots.map((s) => renderSlotLine(s, opts.tz, now, opts.recipientTz));
    return `<p>${intro} ${parts.join(', ')}.</p><p>${outro}</p>`;
  }

  const tag = opts.format === 'numbered' ? 'ol' : 'ul';
  const items = slots
    .map((s) => `<li>${renderSlotLine(s, opts.tz, now, opts.recipientTz)}</li>`)
    .join('');
  return `<p>${intro}</p><${tag}>${items}</${tag}><p>${outro}</p>`;
}