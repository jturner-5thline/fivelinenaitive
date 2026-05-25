import { useState, useEffect, useCallback, useRef } from 'react';
import { Switch } from '@/components/ui/switch';
import { applyBullets } from '@/utils/bulletFormat';
import { Plus, Trash2, CalendarIcon, Loader2, Check, X, List } from 'lucide-react';
import { NaitiveIcon as Sparkles } from '@/components/NaitiveIcon';
import { format } from 'date-fns';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { DealWriteUpData, FinancialYear, FinancialComment, ExistingDebtItem } from '../DealWriteUp';
import { FlexChangedFieldWrapper } from './FlexChangedFieldWrapper';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useCompanyFeatures } from '@/hooks/useCompanyFeatures';

const PROFITABILITY_OPTIONS = [
  'Profitable',
  'Break-even',
  'Pre-profit',
  'Negative',
];

const ACCOUNTING_SYSTEM_OPTIONS = [
  'QuickBooks',
  'Xero',
  'NetSuite',
  'Sage',
  'FreshBooks',
  'Wave',
  'Other',
];

interface WriteUpFinancialTabProps {
  data: DealWriteUpData;
  updateField: <K extends keyof DealWriteUpData>(field: K, value: DealWriteUpData[K]) => void;
  changedFields?: Set<string>;
  isFieldEdited?: (field: string) => boolean;
}

// Format currency value - revenue in $X.XXMM format
const formatCurrency = (value: string): string => {
  if (!value) return '';
  // Allow parenthesized negatives to pass through (e.g., ($1.50MM))
  if (value.startsWith('(')) return value;
  // Already formatted as $X.XXMM / $X.XXK — return as-is
  if (/^\$[\d,.]+MM$/i.test(value) || /^\$[\d,.]+K$/i.test(value)) return value;
  const numericValue = value.replace(/[^0-9.-]/g, '');
  if (numericValue && !isNaN(parseFloat(numericValue))) {
    const num = parseFloat(numericValue);
    const upperValue = value.toUpperCase();
    if (upperValue.includes('MM') || upperValue.includes('M')) {
      return `$${num.toFixed(2)}MM`;
    } else if (upperValue.includes('K')) {
      return `$${num.toFixed(2)}K`;
    } else if (num >= 1000000) {
      return `$${(num / 1000000).toFixed(2)}MM`;
    } else if (num >= 1000) {
      return `$${(num / 1000).toFixed(2)}K`;
    }
    return `$${num.toFixed(2)}`;
  }
  return value.startsWith('$') ? value : `$${value}`;
};

// Format EBITDA value - always in millions with 2 decimals, negative in parentheses
const formatEbitda = (value: string): string => {
  if (!value) return '';
  
  // Check if already formatted
  if (value.startsWith('($') || (value.startsWith('$') && value.includes('MM'))) return value;
  
  // Handle parentheses format for negative
  let isNegative = value.includes('-') || value.startsWith('(');
  let cleanValue = value.replace(/[$(),\s-]/g, '').toUpperCase();
  
  // Extract numeric part
  const numericMatch = cleanValue.match(/^(\d+\.?\d*)(MM|M|K|B)?$/);
  if (!numericMatch) {
    // Try to parse just the number
    const justNum = cleanValue.replace(/[^0-9.]/g, '');
    if (!justNum || isNaN(parseFloat(justNum))) return value;
    cleanValue = justNum;
  }
  
  let num = parseFloat(numericMatch ? numericMatch[1] : cleanValue);
  const suffix = numericMatch ? numericMatch[2] : null;
  
  // Convert to actual value based on suffix
  if (suffix === 'B') num *= 1000000000;
  else if (suffix === 'MM') num *= 1000000;
  else if (suffix === 'M') num *= 1000000;
  else if (suffix === 'K') num *= 1000;
  
  // Convert to millions
  const inMillions = num / 1000000;
  
  // Format with 2 decimal places
  if (isNegative) {
    return `($${inMillions.toFixed(2)}MM)`;
  }
  return `$${inMillions.toFixed(2)}MM`;
};

// Check if EBITDA value is negative
const isNegativeEbitda = (value: string): boolean => {
  return value.startsWith('($') || value.startsWith('(') || value.includes('-');
};

// Format percentage value with validation (max 150%)
const formatPercentage = (value: string): { formatted: string; error: string | null } => {
  if (!value) return { formatted: '', error: null };
  const numericValue = value.replace(/[^0-9.-]/g, '');
  if (numericValue && !isNaN(parseFloat(numericValue))) {
    const num = parseFloat(numericValue);
    if (num > 150) {
      return { formatted: '150%', error: 'Gross margin cannot exceed 150%' };
    }
    return { formatted: `${numericValue}%`, error: null };
  }
  return { formatted: value.includes('%') ? value : value, error: null };
};

// Parse currency string to numeric value
const parseCurrencyToNumber = (value: string): number | null => {
  if (!value) return null;
  const cleanValue = value.replace(/[$,\s]/g, '').toUpperCase();
  const numericMatch = cleanValue.match(/^(-?)(\d+\.?\d*)(MM|M|K|B)?\)?$/);
  if (!numericMatch) return null;
  
  const isNegative = cleanValue.includes('(') || cleanValue.startsWith('-');
  const num = parseFloat(numericMatch[2]);
  const suffix = numericMatch[3];
  
  let multiplier = 1;
  if (suffix === 'B') multiplier = 1000000000;
  else if (suffix === 'MM') multiplier = 1000000;
  else if (suffix === 'M') multiplier = 1000000;
  else if (suffix === 'K') multiplier = 1000;
  
  const result = num * multiplier;
  return isNegative ? -result : result;
};

// Parse year string to numeric value
const parseYearToNumber = (yearStr: string): number | null => {
  if (!yearStr) return null;
  const match = yearStr.match(/(\d{4})/);
  return match ? parseInt(match[1], 10) : null;
};

export function WriteUpFinancialTab({ data, updateField, changedFields }: WriteUpFinancialTabProps) {
  const [grossMarginErrors, setGrossMarginErrors] = useState<Record<string, string | null>>({});
  const [financialAsOfText, setFinancialAsOfText] = useState(
    data.financialDataAsOf ? format(data.financialDataAsOf, 'MM/yyyy') : ''
  );

  // Sync external changes back to local text
  useEffect(() => {
    const formatted = data.financialDataAsOf ? format(data.financialDataAsOf, 'MM/yyyy') : '';
    setFinancialAsOfText(prev => {
      // Only update if the date actually changed (avoid overwriting mid-typing)
      const match = prev.match(/^(\d{2})\/(\d{4})$/);
      if (match && data.financialDataAsOf) {
        const m = parseInt(match[1], 10);
        const y = parseInt(match[2], 10);
        if (m === data.financialDataAsOf.getMonth() + 1 && y === data.financialDataAsOf.getFullYear()) {
          return prev;
        }
      }
      return formatted;
    });
  }, [data.financialDataAsOf]);

  // Bullet toggle state
  const [useOfFundsBullets, setUseOfFundsBullets] = useState(() => {
    const v = data.useOfFunds || '';
    return v.split('\n').filter(l => l.trim()).some(l => l.trimStart().startsWith('• '));
  });
  const [debtBullets, setDebtBullets] = useState(() => {
    const v = data.existingDebtDetails || '';
    return v.split('\n').filter(l => l.trim()).some(l => l.trimStart().startsWith('• '));
  });

  // AI refine state
  const [isRefining, setIsRefining] = useState(false);
  const [refinedText, setRefinedText] = useState<string | null>(null);

  const handleRefineUseOfFunds = async () => {
    if (!data.useOfFunds?.trim()) {
      toast.error('Please enter some text first before refining');
      return;
    }
    setIsRefining(true);
    setRefinedText(null);
    try {
      const { data: result, error } = await supabase.functions.invoke('refine-text', {
        body: {
          text: data.useOfFunds,
          fieldName: 'Use of Funds',
          context: `Company: ${data.companyName || ''}, Capital Ask: ${data.capitalAsk || ''}`,
        },
      });
      if (error) throw error;
      if (result?.error) {
        toast.error(result.error);
        return;
      }
      if (result?.refined) {
        setRefinedText(result.refined);
      }
    } catch (e) {
      console.error('Refine error:', e);
      toast.error('Failed to refine text');
    } finally {
      setIsRefining(false);
    }
  };

  // Column visibility toggles - persisted via data.financialColumnVisibility
  const colVis = data.financialColumnVisibility || { showRevGrowth: true, showGmDelta: true, showEbitdaDelta: true };
  const showRevGrowth = colVis.showRevGrowth;
  const showGmDelta = colVis.showGmDelta;
  const showEbitdaDelta = colVis.showEbitdaDelta;
  
  const setShowRevGrowth = (v: boolean) => updateField('financialColumnVisibility', { ...colVis, showRevGrowth: v });
  const setShowGmDelta = (v: boolean) => updateField('financialColumnVisibility', { ...colVis, showGmDelta: v });
  const setShowEbitdaDelta = (v: boolean) => updateField('financialColumnVisibility', { ...colVis, showEbitdaDelta: v });
  
  // Fixed column widths (not resizable)
  const columnWidths = {
    year: 100,
    revenue: 140,
    revGrowth: 90,
    grossMargin: 120,
    gmDelta: 90,
    ebitda: 120,
    ebitdaDelta: 90,
  };

  // Sort financial years chronologically
  const sortFinancialYearsChronologically = (years: FinancialYear[]): FinancialYear[] => {
    return [...years].sort((a, b) => {
      const parseYear = (yearStr: string): number => {
        if (!yearStr) return Infinity;
        const match = yearStr.match(/(\d{4})/);
        return match ? parseInt(match[1], 10) : Infinity;
      };
      return parseYear(a.year) - parseYear(b.year);
    });
  };

  const addFinancialYear = () => {
    const newYear: FinancialYear = {
      id: crypto.randomUUID(),
      year: '',
      revenue: '',
      gross_margin: '',
      ebitda: '',
    };
    updateField('financialYears', sortFinancialYearsChronologically([...data.financialYears, newYear]));
  };

  const updateFinancialYear = (id: string, field: keyof Omit<FinancialYear, 'id'>, value: string) => {
    const updatedYears = data.financialYears.map(item => 
      item.id === id ? { ...item, [field]: value } : item
    );
    if (field === 'year') {
      updateField('financialYears', sortFinancialYearsChronologically(updatedYears));
    } else {
      updateField('financialYears', updatedYears);
    }
  };

  const deleteFinancialYear = (id: string) => {
    updateField('financialYears', data.financialYears.filter(item => item.id !== id));
  };

  // Financial comments handlers
  const addFinancialComment = () => {
    const newComment: FinancialComment = {
      id: crypto.randomUUID(),
      title: '',
      description: '',
    };
    updateField('financialComments', [...(data.financialComments || []), newComment]);
  };

  const updateFinancialComment = (id: string, field: 'title' | 'description', value: string) => {
    updateField(
      'financialComments',
      (data.financialComments || []).map(item => 
        item.id === id ? { ...item, [field]: value } : item
      )
    );
  };

  const deleteFinancialComment = (id: string) => {
    updateField('financialComments', (data.financialComments || []).filter(item => item.id !== id));
  };

  // Calculate YoY revenue growth
  const calculateRevenueGrowth = (index: number): string | null => {
    if (data.financialYears.length < 2) return null;
    
    const currentRow = data.financialYears[index];
    const currentYear = parseYearToNumber(currentRow.year);
    
    if (currentYear === null) return null;
    
    const previousYearRow = data.financialYears.find(row => {
      const rowYear = parseYearToNumber(row.year);
      return rowYear === currentYear - 1;
    });
    
    if (!previousYearRow) return null;
    
    const currentRevenue = parseCurrencyToNumber(currentRow.revenue);
    const previousRevenue = parseCurrencyToNumber(previousYearRow.revenue);
    
    if (currentRevenue === null || previousRevenue === null || previousRevenue === 0) return null;
    
    const growthPercent = ((currentRevenue - previousRevenue) / Math.abs(previousRevenue)) * 100;
    const formatted = growthPercent.toFixed(1);
    
    if (growthPercent > 0) return `+${formatted}%`;
    if (growthPercent < 0) return `${formatted}%`;
    return '0%';
  };

  // Calculate YoY gross margin growth (as percentage change)
  const calculateGrossMarginChange = (index: number): string | null => {
    if (data.financialYears.length < 2) return null;
    
    const currentRow = data.financialYears[index];
    const currentYear = parseYearToNumber(currentRow.year);
    
    if (currentYear === null) return null;
    
    const previousYearRow = data.financialYears.find(row => {
      const rowYear = parseYearToNumber(row.year);
      return rowYear === currentYear - 1;
    });
    
    if (!previousYearRow) return null;
    
    // Parse percentage values
    const parsePercent = (val: string): number | null => {
      if (!val) return null;
      const num = parseFloat(val.replace(/[^0-9.-]/g, ''));
      return isNaN(num) ? null : num;
    };
    
    const currentGM = parsePercent(currentRow.gross_margin);
    const previousGM = parsePercent(previousYearRow.gross_margin);
    
    if (currentGM === null || previousGM === null || previousGM === 0) return null;
    
    const growthPercent = ((currentGM - previousGM) / Math.abs(previousGM)) * 100;
    const formatted = growthPercent.toFixed(1);
    
    if (growthPercent > 0) return `+${formatted}%`;
    if (growthPercent < 0) return `${formatted}%`;
    return '0%';
  };

  // Calculate YoY EBITDA growth
  const calculateEbitdaGrowth = (index: number): string | null => {
    if (data.financialYears.length < 2) return null;
    
    const currentRow = data.financialYears[index];
    const currentYear = parseYearToNumber(currentRow.year);
    
    if (currentYear === null) return null;
    
    const previousYearRow = data.financialYears.find(row => {
      const rowYear = parseYearToNumber(row.year);
      return rowYear === currentYear - 1;
    });
    
    if (!previousYearRow) return null;
    
    // Parse EBITDA values
    const parseEbitda = (val: string): number | null => {
      if (!val) return null;
      const isNegative = val.startsWith('($') || val.startsWith('(') || val.includes('-');
      const cleanVal = val.replace(/[$(),\s-]/g, '').toUpperCase();
      const match = cleanVal.match(/^(\d+\.?\d*)(MM|M|K|B)?$/);
      if (!match) return null;
      
      let num = parseFloat(match[1]);
      const suffix = match[2];
      
      if (suffix === 'B') num *= 1000000000;
      else if (suffix === 'MM') num *= 1000000;
      else if (suffix === 'M') num *= 1000000;
      else if (suffix === 'K') num *= 1000;
      
      return isNegative ? -num : num;
    };
    
    const currentEbitda = parseEbitda(currentRow.ebitda);
    const previousEbitda = parseEbitda(previousYearRow.ebitda);
    
    if (currentEbitda === null || previousEbitda === null || previousEbitda === 0) return null;
    
    const growthPercent = ((currentEbitda - previousEbitda) / Math.abs(previousEbitda)) * 100;
    const formatted = growthPercent.toFixed(1);
    
    if (growthPercent > 0) return `+${formatted}%`;
    if (growthPercent < 0) return `${formatted}%`;
    return '0%';
  };

  return (
    <div className="space-y-6 min-w-0">
      {/* Profitability & Gross Margins Row */}
      <div className="grid grid-cols-2 gap-4">
        <FlexChangedFieldWrapper fieldKey="profitability" changedFields={changedFields} className="space-y-2">
          <Label htmlFor="profitability">Profitability *</Label>
          <Select value={data.profitability} onValueChange={(v) => updateField('profitability', v)}>
            <SelectTrigger>
              <SelectValue placeholder="Select profitability" />
            </SelectTrigger>
            <SelectContent>
              {PROFITABILITY_OPTIONS.map(option => (
                <SelectItem key={option} value={option}>{option}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FlexChangedFieldWrapper>
        <FlexChangedFieldWrapper fieldKey="grossMargins" changedFields={changedFields} className="space-y-2">
          <Label htmlFor="grossMargins">Gross Margins *</Label>
          <Input
            id="grossMargins"
            value={data.grossMargins}
            onChange={(e) => updateField('grossMargins', e.target.value)}
            onBlur={(e) => {
              const result = formatPercentage(e.target.value);
              updateField('grossMargins', result.formatted);
              setGrossMarginErrors(prev => ({ ...prev, main: result.error }));
            }}
            placeholder="75%"
            className={grossMarginErrors.main ? 'border-destructive' : ''}
          />
          {grossMarginErrors.main && (
            <p className="text-xs text-destructive mt-1">{grossMarginErrors.main}</p>
          )}
        </FlexChangedFieldWrapper>
      </div>

      {/* Capital Ask & Financial Data As Of Row */}
      <div className="grid grid-cols-2 gap-4">
        <FlexChangedFieldWrapper fieldKey="capitalAsk" changedFields={changedFields} className="space-y-2">
          <Label htmlFor="capitalAsk">Capital Ask *</Label>
          <Input
            id="capitalAsk"
            value={data.capitalAsk}
            onChange={(e) => updateField('capitalAsk', e.target.value)}
            onBlur={(e) => updateField('capitalAsk', formatCurrency(e.target.value))}
            placeholder="$2.5M"
          />
        </FlexChangedFieldWrapper>
        <div className="space-y-2">
          <Label htmlFor="financialDataAsOf">Financial Data As Of</Label>
          <div className="flex gap-2">
            <Input
              id="financialDataAsOf"
              value={financialAsOfText}
              onChange={(e) => {
                let val = e.target.value;
                // Auto-insert slash after 2 digits
                if (val.length === 2 && !val.includes('/') && financialAsOfText.length < val.length) {
                  val = val + '/';
                }
                // Only allow digits and slash, max 7 chars (MM/YYYY)
                if (/^[\d/]*$/.test(val) && val.length <= 7) {
                  setFinancialAsOfText(val);
                  // Parse MM/YYYY
                  const match = val.match(/^(\d{2})\/(\d{4})$/);
                  if (match) {
                    const month = parseInt(match[1], 10);
                    const year = parseInt(match[2], 10);
                    if (month >= 1 && month <= 12 && year >= 1900 && year <= 2100) {
                      updateField('financialDataAsOf', new Date(year, month - 1, 1));
                    }
                  }
                }
                if (val === '') {
                  setFinancialAsOfText('');
                  updateField('financialDataAsOf', null);
                }
              }}
              placeholder="MM/YYYY"
              className="flex-1"
            />
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="icon" className="shrink-0">
                  <CalendarIcon className="h-4 w-4" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-3" align="end">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        const current = data.financialDataAsOf || new Date();
                        updateField('financialDataAsOf', new Date(current.getFullYear() - 1, current.getMonth(), 1));
                        setFinancialAsOfText(format(new Date(current.getFullYear() - 1, current.getMonth(), 1), 'MM/yyyy'));
                      }}
                    >
                      ←
                    </Button>
                    <span className="text-sm font-medium">
                      {data.financialDataAsOf ? data.financialDataAsOf.getFullYear() : new Date().getFullYear()}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        const current = data.financialDataAsOf || new Date();
                        updateField('financialDataAsOf', new Date(current.getFullYear() + 1, current.getMonth(), 1));
                        setFinancialAsOfText(format(new Date(current.getFullYear() + 1, current.getMonth(), 1), 'MM/yyyy'));
                      }}
                    >
                      →
                    </Button>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].map((month, idx) => {
                      const year = data.financialDataAsOf ? data.financialDataAsOf.getFullYear() : new Date().getFullYear();
                      const isSelected = data.financialDataAsOf?.getMonth() === idx && data.financialDataAsOf?.getFullYear() === year;
                      return (
                        <Button
                          key={month}
                          variant={isSelected ? 'default' : 'outline'}
                          size="sm"
                          className="text-xs"
                          onClick={() => {
                            const newDate = new Date(year, idx, 1);
                            updateField('financialDataAsOf', newDate);
                            setFinancialAsOfText(format(newDate, 'MM/yyyy'));
                          }}
                        >
                          {month}
                        </Button>
                      );
                    })}
                  </div>
                </div>
              </PopoverContent>
            </Popover>
          </div>
        </div>
      </div>

      {/* Accounting System */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="accountingSystem">Accounting System</Label>
          <Select value={data.accountingSystem} onValueChange={(v) => updateField('accountingSystem', v)}>
            <SelectTrigger>
              <SelectValue placeholder="Select accounting system" />
            </SelectTrigger>
            <SelectContent>
              {ACCOUNTING_SYSTEM_OPTIONS.map(option => (
                <SelectItem key={option} value={option}>{option}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Use of Funds */}
      <FlexChangedFieldWrapper fieldKey="useOfFunds" changedFields={changedFields} className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Label htmlFor="useOfFunds">Use of Funds</Label>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <Switch
                checked={useOfFundsBullets}
                onCheckedChange={(checked) => {
                  setUseOfFundsBullets(checked);
                  updateField('useOfFunds', applyBullets(data.useOfFunds || '', checked));
                }}
                className="h-4 w-8 [&>span]:h-3 [&>span]:w-3 data-[state=checked]:[&>span]:translate-x-4"
              />
              <span className="text-xs text-muted-foreground select-none">Bullet list</span>
            </label>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleRefineUseOfFunds}
            disabled={isRefining || !data.useOfFunds?.trim()}
            className="gap-1.5 text-xs h-7"
          >
            {isRefining ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Sparkles className="h-3.5 w-3.5 text-primary" />
            )}
            {isRefining ? 'Refining...' : 'AI Refine'}
          </Button>
        </div>
        <Textarea
          id="useOfFunds"
          value={data.useOfFunds}
          onChange={(e) => {
            const val = useOfFundsBullets ? applyBullets(e.target.value, true) : e.target.value;
            updateField('useOfFunds', val);
            setRefinedText(null);
          }}
          onBlur={() => {
            if (useOfFundsBullets) updateField('useOfFunds', applyBullets(data.useOfFunds || '', true));
          }}
          placeholder="Expand sales team and accelerate product development for enterprise features."
          className="min-h-[80px]"
        />
        {refinedText && (
          <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-primary flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5" />
                AI Suggestion
              </span>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-xs gap-1"
                  onClick={() => {
                    updateField('useOfFunds', refinedText);
                    setRefinedText(null);
                    toast.success('Suggestion applied');
                  }}
                >
                  <Check className="h-3 w-3" />
                  Apply
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-xs gap-1 text-muted-foreground"
                  onClick={() => setRefinedText(null)}
                >
                  <X className="h-3 w-3" />
                  Dismiss
                </Button>
              </div>
            </div>
            <p className="text-sm text-foreground">{refinedText}</p>
          </div>
        )}
      </FlexChangedFieldWrapper>

      {/* Existing Debt Details */}
      <FlexChangedFieldWrapper fieldKey="existingDebtDetails" changedFields={changedFields} className="space-y-2">
        <ExistingDebtItemsEditor
          items={data.existingDebtItems || []}
          onChange={(next) => updateField('existingDebtItems', next)}
          legacyText={data.existingDebtDetails || ''}
          legacyDismissed={!!data.existingDebtLegacyDismissed}
          onDismissLegacy={() => {
            updateField('existingDebtLegacyDismissed', true);
            updateField('existingDebtDetails', '');
          }}
        />
      </FlexChangedFieldWrapper>

      {/* Financial Commentary Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <Label className="text-base font-semibold">Financials</Label>
            <p className="text-xs text-muted-foreground mt-0.5">Historical and projected financial performance by year</p>
          </div>
          <Button variant="outline" size="sm" onClick={addFinancialYear}>
            <Plus className="h-4 w-4 mr-1" />
            Add Year
          </Button>
        </div>
        
        <div className="border rounded-lg overflow-x-auto max-w-full">
          <table className="w-full min-w-[750px]">
            <thead>
              <tr className="border-b bg-muted/30">
                <th style={{ width: columnWidths.year }} className="text-center py-3 px-4 text-sm font-medium text-muted-foreground">
                  Year
                </th>
                <th style={{ width: columnWidths.revenue }} className="text-center py-3 px-4 text-sm font-medium text-muted-foreground">
                  Total Revenue
                </th>
                <th style={{ width: columnWidths.revGrowth }} className="text-center py-3 px-4 text-sm font-medium text-muted-foreground">
                  <div className="flex items-center justify-center gap-2">
                    <Checkbox 
                      checked={showRevGrowth} 
                      onCheckedChange={(checked) => setShowRevGrowth(!!checked)}
                      className="h-3.5 w-3.5"
                    />
                    <span>Rev. Growth</span>
                  </div>
                </th>
                <th style={{ width: columnWidths.grossMargin }} className="text-center py-3 px-4 text-sm font-medium text-muted-foreground">
                  Gross Margin
                </th>
                <th style={{ width: columnWidths.gmDelta }} className="text-center py-3 px-4 text-sm font-medium text-muted-foreground">
                  <div className="flex items-center justify-center gap-2">
                    <Checkbox 
                      checked={showGmDelta} 
                      onCheckedChange={(checked) => setShowGmDelta(!!checked)}
                      className="h-3.5 w-3.5"
                    />
                    <span>GM Δ</span>
                  </div>
                </th>
                <th style={{ width: columnWidths.ebitda }} className="text-center py-3 px-4 text-sm font-medium text-muted-foreground">
                  EBITDA
                </th>
                <th style={{ width: columnWidths.ebitdaDelta }} className="text-center py-3 px-4 text-sm font-medium text-muted-foreground">
                  <div className="flex items-center justify-center gap-2">
                    <Checkbox 
                      checked={showEbitdaDelta} 
                      onCheckedChange={(checked) => setShowEbitdaDelta(!!checked)}
                      className="h-3.5 w-3.5"
                    />
                    <span>EBITDA Δ</span>
                  </div>
                </th>
                <th className="w-12 py-3 px-2"></th>
              </tr>
            </thead>
            <tbody>
              {data.financialYears.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-muted-foreground text-sm">
                    No financial years added yet. Click "Add Year" to get started.
                  </td>
                </tr>
              ) : (
                data.financialYears.map((item, index) => (
                  <tr key={item.id} className={cn("border-b last:border-0", index % 2 === 1 && "bg-muted/20")}>
                    <td className="py-2 px-4">
                      <Input
                        value={item.year}
                        onChange={(e) => updateFinancialYear(item.id, 'year', e.target.value)}
                        placeholder="2024"
                        className="h-8 text-center border border-primary/40 bg-muted/30 rounded-md px-2 focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-0 focus-visible:border-primary font-medium placeholder:text-muted-foreground/50"
                      />
                    </td>
                    <td className="py-2 px-4">
                      <Input
                        value={item.revenue}
                        onChange={(e) => updateFinancialYear(item.id, 'revenue', e.target.value)}
                        onBlur={(e) => updateFinancialYear(item.id, 'revenue', formatCurrency(e.target.value))}
                        placeholder="$24.72MM"
                        className="h-8 text-center border border-primary/40 bg-muted/30 rounded-md px-2 focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-0 focus-visible:border-primary placeholder:text-muted-foreground/50"
                      />
                    </td>
                    <td className="py-2 px-4 text-center">
                      {showRevGrowth ? (
                        (() => {
                          const growth = calculateRevenueGrowth(index);
                          if (growth === null) return <span className="text-muted-foreground text-sm">—</span>;
                          const isPositive = growth.startsWith('+');
                          const isNegative = growth.startsWith('-');
                          return (
                            <span className={cn(
                              "text-sm font-medium",
                              isPositive && "text-green-600 dark:text-green-500",
                              isNegative && "text-red-600 dark:text-red-500"
                            )}>
                              {growth}
                            </span>
                          );
                        })()
                      ) : <span className="text-muted-foreground text-sm">—</span>}
                    </td>
                    <td className="py-2 px-4">
                      <div className="relative">
                        <Input
                          value={item.gross_margin}
                          onChange={(e) => updateFinancialYear(item.id, 'gross_margin', e.target.value)}
                          onBlur={(e) => {
                            const result = formatPercentage(e.target.value);
                            updateFinancialYear(item.id, 'gross_margin', result.formatted);
                            setGrossMarginErrors(prev => ({ ...prev, [item.id]: result.error }));
                          }}
                          placeholder="53%"
                          className={cn(
                            "h-8 text-center border border-primary/40 bg-muted/30 rounded-md px-2 focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-0 focus-visible:border-primary placeholder:text-muted-foreground/50",
                            grossMarginErrors[item.id] && "text-destructive border-destructive/50"
                          )}
                        />
                        {grossMarginErrors[item.id] && (
                          <p className="text-[10px] text-destructive absolute -bottom-3 left-0 whitespace-nowrap">{grossMarginErrors[item.id]}</p>
                        )}
                      </div>
                    </td>
                    <td className="py-2 px-4 text-center">
                      {showGmDelta ? (
                        (() => {
                          const change = calculateGrossMarginChange(index);
                          if (change === null) return <span className="text-muted-foreground text-sm">—</span>;
                          const isPositive = change.startsWith('+');
                          const isNegative = change.startsWith('-');
                          return (
                            <span className={cn(
                              "text-sm font-medium",
                              isPositive && "text-green-600 dark:text-green-500",
                              isNegative && "text-red-600 dark:text-red-500"
                            )}>
                              {change}
                            </span>
                          );
                        })()
                      ) : <span className="text-muted-foreground text-sm">—</span>}
                    </td>
                    <td className="py-2 px-4">
                      <Input
                        value={item.ebitda}
                        onChange={(e) => updateFinancialYear(item.id, 'ebitda', e.target.value)}
                        onBlur={(e) => updateFinancialYear(item.id, 'ebitda', formatEbitda(e.target.value))}
                        placeholder="$1.00MM"
                        className={cn(
                          "h-8 text-center border border-primary/40 bg-muted/30 rounded-md px-2 focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-0 focus-visible:border-primary placeholder:text-muted-foreground/50",
                          isNegativeEbitda(item.ebitda) && "text-red-600 dark:text-red-500"
                        )}
                      />
                    </td>
                    <td className="py-2 px-4 text-center">
                      {showEbitdaDelta ? (
                        (() => {
                          const growth = calculateEbitdaGrowth(index);
                          if (growth === null) return <span className="text-muted-foreground text-sm">—</span>;
                          const isPositive = growth.startsWith('+');
                          const isNegative = growth.startsWith('-');
                          return (
                            <span className={cn(
                              "text-sm font-medium",
                              isPositive && "text-green-600 dark:text-green-500",
                              isNegative && "text-red-600 dark:text-red-500"
                            )}>
                              {growth}
                            </span>
                          );
                        })()
                      ) : <span className="text-muted-foreground text-sm">—</span>}
                    </td>
                    <td className="py-2 px-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-destructive"
                        onClick={() => deleteFinancialYear(item.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Financial Commentary Comments Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <Label className="text-base font-semibold">Financial Commentary</Label>
            <p className="text-sm text-muted-foreground mt-0.5">Additional notes and insights about financial performance</p>
          </div>
          <Button variant="outline" size="sm" onClick={addFinancialComment}>
            <Plus className="h-4 w-4 mr-1" />
            Add Comment
          </Button>
        </div>
        
        {(!data.financialComments || data.financialComments.length === 0) ? (
          <div className="border rounded-lg p-8 text-center text-muted-foreground">
            <p className="text-sm">No financial comments added yet.</p>
            <p className="text-xs mt-1">Click "Add Comment" to add financial insights.</p>
          </div>
        ) : (
          data.financialComments.map((item) => (
            <div key={item.id} className="border rounded-lg p-4 space-y-3 relative bg-muted/30">
              <Button
                variant="ghost"
                size="icon"
                className="absolute top-2 right-2 h-8 w-8 text-muted-foreground hover:text-destructive"
                onClick={() => deleteFinancialComment(item.id)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
              <div className="space-y-2 pr-10">
                <Label>Title</Label>
                <Input
                  value={item.title}
                  onChange={(e) => updateFinancialComment(item.id, 'title', e.target.value)}
                  placeholder="Strong Revenue Growth"
                />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Description</Label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0"
                    title="Toggle bullet on current line"
                    onClick={() => {
                      const ta = document.getElementById(`fin-comment-desc-${item.id}`) as HTMLTextAreaElement | null;
                      if (!ta) return;
                      const val = item.description || '';
                      const start = ta.selectionStart ?? 0;
                      const lineStart = val.lastIndexOf('\n', start - 1) + 1;
                      let lineEnd = val.indexOf('\n', start);
                      if (lineEnd === -1) lineEnd = val.length;
                      const line = val.substring(lineStart, lineEnd);
                      const trimmed = line.trimStart();
                      let newLine: string;
                      let cursorOffset: number;
                      if (trimmed.startsWith('• ')) {
                        newLine = line.replace('• ', '');
                        cursorOffset = -2;
                      } else {
                        const lw = line.length - trimmed.length;
                        newLine = line.substring(0, lw) + '• ' + trimmed;
                        cursorOffset = 2;
                      }
                      const newVal = val.substring(0, lineStart) + newLine + val.substring(lineEnd);
                      updateFinancialComment(item.id, 'description', newVal);
                      const newPos = Math.max(lineStart, Math.min(start + cursorOffset, lineStart + newLine.length));
                      requestAnimationFrame(() => {
                        ta.focus();
                        ta.setSelectionRange(newPos, newPos);
                      });
                    }}
                  >
                    <List className="h-4 w-4" />
                  </Button>
                </div>
                <Textarea
                  id={`fin-comment-desc-${item.id}`}
                  value={item.description}
                  onChange={(e) => updateFinancialComment(item.id, 'description', e.target.value)}
                  placeholder="Revenue has grown 40% YoY driven by expansion into new markets..."
                  className="min-h-[60px]"
                />
              </div>
            </div>
          ))
        )}
      </div>

      {/* Visible Metrics on FLEx */}
      <div className="space-y-3">
        <div>
          <Label className="text-sm font-semibold">Key Metrics - FLEx</Label>
          <p className="text-xs text-muted-foreground mt-1">Toggle which key metrics appear on the FLEx deal detail page.</p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {(() => {
            // Match financial years to the actual calendar year
            const calendarYear = new Date().getFullYear();
            const yearsWithParsed = data.financialYears
              .filter(y => y.year)
              .map(y => ({ ...y, parsedYear: parseYearToNumber(y.year) }));

            const currentYearData = yearsWithParsed.find(y => y.parsedYear === calendarYear) ?? null;
            const priorYearData = yearsWithParsed.find(y => y.parsedYear === calendarYear - 1) ?? null;

            const currentYearRev = currentYearData?.revenue ? parseCurrencyToNumber(currentYearData.revenue) : null;
            const priorYearRev = priorYearData?.revenue ? parseCurrencyToNumber(priorYearData.revenue) : null;

            let yoyValue: string | null = null;
            if (currentYearRev !== null && priorYearRev !== null && priorYearRev !== 0) {
              const growth = ((currentYearRev - priorYearRev) / Math.abs(priorYearRev)) * 100;
              yoyValue = growth > 0 ? `+${growth.toFixed(1)}%` : `${growth.toFixed(1)}%`;
            }

            const metricItems = [
              { key: 'yoy_growth' as const, label: 'YoY Growth', value: yoyValue },
              { key: 'this_year_revenue' as const, label: `${calendarYear} Revenue`, value: currentYearData?.revenue ? formatCurrency(currentYearData.revenue) : null },
              { key: 'last_year_revenue' as const, label: `${calendarYear - 1} Revenue`, value: priorYearData?.revenue ? formatCurrency(priorYearData.revenue) : null },
              { key: 'gross_margins' as const, label: 'Gross Margins', value: currentYearData?.gross_margin || data.grossMargins || null },
            ];

            const defaults = { yoy_growth: true, this_year_revenue: true, last_year_revenue: true, gross_margins: true };
            const metrics = data.visibleMetrics ?? defaults;

            return metricItems.map(({ key, label, value }) => (
              <div key={key} className="flex items-center justify-between gap-2 rounded-md border bg-background px-3 py-2">
                <div className="flex items-center gap-2 min-w-0">
                  <Label htmlFor={`fin-metric-${key}`} className="text-sm font-normal cursor-pointer whitespace-nowrap">{label}</Label>
                  {value && (
                    <span className={cn(
                      "text-sm font-semibold truncate",
                      key === 'yoy_growth' && value.startsWith('+') && "text-emerald-600 dark:text-emerald-400",
                      key === 'yoy_growth' && value.startsWith('-') && "text-red-600 dark:text-red-400",
                      key !== 'yoy_growth' && "text-foreground"
                    )}>
                      {value}
                    </span>
                  )}
                </div>
                <Switch
                  id={`fin-metric-${key}`}
                  checked={metrics[key]}
                  onCheckedChange={(checked) => {
                    updateField('visibleMetrics', { ...metrics, [key]: checked });
                  }}
                />
              </div>
            ));
          })()}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Existing Debt Items Editor
// ============================================================================

const DEBT_TYPE_OPTIONS = [
  'Senior Facility',
  'Subordinated Note',
  'Convertible Note',
  'Line of Credit',
  'Equipment Loan',
  'Other',
];

const newDebtId = () =>
  (typeof crypto !== 'undefined' && 'randomUUID' in crypto)
    ? crypto.randomUUID()
    : `debt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const formatMaturityLabel = (iso: string | null): string => {
  if (!iso) return 'Pick maturity';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return 'Pick maturity';
  return format(d, 'MM/yyyy');
};

interface ExistingDebtItemsEditorProps {
  items: ExistingDebtItem[];
  onChange: (next: ExistingDebtItem[]) => void;
  legacyText: string;
  legacyDismissed: boolean;
  onDismissLegacy: () => void;
}

function ExistingDebtItemsEditor({
  items,
  onChange,
  legacyText,
  legacyDismissed,
  onDismissLegacy,
}: ExistingDebtItemsEditorProps) {
  const update = (id: string, patch: Partial<ExistingDebtItem>) => {
    onChange(items.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  };
  const remove = (id: string) => onChange(items.filter((it) => it.id !== id));
  const add = () =>
    onChange([
      ...items,
      { id: newDebtId(), lender: '', amount: '', type: '', maturityDate: null, notes: '' },
    ]);

  const showLegacy = !legacyDismissed && !!legacyText.trim();

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label>Existing Debt Details</Label>
        <Button type="button" variant="outline" size="sm" onClick={add} className="h-8">
          <Plus className="h-3.5 w-3.5 mr-1" />
          Add Loan
        </Button>
      </div>

      {showLegacy && (
        <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3">
          <div className="flex items-start justify-between gap-3">
            <div className="text-xs text-muted-foreground">
              <div className="font-medium text-foreground mb-1">Previous notes</div>
              <div className="whitespace-pre-wrap leading-relaxed">{legacyText}</div>
              <div className="mt-2 italic">
                Re-enter these as structured loans below, then dismiss this banner.
              </div>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs gap-1 text-muted-foreground"
              onClick={onDismissLegacy}
            >
              <X className="h-3 w-3" />
              Dismiss
            </Button>
          </div>
        </div>
      )}

      {items.length === 0 ? (
        <div className="rounded-md border border-dashed border-border bg-muted/30 px-3 py-4 text-center text-xs text-muted-foreground">
          No loans added. Click <span className="font-medium text-foreground">Add Loan</span> to log existing debt.
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((item) => (
            <div
              key={item.id}
              className="rounded-md border border-border bg-muted/30 p-3 space-y-2"
            >
              <div className="grid grid-cols-1 md:grid-cols-12 gap-2">
                <div className="md:col-span-4">
                  <Label className="text-[11px] text-muted-foreground">Lender / Instrument</Label>
                  <Input
                    value={item.lender}
                    onChange={(e) => update(item.id, { lender: e.target.value })}
                    placeholder="e.g. Collective Capital Ventures"
                    className="h-9"
                  />
                </div>
                <div className="md:col-span-2">
                  <Label className="text-[11px] text-muted-foreground">Amount</Label>
                  <Input
                    value={item.amount}
                    onChange={(e) => update(item.id, { amount: e.target.value })}
                    placeholder="$3,000,000"
                    className="h-9"
                  />
                </div>
                <div className="md:col-span-3">
                  <Label className="text-[11px] text-muted-foreground">Type</Label>
                  <Select
                    value={item.type || undefined}
                    onValueChange={(v) => update(item.id, { type: v })}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                    <SelectContent>
                      {DEBT_TYPE_OPTIONS.map((opt) => (
                        <SelectItem key={opt} value={opt}>
                          {opt}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="md:col-span-2">
                  <Label className="text-[11px] text-muted-foreground">Maturity</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        type="button"
                        variant="outline"
                        className={cn(
                          'h-9 w-full justify-start text-left font-normal',
                          !item.maturityDate && 'text-muted-foreground',
                        )}
                      >
                        <CalendarIcon className="mr-2 h-3.5 w-3.5" />
                        {formatMaturityLabel(item.maturityDate)}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={item.maturityDate ? new Date(item.maturityDate) : undefined}
                        onSelect={(d) =>
                          update(item.id, {
                            maturityDate: d
                              ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
                              : null,
                          })
                        }
                        initialFocus
                        className={cn('p-3 pointer-events-auto')}
                      />
                    </PopoverContent>
                  </Popover>
                </div>
                <div className="md:col-span-1 flex md:items-end justify-end">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 text-muted-foreground hover:text-destructive"
                    onClick={() => remove(item.id)}
                    aria-label="Remove loan"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div>
                <Label className="text-[11px] text-muted-foreground">Notes</Label>
                <Input
                  value={item.notes}
                  onChange={(e) => update(item.id, { notes: e.target.value })}
                  placeholder="e.g. flexibility for partial or full refinance or subordination"
                  className="h-9"
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
