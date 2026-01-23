import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/hooks/use-toast';
import { DealWriteUpData, KeyItem, CompanyHighlight, FinancialYear } from '@/components/deal/DealWriteUp';
import { Json } from '@/integrations/supabase/types';

interface DealWriteupRow {
  id: string;
  deal_id: string;
  user_id: string;
  company_name: string;
  company_url: string | null;
  linkedin_url: string | null;
  data_room_url: string | null;
  industry: string | null;
  location: string | null;
  deal_type: string | null;
  billing_model: string | null;
  profitability: string | null;
  gross_margins: string | null;
  capital_ask: string | null;
  this_year_revenue: string | null;
  last_year_revenue: string | null;
  financial_data_as_of: string | null;
  accounting_system: string | null;
  status: string | null;
  use_of_funds: string | null;
  existing_debt_details: string | null;
  description: string | null;
  key_items: Json | null;
  company_highlights: Json | null;
  financial_years: Json | null;
  publish_as_anonymous: boolean | null;
  created_at: string;
  updated_at: string;
}

export function useDealWriteup(dealId: string | undefined) {
  const { user } = useAuth();
  const [writeup, setWriteup] = useState<DealWriteupRow | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const fetchWriteup = useCallback(async () => {
    if (!dealId || !user) {
      setIsLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('deal_writeups')
        .select('*')
        .eq('deal_id', dealId)
        .maybeSingle();

      if (error) throw error;
      setWriteup(data);
    } catch (error) {
      console.error('Error fetching deal writeup:', error);
    } finally {
      setIsLoading(false);
    }
  }, [dealId, user]);

  useEffect(() => {
    fetchWriteup();
  }, [fetchWriteup]);

  const saveWriteup = useCallback(async (data: DealWriteUpData): Promise<boolean> => {
    if (!dealId || !user) return false;

    setIsSaving(true);
    try {
      const writeupData = {
        deal_id: dealId,
        user_id: user.id,
        company_name: data.companyName,
        company_url: data.companyUrl || null,
        linkedin_url: data.linkedinUrl || null,
        data_room_url: data.dataRoomUrl || null,
        industry: data.industry || null,
        location: data.location || null,
        year_founded: data.yearFounded || null,
        headcount: data.headcount || null,
        deal_type: data.dealTypes?.join(', ') || null,
        billing_model: data.billingModel || null,
        profitability: data.profitability || null,
        gross_margins: data.grossMargins || null,
        capital_ask: data.capitalAsk || null,
        financial_data_as_of: data.financialDataAsOf?.toISOString() || null,
        accounting_system: data.accountingSystem || null,
        status: data.status || 'Draft',
        use_of_funds: data.useOfFunds || null,
        existing_debt_details: data.existingDebtDetails || null,
        description: data.description || null,
        key_items: data.keyItems as unknown as Json,
        company_highlights: data.companyHighlights as unknown as Json,
        financial_years: data.financialYears as unknown as Json,
        publish_as_anonymous: data.publishAsAnonymous,
      };

      if (writeup) {
        // Update existing writeup
        const { error } = await supabase
          .from('deal_writeups')
          .update(writeupData)
          .eq('id', writeup.id);

        if (error) throw error;
        
        // Refetch to get updated data
        await fetchWriteup();
      } else {
        // Create new writeup
        const { data: newData, error } = await supabase
          .from('deal_writeups')
          .insert([writeupData])
          .select()
          .single();

        if (error) throw error;
        setWriteup(newData);
      }

      toast({
        title: 'Saved',
        description: 'Deal write-up has been saved successfully.',
      });
      
      return true;
    } catch (error) {
      console.error('Error saving deal writeup:', error);
      toast({
        title: 'Error',
        description: 'Failed to save deal write-up. Please try again.',
        variant: 'destructive',
      });
      return false;
    } finally {
      setIsSaving(false);
    }
  }, [dealId, user, writeup, fetchWriteup]);

  const rowToData = useCallback((row: DealWriteupRow | null): DealWriteUpData | null => {
    if (!row) return null;
    
    // Parse key_items from JSON
    let keyItems: KeyItem[] = [];
    if (row.key_items && Array.isArray(row.key_items)) {
      keyItems = row.key_items as unknown as KeyItem[];
    }
    
    // Parse company_highlights from JSON
    let companyHighlights: CompanyHighlight[] = [];
    if (row.company_highlights && Array.isArray(row.company_highlights)) {
      companyHighlights = row.company_highlights as unknown as CompanyHighlight[];
    }
    
    // Parse financial_years from JSON
    let financialYears: FinancialYear[] = [];
    if (row.financial_years && Array.isArray(row.financial_years)) {
      financialYears = row.financial_years as unknown as FinancialYear[];
    }
    
    return {
      companyName: row.company_name || '',
      companyUrl: row.company_url || '',
      linkedinUrl: row.linkedin_url || '',
      dataRoomUrl: row.data_room_url || '',
      industry: row.industry || '',
      location: row.location || '',
      yearFounded: (row as any).year_founded || '',
      headcount: (row as any).headcount || '',
      dealTypes: row.deal_type ? row.deal_type.split(', ').filter(Boolean) : [],
      billingModel: row.billing_model || '',
      profitability: row.profitability || '',
      grossMargins: row.gross_margins || '',
      capitalAsk: row.capital_ask || '',
      financialDataAsOf: row.financial_data_as_of ? new Date(row.financial_data_as_of) : null,
      accountingSystem: row.accounting_system || '',
      status: row.status || 'Draft',
      useOfFunds: row.use_of_funds || '',
      existingDebtDetails: row.existing_debt_details || '',
      description: row.description || '',
      keyItems,
      companyHighlights,
      financialYears,
      publishAsAnonymous: row.publish_as_anonymous || false,
    };
  }, []);

  return {
    writeup,
    writeupData: rowToData(writeup),
    isLoading,
    isSaving,
    saveWriteup,
    refetch: fetchWriteup,
  };
}
