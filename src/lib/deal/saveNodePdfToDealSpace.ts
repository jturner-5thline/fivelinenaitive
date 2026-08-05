import { supabase } from '@/integrations/supabase/client';

/**
 * Render a DOM node to a paginated Letter-size PDF and store it in the
 * deal's Deal Space ▸ Documents (deal-space bucket + deal_space_documents).
 *
 * The browser's own "Save as PDF" output is not accessible to JS, so we
 * generate an equivalent copy from the same printable node.
 */
export async function saveNodePdfToDealSpace(
  node: HTMLElement,
  dealId: string,
  fileBaseName: string,
): Promise<{ id: string; name: string } | null> {
  const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all([
    import('html2canvas'),
    import('jspdf'),
  ]);

  const canvas = await html2canvas(node, {
    scale: 2,
    backgroundColor: '#ffffff',
    useCORS: true,
    windowWidth: node.scrollWidth,
  });

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

  const blob = pdf.output('blob') as Blob;
  const fileName = `${fileBaseName}.pdf`;
  const storagePath = `${dealId}/${crypto.randomUUID()}.pdf`;

  const { data: userRes } = await supabase.auth.getUser();

  const { error: uploadError } = await supabase.storage
    .from('deal-space')
    .upload(storagePath, blob, { contentType: 'application/pdf' });
  if (uploadError) throw uploadError;

  const { data, error } = await supabase
    .from('deal_space_documents' as any)
    .insert({
      deal_id: dealId,
      name: fileName,
      file_path: storagePath,
      content_type: 'application/pdf',
      size_bytes: blob.size,
      user_id: userRes?.user?.id ?? null,
    })
    .select('id, name')
    .single();
  if (error) throw error;

  return data as unknown as { id: string; name: string };
}