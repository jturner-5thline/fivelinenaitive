import { describe, it, expect } from 'vitest';
import {
  buildScheduleNotes,
  cleanEmailBodyForSummary,
  stripEmailHeaders,
  stripEmailQuotedHistory,
  stripPhoneFooters,
  stripSignatureBlock,
  trimTopic,
  formatDateInTz,
} from '@/lib/scheduleMeetingNotes';

const CENSYS_RAW = `No worries. 10:30am EDT on Wednesday works too
Will Breck
m: +1.415.686.7022

From: Niki Heikali <nheikali@5thline.co>
Sent: Friday, May 22, 2026 9:12 AM
To: Will Breck <will@censys.io>
Subject: RE: Censys Technologies | Partners for Growth - New Deal $8-10MM

Hi Will — confirming the 10am slot.

On Thu, May 21, 2026 at 4:01 PM Will Breck <will@censys.io> wrote:
> Can we move to 10:30?

--
Niki Heikali
Partner, 5th Line
CONFIDENTIAL: privileged communication, intended recipient only.`;

describe('strip helpers', () => {
  it('strips email headers', () => {
    expect(stripEmailHeaders('From: a\nSubject: b\nBody here')).not.toMatch(/From:|Subject:/);
  });
  it('cuts quoted history at "On ... wrote:"', () => {
    const out = stripEmailQuotedHistory('hello\nOn Mon, Will wrote:\n> old\n> more');
    expect(out).toContain('hello');
    expect(out).not.toMatch(/wrote:|> old/);
  });
  it('strips signature blocks', () => {
    const out = stripSignatureBlock('body\n-- \nJane Doe\nPartner');
    expect(out).not.toMatch(/Jane Doe|Partner/);
    expect(stripSignatureBlock('hi\nSent from my iPhone')).not.toMatch(/iPhone/);
  });
  it('strips phone footers', () => {
    expect(stripPhoneFooters('Will m: +1.415.686.7022')).not.toMatch(/\d{3}/);
    expect(stripPhoneFooters('Cell: (415) 686-7022')).not.toMatch(/\d{3}/);
  });
});

describe('cleanEmailBodyForSummary on Censys fixture', () => {
  const cleaned = cleanEmailBodyForSummary(CENSYS_RAW);
  it('preserves the meaningful sentence', () => {
    expect(cleaned.toLowerCase()).toContain('10:30am');
  });
  it('removes header tokens', () => {
    expect(cleaned).not.toMatch(/From:|Sent:|Subject:|To:/);
  });
  it('removes phone numbers', () => {
    expect(cleaned).not.toMatch(/415[.\-)]?\s?686/);
  });
  it('removes quoted history and signature', () => {
    expect(cleaned).not.toMatch(/wrote:|> /);
    expect(cleaned).not.toMatch(/CONFIDENTIAL/i);
  });
});

describe('trimTopic', () => {
  it('caps at 140 chars with ellipsis', () => {
    const long = 'x'.repeat(200);
    const out = trimTopic(long);
    expect(out.length).toBeLessThanOrEqual(140);
    expect(out.endsWith('…')).toBe(true);
  });
  it('leaves short strings alone', () => {
    expect(trimTopic('short topic')).toBe('short topic');
  });
});

describe('formatDateInTz', () => {
  it('renders a YYYY-MM-DD HH:mm zzz string', () => {
    const d = new Date('2026-05-27T14:30:00Z');
    const out = formatDateInTz(d, 'America/New_York');
    expect(out).toMatch(/^2026-05-27 \d{2}:\d{2} [A-Z]{2,5}$/);
  });
});

describe('buildScheduleNotes (Censys scenario)', () => {
  const notes = buildScheduleNotes({
    dealName: 'Censys Technologies',
    dealStage: 'Indication of Interest',
    sender: {
      name: 'Will Breck',
      email: 'will@censys.io',
      receivedAt: new Date('2026-05-23T14:00:00Z'),
    },
    proposedStart: new Date('2026-05-27T14:30:00Z'),
    proposedEnd: new Date('2026-05-27T15:15:00Z'),
    attendeeTimezones: ['America/New_York'],
    freeBusyVerified: true,
    topic: 'Confirm 10:30am EDT Wednesday meeting for Censys Technologies financing',
    fallbackSubject: 'RE: Censys Technologies | Partners for Growth',
    threadId: 'thread-censys-1',
    origin: 'https://app.example.com',
    userTz: 'America/New_York',
  });

  it('contains all five lines in order', () => {
    const lines = notes.split('\n');
    expect(lines[0]).toMatch(/^Deal: Censys Technologies \(Indication of Interest\)$/);
    expect(lines[1]).toMatch(/^Requested by: Will Breck <will@censys\.io> on /);
    expect(lines[2]).toMatch(/^Proposed time: .+ \(verified vs freeBusy: yes\)$/);
    expect(lines[3]).toMatch(/^Topic: /);
    expect(lines[4]).toBe(
      'Thread: https://app.example.com/inbox?thread=thread-censys-1',
    );
  });

  it('topic line is ≤ 140 chars after the "Topic: " prefix', () => {
    const topicLine = notes.split('\n')[3].replace(/^Topic: /, '');
    expect(topicLine.length).toBeLessThanOrEqual(140);
  });

  it('contains no raw email headers or phone numbers', () => {
    expect(notes).not.toMatch(/From:|Sent:|Subject:|To:/);
    expect(notes).not.toMatch(/415[.\-)]?\s?686/);
  });

  it('falls back gracefully without proposed time', () => {
    const n = buildScheduleNotes({
      dealName: 'X',
      sender: { name: 'A', email: 'a@b.co' },
      userTz: 'America/New_York',
      fallbackSubject: 'Hi',
    });
    expect(n).toContain('Proposed time: (pick a slot)');
    expect(n).toContain('Topic: Hi');
  });
});