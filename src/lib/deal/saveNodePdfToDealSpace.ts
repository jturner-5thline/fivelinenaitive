import { supabase } from '@/integrations/supabase/client';

/**
 * Render a DOM node to a paginated Letter-size PDF and store it in the
 * deal's Deal Space ▸ Documents (deal-space bucket + deal_space_documents).
 *
 * The browser's own "Save as PDF" output is not accessible to JS, so we
 * generate an equivalent copy from the same printable node.
 */
/**
 * Render a DOM node to a paginated Letter-size PDF Blob (no upload, no print).
 * Used both for the Deal Space archive copy and for direct downloads when the
 * print popup is blocked by the browser.
 */
export async function renderNodeToPdfBlob(node: HTMLElement): Promise<Blob> {
  const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all([
    import('html2canvas'),
    import('jspdf'),
  ]);

  // html2canvas can fail with "Unable to find element in cloned iframe" when the
  // target lives inside a portal/dialog that is animating or re-rendering. Render
  // a detached, offscreen clone we fully control instead of the live node.
  const width = Math.max(node.scrollWidth, node.getBoundingClientRect().width, 800);
  const host = document.createElement('div');
  host.setAttribute('data-pdf-capture-host', '');
  host.style.cssText = [
    'position:fixed',
    'left:-100000px',
    'top:0',
    'z-index:-1',
    'pointer-events:none',
    `width:${Math.round(width)}px`,
    'background:#ffffff',
  ].join(';');
  const clone = node.cloneNode(true) as HTMLElement;
  clone.removeAttribute('id');
  clone.style.width = `${Math.round(width)}px`;
  clone.style.maxHeight = 'none';
  clone.style.height = 'auto';
  clone.style.overflow = 'visible';
  host.appendChild(clone);
  document.body.appendChild(host);

  let canvas: HTMLCanvasElement;
  try {
    // Let the clone lay out before measuring.
    await new Promise((r) => requestAnimationFrame(() => r(null)));
    canvas = await html2canvas(clone, {
      scale: 2,
      backgroundColor: '#ffffff',
      useCORS: true,
      logging: false,
      width: Math.round(width),
      height: Math.max(clone.scrollHeight, 1),
      windowWidth: Math.round(width),
      windowHeight: Math.max(clone.scrollHeight, 1),
    });
  } finally {
    host.remove();
  }

  const pdf = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'letter' });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 18;
  const usableWidth = pageWidth - margin * 2;
  const usableHeight = pageHeight - margin * 2;

  // Slice the tall canvas into page-height chunks so long reports paginate.
  const pxPerPage = Math.floor((canvas.width / usableWidth) * usableHeight);
  let offset = 0;
  let first = true;
  while (offset < canvas.height) {
    const sliceHeight = Math.min(pxPerPage, canvas.height - offset);
    const slice = document.createElement('canvas');
    slice.width = canvas.width;
    slice.height = sliceHeight;
    const ctx = slice.getContext('2d');
    if (!ctx) break;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, slice.width, slice.height);
    ctx.drawImage(canvas, 0, offset, canvas.width, sliceHeight, 0, 0, canvas.width, sliceHeight);
    const img = slice.toDataURL('image/jpeg', 0.92);
    if (!first) pdf.addPage();
    pdf.addImage(img, 'JPEG', margin, margin, usableWidth, (sliceHeight * usableWidth) / canvas.width);
    first = false;
    offset += sliceHeight;
  }

  return pdf.output('blob') as Blob;
}

/** Generate the PDF client-side and trigger a normal browser download. */
export async function downloadNodePdf(node: HTMLElement, fileBaseName: string): Promise<void> {
  const blob = await renderNodeToPdfBlob(node);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${fileBaseName}.pdf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export async function saveNodePdfToDealSpace(
  node: HTMLElement,
  dealId: string,
  fileBaseName: string,
): Promise<{ id: string; name: string } | null> {
  const blob = await renderNodeToPdfBlob(node);
  const fileName = `${fileBaseName}.pdf`;
  // Archive copies live in the Internal section of the Data Room
  // (vdr_documents + `vdr-files` bucket), not in Deal Space.
  const folderPath = '/Reports/';
  const storagePath = `${dealId}${folderPath}${fileName}`;

  const { data: userRes } = await supabase.auth.getUser();
  const { data: dealRow } = await supabase
    .from('deals')
    .select('company_id')
    .eq('id', dealId)
    .maybeSingle();

  const { error: uploadError } = await supabase.storage
    .from('vdr-files')
    .upload(storagePath, blob, { contentType: 'application/pdf', upsert: true });
  if (uploadError) throw uploadError;

  const { data, error } = await supabase
    .from('vdr_documents' as any)
    .insert({
      deal_id: dealId,
      company_id: (dealRow as any)?.company_id ?? null,
      filename: fileName,
      file_path: storagePath,
      file_size: blob.size,
      file_type: 'application/pdf',
      folder_path: folderPath,
      is_folder: false,
      source: 'dataroom',
      uploaded_by: userRes?.user?.id ?? null,
      ingestion_status: 'pending',
    })
    .select('id, filename')
    .single();
  if (error) throw error;

  return { id: (data as any).id, name: (data as any).filename };
}