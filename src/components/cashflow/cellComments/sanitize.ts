// Minimal HTML sanitizer for the lightweight rich text editor used in cell comments.
// Allowed tags: b, strong, i, em, u, ul, ol, li, br, p, span (no attributes kept).
// Removes scripts, event handlers, javascript: urls, and unknown tags.

const ALLOWED_TAGS = new Set(['B', 'STRONG', 'I', 'EM', 'U', 'UL', 'OL', 'LI', 'BR', 'P', 'SPAN', 'DIV']);

export function sanitizeRichText(html: string): string {
  if (!html) return '';
  if (typeof window === 'undefined' || typeof DOMParser === 'undefined') {
    // Strip tags as a safe fallback
    return html.replace(/<[^>]*>/g, '');
  }
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html');
  const root = doc.body.firstChild as HTMLElement | null;
  if (!root) return '';
  walk(root);
  return root.innerHTML;
}

function walk(node: Element) {
  // Iterate over a static copy because we mutate children
  const children = Array.from(node.children);
  for (const child of children) {
    if (!ALLOWED_TAGS.has(child.tagName)) {
      // Replace with its text content
      const textNode = node.ownerDocument!.createTextNode(child.textContent || '');
      child.replaceWith(textNode);
      continue;
    }
    // Strip all attributes
    for (const attr of Array.from(child.attributes)) {
      child.removeAttribute(attr.name);
    }
    walk(child);
  }
}

export function htmlToPlainText(html: string): string {
  if (!html) return '';
  if (typeof window === 'undefined' || typeof DOMParser === 'undefined') {
    return html.replace(/<[^>]*>/g, '').trim();
  }
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return (doc.body.textContent || '').trim();
}
