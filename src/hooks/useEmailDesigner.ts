import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/hooks/useCompany';
import { toast } from 'sonner';
import DOMPurify from 'dompurify';

export interface EmailBlock {
  id: string;
  type: 'text' | 'button' | 'image' | 'divider' | 'spacer' | 'columns';
  props: Record<string, any>;
  children?: EmailBlock[];
}

export interface EmailTemplateV2 {
  id: string;
  company_id: string;
  name: string;
  type: string;
  scope: string;
  template_json: EmailBlock[];
  subject_template: string | null;
  preview_text_template: string | null;
  is_locked: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface SavedBlock {
  id: string;
  company_id: string;
  name: string;
  block_json: EmailBlock;
  category: string | null;
  created_at: string;
}

const MERGE_TAGS = [
  { key: 'contact.first_name', label: 'First Name' },
  { key: 'contact.last_name', label: 'Last Name' },
  { key: 'contact.email', label: 'Email' },
  { key: 'contact.job_title', label: 'Job Title' },
  { key: 'contact.company_name', label: 'Company' },
  { key: 'deal.name', label: 'Deal Name' },
  { key: 'deal.stage', label: 'Deal Stage' },
  { key: 'deal.value', label: 'Deal Value' },
  { key: 'user.first_name', label: 'Sender First Name' },
  { key: 'user.last_name', label: 'Sender Last Name' },
  { key: 'user.email', label: 'Sender Email' },
  { key: 'organization.name', label: 'Organization' },
  { key: 'unsubscribe_link', label: 'Unsubscribe Link' },
];

export { MERGE_TAGS };

export function useEmailTemplatesV2() {
  const { company } = useCompany();
  return useQuery({
    queryKey: ['email-templates-v2', company?.id],
    queryFn: async () => {
      if (!company?.id) return [];
      const { data, error } = await supabase
        .from('email_templates_v2')
        .select('*')
        .eq('company_id', company.id)
        .order('updated_at', { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as EmailTemplateV2[];
    },
    enabled: !!company?.id,
  });
}

export function useSaveEmailTemplate() {
  const qc = useQueryClient();
  const { company } = useCompany();
  return useMutation({
    mutationFn: async (template: Partial<EmailTemplateV2> & { name: string }) => {
      if (!company?.id) throw new Error('No company');
      const { data: { user } } = await supabase.auth.getUser();
      const payload = {
        ...template,
        company_id: company.id,
        created_by: template.created_by || user?.id,
        template_json: template.template_json || [],
      };
      if (template.id) {
        const { data, error } = await supabase
          .from('email_templates_v2')
          .update(payload as any)
          .eq('id', template.id)
          .select()
          .single();
        if (error) throw error;
        return data;
      } else {
        const { data, error } = await supabase
          .from('email_templates_v2')
          .insert(payload as any)
          .select()
          .single();
        if (error) throw error;
        return data;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['email-templates-v2'] });
      toast.success('Template saved');
    },
    onError: () => toast.error('Failed to save template'),
  });
}

export function useDeleteEmailTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('email_templates_v2').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['email-templates-v2'] });
      toast.success('Template deleted');
    },
    onError: () => toast.error('Failed to delete template'),
  });
}

export function useBlockLibrary() {
  const { company } = useCompany();
  return useQuery({
    queryKey: ['email-block-library', company?.id],
    queryFn: async () => {
      if (!company?.id) return [];
      const { data, error } = await supabase
        .from('email_block_library')
        .select('*')
        .eq('company_id', company.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as SavedBlock[];
    },
    enabled: !!company?.id,
  });
}

/** Render merge tags in text */
export function renderMergeTags(text: string, context: Record<string, any>): string {
  return text.replace(/\{\{(\w+\.\w+)\}\}/g, (match, key) => {
    const [group, field] = key.split('.');
    return context?.[group]?.[field] ?? match;
  });
}

/** Convert blocks to HTML preview */
export function blocksToHtml(blocks: EmailBlock[]): string {
  const raw = blocks.map(block => {
    switch (block.type) {
      case 'text':
        return `<div style="text-align:${block.props.align || 'left'};font-size:${block.props.fontSize || 14}px">${block.props.content || ''}</div>`;
      case 'button':
        return `<div style="text-align:${block.props.align || 'center'};padding:12px 0"><a href="${block.props.url || '#'}" style="background:${block.props.color || '#20808d'};color:#fff;padding:10px 24px;border-radius:6px;text-decoration:none;display:inline-block">${block.props.text || 'Click Here'}</a></div>`;
      case 'image':
        return `<div style="text-align:${block.props.align || 'center'}"><img src="${block.props.src || ''}" alt="${block.props.alt || ''}" style="max-width:100%;width:${block.props.width || '100%'}" /></div>`;
      case 'divider':
        return `<hr style="border:none;border-top:1px solid #e5e7eb;margin:16px 0" />`;
      case 'spacer':
        return `<div style="height:${block.props.height || 24}px"></div>`;
      default:
        return '';
    }
  }).join('');
  // Sanitize merged HTML to prevent stored XSS from malicious template fields.
  // Restrict URI schemes to http(s) and mailto so javascript:/data: are stripped.
  return DOMPurify.sanitize(raw, {
    USE_PROFILES: { html: true },
    ALLOWED_URI_REGEXP: /^(?:https?:|mailto:|#)/i,
  });
}
