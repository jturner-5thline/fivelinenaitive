import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { startOfMonth, endOfMonth, startOfQuarter, endOfQuarter, startOfYear, endOfYear, eachMonthOfInterval, eachQuarterOfInterval, eachYearOfInterval, format } from 'date-fns';

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

export interface PeriodColumn {
  label: string;
  shortLabel: string;
  year: number;
  month?: number;
  quarter?: number;
  startDate: Date;
  endDate: Date;
  period?: FinancialPeriod;
}

export function useFinanceDataRange(
  companyId: string | undefined,
  periodType: FinancePeriodType,
  startDate: Date,
  endDate: Date
) {
  const { user } = useAuth();
  const [periods, setPeriods] = useState<FinancialPeriod[]>([]);
  const [categories, setCategories] = useState<FinancialCategory[]>([]);
  const [lineItems, setLineItems] = useState<FinancialLineItem[]>([]);
  const [financialData, setFinancialData] = useState<FinancialDataEntry[]>([]);
  const [changeLogs, setChangeLogs] = useState<FinancialChangeLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Generate period columns based on date range and period type
  const generatePeriodColumns = useCallback((): PeriodColumn[] => {
    const columns: PeriodColumn[] = [];
    
    if (periodType === 'monthly') {
      const months = eachMonthOfInterval({ start: startDate, end: endDate });
      months.forEach(date => {
        columns.push({
          label: format(date, 'MMMM yyyy'),
          shortLabel: format(date, 'MMM yyyy'),
          year: date.getFullYear(),
          month: date.getMonth() + 1,
          startDate: startOfMonth(date),
          endDate: endOfMonth(date),
        });
      });
    } else if (periodType === 'quarterly') {
      const quarters = eachQuarterOfInterval({ start: startDate, end: endDate });
      quarters.forEach(date => {
        const quarter = Math.ceil((date.getMonth() + 1) / 3);
        columns.push({
          label: `Q${quarter} ${date.getFullYear()}`,
          shortLabel: `Q${quarter} ${date.getFullYear()}`,
          year: date.getFullYear(),
          quarter,
          startDate: startOfQuarter(date),
          endDate: endOfQuarter(date),
        });
      });
    } else {
      const years = eachYearOfInterval({ start: startDate, end: endDate });
      years.forEach(date => {
        columns.push({
          label: `FY ${date.getFullYear()}`,
          shortLabel: `${date.getFullYear()}`,
          year: date.getFullYear(),
          startDate: startOfYear(date),
          endDate: endOfYear(date),
        });
      });
    }
    
    return columns;
  }, [periodType, startDate, endDate]);

  const periodColumns = generatePeriodColumns();

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

    const startDateStr = format(startDate, 'yyyy-MM-dd');
    const endDateStr = format(endDate, 'yyyy-MM-dd');

    const { data, error } = await supabase
      .from('financial_periods')
      .select('*')
      .eq('company_id', companyId)
      .eq('period_type', periodType)
      .gte('start_date', startDateStr)
      .lte('end_date', endDateStr)
      .order('start_date', { ascending: true });

    if (error) {
      console.error('Error fetching periods:', error);
      return;
    }

    setPeriods((data || []) as unknown as FinancialPeriod[]);
  }, [companyId, periodType, startDate, endDate]);

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
    } else {
      setFinancialData([]);
    }
  }, [periods, fetchFinancialData, fetchChangeLogs]);

  // Map periods to columns
  const getColumnsWithPeriods = useCallback((): PeriodColumn[] => {
    return periodColumns.map(col => {
      const matchingPeriod = periods.find(p => {
        if (periodType === 'monthly') {
          return p.year === col.year && p.month === col.month;
        } else if (periodType === 'quarterly') {
          return p.year === col.year && p.quarter === col.quarter;
        } else {
          return p.year === col.year;
        }
      });
      return { ...col, period: matchingPeriod };
    });
  }, [periodColumns, periods, periodType]);

  const createPeriod = async (column: PeriodColumn): Promise<FinancialPeriod | null> => {
    if (!companyId || !user) return null;

    const startDateStr = format(column.startDate, 'yyyy-MM-dd');
    const endDateStr = format(column.endDate, 'yyyy-MM-dd');

    const { data, error } = await supabase
      .from('financial_periods')
      .insert({
        company_id: companyId,
        period_type: periodType,
        year: column.year,
        month: column.month || null,
        quarter: column.quarter || null,
        start_date: startDateStr,
        end_date: endDateStr,
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
    setPeriods(prev => [...prev, newPeriod].sort((a, b) => 
      new Date(a.start_date).getTime() - new Date(b.start_date).getTime()
    ));
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

    const existingData = financialData.find(
      d => d.period_id === periodId && d.line_item_id === lineItemId
    );

    if (existingData) {
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
    periodColumns: getColumnsWithPeriods(),
    updateFinancialData,
    createPeriod,
    refreshData
  };
}
