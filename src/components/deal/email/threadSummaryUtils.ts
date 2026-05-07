import { supabase } from '@/integrations/supabase/client';
import { htmlToPlainText } from '@/lib/htmlToPlainText';
import type { MockEmail } from './mockEmailData';
import { fetchFullEmailThread, type FullThreadMessage } from './useFullEmailMessage';

export type EmailThreadSummarySource = 'fetchFullEmailThread' | 'selected-thread-data';

export interface EmailThreadSummaryDebug {
  threadId: string;
  subject: string;
  messageCount: number;
  source: EmailThreadSummarySource;
  firstTimestamp: string | null;
  lastTimestamp: string | null;
  cleanedCharCount: number;
}

interface ThreadSummaryRequestMessage {
  from: string;
  date: string;
  subject: string;
  body_text: string;
  attachments: string[];
}

interface ThreadSummaryInput {
  messages: ThreadSummaryRequestMessage[];
  debug: EmailThreadSummaryDebug;
}

interface SummarizeEmailThreadArgs {
  threadId: string;
  subject: string;
  emails: MockEmail[];
}

const MIN_SUMMARY_THREAD_CHARS = 120;

function resolvePlainBody(bodyText?: string | null, bodyHtml?: string | null, preview?: string | null) {
  return bodyText?.trim() || (bodyHtml ? htmlToPlainText(bodyHtml).trim() : '') || preview?.trim() || '';
}

function stripTrailingSignature(lines: string[]) {
  const signoffPattern = /^(best|thanks|thank you|regards|cheers|sincerely|warm regards|kind regards|all the best)[,!-]*$/i;
  for (let i = Math.max(0, lines.length - 8); i < lines.length; i += 1) {
    if (signoffPattern.test(lines[i]?.trim() || '')) {
      return lines.slice(0, i);
    }
  }

  for (let i = Math.max(0, lines.length - 6); i < lines.length; i += 1) {
    if (/^sent from my (iphone|ipad|android)/i.test(lines[i]?.trim() || '') || /^get outlook for/i.test(lines[i]?.trim() || '')) {
      return lines.slice(0, i);
    }
  }

  return lines;
}

function cleanMessageBody(raw: string, seenLines: Set<string>) {
  if (!raw) return '';

  const lines = raw
    .replace(/\r\n/g, '\n')
    .replace(/\u00a0/g, ' ')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .split('\n');

  const kept: string[] = [];

  for (const originalLine of lines) {
    const line = originalLine.trimEnd();
    const trimmed = line.trim();

    if (/^on\s.+wrote:\s*$/i.test(trimmed)) break;
    if (/^from:\s.+$/i.test(trimmed)) break;
    if (/^(confidentiality notice|caution:\s*external|external email warning)/i.test(trimmed)) break;
    if (/this email( and any attachments)? is confidential/i.test(trimmed)) break;
    if (/^>+/.test(trimmed)) continue;
    if (/^(image removed by sender|view in browser)$/i.test(trimmed)) continue;

    kept.push(line);
  }

  const withoutSignature = stripTrailingSignature(kept);
  const deduped = withoutSignature.filter((line) => {
    const normalized = line.replace(/\s+/g, ' ').trim().toLowerCase();
    if (!normalized) return true;
    if (normalized.length >= 8) {
      if (seenLines.has(normalized)) return false;
      seenLines.add(normalized);
    }
    return true;
  });

  return deduped.join('\n').replace(/\n{3,}/g, '\n\n').trim().slice(0, 4000);
}

function sortChronologically<T extends { received_at?: string | null; date?: string | null }>(messages: T[]) {
  return [...messages].sort((a, b) => {
    const ta = Date.parse(a.received_at || a.date || '') || 0;
    const tb = Date.parse(b.received_at || b.date || '') || 0;
    return ta - tb;
  });
}

function buildSummaryInput(
  threadId: string,
  subject: string,
  source: EmailThreadSummarySource,
  messages: Array<{
    from_name?: string | null;
    from_email?: string | null;
    subject?: string | null;
    received_at?: string | null;
    body_text?: string | null;
    body_html?: string | null;
    body_preview?: string | null;
    attachments?: Array<{ filename?: string | null }> | null;
  }>,
) {
  const seenLines = new Set<string>();
  const sorted = sortChronologically(messages);

  const normalized: ThreadSummaryRequestMessage[] = sorted
    .map((message) => {
      const from = message.from_name
        ? `${message.from_name}${message.from_email ? ` <${message.from_email}>` : ''}`
        : message.from_email || 'Unknown';
      const cleanBody = cleanMessageBody(
        resolvePlainBody(message.body_text, message.body_html, message.body_preview),
        seenLines,
      );

      return {
        from,
        date: message.received_at || '',
        subject: message.subject || subject || '',
        body_text: cleanBody,
        attachments: (message.attachments || [])
          .map((attachment) => attachment?.filename?.trim() || '')
          .filter(Boolean),
      };
    })
    .filter((message) => message.body_text.length > 0);

  const cleanedCharCount = normalized.reduce((sum, message) => sum + message.body_text.length, 0);

  return {
    messages: normalized,
    debug: {
      threadId,
      subject,
      messageCount: normalized.length,
      source,
      firstTimestamp: normalized[0]?.date || null,
      lastTimestamp: normalized[normalized.length - 1]?.date || null,
      cleanedCharCount,
    } satisfies EmailThreadSummaryDebug,
  };
}

export async function summarizeSelectedEmailThread({ threadId, subject, emails }: SummarizeEmailThreadArgs) {
  const selectedThreadId = threadId.trim();
  const selectedSubject = subject.trim();

  const inMemoryInput = buildSummaryInput(selectedThreadId, selectedSubject, 'selected-thread-data', emails);
  let fetchedInput: ThreadSummaryInput = {
    messages: [],
    debug: {
      threadId: selectedThreadId,
      subject: selectedSubject,
      messageCount: 0,
      source: 'fetchFullEmailThread' as const,
      firstTimestamp: null,
      lastTimestamp: null,
      cleanedCharCount: 0,
    },
  };

  if (selectedThreadId && !selectedThreadId.startsWith('mock-')) {
    const fetchedMessages = await fetchFullEmailThread(selectedThreadId);
    fetchedInput = buildSummaryInput(
      selectedThreadId,
      selectedSubject,
      'fetchFullEmailThread',
      fetchedMessages as FullThreadMessage[],
    );
  }

  const chosen = fetchedInput.debug.cleanedCharCount >= inMemoryInput.debug.cleanedCharCount
    ? fetchedInput
    : inMemoryInput;

  const fallback = chosen === fetchedInput ? inMemoryInput : fetchedInput;
  const summaryInput = chosen.debug.cleanedCharCount >= MIN_SUMMARY_THREAD_CHARS ? chosen : fallback;

  if ((import.meta as ImportMeta).env?.DEV) {
    console.info('[email-thread-summary] source', {
      source: summaryInput.debug.source,
      threadId: summaryInput.debug.threadId,
      subject: summaryInput.debug.subject,
      messageCount: summaryInput.debug.messageCount,
      firstTimestamp: summaryInput.debug.firstTimestamp,
      lastTimestamp: summaryInput.debug.lastTimestamp,
      cleanedCharCount: summaryInput.debug.cleanedCharCount,
    });
  }

  if (summaryInput.debug.cleanedCharCount < MIN_SUMMARY_THREAD_CHARS || summaryInput.messages.length === 0) {
    const error = new Error("Couldn't read the selected email thread for summary");
    (error as Error & { debug?: EmailThreadSummaryDebug }).debug = summaryInput.debug;
    throw error;
  }

  const { data, error } = await supabase.functions.invoke('email-thread-summarizer', {
    body: {
      threadId: selectedThreadId,
      subject: selectedSubject,
      messages: summaryInput.messages,
    },
  });

  if (error) throw new Error(error.message || 'Failed to summarize email thread');

  const bullets = Array.isArray(data?.bullets)
    ? data.bullets.map((bullet: unknown) => String(bullet || '').trim()).filter(Boolean)
    : [];

  if (bullets.length === 0) {
    throw new Error('Thread summarizer returned no bullets');
  }

  return {
    bullets,
    debug: summaryInput.debug,
  };
}