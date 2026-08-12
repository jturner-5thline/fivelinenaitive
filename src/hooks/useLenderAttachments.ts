import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useCompany } from '@/hooks/useCompany';
import { toast } from 'sonner';

export const LENDER_ATTACHMENT_CATEGORIES = [
  { value: 'general', label: 'General' },
  { value: 'nda', label: 'NDA' },
  { value: 'marketing_materials', label: 'Marketing Materials' },
  { value: 'contracts', label: 'Contracts' },
  { value: 'presentations', label: 'Presentations' },
  { value: 'due_diligence', label: 'Due Diligence' },
  { value: 'term_sheets', label: 'Term Sheets' },
  { value: 'correspondence', label: 'Correspondence' },
] as const;

export type LenderAttachmentCategory = typeof LENDER_ATTACHMENT_CATEGORIES[number]['value'];

export interface LenderAttachment {
  id: string;
  lender_name: string;
  name: string;
  file_path: string;
  content_type: string | null;
  size_bytes: number;
  created_at: string;
  category: LenderAttachmentCategory;
  url?: string;
  /** Where the file physically lives — funding source record or the linked CRM company */
  source?: 'funding_source' | 'company';
  source_label?: string | null;
}

const COMPANY_BUCKET = 'crm-company-attachments';

/** CRM company id representing the same entity as this funding source. */
async function resolveLinkedCompanyId(lenderName: string): Promise<string | null> {
  const { data: lender } = await supabase
    .from('master_lenders')
    .select('crm_company_id')
    .ilike('name', lenderName)
    .not('crm_company_id', 'is', null)
    .limit(1)
    .maybeSingle();
  const linked = (lender as any)?.crm_company_id as string | undefined;
  if (linked) return linked;

  const { data: co } = await supabase
    .from('crm_companies')
    .select('id')
    .ilike('name', lenderName)
    .limit(1)
    .maybeSingle();
  return (co as any)?.id ?? null;
}

export function useLenderAttachments(lenderName: string | null) {
  const { user } = useAuth();
  const { company } = useCompany();
  const [attachments, setAttachments] = useState<LenderAttachment[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const fetchAttachments = useCallback(async () => {
    if (!user || !lenderName || !company?.id) {
      setAttachments([]);
      return;
    }

    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('lender_attachments')
        .select('*')
        .eq('company_id', company.id)
        .eq('lender_name', lenderName)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Shared attachments from the matching CRM company (same rows, not duplicated)
      const companyId = await resolveLinkedCompanyId(lenderName);
      let companyRows: any[] = [];
      if (companyId) {
        const { data: ca } = await supabase
          .from('crm_company_attachments' as any)
          .select('*')
          .eq('crm_company_id', companyId);
        companyRows = (ca ?? []) as any[];
      }

      // Get signed URLs for each attachment (1 hour expiry)
      const attachmentsWithUrls = await Promise.all([
        ...(data || []).map(async (att) => {
          const { data: urlData, error: urlError } = await supabase.storage
            .from('lender-attachments')
            .createSignedUrl(att.file_path, 3600); // 1 hour expiry
          
          return { 
            ...att, 
            url: urlError ? undefined : urlData?.signedUrl,
            category: att.category as LenderAttachmentCategory,
            source: 'funding_source' as const,
          };
        }),
        ...companyRows.map(async (att) => {
          const { data: urlData } = await supabase.storage
            .from(COMPANY_BUCKET)
            .createSignedUrl(att.file_path, 3600);
          return {
            ...att,
            lender_name: lenderName,
            url: urlData?.signedUrl,
            category: att.category as LenderAttachmentCategory,
            source: 'company' as const,
            source_label: 'Company',
          } as LenderAttachment;
        }),
      ]);
      attachmentsWithUrls.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));

      setAttachments(attachmentsWithUrls);
    } catch (error) {
      console.error('Error fetching lender attachments:', error);
    } finally {
      setIsLoading(false);
    }
  }, [user, lenderName, company?.id]);

  useEffect(() => {
    fetchAttachments();
  }, [fetchAttachments]);

  const uploadAttachment = async (file: File, category: LenderAttachmentCategory = 'general') => {
    if (!user || !lenderName || !company?.id) {
      toast.error('Please log in to upload attachments');
      return null;
    }

    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
      const filePath = `${user.id}/${lenderName}/${fileName}`;

      // Upload to storage
      const { error: uploadError } = await supabase.storage
        .from('lender-attachments')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      // Create database record
      const { data, error: dbError } = await supabase
        .from('lender_attachments')
        .insert({
          user_id: user.id,
          company_id: company.id,
          lender_name: lenderName,
          name: file.name,
          file_path: filePath,
          content_type: file.type,
          size_bytes: file.size,
          category,
        })
        .select()
        .single();

      if (dbError) throw dbError;

      return data;
    } catch (error) {
      console.error('Error uploading attachment:', error);
      throw error;
    }
  };

  const uploadMultipleAttachments = async (files: File[], category: LenderAttachmentCategory = 'general') => {
    if (!user || !lenderName) {
      toast.error('Please log in to upload attachments');
      return [];
    }

    const results: any[] = [];
    const errors: string[] = [];

    for (const file of files) {
      try {
        const result = await uploadAttachment(file, category);
        if (result) results.push(result);
      } catch (error) {
        errors.push(file.name);
      }
    }

    if (errors.length > 0) {
      toast.error(`Failed to upload: ${errors.join(', ')}`);
    }
    
    if (results.length > 0) {
      toast.success(`${results.length} attachment${results.length > 1 ? 's' : ''} uploaded`);
      await fetchAttachments();
    }

    return results;
  };

  const deleteAttachment = async (attachment: LenderAttachment) => {
    if (!user) return false;

    try {
      const fromCompany = attachment.source === 'company';
      // Delete from storage
      const { error: storageError } = await supabase.storage
        .from(fromCompany ? COMPANY_BUCKET : 'lender-attachments')
        .remove([attachment.file_path]);

      if (storageError) throw storageError;

      // Delete from database
      const { error: dbError } = await supabase
        .from((fromCompany ? 'crm_company_attachments' : 'lender_attachments') as any)
        .delete()
        .eq('id', attachment.id);

      if (dbError) throw dbError;

      toast.success('Attachment deleted');
      await fetchAttachments();
      return true;
    } catch (error) {
      console.error('Error deleting attachment:', error);
      toast.error('Failed to delete attachment');
      return false;
    }
  };

  return {
    attachments,
    isLoading,
    uploadAttachment,
    uploadMultipleAttachments,
    deleteAttachment,
    refetch: fetchAttachments,
  };
}
