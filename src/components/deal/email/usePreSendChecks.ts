import { useState, useCallback } from 'react';

const ATTACHMENT_KEYWORDS = [
  'attached', 'attachment', 'attachments',
  "i've attached", 'i have attached', 'please find attached',
  'see attached', 'see the attached', 'see attachment',
  'see the file', 'see the deck', 'see the document',
  'enclosed', 'enclosing', 'find enclosed',
  'attaching', 'sending along', 'included the file',
];

// Pattern to detect quoted text blocks (previous replies)
const QUOTED_LINE_PATTERNS = [
  /^>+\s/,
  /^On .+ wrote:$/,
  /^-{3,}\s*Original Message/i,
  /^From:\s/,
];

function stripQuotedText(body: string): string {
  const lines = body.split('\n');
  const result: string[] = [];
  let inQuote = false;

  for (const line of lines) {
    if (QUOTED_LINE_PATTERNS.some(p => p.test(line.trim()))) {
      inQuote = true;
      continue;
    }
    if (inQuote && line.startsWith('>')) continue;
    if (inQuote && line.trim() === '') continue;
    if (inQuote && !line.startsWith('>') && line.trim() !== '') {
      inQuote = false;
    }
    if (!inQuote) result.push(line);
  }
  return result.join('\n');
}

function bodyMentionsAttachment(rawBody: string): boolean {
  const body = stripQuotedText(rawBody).toLowerCase();
  return ATTACHMENT_KEYWORDS.some(kw => body.includes(kw));
}

export type PreSendAlert = 'missing-attachment' | 'missing-subject' | null;

export function usePreSendChecks() {
  const [alert, setAlert] = useState<PreSendAlert>(null);

  const runChecks = useCallback((opts: {
    subject: string;
    body: string;
    attachments: string[];
  }): boolean => {
    // Check missing subject first
    if (!opts.subject.trim()) {
      setAlert('missing-subject');
      return false;
    }
    // Check missing attachment
    if (bodyMentionsAttachment(opts.body) && opts.attachments.length === 0) {
      setAlert('missing-attachment');
      return false;
    }
    return true;
  }, []);

  const clearAlert = useCallback(() => setAlert(null), []);

  return { alert, runChecks, clearAlert };
}
