/**
 * Pure helpers for composing the Schedule Meeting NOTES field
 * (QuickBookMeetingPopover). Extracted so the strip/compose logic can be
 * unit-tested without mounting React or hitting the network.
 *
 * The previous implementation (seedAgenda) dumped the raw latest email
 * body — quoted history, headers, signatures, phone footers — into the
 * NOTES textarea. These helpers produce a clean, structured 5-line block
 * and provide deterministic text cleaning that the LLM topic summarizer
 * can also reuse.
 */

/** Cut everything from the first quoted-history marker onward. */
export function stripEmailQuotedHistory(input: string): string {
  if (!input) return '';
  let out = input;
  // "On <date>, <name> wrote:" style.
  out = out.replace(/^[ \t]*On\s.+\swrote:\s*[\s\S]*$/m, '');
  // "----- Original Message -----" style.
  out = out.replace(/[-_]{2,}\s*Original Message\s*[-_]{2,}[\s\S]*$/i, '');
  // Lines beginning with ">" — drop the line and everything after the
  // first such block.
  const gtIdx = out.search(/^>\s?/m);
  if (gtIdx >= 0) out = out.slice(0, gtIdx);
  // Forwarded message divider.
  out = out.replace(/[-_]{2,}\s*Forwarded message\s*[-_]{2,}[\s\S]*$/i, '');
  return out;
}

/** Drop "From:/To:/Cc:/Subject:/Date:/Sent:/Reply-To:" header lines. */
export function stripEmailHeaders(input: string): string {
  if (!input) return '';
  return input.replace(
    /^(From|Sent|To|Cc|Bcc|Subject|Date|Reply-To):\s.*$/gim,
    '',
  );
}

/** Remove signature blocks: "-- " delimiter, "Sent from ..." footers,
 *  and trailing 1-4 line blocks that read like a sign-off. */
export function stripSignatureBlock(input: string): string {
  if (!input) return '';
  let out = input;
  // Standard "-- " sig delimiter.
  out = out.replace(/^-- ?$[\s\S]*$/m, '');
  // Mobile auto-footer.
  out = out.replace(/Sent from my (iPhone|iPad|Android|mobile|BlackBerry).*/gim, '');
  return out;
}

/** Strip inline phone-footer fragments like "m: +1.415.686.7022" or
 *  "Cell: (415) 686-7022". */
export function stripPhoneFooters(input: string): string {
  if (!input) return '';
  return input.replace(
    /\b(m|t|p|c|o|d|tel|cell|mobile|direct|phone|fax)[:.]?\s*\+?[\d().\-\s]{7,}\b/gi,
    '',
  );
}

/** Drop common confidentiality/disclaimer footer lines. */
export function stripDisclaimers(input: string): string {
  if (!input) return '';
  return input
    .split('\n')
    .filter(
      (l) =>
        !/confidential|privileged|do not distribute|intended recipient|unsubscribe/i.test(
          l,
        ),
    )
    .join('\n');
}

/** Collapse runs of whitespace/blank lines. */
export function collapseWhitespace(input: string): string {
  return (input || '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

/** Full clean: quoted history → headers → signature → phones → disclaimers → whitespace. */
export function cleanEmailBodyForSummary(input: string): string {
  let out = input || '';
  out = stripEmailQuotedHistory(out);
  out = stripEmailHeaders(out);
  out = stripSignatureBlock(out);
  out = stripPhoneFooters(out);
  out = stripDisclaimers(out);
  out = collapseWhitespace(out);
  return out;
}

/** Trim a one-sentence topic to ≤140 chars, ellipsis if cut. */
export function trimTopic(s: string, max = 140): string {
  const clean = (s || '').replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  return clean.slice(0, max - 1).trimEnd() + '…';
}

/** Format a Date in a given IANA TZ as "YYYY-MM-DD HH:mm zzz". */
export function formatDateInTz(d: Date, tz: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZoneName: 'short',
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value || '';
  const tzAbbr = get('timeZoneName');
  return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')} ${tzAbbr}`;
}

export interface ScheduleNotesInput {
  dealName?: string | null;
  dealStage?: string | null;
  sender: { name?: string | null; email?: string | null; receivedAt?: Date | null };
  proposedStart?: Date | null;
  proposedEnd?: Date | null;
  attendeeTimezones?: string[]; // distinct IANA tz strings to render proposed time in
  freeBusyVerified?: boolean;
  topic?: string | null; // pre-summarized one-liner; falls back to subject
  fallbackSubject?: string | null;
  threadId?: string | null;
  origin?: string; // e.g. window.location.origin
  userTz: string; // for the Requested by timestamp
}

/** Compose the structured 5-line NOTES block. */
export function buildScheduleNotes(input: ScheduleNotesInput): string {
  const lines: string[] = [];

  // 1. Deal
  const dealName = (input.dealName || '').trim();
  const stage = (input.dealStage || '').trim();
  if (dealName) {
    lines.push(stage ? `Deal: ${dealName} (${stage})` : `Deal: ${dealName}`);
  } else {
    lines.push('Deal: (unassigned)');
  }

  // 2. Requested by
  const sName = (input.sender.name || '').trim();
  const sEmail = (input.sender.email || '').trim();
  const who = sName && sEmail ? `${sName} <${sEmail}>` : sName || sEmail || 'Unknown sender';
  const when = input.sender.receivedAt
    ? formatDateInTz(input.sender.receivedAt, input.userTz)
    : null;
  lines.push(when ? `Requested by: ${who} on ${when}` : `Requested by: ${who}`);

  // 3. Proposed time
  if (input.proposedStart && input.proposedEnd) {
    const tzs = (input.attendeeTimezones && input.attendeeTimezones.length
      ? input.attendeeTimezones
      : [input.userTz]
    ).filter((v, i, a) => a.indexOf(v) === i);
    const slotParts = tzs.map((tz) => {
      const startStr = formatDateInTz(input.proposedStart!, tz);
      const endTime = new Intl.DateTimeFormat('en-US', {
        timeZone: tz,
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).format(input.proposedEnd!);
      return `${startStr}–${endTime}`;
    });
    const verified = input.freeBusyVerified ? 'yes' : 'no';
    lines.push(
      `Proposed time: ${slotParts.join(' / ')} (verified vs freeBusy: ${verified})`,
    );
  } else {
    lines.push('Proposed time: (pick a slot)');
  }

  // 4. Topic
  const topic = trimTopic(input.topic || input.fallbackSubject || 'Discussion');
  lines.push(`Topic: ${topic}`);

  // 5. Thread deep-link
  if (input.threadId && input.origin) {
    lines.push(`Thread: ${input.origin}/inbox?thread=${encodeURIComponent(input.threadId)}`);
  } else if (input.threadId) {
    lines.push(`Thread: /inbox?thread=${encodeURIComponent(input.threadId)}`);
  }

  return lines.join('\n');
}