/**
 * formatSlots — render a list of meeting slots as draft-ready text,
 * with optional per-slot clickable confirm links.
 */
export type SlotFormat = 'bulleted' | 'inline' | 'numbered';

export interface FormatSlot {
  start: Date;
  end: Date;
  /** Public confirm URL for one-click booking. */
  url?: string;
}

function fmtDay(d: Date, tz: string): string {
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', timeZone: tz,
  }).format(d);
}
function fmtDayShort(d: Date, tz: string): string {
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'short', month: 'numeric', day: 'numeric', timeZone: tz,
  }).format(d).replace(',', '');
}
function fmtTime(d: Date, tz: string, ampm = true): string {
  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric', minute: '2-digit', hour12: ampm, timeZone: tz,
  }).format(d).replace(' ', '\u00a0');
}
function tzAbbr(d: Date, tz: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, timeZoneName: 'short',
  }).formatToParts(d);
  return parts.find((p) => p.type === 'timeZoneName')?.value || tz;
}

function renderSlotLine(s: FormatSlot, tz: string, recipientTz?: string | null): string {
  const main = `${fmtDay(s.start, tz)} \u00b7 ${fmtTime(s.start, tz)}\u2013${fmtTime(s.end, tz)} ${tzAbbr(s.start, tz)}`;
  const second = recipientTz && recipientTz !== tz
    ? ` (\u2248 ${fmtTime(s.start, recipientTz)}\u2013${fmtTime(s.end, recipientTz)} ${tzAbbr(s.start, recipientTz)})`
    : '';
  return `${main}${second}`;
}

function renderSlotInline(s: FormatSlot, tz: string): string {
  return `${fmtDayShort(s.start, tz)} ${fmtTime(s.start, tz, true)}\u2013${fmtTime(s.end, tz, true)}`;
}

export interface FormatOptions {
  format: SlotFormat;
  tz: string;
  recipientTz?: string | null;
  intro?: string;
  outro?: string;
  asHtml?: boolean;
}

const DEFAULT_INTRO =
  "Here are a few times that work on my end \u2014 let me know which is easiest for you:";
const DEFAULT_OUTRO =
  "Happy to send a calendar invite once we pick a time.";

export function formatSlotsAsText(slots: FormatSlot[], opts: FormatOptions): string {
  const intro = opts.intro ?? DEFAULT_INTRO;
  const outro = opts.outro ?? DEFAULT_OUTRO;
  if (slots.length === 0) return '';

  if (opts.format === 'inline') {
    const joined = slots.map((s) => renderSlotInline(s, opts.tz)).join(', ');
    return `${intro} ${joined} ${tzAbbr(slots[0].start, opts.tz)}.\n\n${outro}`;
  }

  const lines = slots.map((s, i) => {
    const prefix = opts.format === 'numbered' ? `${i + 1}.` : '\u2022';
    return `  ${prefix} ${renderSlotLine(s, opts.tz, opts.recipientTz)}`;
  });
  return `${intro}\n\n${lines.join('\n')}\n\n${outro}`;
}

/**
 * HTML version with per-slot anchor links for the public confirm flow.
 */
export function formatSlotsAsHtml(slots: FormatSlot[], opts: FormatOptions): string {
  const intro = opts.intro ?? DEFAULT_INTRO;
  const outro = opts.outro ?? DEFAULT_OUTRO;
  if (slots.length === 0) return '';

  const renderAnchor = (s: FormatSlot, label: string) => {
    if (!s.url) return label;
    return `<a href="${s.url}" target="_blank" rel="noopener">${label}</a>`;
  };

  if (opts.format === 'inline') {
    const parts = slots.map((s) => renderAnchor(s, renderSlotInline(s, opts.tz)));
    return `<p>${intro} ${parts.join(', ')} ${tzAbbr(slots[0].start, opts.tz)}.</p><p>${outro}</p>`;
  }

  const tag = opts.format === 'numbered' ? 'ol' : 'ul';
  const items = slots.map((s) => `<li>${renderAnchor(s, renderSlotLine(s, opts.tz, opts.recipientTz))}</li>`).join('');
  return `<p>${intro}</p><${tag}>${items}</${tag}><p>${outro}</p>`;
}