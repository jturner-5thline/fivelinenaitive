import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

export interface DocumentExtraction {
  document_metadata: {
    document_type: string | null;
    title: string | null;
    source_filename: string | null;
    page_count: number | null;
    company_name: string | null;
    company_legal_name: string | null;
    reporting_period: string | null;
    currency: string | null;
  };
  company_profile: {
    industry: string | null;
    business_description: string | null;
    hq_location: string | null;
    website: string | null;
    founded_year: number | null;
  };
  financials: {
    periods: Array<{
      label: string | null;
      revenue: number | null;
      arr: number | null;
      mrr: number | null;
      gross_margin_percent: number | null;
      ebitda: number | null;
      ebitda_margin_percent: number | null;
      net_income: number | null;
      opex: {
        sales_and_marketing: number | null;
        research_and_development: number | null;
        general_and_administrative: number | null;
        other_opex: number | null;
      };
      total_assets: number | null;
      total_liabilities: number | null;
      total_equity: number | null;
    }>;
  };
  cap_table: {
    entries: Array<{
      holder_name: string;
      security_type: string | null;
      shares_or_units: number | null;
      ownership_percent: number | null;
      class_or_series: string | null;
    }>;
  };
  contracts: {
    loan_agreements: Array<{
      lender_name: string | null;
      facility_type: string | null;
      commitment_amount: number | null;
      maturity_date: string | null;
      interest_rate: string | null;
      financial_covenants: string | null;
      security_or_collateral: string | null;
    }>;
    customer_agreements: Array<{
      customer_name: string | null;
      contract_value: number | null;
      contract_term: string | null;
      renewal_terms: string | null;
      termination_rights: string | null;
    }>;
  };
  risk_flags: Array<{
    category: string;
    severity: string;
    description: string;
    source_reference: {
      page: number | null;
      text_snippet: string | null;
    };
  }>;
  qa_support: {
    key_points_summary: string | null;
    qa_ready_context: string | null;
  };
  meta: {
    processing_notes: string | null;
    uncertainty_notes: string | null;
  };
}

export interface ExtractionResult {
  extraction: DocumentExtraction;
  documentsProcessed: string[];
  documentCount: number;
}

export function useDealDocumentExtraction(dealId: string) {
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractingDocId, setExtractingDocId] = useState<string | null>(null);
  const [result, setResult] = useState<ExtractionResult | null>(null);

  const extractDocument = useCallback(async (documentId?: string): Promise<ExtractionResult | null> => {
    setIsExtracting(true);
    setExtractingDocId(documentId || null);
    try {
      const { data, error } = await supabase.functions.invoke('deal-space-ai', {
        body: { dealId, action: 'extract-document', documentId },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      setResult(data);
      toast({
        title: 'Extraction complete',
        description: `Analyzed ${data.documentCount} document(s)`,
      });
      return data;
    } catch (err) {
      console.error('Document extraction error:', err);
      toast({
        title: 'Extraction failed',
        description: err instanceof Error ? err.message : 'Could not extract document data',
        variant: 'destructive',
      });
      return null;
    } finally {
      setIsExtracting(false);
      setExtractingDocId(null);
    }
  }, [dealId]);

  const clearResult = useCallback(() => setResult(null), []);

  return { isExtracting, extractingDocId, result, extractDocument, clearResult };
}
