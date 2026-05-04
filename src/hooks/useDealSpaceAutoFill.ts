import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { logUsage } from '@/lib/usageLogger';
import { DealWriteUpData } from '@/components/deal/DealWriteUp';

export interface SourceReference {
  source_index?: number;
  source_type: 'document' | 'spreadsheet' | 'note' | 'memo' | 'structured_data' | 'flag_note' | 'lender';
  source_name: string;
  source_id?: string;
  location?: string | null;
  excerpt?: string;
}

export interface ExtractedWriteUpField {
  field: keyof DealWriteUpData;
  value: unknown;
  confidence: 'high' | 'medium' | 'low';
  source?: string;
  sourceLocation?: string;
  sources?: SourceReference[];
}

export interface AutoFillResult {
  extractedFields: ExtractedWriteUpField[];
  documentCount: number;
  sourceCount: number;
}

export function useDealSpaceAutoFill(dealId: string | undefined) {
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractedFields, setExtractedFields] = useState<ExtractedWriteUpField[]>([]);

  const extractWriteUpData = useCallback(async (): Promise<AutoFillResult | null> => {
    if (!dealId) return null;

    setIsExtracting(true);
    try {
      const { data, error } = await supabase.functions.invoke('deal-space-ai', {
        body: { dealId, action: 'extract-writeup' },
      });

      if (error) throw error;
      if (data.error) throw new Error(data.error);

      const fields = data.extractedFields || [];
      setExtractedFields(fields);

      logUsage({
        feature_type: 'WRITE_UP_GENERATED',
        feature_subtype: 'ai_autofill',
        deal_id: dealId,
        metadata: {
          field_count: fields.length,
          document_count: data.documentCount || 0,
        },
      });

      return {
        extractedFields: fields,
        documentCount: data.documentCount || 0,
        sourceCount: data.sourceCount || 0,
      };
    } catch (err) {
      console.error('Auto-fill extraction error:', err);
      toast({
        title: 'Extraction failed',
        description: err instanceof Error ? err.message : 'Could not extract data from documents',
        variant: 'destructive',
      });
      return null;
    } finally {
      setIsExtracting(false);
    }
  }, [dealId]);

  const clearExtractedFields = useCallback(() => {
    setExtractedFields([]);
  }, []);

  return {
    isExtracting,
    extractedFields,
    extractWriteUpData,
    clearExtractedFields,
    setExtractedFields,
  };
}
