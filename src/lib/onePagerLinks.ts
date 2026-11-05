export interface OnePagerLink {
  label: string;
  href: string;
}

const withProtocol = (url: string) => (/^https?:\/\//i.test(url) ? url : `https://${url}`);

/**
 * Turns stored one-pager values like "Deck.pdf (https://...),Other.pdf (https://...)"
 * into short file-name links. Plain URLs fall back to the last path segment.
 */
export function parseOnePagerLinks(raw: string | null | undefined): OnePagerLink[] {
  const value = (raw ?? '').trim();
  if (!value) return [];
  const pattern = /([^,()]+?)\s*\((https?:\/\/[^)\s]+)\)/g;
  const links: OnePagerLink[] = [];
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(value))) {
    links.push({ label: match[1].trim(), href: match[2] });
  }
  if (links.length > 0) return links;
  let label = value;
  try {
    const url = new URL(withProtocol(value));
    const last = decodeURIComponent(url.pathname.split('/').filter(Boolean).pop() || '');
    label = last || url.hostname;
  } catch {
    // keep raw value
  }
  return [{ label, href: withProtocol(value) }];
}
