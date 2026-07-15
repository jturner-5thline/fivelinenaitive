import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

export const CRM_CONTACT_ATTACHMENT_CATEGORIES = [
  { value: 'general', label: 'General' },
  { value: 'contracts', label: 'Contracts' },
  { value: 'nda', label: 'NDA' },
  { value: 'correspondence', label: 'Correspondence' },
  { value: 'presentations', label: 'Presentations' },
  { value: 'other', label: 'Other' },
] as const;

export type CrmContactAttachmentCategory =
  typeof CRM_CONTACT_ATTACHMENT_CATEGORIES[number]['value'];

export interface CrmContactAttachment {
  id: string;
  contact_id: string;
  name: string;
  file_path: string;
  content_type: string | null;
  size_bytes: number;
  category: CrmContactAttachmentCategory;
  created_at: string;
  url?: string;
}

const BUCKET = 'crm-contact-attachments';

export function useCrmContactAttachments(contactId: string | null) {
  const { user } = useAuth();
  const [attachments, setAttachments] = useState<CrmContactAttachment[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const refetch = useCallback(async () => {
    if (!user || !contactId) {
      setAttachments([]);
      return;
    }
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('crm_contact_attachments' as any)
        .select('*')
        .eq('contact_id', contactId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      const withUrls = await Promise.all(
        ((data ?? []) as any[]).map(async (att) => {
          const { data: signed } = await supabase.storage
            .from(BUCKET)
            .createSignedUrl(att.file_path, 3600);
          return { ...att, url: signed?.signedUrl } as CrmContactAttachment;
        }),
      );
      setAttachments(withUrls);
    } catch (err) {
      console.error('[useCrmContactAttachments] fetch failed', err);
    } finally {
      setIsLoading(false);
    }
  }, [user, contactId]);

  useEffect(() => { refetch(); }, [refetch]);

  const upload = async (
    file: File,
    category: CrmContactAttachmentCategory = 'general',
  ) => {
    if (!user || !contactId) {
      toast.error('Please sign in to upload attachments');
      return null;
    }
    const safeExt = (file.name.split('.').pop() || 'bin').replace(/[^a-z0-9]/gi, '');
    const fileName = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}.${safeExt}`;
    const filePath = `${user.id}/${contactId}/${fileName}`;

    const { error: uploadErr } = await supabase.storage
      .from(BUCKET)
      .upload(filePath, file, { contentType: file.type || undefined });
    if (uploadErr) throw uploadErr;

    const { data, error: dbErr } = await supabase
      .from('crm_contact_attachments' as any)
      .insert({
        user_id: user.id,
        contact_id: contactId,
        name: file.name,
        file_path: filePath,
        content_type: file.type || null,
        size_bytes: file.size,
        category,
      })
      .select()
      .single();
    if (dbErr) {
      await supabase.storage.from(BUCKET).remove([filePath]);
      throw dbErr;
    }
    return data;
  };

  const uploadMany = async (
    files: File[],
    category: CrmContactAttachmentCategory = 'general',
  ) => {
    const ok: any[] = [];
    const failed: string[] = [];
    for (const f of files) {
      try {
        const r = await upload(f, category);
        if (r) ok.push(r);
      } catch (e) {
        console.error('[useCrmContactAttachments] upload failed', f.name, e);
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

  const remove = async (att: CrmContactAttachment) => {
    try {
      await supabase.storage.from(BUCKET).remove([att.file_path]);
      const { error } = await supabase
        .from('crm_contact_attachments' as any)
        .delete()
        .eq('id', att.id);
      if (error) throw error;
      toast.success('Attachment deleted');
      await refetch();
      return true;
    } catch (err) {
      console.error('[useCrmContactAttachments] delete failed', err);
      toast.error('Failed to delete attachment');
      return false;
    }
  };

  return { attachments, isLoading, upload, uploadMany, remove, refetch };
}