import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

export type FinancePeriodType = 'monthly' | 'quarterly' | 'annual';
export type StatementType = 'pnl' | 'balance_sheet' | 'cash_flow';

export interface FinancialPeriod {
  id: string;
  company_id: string;
  period_type: FinancePeriodType;
  year: number;
  month: number | null;
  quarter: number | null;
  start_date: string;
  end_date: string;
  is_locked: boolean;
  created_at: string;
  updated_at: string;
}

export interface FinancialCategory {
  id: string;
  company_id: string | null;
  statement_type: StatementType;
  name: string;
  display_order: number;
  is_system: boolean;
  parent_category_id: string | null;
}

export interface FinancialLineItem {
  id: string;
  company_id: string | null;
  category_id: string | null;
  statement_type: StatementType;
  name: string;
  description: string | null;
  display_order: number;
  is_calculated: boolean;
  calculation_formula: string | null;
  is_system: boolean;
}

export interface FinancialDataEntry {
  id: string;
  company_id: string;
  period_id: string;
  line_item_id: string;
  amount: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface FinancialChangeLog {
  id: string;
  company_id: string;
  financial_data_id: string;
  period_id: string;
  line_item_id: string;
  previous_amount: number | null;
  new_amount: number;
  change_reason: string | null;
  changed_by: string | null;
  changed_at: string;
}

export function useFinanceData(
  companyId: string | undefined,
  periodType: FinancePeriodType,
  selectedYear: number,
  selectedMonth?: number,
  selectedQuarter?: number
) {
  const { user } = useAuth();
  const [periods, setPeriods] = useState<FinancialPeriod[]>([]);
  const [categories, setCategories] = useState<FinancialCategory[]>([]);
  const [lineItems, setLineItems] = useState<FinancialLineItem[]>([]);
  const [financialData, setFinancialData] = useState<FinancialDataEntry[]>([]);
  const [changeLogs, setChangeLogs] = useState<FinancialChangeLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchCategories = useCallback(async () => {
    if (!companyId) return;

    const { data, error } = await supabase
      .from('financial_line_item_categories')
      .select('*')
      .or(`company_id.eq.${companyId},company_id.is.null`)
      .order('display_order');

    if (error) {
      console.error('Error fetching categories:', error);
      return;
    }

    // Cast to the correct type since enums aren't in generated types yet
    setCategories((data || []) as unknown as FinancialCategory[]);
  }, [companyId]);

  const fetchLineItems = useCallback(async () => {
    if (!companyId) return;

    const { data, error } = await supabase
      .from('financial_line_items')
      .select('*')
      .or(`company_id.eq.${companyId},company_id.is.null`)
      .order('display_order');

    if (error) {
      console.error('Error fetching line items:', error);
      return;
    }

    setLineItems((data || []) as unknown as FinancialLineItem[]);
  }, [companyId]);

  const fetchPeriods = useCallback(async () => {
    if (!companyId) return;

    let query = supabase
      .from('financial_periods')
      .select('*')
      .eq('company_id', companyId)
      .eq('period_type', periodType)
      .eq('year', selectedYear);

    if (periodType === 'monthly' && selectedMonth) {
      query = query.eq('month', selectedMonth);
    } else if (periodType === 'quarterly' && selectedQuarter) {
      query = query.eq('quarter', selectedQuarter);
    }

    const { data, error } = await query.order('start_date', { ascending: false });

    if (error) {
      console.error('Error fetching periods:', error);
      return;
    }

    setPeriods((data || []) as unknown as FinancialPeriod[]);
  }, [companyId, periodType, selectedYear, selectedMonth, selectedQuarter]);

  const fetchFinancialData = useCallback(async () => {
    if (!companyId || periods.length === 0) {
      setFinancialData([]);
      return;
    }

    const periodIds = periods.map(p => p.id);

    const { data, error } = await supabase
      .from('financial_data')
      .select('*')
      .eq('company_id', companyId)
      .in('period_id', periodIds);

    if (error) {
      console.error('Error fetching financial data:', error);
      return;
    }

    setFinancialData((data || []) as unknown as FinancialDataEntry[]);
  }, [companyId, periods]);

  const fetchChangeLogs = useCallback(async () => {
    if (!companyId) return;

    const { data, error } = await supabase
      .from('financial_change_logs')
      .select('*')
      .eq('company_id', companyId)
      .order('changed_at', { ascending: false })
      .limit(100);

    if (error) {
      console.error('Error fetching change logs:', error);
      return;
    }

    setChangeLogs((data || []) as unknown as FinancialChangeLog[]);
  }, [companyId]);

  const refreshData = useCallback(async () => {
    setIsLoading(true);
    await Promise.all([
      fetchCategories(),
      fetchLineItems(),
      fetchPeriods(),
    ]);
    setIsLoading(false);
  }, [fetchCategories, fetchLineItems, fetchPeriods]);

  useEffect(() => {
    if (companyId) {
      refreshData();
    }
  }, [companyId, refreshData]);

  useEffect(() => {
    if (periods.length > 0) {
      fetchFinancialData();
      fetchChangeLogs();
    }
  }, [periods, fetchFinancialData, fetchChangeLogs]);

  const createPeriod = async (): Promise<FinancialPeriod | null> => {
    if (!companyId || !user) return null;

    let startDate: string;
    let endDate: string;

    if (periodType === 'monthly' && selectedMonth) {
      startDate = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-01`;
      const lastDay = new Date(selectedYear, selectedMonth, 0).getDate();
      endDate = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-${lastDay}`;
    } else if (periodType === 'quarterly' && selectedQuarter) {
      const startMonth = (selectedQuarter - 1) * 3 + 1;
      const endMonth = selectedQuarter * 3;
      startDate = `${selectedYear}-${String(startMonth).padStart(2, '0')}-01`;
      const lastDay = new Date(selectedYear, endMonth, 0).getDate();
      endDate = `${selectedYear}-${String(endMonth).padStart(2, '0')}-${lastDay}`;
    } else {
      startDate = `${selectedYear}-01-01`;
      endDate = `${selectedYear}-12-31`;
    }

    const { data, error } = await supabase
      .from('financial_periods')
      .insert({
        company_id: companyId,
        period_type: periodType,
        year: selectedYear,
        month: periodType === 'monthly' ? selectedMonth : null,
        quarter: periodType === 'quarterly' ? selectedQuarter : null,
        start_date: startDate,
        end_date: endDate,
        created_by: user.id
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating period:', error);
      toast.error('Failed to create period');
      return null;
    }

    const newPeriod = data as unknown as FinancialPeriod;
    setPeriods(prev => [newPeriod, ...prev]);
    toast.success('Period created successfully');
    return newPeriod;
  };

  const updateFinancialData = async (
    periodId: string,
    lineItemId: string,
    amount: number,
    notes?: string
  ): Promise<boolean> => {
    if (!companyId || !user) return false;

    // Check if data exists
    const existingData = financialData.find(
      d => d.period_id === periodId && d.line_item_id === lineItemId
    );

    if (existingData) {
      // Update existing
      const { error } = await supabase
        .from('financial_data')
        .update({ 
          amount, 
          notes: notes || existingData.notes,
          updated_by: user.id 
        })
        .eq('id', existingData.id);

      if (error) {
        console.error('Error updating financial data:', error);
        toast.error('Failed to update data');
        return false;
      }

      setFinancialData(prev =>
        prev.map(d =>
          d.id === existingData.id ? { ...d, amount, notes: notes || d.notes } : d
        )
      );
    } else {
      // Insert new
      const { data, error } = await supabase
        .from('financial_data')
        .insert({
          company_id: companyId,
          period_id: periodId,
          line_item_id: lineItemId,
          amount,
          notes,
          updated_by: user.id
        })
        .select()
        .single();

      if (error) {
        console.error('Error inserting financial data:', error);
        toast.error('Failed to save data');
        return false;
      }

      setFinancialData(prev => [...prev, data as unknown as FinancialDataEntry]);
    }

    // Refresh change logs
    fetchChangeLogs();
    return true;
  };

  return {
    periods,
    categories,
    lineItems,
    financialData,
    changeLogs,
    isLoading,
    updateFinancialData,
    createPeriod,
    refreshData
  };
}
