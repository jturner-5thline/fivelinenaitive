import { supabase } from '@/integrations/supabase/client';

const ARCHIVE_FOLDER = '/Write-Ups/';

/**
 * Archive an approved AI Draft Write-Up into the deal's Internal Data Room
 * (vdr_documents, source = 'internal'). Triggered ONLY when the advisor
 * clicks "Approve & Export" on the human-review banner — never on draft
 * generation, autosave, or preview.
 *
 * Stores the final approved HTML as a self-contained .html file under a
 * "Write-Ups" folder, with metadata capturing the deal context, author,
 * and an incrementing version number per deal.
 */
export async function archiveApprovedWriteUp(params: {
  dealId: string;
  dealName?: string | null;
  companyName?: string | null;
  html: string;
  title: string;
}): Promise<{ ok: boolean; version?: number; error?: unknown }> {
  const { dealId, dealName, companyName, html, title } = params;
  try {
    if (!dealId) return { ok: false, error: 'missing deal id' };
    const { data: { user } } = await supabase.auth.getUser();

    let companyId: string | null = null;
    const { data: dealRow } = await supabase
      .from('deals')
      .select('company_id')
      .eq('id', dealId)
      .maybeSingle();
    companyId = (dealRow as any)?.company_id ?? null;
    if (!companyId && user?.id) {
      const { data: prof } = await supabase
        .from('profiles')
        .select('company_id')
        .eq('id', user.id)
        .maybeSingle();
      companyId = (prof as any)?.company_id ?? null;
    }
    if (!companyId) return { ok: false, error: 'missing company id' };

    // Determine next version number for this deal
    const { data: priors } = await (supabase as any)
      .from('vdr_documents')
      .select('metadata')
      .eq('deal_id', dealId)
      .eq('folder_path', ARCHIVE_FOLDER);
    const versions = (priors || [])
      .map((p: any) => Number(p?.metadata?.version || 0))
      .filter((n: number) => Number.isFinite(n));
    const version = (versions.length ? Math.max(...versions) : 0) + 1;

    const sentAt = new Date();
    const stamp = sentAt.toISOString().replace(/[:.]/g, '-');
    const safe = (companyName || dealName || 'Deal')
      .replace(/[^\w\-]+/g, '_')
      .slice(0, 60);
    const filename = `Write-Up v${version} — ${safe} — ${sentAt
      .toISOString()
      .slice(0, 10)}.html`;
    const storagePath = `${dealId}${ARCHIVE_FOLDER}${stamp}__v${version}__${safe}.html`;

    const escape = (s: string) =>
      s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const archiveDoc = `<!doctype html><html><head><meta charset="utf-8"><title>${escape(
      title,
    )}</title></head><body style="margin:0;padding:24px;background:#fff;color:#111;font-family:-apple-system,Segoe UI,Roboto,sans-serif;line-height:1.5;">${html}</body></html>`;

    const blob = new Blob([archiveDoc], { type: 'text/html' });

    const { error: uploadError } = await supabase.storage
      .from('vdr-files')
      .upload(storagePath, blob, { upsert: true, contentType: 'text/html' });
    if (uploadError) {
      console.error('archiveApprovedWriteUp upload failed', uploadError);
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
        metadata: {
          archive_type: 'approved_writeup',
          version,
          approved_at: sentAt.toISOString(),
          approved_by: user?.id ?? null,
          approved_by_email: user?.email ?? null,
          deal_id: dealId,
          deal_name: dealName ?? null,
          deal_company: companyName ?? null,
          title,
        },
      });
    if (insertError) {
      console.error('archiveApprovedWriteUp insert failed', insertError);
      return { ok: false, error: insertError };
    }
    return { ok: true, version };
  } catch (e) {
    console.error('archiveApprovedWriteUp unexpected error', e);
    return { ok: false, error: e };
  }
}