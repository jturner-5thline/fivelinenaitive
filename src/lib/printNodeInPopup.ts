/**
 * Print a DOM node from a standalone popup window.
 *
 * Printing from inside an iframe (e.g. the Lovable preview) makes the browser
 * use the TOP document's title as the default PDF filename. A popup is its own
 * top-level document, so its <title> becomes the suggested filename.
 *
 * Returns true when the popup was opened (caller should not fall back to
 * window.print()), false when it was blocked.
 */
export function printNodeInPopup(node: HTMLElement, title: string, extraCss = ''): boolean {
  let win: Window | null = null;
  try {
    win = window.open('', '_blank', 'width=900,height=1000');
  } catch {
    return false;
  }
  if (!win) return false;

  const head = Array.from(
    document.querySelectorAll('style, link[rel="stylesheet"]')
  )
    .map((el) => el.outerHTML)
    .join('\n');

  win.document.open();
  win.document.write(`<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>${title.replace(/[<>&]/g, ' ')}</title>
${head}
<style>
  @page { size: Letter; margin: 0.25in; }
  html, body {
    margin: 0 !important;
    padding: 0 !important;
    background: #ffffff !important;
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }
  #print-root, #print-root * {
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }
  #print-root {
    max-height: none !important;
    overflow: visible !important;
    border-radius: 0 !important;
    box-shadow: none !important;
  }
  /* Never allow a break BEFORE the first content — an oversized element
     with break-inside:avoid gets pushed to the next page, which is what
     produced a blank first page. Only small atoms keep break-inside:avoid. */
  #print-root, #print-root > *, #print-root > div > * {
    break-before: avoid !important;
    page-break-before: avoid !important;
    break-inside: auto !important;
    page-break-inside: auto !important;
  }
  #print-root > *:first-child { margin-top: 0 !important; }
  #print-root tr, #print-root li, #print-root thead {
    break-inside: avoid;
    page-break-inside: avoid;
  }
  #print-root h1, #print-root h2, #print-root h3, #print-root .sr-section-label {
    break-after: avoid;
    page-break-after: avoid;
  }
  ${extraCss}
</style>
</head>
<body><div id="print-root"></div></body>
</html>`);
  win.document.close();

  const clone = node.cloneNode(true) as HTMLElement;
  clone.removeAttribute('id');
  clone.style.maxHeight = 'none';
  clone.style.overflow = 'visible';

  const mount = () => {
    const root = win!.document.getElementById('print-root');
    if (root) root.appendChild(win!.document.importNode(clone, true));
    if (root) applyKeepTogether(win!, root);
    // Give styles/fonts a beat to settle before invoking the print dialog.
    win!.setTimeout(() => {
      win!.focus();
      win!.print();
      win!.setTimeout(() => win!.close(), 300);
    }, 400);
  };

  if (win.document.readyState === 'complete') mount();
  else win.addEventListener('load', mount);

  return true;
}

/**
 * Keep sections whole across page breaks WITHOUT reintroducing blank pages.
 *
 * CSS alone cannot express "avoid breaking inside this element unless it is
 * taller than a page" — an oversized `break-inside: avoid` element gets
 * pushed to the next page, leaving a blank one. So we measure after mount:
 *  - a section label is glued to the block that follows it;
 *  - `break-inside: avoid` is applied only to blocks that fit on a page.
 */
function applyKeepTogether(win: Window, root: HTMLElement) {
  const doc = win.document;
  // Letter height (11in) minus the 0.25in @page margins, in CSS px.
  const PAGE_PX = (11 - 0.5) * 96;
  const FIT = PAGE_PX * 0.9;

  const firstChild = root.firstElementChild as HTMLElement | null;
  const containers: HTMLElement[] = [root];
  if (firstChild) {
    containers.push(firstChild);
    Array.from(firstChild.children).forEach((c) => containers.push(c as HTMLElement));
  }

  // 1) Glue "section label + following content" into one unbreakable box.
  containers.forEach((container) => {
    const labels = Array.from(
      container.querySelectorAll(':scope > .sr-section-label, :scope > h1, :scope > h2, :scope > h3'),
    ) as HTMLElement[];
    labels.forEach((label) => {
      const next = label.nextElementSibling as HTMLElement | null;
      if (!next) return;
      const combined = label.offsetHeight + next.offsetHeight;
      if (combined <= 0 || combined > FIT) return;
      const wrap = doc.createElement('div');
      wrap.style.breakInside = 'avoid';
      wrap.style.pageBreakInside = 'avoid';
      label.parentElement?.insertBefore(wrap, label);
      wrap.appendChild(label);
      wrap.appendChild(next);
    });
  });

  // 2) Any block that fits on a page should never be split.
  const blocks = Array.from(root.querySelectorAll('div, section, table, ul, ol')) as HTMLElement[];
  blocks.forEach((el) => {
    if (el === root || el === firstChild) return;
    const h = el.offsetHeight;
    if (h > 0 && h <= FIT) {
      el.style.breakInside = 'avoid';
      el.style.pageBreakInside = 'avoid';
    } else {
      el.style.breakInside = 'auto';
      el.style.pageBreakInside = 'auto';
    }
  });
}
