import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';

/**
 * Single source of truth for rendering the Status Report Preview DOM to a PDF.
 *
 * Both the "Export as PDF" and "Generate Status Email" buttons in
 * StatusReportPreviewModal call this helper against the SAME rendered
 * preview node (`printableRef`), so the downloaded file and the email
 * attachment are byte-identical visual snapshots of what the user sees.
 *
 * The legacy jsPDF-only template (`buildStatusReportPdfFile` /
 * `exportStatusReportToPDF` in `dealExport.ts`) is no longer used by the
 * email flow — it produced a ~15–25 KB minimal layout that did not match
 * the live preview (no gradient header, no Pipeline Snapshot tiles, etc.).
 */

/** Wait for a "real" paint after data is loaded. Two rAFs guarantees the
 *  browser has committed at least one paint of the updated DOM. */
export async function waitForRender(): Promise<void> {
  await new Promise<void>((r) =>
    requestAnimationFrame(() => requestAnimationFrame(() => r())),
  );
}

export interface CaptureResult {
  blob: Blob;
  file: File;
  pages: number;
  bytes: number;
  fileName: string;
}

/**
 * Capture a DOM node to a multi-page Letter PDF.
 *
 * Strategy: html2canvas → vertical slice the resulting canvas onto Letter
 * pages at preserved aspect ratio, so long reports paginate cleanly.
 */
export async function captureStatusReportPdf(
  node: HTMLElement,
  dealName: string,
  opts?: { waitForReady?: () => Promise<void> | void },
): Promise<CaptureResult> {
  if (!node) throw new Error('Status report preview node is not mounted.');

  // 1. Caller-provided readiness signal (e.g. resolve when AI sections + pass
  //    feedback have finished loading). Then two rAFs to guarantee a paint.
  if (opts?.waitForReady) await opts.waitForReady();
  await waitForRender();

  // 2. Snapshot the preview node.
  const canvas = await html2canvas(node, {
    scale: 2,
    useCORS: true,
    backgroundColor: null,
    windowWidth: node.scrollWidth,
    logging: false,
  });

  // 3. Paginate onto Letter @ pt.
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'letter' });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 18;
  const usableWidth = pageWidth - margin * 2;
  const usableHeight = pageHeight - margin * 2;
  const ratio = usableWidth / canvas.width;
  const pxPerPage = Math.floor(usableHeight / ratio);

  let y = 0;
  let pages = 0;
  // Match the preview's deep-navy backdrop so slice edges blend.
  const PAGE_BG = '#0b1220';

  while (y < canvas.height) {
    const sliceHeight = Math.min(pxPerPage, canvas.height - y);
    const slice = document.createElement('canvas');
    slice.width = canvas.width;
    slice.height = sliceHeight;
    const ctx = slice.getContext('2d');
    if (!ctx) throw new Error('Failed to create 2D canvas context.');
    ctx.fillStyle = PAGE_BG;
    ctx.fillRect(0, 0, slice.width, slice.height);
    ctx.drawImage(
      canvas,
      0, y, canvas.width, sliceHeight,
      0, 0, canvas.width, sliceHeight,
    );
    const img = slice.toDataURL('image/jpeg', 0.92);
    if (pages > 0) pdf.addPage();
    pdf.addImage(img, 'JPEG', margin, margin, usableWidth, sliceHeight * ratio);
    y += sliceHeight;
    pages += 1;
  }

  const blob = pdf.output('blob');
  const dateMMDD = new Date()
    .toLocaleDateString('en-US', { month: '2-digit', day: '2-digit' })
    .replace('/', '-');
  // Per-generation suffix prevents any stale chip from being reused.
  const uniq = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const fileName = `${dealName} Status Update - ${dateMMDD} [${uniq}].pdf`;

  // eslint-disable-next-line no-console
  console.info('[StatusReport] captured PDF from DOM', {
    deal: dealName,
    bytes: blob.size,
    mime: blob.type,
    pages,
    fileName,
  });

  // Sanity guard — a real DOM-captured status report (multi-section, gradient
  // header, pipeline tiles) is well above 30 KB. A sub-30 KB output strongly
  // indicates a half-rendered/empty preview node.
  const MIN_BYTES = 30_000;
  if (!blob || blob.size < MIN_BYTES) {
    throw new Error(
      `Status report PDF looks empty (${blob?.size ?? 0} bytes, ${pages} pages). ` +
        `The preview may not have finished rendering — refusing to attach.`,
    );
  }
  if (blob.type && blob.type !== 'application/pdf') {
    throw new Error(
      `Status report blob has wrong mime type "${blob.type}". Expected application/pdf.`,
    );
  }

  const file = new File([blob], fileName, { type: 'application/pdf' });
  return { blob, file, pages, bytes: blob.size, fileName };
}