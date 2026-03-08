import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useCompany } from '@/hooks/useCompany';
import { AgreementTemplate, AgreementSection, AgreementFieldDef, AgreementSubsection, AgreementQualifier } from './types';
import { DEFAULT_TEMPLATE_NAME, DEFAULT_TEMPLATE_DESCRIPTION, DEFAULT_SECTIONS } from './seedData';
import { toast } from 'sonner';

function parseSections(rows: any[]): AgreementSection[] {
  return rows.map(r => ({
    id: r.section_id,
    db_id: r.id,
    template_id: r.template_id,
    section_id: r.section_id,
    title: r.title,
    category: r.category as 'staple' | 'configurable' | 'optional',
    enabled: r.enabled ?? true,
    sort_order: r.sort_order,
    description: r.description || '',
    template_text: r.template_text || '',
    fields: (r.fields || []) as AgreementFieldDef[],
    subsections: r.subsections as AgreementSubsection[] | null,
    qualifiers: r.qualifiers as AgreementQualifier[] | null,
  })).sort((a, b) => a.sort_order - b.sort_order);
}

export function useAgreementTemplates() {
  const [templates, setTemplates] = useState<AgreementTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();
  const { company } = useCompany();
  const companyId = company?.id;

  const fetchTemplates = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    try {
      const { data: tplRows, error } = await supabase
        .from('agreement_templates')
        .select('*')
        .eq('company_id', companyId)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const results: AgreementTemplate[] = [];
      for (const t of tplRows || []) {
        const { data: secRows } = await supabase
          .from('agreement_sections')
          .select('*')
          .eq('template_id', t.id)
          .order('sort_order');

        results.push({
          id: t.id,
          company_id: t.company_id,
          name: t.name,
          description: t.description || '',
          created_by: t.created_by,
          is_active: t.is_active ?? true,
          created_at: t.created_at,
          updated_at: t.updated_at,
          sections: parseSections(secRows || []),
        });
      }
      setTemplates(results);
    } catch (err: any) {
      console.error('Error fetching agreement templates:', err);
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  const createTemplate = useCallback(async (name: string, description: string, sections: Omit<AgreementSection, 'id' | 'db_id' | 'template_id'>[]) => {
    if (!user || !companyId) return null;
    try {
      const { data: tpl, error } = await supabase
        .from('agreement_templates')
        .insert({ name, description, company_id: companyId, created_by: user.id })
        .select()
        .single();

      if (error) throw error;

      const sectionRows = sections.map((s, i) => ({
        template_id: tpl.id,
        section_id: s.section_id,
        title: s.title,
        category: s.category,
        enabled: s.enabled,
        sort_order: s.sort_order ?? i,
        description: s.description || null,
        template_text: s.template_text,
        fields: s.fields as any,
        subsections: s.subsections as any,
        qualifiers: s.qualifiers as any,
      }));

      if (sectionRows.length > 0) {
        const { error: secError } = await supabase
          .from('agreement_sections')
          .insert(sectionRows);
        if (secError) throw secError;
      }

      toast.success('Template created successfully');
      await fetchTemplates();
      return tpl.id;
    } catch (err: any) {
      toast.error('Failed to create template: ' + err.message);
      return null;
    }
  }, [user, companyId, fetchTemplates]);

  const seedDefaultTemplate = useCallback(async () => {
    return createTemplate(DEFAULT_TEMPLATE_NAME, DEFAULT_TEMPLATE_DESCRIPTION, DEFAULT_SECTIONS as any);
  }, [createTemplate]);

  const updateTemplate = useCallback(async (templateId: string, updates: { name?: string; description?: string; is_active?: boolean }) => {
    try {
      const { error } = await supabase
        .from('agreement_templates')
        .update(updates)
        .eq('id', templateId);
      if (error) throw error;
      toast.success('Template updated');
      await fetchTemplates();
    } catch (err: any) {
      toast.error('Failed to update template: ' + err.message);
    }
  }, [fetchTemplates]);

  const deleteTemplate = useCallback(async (templateId: string) => {
    try {
      const { error } = await supabase
        .from('agreement_templates')
        .delete()
        .eq('id', templateId);
      if (error) throw error;
      toast.success('Template deleted');
      await fetchTemplates();
    } catch (err: any) {
      toast.error('Failed to delete template: ' + err.message);
    }
  }, [fetchTemplates]);

  const duplicateTemplate = useCallback(async (template: AgreementTemplate) => {
    const newSections = template.sections.map(s => ({
      section_id: s.section_id,
      title: s.title,
      category: s.category,
      enabled: s.enabled,
      sort_order: s.sort_order,
      description: s.description,
      template_text: s.template_text,
      fields: s.fields,
      subsections: s.subsections,
      qualifiers: s.qualifiers,
    }));
    return createTemplate(template.name + ' (Copy)', template.description || '', newSections as any);
  }, [createTemplate]);

  const saveSections = useCallback(async (templateId: string, sections: AgreementSection[]) => {
    try {
      // Delete existing sections and re-insert
      await supabase.from('agreement_sections').delete().eq('template_id', templateId);

      const rows = sections.map((s, i) => ({
        template_id: templateId,
        section_id: s.section_id,
        title: s.title,
        category: s.category,
        enabled: s.enabled,
        sort_order: i,
        description: s.description || null,
        template_text: s.template_text,
        fields: s.fields as any,
        subsections: s.subsections as any,
        qualifiers: s.qualifiers as any,
      }));

      if (rows.length > 0) {
        const { error } = await supabase.from('agreement_sections').insert(rows);
        if (error) throw error;
      }

      toast.success('Sections saved');
      await fetchTemplates();
    } catch (err: any) {
      toast.error('Failed to save sections: ' + err.message);
    }
  }, [fetchTemplates]);

  return {
    templates,
    loading,
    createTemplate,
    seedDefaultTemplate,
    updateTemplate,
    deleteTemplate,
    duplicateTemplate,
    saveSections,
    refetch: fetchTemplates,
  };
}

export function useActiveTemplate() {
  const [template, setTemplate] = useState<AgreementTemplate | null>(null);
  const [loading, setLoading] = useState(true);
  const { companyId } = useCompany();

  useEffect(() => {
    if (!companyId) return;

    const fetch = async () => {
      setLoading(true);
      try {
        const { data: tplRows } = await supabase
          .from('agreement_templates')
          .select('*')
          .eq('company_id', companyId)
          .eq('is_active', true)
          .order('created_at')
          .limit(1);

        if (!tplRows || tplRows.length === 0) {
          setTemplate(null);
          return;
        }

        const t = tplRows[0];
        const { data: secRows } = await supabase
          .from('agreement_sections')
          .select('*')
          .eq('template_id', t.id)
          .order('sort_order');

        setTemplate({
          id: t.id,
          company_id: t.company_id,
          name: t.name,
          description: t.description || '',
          created_by: t.created_by,
          is_active: true,
          sections: parseSections(secRows || []),
        });
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetch();
  }, [companyId]);

  return { template, loading };
}
