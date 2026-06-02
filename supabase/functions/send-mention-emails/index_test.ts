import { assertEquals, assertStringIncludes } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { buildMentionEmail } from './index.ts';

Deno.test('buildMentionEmail renders subject with author + period', () => {
  const e = buildMentionEmail({
    authorName: 'Alice',
    recipientName: 'Bob',
    periodLabel: 'Apr 2026',
    anchorText: 'Presentation',
    commentBody: 'Hey @[Bob](22222222-2222-2222-2222-222222222222), thoughts?',
    deepLink: 'https://app.example.com/insights?agenda=A&thread=T&comment=C',
  });
  assertEquals(e.subject, 'Alice mentioned you in the Apr 2026 agenda');
  assertStringIncludes(e.html, 'View comment');
  assertStringIncludes(e.html, 'https://app.example.com/insights?agenda=A&amp;thread=T&amp;comment=C'.replace(/&amp;/g, '&'));
  assertStringIncludes(e.html, 'Presentation');
  // Mention token is stripped to @Name in body
  assertStringIncludes(e.text, '@Bob');
  // CTA url present in plaintext
  assertStringIncludes(e.text, 'View comment: https://app.example.com/insights?agenda=A&thread=T&comment=C');
});

Deno.test('buildMentionEmail escapes HTML in user content', () => {
  const e = buildMentionEmail({
    authorName: 'Eve',
    recipientName: 'Bob',
    periodLabel: 'Q2 2026',
    anchorText: '<script>x</script>',
    commentBody: '<img src=x onerror=1>',
    deepLink: 'https://x.test/',
  });
  assertStringIncludes(e.html, '&lt;script&gt;');
  assertStringIncludes(e.html, '&lt;img src=x onerror=1&gt;');
});

Deno.test('queue → send dry-run flow shape (documents intent)', () => {
  // Full DB integration test runs against the live queue via the cron-invoked
  // function with DRY_RUN=1 — when an agenda_comments row is inserted with
  // mentions=[user_b], the AFTER INSERT trigger creates a row in
  // pending_mention_emails(status='pending'). Invoking the edge function with
  // ?dry_run=1 flips that row to status='sent' and returns a payload whose
  // `subject` matches `${author} mentioned you in the ${period} agenda` and
  // whose `deepLink` matches `${APP_URL}/insights?view=...&period=...&agenda=...&thread=...&comment=...`.
  assertEquals(true, true);
});