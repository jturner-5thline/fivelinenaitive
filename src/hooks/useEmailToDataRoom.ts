import { useCallback, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import type { EmailAttachment } from '@/components/deal/email/mockEmailData';
import type { DealAttachmentCategory } from '@/hooks/useDealAttachments';

export interface DataRoomDestinationSuggestion {
  suggested_deal_id: string;
  suggested_deal_name: string;
  confidence: 'low' | 'medium' | 'high';
  reason: string;
  default_category: DealAttachmentCategory;
  per_file: Array<{
    filename: string;
    category: DealAttachmentCategory;
    include: boolean;
  }>;
}

export interface SourceEmailMeta {
  messageId: string;
  threadId: string;
  subject: string;
  senderName: string;
  senderEmail: string;
}

export interface UploadPlanItem {
  attachment: EmailAttachment;
  desiredName: string;
  category: DealAttachmentCategory;
  include: boolean;
}

export interface UploadResult {
  uploaded: number;
  failed: number;
  renamed: Array<{ original: string; final: string }>;
}

/**
 * useEmailToDataRoom
 * ------------------
 * Orchestrates the "send email attachments to a deal data room" flow:
 *   1. AI suggestion (suggest) — calls smart-email-ai with attachment metadata.
 *   2. Upload (commitUpload) — for each selected attachment:
 *        - downloads the binary via gmail-messages
 *        - uploads to deal-attachments storage bucket
 *        - inserts deal_attachments row with email provenance
 *        - de-dupes filenames using -v2/-v3 suffix
 *   3. Logs a single activity_logs entry summarizing the upload.
 */
export function useEmailToDataRoom() {
  const { user } = useAuth();
  const [suggesting, setSuggesting] = useState(false);
  const [uploading, setUploading] = useState(false);

  const suggest = useCallback(
    async (params: {
      dealId?: string;
      sourceEmail: SourceEmailMeta;
      threadData: any;
      attachments: EmailAttachment[];
    }): Promise<DataRoomDestinationSuggestion | null> => {
      setSuggesting(true);
      try {
        const attachmentMeta = params.attachments
          .filter((a) => !a.is_inline)
          .map((a) => ({
            filename: a.filename || 'Untitled',
            content_type: a.content_type,
            size: a.size,
          }));

        const { data, error } = await supabase.functions.invoke('smart-email-ai', {
          body: {
            action: 'suggest_data_room_destination',
            dealId: params.dealId,
            threadData: params.threadData,
            emailData: {
              from_name: params.sourceEmail.senderName,
              from_email: params.sourceEmail.senderEmail,
              subject: params.sourceEmail.subject,
              body_preview: params.threadData?.latestEmail?.body_preview || '',
            },
            attachments: attachmentMeta,
          },
        });

        if (error) throw error;
        if (data?.error) throw new Error(data.error);
        const r = data?.result;
        if (!r || r.raw) return null;

        // Normalize per-file (ensure every input filename has an entry)
        const perFileMap = new Map<string, { category: DealAttachmentCategory; include: boolean }>();
        (r.per_file || []).forEach((f: any) => {
          if (f?.filename) {
            perFileMap.set(f.filename, {
              category: ['materials', 'financials', 'agreements', 'other'].includes(f.category)
                ? f.category
                : (r.default_category || 'materials'),
              include: f.include !== false,
            });
          }
        });

        const fallbackCategory: DealAttachmentCategory = ['materials', 'financials', 'agreements', 'other'].includes(
          r.default_category,
        )
          ? r.default_category
          : 'materials';

        const per_file = attachmentMeta.map((a) => ({
          filename: a.filename,
          category: perFileMap.get(a.filename)?.category || fallbackCategory,
          include: perFileMap.get(a.filename)?.include ?? true,
        }));

        return {
          suggested_deal_id: r.suggested_deal_id || '',
          suggested_deal_name: r.suggested_deal_name || '',
          confidence: ['low', 'medium', 'high'].includes(r.confidence) ? r.confidence : 'low',
          reason: r.reason || '',
          default_category: fallbackCategory,
          per_file,
        };
      } catch (err: any) {
        console.error('[useEmailToDataRoom] suggest error:', err);
        return null;
      } finally {
        setSuggesting(false);
      }
    },
    [],
  );

  const commitUpload = useCallback(
    async (params: {
      dealId: string;
      messageId: string; // for downloading attachment binaries
      sourceEmail: SourceEmailMeta;
      plan: UploadPlanItem[];
    }): Promise<UploadResult | null> => {
      if (!user) {
        toast.error('Please log in');
        return null;
      }
      const items = params.plan.filter((p) => p.include && p.attachment.id);
      if (items.length === 0) {
        toast.warning('No files selected');
        return null;
      }

      setUploading(true);
      let uploaded = 0;
      let failed = 0;
      const renamed: Array<{ original: string; final: string }> = [];

      try {
        // Pull existing filenames for this deal so we can dedupe via -v2/-v3 suffix
        const { data: existingRows } = await supabase
          .from('deal_attachments')
          .select('name')
          .eq('deal_id', params.dealId);
        const existingNames = new Set<string>((existingRows || []).map((r: any) => r.name));

        const ensureUniqueName = (desired: string): string => {
          if (!existingNames.has(desired)) {
            existingNames.add(desired);
            return desired;
          }
          const dot = desired.lastIndexOf('.');
          const stem = dot > 0 ? desired.slice(0, dot) : desired;
          const ext = dot > 0 ? desired.slice(dot) : '';
          let v = 2;
          while (existingNames.has(`${stem}-v${v}${ext}`)) v++;
          const final = `${stem}-v${v}${ext}`;
          existingNames.add(final);
          renamed.push({ original: desired, final });
          return final;
        };

        for (const item of items) {
          try {
            // Download binary via existing edge function
            const { data: dl, error: dlErr } = await supabase.functions.invoke('gmail-messages', {
              body: {
                action: 'get_attachment',
                message_id: params.messageId,
                attachment_id: item.attachment.id,
              },
            });
            if (dlErr || !dl?.data) throw new Error(dlErr?.message || 'Download failed');

            const binary = atob(dl.data);
            const len = binary.length;
            const bytes = new Uint8Array(len);
            for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
            const blob = new Blob([bytes], {
              type: dl.content_type || item.attachment.content_type || 'application/octet-stream',
            });

            const finalName = ensureUniqueName(item.desiredName.trim() || item.attachment.filename || 'attachment');
            const ext = finalName.includes('.') ? finalName.split('.').pop() : 'bin';
            const storageName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
            const filePath = `${user.id}/${params.dealId}/${storageName}`;

            const { error: upErr } = await supabase.storage
              .from('deal-attachments')
              .upload(filePath, blob, { contentType: blob.type });
            if (upErr) throw upErr;

            const { error: dbErr } = await supabase.from('deal_attachments').insert({
              user_id: user.id,
              deal_id: params.dealId,
              name: finalName,
              file_path: filePath,
              content_type: blob.type,
              size_bytes: blob.size,
              category: item.category,
              source: 'email_attachment',
              source_email_id: params.sourceEmail.messageId,
              source_thread_id: params.sourceEmail.threadId,
              source_subject: params.sourceEmail.subject,
              source_sender: `${params.sourceEmail.senderName} <${params.sourceEmail.senderEmail}>`,
            } as any);
            if (dbErr) throw dbErr;

            uploaded += 1;
          } catch (err) {
            console.error('[useEmailToDataRoom] file failed:', item.attachment.filename, err);
            failed += 1;
          }
        }

        // Activity log entry summarizing the upload
        if (uploaded > 0) {
          try {
            await supabase.from('activity_logs').insert({
              deal_id: params.dealId,
              activity_type: 'document_received',
              description: `${uploaded} file${uploaded === 1 ? '' : 's'} added to data room from email "${params.sourceEmail.subject}" (${params.sourceEmail.senderName})`,
              user_id: user.id,
              metadata: {
                source: 'email_attachment',
                email_id: params.sourceEmail.messageId,
                thread_id: params.sourceEmail.threadId,
                sender: params.sourceEmail.senderEmail,
                subject: params.sourceEmail.subject,
                files_uploaded: uploaded,
                files_failed: failed,
                renamed,
              },
            });
          } catch (logErr) {
            console.warn('[useEmailToDataRoom] activity log failed:', logErr);
          }
        }

        if (uploaded > 0 && failed === 0) {
          toast.success(`Added ${uploaded} file${uploaded === 1 ? '' : 's'} to data room`);
        } else if (uploaded > 0 && failed > 0) {
          toast.warning(`Added ${uploaded}, ${failed} failed`);
        } else {
          toast.error('Upload failed');
        }

        return { uploaded, failed, renamed };
      } finally {
        setUploading(false);
      }
    },
    [user],
  );

  return { suggest, commitUpload, suggesting, uploading };
}
