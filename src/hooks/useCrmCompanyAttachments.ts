import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

export const CRM_COMPANY_ATTACHMENT_CATEGORIES = [
  { value: 'general', label: 'General' },
  { value: 'contracts', label: 'Contracts' },
  { value: 'nda', label: 'NDA' },
  { value: 'marketing', label: 'Marketing' },
  { value: 'financials', label: 'Financials' },
  { value: 'presentations', label: 'Presentations' },
  { value: 'correspondence', label: 'Correspondence' },
  { value: 'other', label: 'Other' },
] as const;

export type CrmCompanyAttachmentCategory =
  typeof CRM_COMPANY_ATTACHMENT_CATEGORIES[number]['value'];

export interface CrmCompanyAttachment {
  id: string;
  crm_company_id: string;
  name: string;
  file_path: string;
  content_type: string | null;
  size_bytes: number;
  category: CrmCompanyAttachmentCategory;
  created_at: string;
  url?: string;
}

const BUCKET = 'crm-company-attachments';

export function useCrmCompanyAttachments(crmCompanyId: string | null) {
  const { user } = useAuth();
  const [attachments, setAttachments] = useState<CrmCompanyAttachment[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const refetch = useCallback(async () => {
    if (!user || !crmCompanyId) {
      setAttachments([]);
      return;
    }
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('crm_company_attachments' as any)
        .select('*')
        .eq('crm_company_id', crmCompanyId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      const withUrls = await Promise.all(
        ((data ?? []) as any[]).map(async (att) => {
          const { data: signed } = await supabase.storage
            .from(BUCKET)
            .createSignedUrl(att.file_path, 3600);
          return {
            ...att,
            url: signed?.signedUrl,
          } as CrmCompanyAttachment;
        }),
      );
      setAttachments(withUrls);
    } catch (err) {
      console.error('[useCrmCompanyAttachments] fetch failed', err);
    } finally {
      setIsLoading(false);
    }
  }, [user, crmCompanyId]);

  useEffect(() => { refetch(); }, [refetch]);

  const upload = async (
    file: File,
    category: CrmCompanyAttachmentCategory = 'general',
  ) => {
    if (!user || !crmCompanyId) {
      toast.error('Please sign in to upload attachments');
      return null;
    }
    const safeExt = (file.name.split('.').pop() || 'bin').replace(/[^a-z0-9]/gi, '');
    const fileName = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}.${safeExt}`;
    const filePath = `${user.id}/${crmCompanyId}/${fileName}`;

    const { error: uploadErr } = await supabase.storage
      .from(BUCKET)
      .upload(filePath, file, { contentType: file.type || undefined });
    if (uploadErr) throw uploadErr;

    const { data, error: dbErr } = await supabase
      .from('crm_company_attachments' as any)
      .insert({
        user_id: user.id,
        crm_company_id: crmCompanyId,
        name: file.name,
        file_path: filePath,
        content_type: file.type || null,
        size_bytes: file.size,
        category,
      })
      .select()
      .single();
    if (dbErr) {
      // Best-effort cleanup of orphaned storage object
      await supabase.storage.from(BUCKET).remove([filePath]);
      throw dbErr;
    }
    return data;
  };

  const uploadMany = async (
    files: File[],
    category: CrmCompanyAttachmentCategory = 'general',
  ) => {
    const ok: any[] = [];
    const failed: string[] = [];
    for (const f of files) {
      try {
        const r = await upload(f, category);
        if (r) ok.push(r);
      } catch (e) {
        console.error('[useCrmCompanyAttachments] upload failed', f.name, e);
        failed.push(f.name);
      }
    }
    if (failed.length) toast.error(`Failed to upload: ${failed.join(', ')}`);
    if (ok.length) {
      toast.success(`${ok.length} attachment${ok.length > 1 ? 's' : ''} uploaded`);
      await refetch();
    }
    return ok;
  };

  const remove = async (att: CrmCompanyAttachment) => {
    try {
      await supabase.storage.from(BUCKET).remove([att.file_path]);
      const { error } = await supabase
        .from('crm_company_attachments' as any)
        .delete()
        .eq('id', att.id);
      if (error) throw error;
      toast.success('Attachment deleted');
      await refetch();
      return true;
    } catch (err) {
      console.error('[useCrmCompanyAttachments] delete failed', err);
      toast.error('Failed to delete attachment');
      return false;
    }
  };

  return { attachments, isLoading, upload, uploadMany, remove, refetch };
}