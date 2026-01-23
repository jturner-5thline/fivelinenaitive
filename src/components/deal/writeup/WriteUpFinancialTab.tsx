import { Plus, Trash2, CalendarIcon } from 'lucide-react';
import { format } from 'date-fns';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
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
import { DealWriteUpData, FinancialYear } from '../DealWriteUp';

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
}

// Format currency value
const formatCurrency = (value: string): string => {
  if (!value) return '';
  if (value.startsWith('$')) return value;
  const numericValue = value.replace(/[^0-9.]/g, '');
  if (numericValue && !isNaN(parseFloat(numericValue))) {
    const num = parseFloat(numericValue);
    const upperValue = value.toUpperCase();
    if (upperValue.includes('M')) {
      return `$${num}M`;
    } else if (upperValue.includes('K')) {
      return `$${num}K`;
    } else if (num >= 1000000) {
      return `$${(num / 1000000).toFixed(1)}M`.replace('.0M', 'M');
    } else if (num >= 1000) {
      return `$${num.toLocaleString()}`;
    }
    return `$${num.toLocaleString()}`;
  }
  return value.startsWith('$') ? value : `$${value}`;
};

// Format percentage value
const formatPercentage = (value: string): string => {
  if (!value) return '';
  if (value.includes('%')) return value;
  const numericValue = value.replace(/[^0-9.]/g, '');
  if (numericValue && !isNaN(parseFloat(numericValue))) {
    return `${numericValue}%`;
  }
  return value;
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

export function WriteUpFinancialTab({ data, updateField }: WriteUpFinancialTabProps) {
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

  return (
    <div className="space-y-6">
      {/* Profitability & Gross Margins Row */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
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
        </div>
        <div className="space-y-2">
          <Label htmlFor="grossMargins">Gross Margins *</Label>
          <Input
            id="grossMargins"
            value={data.grossMargins}
            onChange={(e) => updateField('grossMargins', e.target.value)}
            onBlur={(e) => updateField('grossMargins', formatPercentage(e.target.value))}
            placeholder="75%"
          />
        </div>
      </div>

      {/* Capital Ask & Financial Data As Of Row */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="capitalAsk">Capital Ask *</Label>
          <Input
            id="capitalAsk"
            value={data.capitalAsk}
            onChange={(e) => updateField('capitalAsk', e.target.value)}
            onBlur={(e) => updateField('capitalAsk', formatCurrency(e.target.value))}
            placeholder="$2.5M"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="financialDataAsOf">Financial Data As Of</Label>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn(
                  'w-full justify-start text-left font-normal',
                  !data.financialDataAsOf && 'text-muted-foreground'
                )}
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {data.financialDataAsOf ? format(data.financialDataAsOf, 'PPP') : 'Select date'}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0">
              <Calendar
                mode="single"
                selected={data.financialDataAsOf ?? undefined}
                onSelect={(date) => updateField('financialDataAsOf', date ?? null)}
                initialFocus
              />
            </PopoverContent>
          </Popover>
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
      <div className="space-y-2">
        <Label htmlFor="useOfFunds">Use of Funds</Label>
        <Textarea
          id="useOfFunds"
          value={data.useOfFunds}
          onChange={(e) => updateField('useOfFunds', e.target.value)}
          placeholder="Expand sales team and accelerate product development for enterprise features."
          className="min-h-[80px]"
        />
      </div>

      {/* Existing Debt Details */}
      <div className="space-y-2">
        <Label htmlFor="existingDebtDetails">Existing Debt Details</Label>
        <Textarea
          id="existingDebtDetails"
          value={data.existingDebtDetails}
          onChange={(e) => updateField('existingDebtDetails', e.target.value)}
          placeholder="Lender: Silicon Valley Bank&#10;Amount: $500,000&#10;Terms: 3-year term loan at 8.5% APR&#10;Maturity: March 2024"
          className="min-h-[100px]"
        />
      </div>

      {/* Financial Commentary Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <Label className="text-base font-semibold">Financial Commentary</Label>
            <p className="text-xs text-muted-foreground mt-0.5">Historical and projected financial performance by year</p>
          </div>
          <Button variant="outline" size="sm" onClick={addFinancialYear}>
            <Plus className="h-4 w-4 mr-1" />
            Add Year
          </Button>
        </div>
        
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b bg-muted/30">
                <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground w-[120px]">Year</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Total Revenue</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground w-[100px]">Rev. Growth</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Gross Margin</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">EBITDA</th>
                <th className="w-12 py-3 px-2"></th>
              </tr>
            </thead>
            <tbody>
              {data.financialYears.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-muted-foreground text-sm">
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
                        className="h-8 border-0 bg-transparent px-0 focus-visible:ring-0 focus-visible:ring-offset-0 font-medium"
                      />
                    </td>
                    <td className="py-2 px-4">
                      <Input
                        value={item.revenue}
                        onChange={(e) => updateFinancialYear(item.id, 'revenue', e.target.value)}
                        placeholder="$24.72MM"
                        className="h-8 border-0 bg-transparent px-0 focus-visible:ring-0 focus-visible:ring-offset-0"
                      />
                    </td>
                    <td className="py-2 px-4">
                      {(() => {
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
                      })()}
                    </td>
                    <td className="py-2 px-4">
                      <Input
                        value={item.gross_margin}
                        onChange={(e) => updateFinancialYear(item.id, 'gross_margin', e.target.value)}
                        placeholder="53%"
                        className="h-8 border-0 bg-transparent px-0 focus-visible:ring-0 focus-visible:ring-offset-0"
                      />
                    </td>
                    <td className="py-2 px-4">
                      <Input
                        value={item.ebitda}
                        onChange={(e) => updateFinancialYear(item.id, 'ebitda', e.target.value)}
                        placeholder="$903k"
                        className="h-8 border-0 bg-transparent px-0 focus-visible:ring-0 focus-visible:ring-offset-0"
                      />
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
    </div>
  );
}
