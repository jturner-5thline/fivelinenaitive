/**
 * Converts an HTML string to plain text, preserving visible text
 * including @mentions and spacing.
 */
export function htmlToPlainText(html: string): string {
  if (!html) return '';
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return (doc.body.textContent || '').trim();
}
