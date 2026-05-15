import { supabase } from '@/integrations/supabase/client';
import type { Deal } from '@/types/deal';

const ARCHIVE_FOLDER = '/Status Reports/';

/**
 * Archive a sent Status Report into the deal's Internal Data Room
 * (vdr_documents, source = 'internal'). Triggered ONLY when the report
 * is actually sent to the client (Copy email / Open in email client),
 * never on preview, draft generation, or PDF export.
 *
 * Stores the final, sent HTML as a self-contained .html file under a
 * "Status Reports" folder, with metadata capturing the send time, the
 * deal context, and the originating user.
 */
export async function archiveSentStatusReport(params: {
  deal: Deal;
  html: string;
  subject: string;
  sendMethod: 'copy' | 'mailto';
}): Promise<{ ok: boolean; error?: unknown }> {
  const { deal, html, subject, sendMethod } = params;
  try {
    const dealId = String(deal.id);
    if (!dealId) return { ok: false, error: 'missing deal id' };

    const { data: { user } } = await supabase.auth.getUser();

    // Resolve company id — prefer auth user's company, fall back to deal.
    let companyId: string | null =
      (deal as any).company_id || (deal as any).org_company_id || null;
    if (!companyId && user?.id) {
      const { data: prof } = await supabase
        .from('profiles')
        .select('company_id')
        .eq('id', user.id)
        .maybeSingle();
      companyId = (prof as any)?.company_id ?? null;
    }
    if (!companyId) return { ok: false, error: 'missing company id' };

    const sentAt = new Date();
    const stamp = sentAt.toISOString().replace(/[:.]/g, '-');
    const safeCompany = (deal.company || deal.name || 'Deal')
      .replace(/[^\w\-]+/g, '_')
      .slice(0, 60);
    const filename = `Status Report — ${safeCompany} — ${sentAt
      .toISOString()
      .slice(0, 10)}.html`;
    const storagePath = `${dealId}${ARCHIVE_FOLDER}${stamp}__${safeCompany}.html`;

    const archiveDoc = `<!doctype html><html><head><meta charset="utf-8"><title>${escape(
      subject,
    )}</title></head><body style="margin:0;padding:24px;background:#fff;">${html}</body></html>`;

    const blob = new Blob([archiveDoc], { type: 'text/html' });

    const { error: uploadError } = await supabase.storage
      .from('vdr-files')
      .upload(storagePath, blob, { upsert: true, contentType: 'text/html' });
    if (uploadError) {
      console.error('archiveSentStatusReport upload failed', uploadError);
      return { ok: false, error: uploadError };
    }

    const { error: insertError } = await (supabase as any)
      .from('vdr_documents')
      .insert({
        deal_id: dealId,
        company_id: companyId,
        filename,
        file_path: storagePath,
        file_size: blob.size,
        file_type: 'text/html',
        folder_path: ARCHIVE_FOLDER,
        is_folder: false,
        source: 'internal',
        uploaded_by: user?.id ?? null,
        ingestion_status: 'skipped',
        metadata: {
          archive_type: 'status_report',
          sent_at: sentAt.toISOString(),
          sent_by: user?.id ?? null,
          sent_by_email: user?.email ?? null,
          send_method: sendMethod,
          subject,
          deal_id: dealId,
          deal_name: deal.name ?? null,
          deal_company: deal.company ?? null,
        },
      });

    if (insertError) {
      console.error('archiveSentStatusReport insert failed', insertError);
      return { ok: false, error: insertError };
    }

    return { ok: true };
  } catch (e) {
    console.error('archiveSentStatusReport unexpected error', e);
    return { ok: false, error: e };
  }
}

function escape(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}