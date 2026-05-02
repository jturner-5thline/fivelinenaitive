import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

export interface PaletteColor { name: string; hex: string; role: string }
export interface StyleSpec {
  palette: PaletteColor[];
  fonts?: { heading?: string; body?: string };
  layout_notes?: string;
}

export interface StyleTemplate {
  id: string;
  user_id: string;
  name: string;
  source_type: "image" | "url" | "manual";
  source_value: string | null;
  palette: PaletteColor[];
  fonts: { heading?: string; body?: string };
  layout_notes: string | null;
  preview_image_path: string | null;
  created_at: string;
}

export interface StyledDocument {
  id: string;
  deal_id: string;
  user_id: string;
  document_type: string;
  title: string;
  sections: string[];
  style: StyleSpec;
  style_template_id: string | null;
  html: string;
  prompt: string | null;
  status: "draft" | "exported";
  exported_attachment_id: string | null;
  exported_at: string | null;
  created_at: string;
  updated_at: string;
}

export const DOCUMENT_TYPES = [
  { value: "deal_summary_memo", label: "Deal Summary Memo" },
  { value: "borrower_profile", label: "Borrower Profile" },
  { value: "lender_pitch_one_pager", label: "Lender Pitch One-Pager" },
  { value: "executive_summary", label: "Executive Summary" },
  { value: "deal_teaser", label: "Deal Teaser (Anonymized)" },
  { value: "term_sheet_summary", label: "Term Sheet Summary" },
] as const;

export const SECTIONS = [
  { value: "executive_summary", label: "Executive Summary" },
  { value: "company_overview", label: "Company Overview" },
  { value: "financial_highlights", label: "Financial Highlights" },
  { value: "use_of_proceeds", label: "Use of Proceeds" },
  { value: "risk_factors", label: "Risk Factors" },
  { value: "fifth_line_commentary", label: "5th Line Commentary" },
  { value: "next_steps", label: "Next Steps" },
] as const;

export const DEFAULT_STYLE: StyleSpec = {
  palette: [
    { name: "Primary", hex: "#1E2952", role: "primary" },
    { name: "Accent", hex: "#4338CA", role: "accent" },
    { name: "Foreground", hex: "#0F172A", role: "foreground" },
    { name: "Muted", hex: "#64748B", role: "muted" },
    { name: "Background", hex: "#FFFFFF", role: "background" },
    { name: "Surface", hex: "#F8FAFC", role: "surface" },
  ],
  fonts: { heading: "Inter", body: "Inter" },
  layout_notes: "Modern, professional layout with clear hierarchy.",
};

export function useBrandedDocStudio(dealId: string | null) {
  const { user } = useAuth();
  const [templates, setTemplates] = useState<StyleTemplate[]>([]);
  const [documents, setDocuments] = useState<StyledDocument[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchAll = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const [tplRes, docRes] = await Promise.all([
        supabase
          .from("ai_style_templates" as any)
          .select("*")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false }),
        dealId
          ? supabase
              .from("ai_styled_documents" as any)
              .select("*")
              .eq("deal_id", dealId)
              .order("updated_at", { ascending: false })
          : Promise.resolve({ data: [], error: null }),
      ]);
      if (tplRes.data) setTemplates(tplRes.data as unknown as StyleTemplate[]);
      if ((docRes as any).data) setDocuments((docRes as any).data as StyledDocument[]);
    } finally {
      setLoading(false);
    }
  }, [user, dealId]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const extractStyle = useCallback(async (input: {
    source_type: "image" | "url";
    image_data_url?: string;
    image_storage_path?: string;
    url?: string;
  }): Promise<StyleSpec> => {
    const { data, error } = await supabase.functions.invoke("branded-doc-style-extract", { body: input });
    if (error) {
      console.error(error);
      toast.error("Style extraction failed — using defaults");
      return DEFAULT_STYLE;
    }
    return {
      palette: data?.palette || DEFAULT_STYLE.palette,
      fonts: data?.fonts || DEFAULT_STYLE.fonts,
      layout_notes: data?.layout_notes || DEFAULT_STYLE.layout_notes,
    };
  }, []);

  const uploadStyleRefImage = useCallback(async (file: File): Promise<string | null> => {
    if (!user) return null;
    const ext = file.name.split(".").pop() || "png";
    const path = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const { error } = await supabase.storage.from("ai-style-refs").upload(path, file, { contentType: file.type });
    if (error) {
      toast.error(`Upload failed: ${error.message}`);
      return null;
    }
    return path;
  }, [user]);

  const generateDocument = useCallback(async (input: {
    deal_id: string;
    document_type: string;
    document_title?: string;
    sections: string[];
    style: StyleSpec;
    user_prompt?: string;
    current_html?: string;
    anonymize?: boolean;
  }): Promise<{ html: string; inner_html: string } | null> => {
    const { data, error } = await supabase.functions.invoke("branded-doc-generate", { body: input });
    if (error || data?.error) {
      console.error(error || data.error);
      toast.error(`Generation failed: ${error?.message || data?.error || "unknown"}`);
      return null;
    }
    return data;
  }, []);

  const saveDocument = useCallback(async (doc: Partial<StyledDocument> & { deal_id: string; document_type: string; title: string; sections: string[]; style: StyleSpec; html: string }) => {
    if (!user) return null;
    const payload: any = {
      ...doc,
      user_id: user.id,
    };
    let res;
    if (doc.id) {
      res = await supabase.from("ai_styled_documents" as any).update(payload).eq("id", doc.id).select().single();
    } else {
      res = await supabase.from("ai_styled_documents" as any).insert(payload).select().single();
    }
    if (res.error) {
      toast.error(`Save failed: ${res.error.message}`);
      return null;
    }
    await fetchAll();
    return res.data as unknown as StyledDocument;
  }, [user, fetchAll]);

  const saveTemplate = useCallback(async (tpl: Omit<StyleTemplate, "id" | "user_id" | "created_at">) => {
    if (!user) return null;
    const { data, error } = await supabase
      .from("ai_style_templates" as any)
      .insert({ ...tpl, user_id: user.id })
      .select()
      .single();
    if (error) {
      toast.error(`Failed to save template: ${error.message}`);
      return null;
    }
    await fetchAll();
    toast.success("Style template saved");
    return data as unknown as StyleTemplate;
  }, [user, fetchAll]);

  const deleteTemplate = useCallback(async (id: string) => {
    const { error } = await supabase.from("ai_style_templates" as any).delete().eq("id", id);
    if (error) {
      toast.error(`Delete failed: ${error.message}`);
      return;
    }
    await fetchAll();
  }, [fetchAll]);

  const exportPdf = useCallback(async (params: {
    deal_id: string;
    document_id: string;
    filename: string;
    pdf_base64: string;
    push_to_drive?: boolean;
  }) => {
    const { data, error } = await supabase.functions.invoke("branded-doc-export", { body: params });
    if (error || data?.error) {
      toast.error(`Export failed: ${error?.message || data?.error}`);
      return null;
    }
    return data;
  }, []);

  return {
    templates, documents, loading,
    extractStyle, uploadStyleRefImage,
    generateDocument, saveDocument,
    saveTemplate, deleteTemplate,
    exportPdf, refresh: fetchAll,
  };
}
