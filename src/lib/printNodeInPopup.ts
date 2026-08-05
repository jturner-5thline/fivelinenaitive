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
  #print-root > div > * {
    break-inside: avoid;
    page-break-inside: avoid;
  }
  #print-root tr, #print-root li, #print-root thead, #print-root table {
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
