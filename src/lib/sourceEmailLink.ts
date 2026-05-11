/**
 * Builds a stable in-app deep-link to the source email/thread that a task
 * was created from. Mirrors the URL shape produced by
 * CreateTaskFromEmailDialog so any task with `source_email_*` columns
 * can render an "Open source email" link without re-deriving the URL
 * shape in multiple places.
 */
export function buildSourceEmailUrl(args: {
  messageId?: string | null;
  threadId?: string | null;
}): string | null {
  const { messageId, threadId } = args;
  if (!messageId && !threadId) return null;
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const params = new URLSearchParams({ widget: 'email' });
  if (threadId) params.set('thread', threadId);
  if (messageId) params.set('message', messageId);
  return `${origin}/dashboard?${params.toString()}`;
}