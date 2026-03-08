import { useState, useCallback, useRef } from 'react';
import type { SaaSModelData, SaaSModelSettings as SaaSModelSettingsType } from './types';
import { IS_FIELDS, BS_FIELDS, FieldMapping, MappingFieldName, FileAnalysisResult } from './types';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';
import { Upload, FileSpreadsheet, Check, AlertTriangle, X, ChevronRight, RefreshCw, ArrowLeft, CheckCircle2, Circle, Sparkles, Loader2, Settings, Trash2, ChevronDown } from 'lucide-react';
import { parseExcelFromFile, ParsedSheet } from '@/lib/excelUtils';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from 'sonner';
import { formatUSD, extractAmount } from '@/lib/formatters/currency';
import { useMappingSuggestions, type MappingSuggestion } from '@/hooks/useMappingSuggestions';
import { supabase } from '@/integrations/supabase/client';

interface Props {
  dealId: string;
  model: SaaSModelData;
  updateModel: (updater: (prev: SaaSModelData) => SaaSModelData) => void;
  recalculate: () => void;
}

// Keyword alias dictionary for auto-detection
const KEYWORD_ALIASES: Record<string, MappingFieldName> = {
  'mrr': 'Recurring Revenue', 'monthly recurring revenue': 'Recurring Revenue', 'recurring revenue': 'Recurring Revenue', 'subscription revenue': 'Recurring Revenue', 'saas revenue': 'Recurring Revenue',
  'non-recurring': 'Non-Recurring Revenue', 'non recurring revenue': 'Non-Recurring Revenue', 'one-time revenue': 'Non-Recurring Revenue', 'services revenue': 'Non-Recurring Revenue', 'professional services': 'Non-Recurring Revenue',
  'other revenue': 'Other Revenue', 'other income': 'Other Revenue', 'miscellaneous revenue': 'Other Revenue',
  'cogs recurring': 'COGS on Recurring Revenue', 'cost of recurring': 'COGS on Recurring Revenue', 'hosting costs': 'COGS on Recurring Revenue',
  'cogs non-recurring': 'COGS on Non-Recurring Revenue', 'cost of services': 'COGS on Non-Recurring Revenue',
  'cogs labor': 'COGS - Labor', 'cost of labor': 'COGS - Labor', 'direct labor': 'COGS - Labor',
  'salaries': 'Salaries and Benefits', 'salary': 'Salaries and Benefits', 'wages': 'Salaries and Benefits', 'compensation': 'Salaries and Benefits', 'payroll': 'Salaries and Benefits', 'benefits': 'Salaries and Benefits',
  'sales and marketing': 'Sales and Marketing', 's&m': 'Sales and Marketing', 'marketing': 'Sales and Marketing', 'advertising': 'Sales and Marketing',
  'r&d': 'Research and Development', 'research': 'Research and Development', 'development': 'Research and Development', 'engineering': 'Research and Development',
  'professional fees': 'Professional Fees', 'legal': 'Professional Fees', 'accounting': 'Professional Fees', 'consulting': 'Professional Fees',
  'g&a': 'General and Administrative', 'general and admin': 'General and Administrative', 'admin': 'General and Administrative', 'office': 'General and Administrative', 'rent': 'General and Administrative',
  'interest expense': 'Interest Expense', 'interest paid': 'Interest Expense',
  'interest income': 'Interest Income', 'interest earned': 'Interest Income',
  'depreciation': 'Depreciation Expense', 'amortization': 'Depreciation Expense', 'd&a': 'Depreciation Expense',
  'other expense': 'Other Expense', 'other expenses': 'Other Expense',
  'tax': 'Tax Expense', 'taxes': 'Tax Expense', 'income tax': 'Tax Expense', 'tax expense': 'Tax Expense',
  'cash': 'Cash and Cash Equivalents', 'cash and equivalents': 'Cash and Cash Equivalents', 'cash & equivalents': 'Cash and Cash Equivalents',
  'marketable securities': 'Marketable Securities', 'investments': 'Marketable Securities', 'short-term investments': 'Marketable Securities',
  'accounts receivable': 'Accounts Receivable', 'a/r': 'Accounts Receivable', 'ar': 'Accounts Receivable', 'trade receivables': 'Accounts Receivable',
  'prepaid': 'Prepaid Expenses', 'prepaid expenses': 'Prepaid Expenses', 'prepaids': 'Prepaid Expenses',
  'inventory': 'Inventory', 'inventories': 'Inventory',
  'other current assets': 'Other Current Assets',
  'ppe': 'Property Plant & Equipment', 'property': 'Property Plant & Equipment', 'pp&e': 'Property Plant & Equipment', 'equipment': 'Property Plant & Equipment',
  'fixed assets': 'Fixed Assets',
  'capitalized software': 'Capitalized Software', 'cap software': 'Capitalized Software', 'software': 'Capitalized Software',
  'intangibles': 'Intangible Assets', 'intangible assets': 'Intangible Assets', 'goodwill': 'Intangible Assets',
  'other lt assets': 'Other LT Assets', 'other long-term assets': 'Other LT Assets',
  'accounts payable': 'Accounts Payable', 'a/p': 'Accounts Payable', 'ap': 'Accounts Payable', 'trade payables': 'Accounts Payable',
  'credit cards': 'Credit Cards', 'credit card': 'Credit Cards',
  'employee accruals': 'Employee Accruals', 'accrued compensation': 'Employee Accruals', 'accrued payroll': 'Employee Accruals',
  'other accrued': 'Other Accrued Liabilities', 'accrued liabilities': 'Other Accrued Liabilities', 'accrued expenses': 'Other Accrued Liabilities',
  'short-term debt': 'Short-Term Debt', 'st debt': 'Short-Term Debt', 'current debt': 'Short-Term Debt', 'line of credit': 'Short-Term Debt',
  'deferred revenue': 'Deferred Revenue', 'unearned revenue': 'Deferred Revenue', 'deferred': 'Deferred Revenue',
  'other st liabilities': 'Other Short-Term Liabilities', 'other current liabilities': 'Other Short-Term Liabilities',
  'long-term debt': 'Long-Term Debt', 'lt debt': 'Long-Term Debt', 'term loan': 'Long-Term Debt', 'notes payable': 'Long-Term Debt',
  'government loan': 'Government Loan', 'gov loan': 'Government Loan', 'ppp': 'Government Loan', 'eidl': 'Government Loan', 'sba': 'Government Loan',
  'shareholder loan': 'Shareholder Loan', 'shareholder note': 'Shareholder Loan', 'related party': 'Shareholder Loan',
  'convertible': 'Convertible Notes', 'convertible notes': 'Convertible Notes', 'convertible debt': 'Convertible Notes',
  'paid in capital': 'Paid in Capital', 'common stock': 'Paid in Capital', 'equity': 'Paid in Capital', 'additional paid-in': 'Paid in Capital',
  'retained earnings': 'Retained Earnings', 'accumulated deficit': 'Retained Earnings',
};

type Phase = 'upload' | 'triage' | 'mapping';

interface AnalyzedFile {
  file: File;
  sheets: ParsedSheet[];
  analysis: FileAnalysisResult;
}

// Map field name to model data path
function getFieldPath(fieldName: MappingFieldName): string[] {
  const map: Record<string, string[]> = {
    'Recurring Revenue': ['revenue', 'recurring'],
    'Non-Recurring Revenue': ['revenue', 'nonRecurring'],
    'Other Revenue': ['revenue', 'other'],
    'COGS on Recurring Revenue': ['cogs', 'onRecurring'],
    'COGS on Non-Recurring Revenue': ['cogs', 'onNonRecurring'],
    'COGS - Labor': ['cogs', 'labor'],
    'Salaries and Benefits': ['opex', 'salaries'],
    'Sales and Marketing': ['opex', 'salesMarketing'],
    'Research and Development': ['opex', 'rnd'],
    'Professional Fees': ['opex', 'professionalFees'],
    'General and Administrative': ['opex', 'gna'],
    'Interest Expense': ['interestExpense'],
    'Interest Income': ['interestIncome'],
    'Depreciation Expense': ['depreciation'],
    'Other Expense': ['otherExpense'],
    'Tax Expense': ['taxExpense'],
    'Cash and Cash Equivalents': ['balanceSheet', 'cash'],
    'Marketable Securities': ['balanceSheet', 'marketableSecurities'],
    'Accounts Receivable': ['balanceSheet', 'ar'],
    'Prepaid Expenses': ['balanceSheet', 'prepaid'],
    'Inventory': ['balanceSheet', 'inventory'],
    'Other Current Assets': ['balanceSheet', 'otherCurrentAssets'],
    'Property Plant & Equipment': ['balanceSheet', 'ppe'],
    'Fixed Assets': ['balanceSheet', 'fixedAssets'],
    'Capitalized Software': ['balanceSheet', 'capSoftware'],
    'Intangible Assets': ['balanceSheet', 'intangibles'],
    'Other LT Assets': ['balanceSheet', 'otherLTAssets'],
    'Accounts Payable': ['balanceSheet', 'ap'],
    'Credit Cards': ['balanceSheet', 'creditCards'],
    'Employee Accruals': ['balanceSheet', 'employeeAccruals'],
    'Other Accrued Liabilities': ['balanceSheet', 'otherAccrued'],
    'Short-Term Debt': ['balanceSheet', 'stDebt'],
    'Deferred Revenue': ['balanceSheet', 'deferredRevenue'],
    'Other Short-Term Liabilities': ['balanceSheet', 'otherSTLiabilities'],
    'Long-Term Debt': ['balanceSheet', 'ltDebt'],
    'Government Loan': ['balanceSheet', 'govLoan'],
    'Shareholder Loan': ['balanceSheet', 'shareholderLoan'],
    'Convertible Notes': ['balanceSheet', 'convertibleNotes'],
    'Paid in Capital': ['balanceSheet', 'paidInCapital'],
    'Retained Earnings': ['balanceSheet', 'retainedEarnings'],
  };
  return map[fieldName] || [];
}

// Format a cell value: if numeric, show as USD; otherwise show raw string
function formatCellValue(val: unknown): string {
  if (val === null || val === undefined) return '';
  if (typeof val === 'number') return formatUSD(val);
  const str = String(val);
  const parsed = parseFloat(str.replace(/[,$\s]/g, ''));
  if (!isNaN(parsed) && str.match(/^[\s$(-]*[\d,.]+[\s)]*$/)) return formatUSD(parsed);
  return str;
}

function isNumericCell(val: unknown): boolean {
  if (typeof val === 'number') return true;
  if (val === null || val === undefined) return false;
  const str = String(val);
  const parsed = parseFloat(str.replace(/[,$\s]/g, ''));
  return !isNaN(parsed) && str.match(/^[\s$(-]*[\d,.]+[\s)]*$/) !== null;
}

// IS field sections for grouping
const IS_SECTIONS: { label: string; fields: string[] }[] = [
  { label: 'Revenue', fields: ['Recurring Revenue', 'Non-Recurring Revenue', 'Other Revenue'] },
  { label: 'Cost of Goods Sold', fields: ['COGS on Recurring Revenue', 'COGS on Non-Recurring Revenue', 'COGS - Labor'] },
  { label: 'Operating Expenses', fields: ['Salaries and Benefits', 'Sales and Marketing', 'Research and Development', 'Professional Fees', 'General and Administrative'] },
  { label: 'Other', fields: ['Interest Expense', 'Interest Income', 'Depreciation Expense', 'Other Expense', 'Tax Expense'] },
];

const BS_SECTIONS: { label: string; fields: string[] }[] = [
  { label: 'Current Assets', fields: ['Cash and Cash Equivalents', 'Marketable Securities', 'Accounts Receivable', 'Prepaid Expenses', 'Inventory', 'Other Current Assets'] },
  { label: 'Long-Term Assets', fields: ['Property Plant & Equipment', 'Fixed Assets', 'Capitalized Software', 'Intangible Assets', 'Other LT Assets'] },
  { label: 'Current Liabilities', fields: ['Accounts Payable', 'Credit Cards', 'Employee Accruals', 'Other Accrued Liabilities', 'Short-Term Debt', 'Deferred Revenue', 'Other Short-Term Liabilities'] },
  { label: 'Long-Term Liabilities', fields: ['Long-Term Debt', 'Government Loan', 'Shareholder Loan', 'Convertible Notes'] },
  { label: 'Equity', fields: ['Paid in Capital', 'Retained Earnings'] },
];

export function SaaSModelDataMapping({ dealId, model, updateModel, recalculate }: Props) {
  const [phase, setPhase] = useState<Phase>('upload');
  const [analyzedFiles, setAnalyzedFiles] = useState<AnalyzedFile[]>([]);
  const [selectedFile, setSelectedFile] = useState<AnalyzedFile | null>(null);
  const [activeSheet, setActiveSheet] = useState(0);
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set());
  const [fieldMappings, setFieldMappings] = useState<Record<string, FieldMapping[]>>({});
  const [isProcessing, setIsProcessing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [localSettings, setLocalSettings] = useState<SaaSModelSettingsType>({ ...model.settings });
  const [settingsSaved, setSettingsSaved] = useState(false);

  const handleSaveSettings = () => {
    updateModel(prev => ({ ...prev, settings: { ...localSettings } }));
    setSettingsSaved(true);
    setTimeout(() => setSettingsSaved(false), 2000);
    toast.success('Settings saved');
  };

  const handleDeleteModel = async () => {
    try {
      await supabase.from('deal_saas_model' as any).delete().eq('deal_id', dealId);
      await supabase.from('deal_saas_sensitivity' as any).delete().eq('deal_id', dealId);
      await supabase.from('deal_saas_lenders' as any).delete().eq('deal_id', dealId);
      await supabase.from('deal_saas_mappings' as any).delete().eq('deal_id', dealId);
      toast.success('Financial model data deleted');
      window.location.reload();
    } catch {
      toast.error('Failed to delete model data');
    }
  };

  const renderSettingsSection = () => (
    <Collapsible open={settingsOpen} onOpenChange={setSettingsOpen}>
      <Card className="border-border/30">
        <CollapsibleTrigger asChild>
          <button className="w-full flex items-center justify-between p-4 hover:bg-muted/10 transition-colors rounded-t-lg">
            <div className="flex items-center gap-2">
              <Settings className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-semibold">Model Settings</span>
              <span className="text-xs text-muted-foreground">— {localSettings.companyName} · {localSettings.businessModel}</span>
            </div>
            <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", settingsOpen && "rotate-180")} />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="px-4 pb-4 pt-0 space-y-4 border-t border-border/20">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 pt-3">
              <div>
                <Label className="text-xs">Company Name</Label>
                <Input className="h-8 text-sm" value={localSettings.companyName}
                  onChange={e => setLocalSettings(s => ({ ...s, companyName: e.target.value }))} />
              </div>
              <div>
                <Label className="text-xs">Business Model</Label>
                <Select value={localSettings.businessModel} onValueChange={v => setLocalSettings(s => ({ ...s, businessModel: v as any }))}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {['SaaS', 'Subscription', 'Marketplace', 'Usage-Based', 'Hybrid'].map(m => (
                      <SelectItem key={m} value={m}>{m}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Customer Base</Label>
                <Select value={localSettings.customerBase} onValueChange={v => setLocalSettings(s => ({ ...s, customerBase: v as any }))}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {['B2B', 'B2C', 'B2B2C'].map(m => (
                      <SelectItem key={m} value={m}>{m}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Actuals Thru Date</Label>
                <Input type="date" className="h-8 text-xs" value={localSettings.actualThruDate}
                  onChange={e => setLocalSettings(s => ({ ...s, actualThruDate: e.target.value }))} />
              </div>
              <div>
                <Label className="text-xs">Financial Quality</Label>
                <Select value={localSettings.financialQuality} onValueChange={v => setLocalSettings(s => ({ ...s, financialQuality: v as any }))}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {['CPA Reviewed', 'Audited', 'Company Prepared'].map(m => (
                      <SelectItem key={m} value={m}>{m}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <Button size="sm" onClick={handleSaveSettings} className="gap-1.5">
                {settingsSaved ? <><Check className="h-3.5 w-3.5" /> Saved</> : 'Save Settings'}
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="ghost" size="sm" className="gap-1.5 text-destructive hover:text-destructive">
                    <Trash2 className="h-3.5 w-3.5" /> Delete Model
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete Financial Model?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will permanently delete all financial model data for "{localSettings.companyName}". This action cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={handleDeleteModel} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                      Delete
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );

  // AI suggestions hook
  const {
    suggestions,
    isLoading: isSuggestLoading,
    hasRun: hasSuggestRun,
    pendingCount,
    acceptedCount,
    fetchSuggestions,
    acceptSuggestion,
    rejectSuggestion,
    acceptAll,
    logPatterns,
    getSuggestionForRow,
  } = useMappingSuggestions();

  // Get company_id for the current user
  const getCompanyId = useCallback(async (): Promise<string | null> => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    const { data } = await supabase.from('company_members').select('company_id').eq('user_id', user.id).limit(1).single();
    return data?.company_id || null;
  }, []);

  // Trigger AI suggestions
  const handleAISuggest = useCallback(async () => {
    if (!selectedFile) return;
    const sheet = selectedFile.sheets[activeSheet];
    if (!sheet) return;

    const companyId = await getCompanyId();
    if (!companyId) {
      toast.error('Company not found');
      return;
    }

    const rows = sheet.data.slice(0, 200).map((row, idx) => ({
      rowIdx: idx,
      label: String(row[0] || ''),
      sampleValues: row.slice(1, 6),
    })).filter(r => r.label.trim().length > 0);

    await fetchSuggestions(rows, companyId, dealId);
  }, [selectedFile, activeSheet, getCompanyId, fetchSuggestions, dealId]);

  // Accept a suggestion and auto-map it
  const handleAcceptSuggestion = useCallback((rowIdx: number) => {
    const suggestion = getSuggestionForRow(rowIdx);
    if (!suggestion || !selectedFile) return;

    const sheet = selectedFile.sheets[activeSheet];
    const fieldName = suggestion.suggestedField;

    // Auto-assign the mapping
    const newMapping: FieldMapping = {
      sheet: sheet.name,
      rowIdx,
      label: String(sheet.data[rowIdx]?.[0] || `Row ${rowIdx + 1}`),
    };

    setFieldMappings(prev => ({
      ...prev,
      [fieldName]: [...(prev[fieldName] || []), newMapping],
    }));

    acceptSuggestion(rowIdx);
  }, [getSuggestionForRow, selectedFile, activeSheet, acceptSuggestion]);

  // Accept all pending suggestions
  const handleAcceptAll = useCallback(() => {
    const pending = suggestions.filter(s => s.status === 'pending');
    pending.forEach(s => handleAcceptSuggestion(s.rowIdx));
    acceptAll();
  }, [suggestions, handleAcceptSuggestion, acceptAll]);

  // Log patterns and recalculate
  const handleRecalculateWithLog = useCallback(async () => {
    const companyId = await getCompanyId();
    if (companyId) {
      await logPatterns(companyId, dealId);
    }
    handleRecalculate();
  }, [getCompanyId, logPatterns, dealId]);

  const analyzeFile = useCallback(async (file: File): Promise<AnalyzedFile> => {
    try {
      const result = await parseExcelFromFile(file);
      const matchedFields: string[] = [];
      let isMatches = 0, bsMatches = 0;

      result.sheets.forEach(sheet => {
        sheet.data.forEach(row => {
          const label = String(row[0] || '').toLowerCase().trim();
          if (!label) return;
          for (const [keyword, field] of Object.entries(KEYWORD_ALIASES)) {
            if (label.includes(keyword) && !matchedFields.includes(field)) {
              matchedFields.push(field);
              if ((IS_FIELDS as readonly string[]).includes(field)) isMatches++;
              else bsMatches++;
            }
          }
        });
      });

      const totalMatches = matchedFields.length;
      let status: FileAnalysisResult['status'] = 'unrecognized';
      if (totalMatches >= 8) status = 'mappable';
      else if (totalMatches >= 2) status = 'partial';

      let type: FileAnalysisResult['type'] = 'Unknown';
      if (isMatches > 0 && bsMatches > 0) type = 'IS + BS';
      else if (isMatches > 0) type = 'Income Statement';
      else if (bsMatches > 0) type = 'Balance Sheet';

      return {
        file,
        sheets: result.sheets,
        analysis: { status, type, totalMatches, isMatches, bsMatches, matchedFields },
      };
    } catch {
      return {
        file,
        sheets: [],
        analysis: { status: 'error', type: 'Unknown', totalMatches: 0, isMatches: 0, bsMatches: 0, matchedFields: [] },
      };
    }
  }, []);

  const handleFilesSelected = useCallback(async (files: FileList) => {
    setIsProcessing(true);
    const results: AnalyzedFile[] = [];
    for (const file of Array.from(files)) {
      results.push(await analyzeFile(file));
    }
    results.sort((a, b) => b.analysis.totalMatches - a.analysis.totalMatches);
    setAnalyzedFiles(results);

    if (results.length === 1) {
      setSelectedFile(results[0]);
      setPhase('mapping');
    } else {
      setPhase('triage');
    }
    setIsProcessing(false);
  }, [analyzeFile]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files.length) handleFilesSelected(e.dataTransfer.files);
  }, [handleFilesSelected]);

  const handleRowClick = useCallback((rowIdx: number, e: React.MouseEvent) => {
    setSelectedRows(prev => {
      const next = new Set(prev);
      if (e.ctrlKey || e.metaKey) {
        if (next.has(rowIdx)) next.delete(rowIdx);
        else next.add(rowIdx);
      } else {
        if (next.has(rowIdx) && next.size === 1) next.clear();
        else { next.clear(); next.add(rowIdx); }
      }
      return next;
    });
  }, []);

  const handleAssignField = useCallback((fieldName: string) => {
    if (!selectedFile || selectedRows.size === 0) return;
    const sheet = selectedFile.sheets[activeSheet];
    const newMappings = Array.from(selectedRows).map(rowIdx => ({
      sheet: sheet.name,
      rowIdx,
      label: String(sheet.data[rowIdx]?.[0] || `Row ${rowIdx + 1}`),
    }));
    setFieldMappings(prev => ({
      ...prev,
      [fieldName]: [...(prev[fieldName] || []), ...newMappings],
    }));
    setSelectedRows(new Set());
  }, [selectedFile, selectedRows, activeSheet]);

  const handleRemoveMapping = useCallback((fieldName: string, idx: number) => {
    setFieldMappings(prev => {
      const updated = { ...prev };
      updated[fieldName] = updated[fieldName].filter((_, i) => i !== idx);
      if (!updated[fieldName].length) delete updated[fieldName];
      return updated;
    });
  }, []);

  const handleRecalculate = useCallback(() => {
    if (!selectedFile) return;
    updateModel(prev => {
      const updated = { ...prev };
      Object.entries(fieldMappings).forEach(([fieldName, mappings]) => {
        const path = getFieldPath(fieldName as MappingFieldName);
        if (!path.length) return;

        const sheet = selectedFile.sheets.find(s => s.name === mappings[0]?.sheet) || selectedFile.sheets[0];
        const numCols = Math.min(24, (sheet.data[0]?.length || 1) - 1);
        const values = new Array(24).fill(0);

        mappings.forEach(m => {
          const row = sheet.data[m.rowIdx];
          if (!row) return;
          for (let c = 1; c <= numCols && c <= 24; c++) {
            const val = typeof row[c] === 'number' ? row[c] as number : parseFloat(String(row[c] || '0').replace(/[,$]/g, ''));
            if (!isNaN(val)) values[c - 1] += val;
          }
        });

        if (path.length === 1) {
          (updated as any)[path[0]] = values;
        } else if (path.length === 2) {
          (updated as any)[path[0]][path[1]] = values;
        }
      });
      return updated;
    });
    toast.success('Model recalculated with mapped data');
  }, [selectedFile, fieldMappings, updateModel]);

  const mappedCount = Object.keys(fieldMappings).length;
  const totalFields = IS_FIELDS.length + BS_FIELDS.length;
  const unmappedCount = totalFields - mappedCount;
  const percent = totalFields === 0 ? 0 : Math.round((mappedCount / totalFields) * 100);

  // Helper to get sample value from a mapped field
  const getSampleValue = (fieldName: string): number | null => {
    const mappings = fieldMappings[fieldName];
    if (!mappings || !selectedFile) return null;
    let total = 0;
    mappings.forEach(m => {
      const sheet = selectedFile.sheets.find(s => s.name === m.sheet) || selectedFile.sheets[0];
      const row = sheet?.data[m.rowIdx];
      if (!row) return;
      // Take the first numeric value after column 0
      for (let c = 1; c < row.length; c++) {
        const val = typeof row[c] === 'number' ? row[c] as number : parseFloat(String(row[c] || '').replace(/[,$]/g, ''));
        if (!isNaN(val)) { total += val; break; }
      }
    });
    return total;
  };

  // Check if a field has a pending AI suggestion
  const getFieldSuggestion = (field: string): MappingSuggestion | undefined => {
    return suggestions.find(s => s.suggestedField === field && s.status === 'pending');
  };

  // Render a field row in the sidebar
  const renderFieldRow = (field: string) => {
    const mapped = fieldMappings[field];
    const isMapped = Boolean(mapped);
    const sampleVal = isMapped ? getSampleValue(field) : null;
    const fieldSuggestion = getFieldSuggestion(field);

    return (
      <div
        key={field}
        className={cn(
          "flex items-center justify-between py-1.5 px-2 rounded group transition-colors",
          isMapped
            ? "bg-emerald-500/5 hover:bg-emerald-500/10"
            : fieldSuggestion
              ? "bg-primary/5 hover:bg-primary/10 ring-1 ring-primary/15"
              : "hover:bg-muted/20"
        )}
      >
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {isMapped ? (
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 flex-shrink-0" />
          ) : fieldSuggestion ? (
            <Sparkles className="h-3.5 w-3.5 text-primary flex-shrink-0" />
          ) : (
            <Circle className="h-3.5 w-3.5 text-muted-foreground/40 flex-shrink-0" />
          )}
          <span className={cn("text-xs truncate", isMapped && "font-medium")}>{field}</span>
          {fieldSuggestion && !isMapped && (
            <Badge variant="outline" className="text-[8px] h-4 px-1 bg-primary/5 text-primary border-primary/20 shrink-0">
              AI · Row {fieldSuggestion.rowIdx + 1}
            </Badge>
          )}
          {mapped && (
            <div className="flex gap-1 flex-shrink-0">
              {mapped.map((m, i) => (
                <Badge key={i} variant="secondary" className="text-[9px] h-4 gap-1 max-w-[100px] truncate">
                  {m.label}
                  <X className="h-2.5 w-2.5 cursor-pointer flex-shrink-0" onClick={e => { e.stopPropagation(); handleRemoveMapping(field, i); }} />
                </Badge>
              ))}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {sampleVal !== null && (
            <span className="text-[10px] tabular-nums text-muted-foreground">{formatUSD(sampleVal)}</span>
          )}
          {fieldSuggestion && !isMapped && (
            <Button size="sm" variant="ghost" className="h-5 text-[10px] px-2 text-primary" onClick={() => handleAcceptSuggestion(fieldSuggestion.rowIdx)}>
              <Check className="h-3 w-3 mr-0.5" /> Apply
            </Button>
          )}
          {selectedRows.size > 0 && (
            <Button size="sm" variant="ghost" className="h-5 text-[10px] px-2 opacity-0 group-hover:opacity-100" onClick={() => handleAssignField(field)}>Assign</Button>
          )}
        </div>
      </div>
    );
  };

  // Render field sections with grouped headers
  const renderFieldSections = (sections: { label: string; fields: string[] }[]) => (
    <div className="space-y-1">
      {sections.map(section => (
        <div key={section.label}>
          <div className="px-2 py-2 bg-muted/30 rounded-sm mb-1">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{section.label}</span>
          </div>
          {section.fields.map(field => renderFieldRow(field))}
        </div>
      ))}
    </div>
  );

  // Phase 1: Upload
  if (phase === 'upload') {
    return (
      <div className="space-y-4">
        {renderSettingsSection()}
        <Card className="border-border/30 border-dashed">
          <CardContent className="p-12 flex flex-col items-center justify-center text-center"
            onDragOver={e => e.preventDefault()} onDrop={handleDrop}>
            {isProcessing ? (
              <div className="flex flex-col items-center gap-3">
                <RefreshCw className="h-10 w-10 text-primary animate-spin" />
                <p className="text-sm text-muted-foreground">Analyzing files...</p>
              </div>
            ) : (
              <>
                <Upload className="h-12 w-12 text-muted-foreground/50 mb-4" />
                <h3 className="text-sm font-semibold mb-1">Upload Financial Statements</h3>
                <p className="text-xs text-muted-foreground mb-4">
                  Drag & drop Excel files (.xlsx, .xls, .csv) or click to browse
                </p>
                <Button size="sm" onClick={() => fileInputRef.current?.click()}>
                  Browse Files
                </Button>
                <input ref={fileInputRef} type="file" className="hidden" accept=".xlsx,.xls,.csv" multiple
                  onChange={e => e.target.files && handleFilesSelected(e.target.files)} />
              </>
            )}
          </CardContent>
        </Card>

        <div className="grid grid-cols-3 gap-3">
          {[
            { title: 'Bulk Upload', desc: 'Upload multiple files at once for batch analysis' },
            { title: 'Auto-Detect', desc: '200+ keyword aliases match rows to financial fields' },
            { title: 'Interactive Mapping', desc: 'Click rows to assign them to model fields' },
          ].map(f => (
            <Card key={f.title} className="border-border/20">
              <CardContent className="p-4">
                <h4 className="text-xs font-semibold mb-1">{f.title}</h4>
                <p className="text-[10px] text-muted-foreground">{f.desc}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  // Phase 1.5: Triage
  if (phase === 'triage') {
    const counts = { mappable: 0, partial: 0, unrecognized: 0, error: 0 };
    analyzedFiles.forEach(f => counts[f.analysis.status]++);

    return (
      <div className="space-y-4">
        {renderSettingsSection()}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" className="h-7" onClick={() => setPhase('upload')}>
              <ArrowLeft className="h-3.5 w-3.5 mr-1" /> Change file
            </Button>
            <div className="flex gap-2 text-xs">
              {counts.mappable > 0 && <Badge className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20">{counts.mappable} Mappable</Badge>}
              {counts.partial > 0 && <Badge className="bg-amber-500/10 text-amber-500 border-amber-500/20">{counts.partial} Partial</Badge>}
              {counts.unrecognized > 0 && <Badge variant="secondary">{counts.unrecognized} Not Recognized</Badge>}
              {counts.error > 0 && <Badge variant="destructive">{counts.error} Error</Badge>}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {analyzedFiles.map((af, idx) => (
            <Card key={idx} className={cn(
              "border-border/30 cursor-pointer hover:border-primary/50 transition-colors",
              af.analysis.status === 'mappable' && "border-emerald-500/30",
              af.analysis.status === 'partial' && "border-amber-500/30",
              af.analysis.status === 'error' && "border-destructive/30",
            )}>
              <CardContent className="p-4" onClick={() => { setSelectedFile(af); setPhase('mapping'); }}>
                <div className="flex items-center gap-2 mb-2">
                  {af.analysis.status === 'mappable' ? <Check className="h-4 w-4 text-emerald-500" /> :
                    af.analysis.status === 'partial' ? <AlertTriangle className="h-4 w-4 text-amber-500" /> :
                    af.analysis.status === 'error' ? <X className="h-4 w-4 text-destructive" /> :
                    <FileSpreadsheet className="h-4 w-4 text-muted-foreground" />}
                  <span className="text-xs font-medium truncate">{af.file.name}</span>
                </div>
                <div className="text-[10px] text-muted-foreground mb-2">
                  {af.sheets.length} sheet{af.sheets.length === 1 ? '' : 's'} · {af.analysis.type} · {af.analysis.totalMatches} of {totalFields} fields detected
                </div>
                <div className="w-full bg-muted/30 rounded-full h-1.5 mb-2">
                  <div className="bg-primary h-1.5 rounded-full" style={{ width: `${(af.analysis.totalMatches / totalFields) * 100}%` }} />
                </div>
                <div className="flex flex-wrap gap-1">
                  {af.analysis.matchedFields.slice(0, 6).map(f => (
                    <Badge key={f} variant="secondary" className="text-[9px] h-4">{f}</Badge>
                  ))}
                  {af.analysis.matchedFields.length > 6 && (
                    <Badge variant="secondary" className="text-[9px] h-4">+{af.analysis.matchedFields.length - 6} more</Badge>
                  )}
                </div>
                <Button size="sm" className="w-full mt-3 h-7 text-xs">
                  Select & Map <ChevronRight className="h-3 w-3 ml-1" />
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  // Phase 2: Mapping UI
  if (!selectedFile) return null;
  const sheet = selectedFile.sheets[activeSheet];
  const sheetCount = selectedFile.sheets.length;
  const rowCount = sheet?.data.length || 0;
  const columnCount = sheet?.data[0]?.length || 0;

  return (
    <div className="space-y-4">
      {renderSettingsSection()}
      {/* Header with description */}
      <div>
        <h3 className="text-sm font-semibold">Map your financial fields</h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          Connect each column from your upload to a standard model field so we can calculate ARR, EBITDA, and other metrics automatically.
        </p>
      </div>

      {/* File card (§7) */}
      <div className="flex items-center gap-3 rounded-lg border border-border/30 bg-muted/10 px-3 py-2">
        <div className="flex h-9 w-9 items-center justify-center rounded bg-emerald-500/10">
          <FileSpreadsheet className="h-4 w-4 text-emerald-500" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium truncate">{selectedFile.file.name}</p>
          <p className="text-[10px] text-muted-foreground">
            {sheetCount} sheet{sheetCount === 1 ? '' : 's'} · {rowCount} rows · {columnCount} columns
          </p>
        </div>
        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setPhase('upload')}>
          Change file
        </Button>
      </div>

      {/* Progress bar (§4) */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium">Mapping progress</span>
          <span className="text-xs text-muted-foreground">{percent}%</span>
        </div>
        <Progress value={percent} className="h-2" />
        <p className="text-[10px] text-muted-foreground">
          <span className="font-medium text-foreground">{mappedCount}</span> of {totalFields} fields mapped · <span className="text-amber-500">{unmappedCount} remaining</span>
        </p>
      </div>

      {/* AI Suggestions Banner */}
      {hasSuggestRun && suggestions.length > 0 && (
        <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-primary/5 border border-primary/20">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <span className="text-xs text-primary font-medium">
              {pendingCount > 0
                ? `${pendingCount} AI suggestion${pendingCount > 1 ? 's' : ''} pending review`
                : `${acceptedCount} suggestion${acceptedCount > 1 ? 's' : ''} applied`}
            </span>
          </div>
          {pendingCount > 0 && (
            <div className="flex items-center gap-2">
              <Button size="sm" variant="ghost" className="h-6 text-[10px] text-primary" onClick={handleAcceptAll}>
                <Check className="h-3 w-3 mr-1" /> Accept All
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Action buttons */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          {analyzedFiles.length > 1 && (
            <Button variant="ghost" size="sm" className="h-7" onClick={() => setPhase('triage')}>
              <ArrowLeft className="h-3.5 w-3.5 mr-1" /> All Files
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs gap-1.5"
            onClick={handleAISuggest}
            disabled={isSuggestLoading}
          >
            {isSuggestLoading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Sparkles className="h-3.5 w-3.5" />
            )}
            {isSuggestLoading ? 'Analyzing...' : hasSuggestRun ? 'Re-analyze' : 'AI Suggest'}
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setPhase('upload')}>
            Change file
          </Button>
          <Button size="sm" className="h-7 text-xs" onClick={handleRecalculateWithLog} disabled={mappedCount === 0}>
            <RefreshCw className="h-3.5 w-3.5 mr-1" /> Review mapped data
          </Button>
        </div>
      </div>

      {/* Split panel */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* Left: Spreadsheet */}
        <div className="lg:col-span-3">
          <Card className="border-border/30">
            <CardContent className="p-0">
              {/* Sheet tabs */}
              <div className="flex border-b border-border/30 overflow-x-auto">
                {selectedFile.sheets.map((s, i) => (
                  <button key={i} className={cn(
                    "px-3 py-2 text-xs whitespace-nowrap border-b-2 transition-colors",
                    i === activeSheet ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
                  )} onClick={() => { setActiveSheet(i); setSelectedRows(new Set()); }}>
                    {s.name}
                  </button>
                ))}
              </div>
              <ScrollArea className="h-[500px]">
                <table className="w-full text-[11px] border-collapse">
                  <thead className="sticky top-0 z-10 bg-muted/80 backdrop-blur-sm">
                    <tr>
                      <th className="w-8 py-1.5 px-1 text-center text-muted-foreground border-r border-border/20">#</th>
                      <th className="py-1.5 px-2 text-left text-muted-foreground min-w-[120px] border-r border-border/10 font-semibold">
                        Source column
                      </th>
                      {Array.from({ length: Math.min((sheet?.data[0]?.length || 0) - 1, 49) }, (_, i) => (
                        <th key={i + 1} className="py-1.5 px-2 text-right text-muted-foreground min-w-[80px] border-r border-border/10 font-normal">
                          {String.fromCharCode(65 + ((i + 1) % 26))}{(i + 1) >= 26 ? String.fromCharCode(65 + Math.floor((i + 1) / 26) - 1) : ''}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(sheet?.data || []).slice(0, 200).map((row, rowIdx) => {
                      const isMappedRow = Object.values(fieldMappings).some(maps =>
                        maps.some(m => m.rowIdx === rowIdx && m.sheet === sheet?.name)
                      );
                      const rowSuggestion = getSuggestionForRow(rowIdx);
                      const hasSuggestion = !!rowSuggestion && rowSuggestion.status !== 'rejected';
                      return (
                        <tr key={rowIdx}
                          className={cn(
                            "cursor-pointer transition-colors border-b border-border/5",
                            selectedRows.has(rowIdx)
                              ? "bg-primary/10 hover:bg-primary/15"
                              : isMappedRow
                                ? "bg-emerald-500/5 hover:bg-emerald-500/10"
                                : hasSuggestion
                                  ? rowSuggestion.category === 'bs'
                                    ? "bg-violet-500/5 hover:bg-violet-500/10"
                                    : "bg-blue-500/5 hover:bg-blue-500/10"
                                  : rowIdx % 2 === 0
                                    ? "bg-transparent hover:bg-muted/20"
                                    : "bg-muted/5 hover:bg-muted/20"
                          )}
                          onClick={e => handleRowClick(rowIdx, e)}>
                          <td className={cn(
                            "py-1 px-1 text-center text-muted-foreground text-[10px] border-r border-border/20",
                            hasSuggestion ? "bg-primary/5" : "bg-muted/10",
                          )}>
                            {rowIdx + 1}
                          </td>
                          {/* First column: label + suggestion badge */}
                          <td className="py-1 px-2 whitespace-nowrap border-r border-border/10 font-medium">
                            <div className="flex items-center gap-1.5">
                              <span>{row[0] !== null && row[0] !== undefined ? String(row[0]) : ''}</span>
                              {hasSuggestion && (
                                <Badge
                                  variant="outline"
                                  className={cn(
                                    "text-[8px] h-4 px-1.5 shrink-0",
                                    rowSuggestion.category === 'bs'
                                      ? "bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/20"
                                      : "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
                                  )}
                                >
                                  <Sparkles className="h-2 w-2 mr-0.5" />
                                  {rowSuggestion.suggestedField}
                                  <span className="ml-1 opacity-70">{Math.round(rowSuggestion.confidence * 100)}%</span>
                                </Badge>
                              )}
                              {hasSuggestion && rowSuggestion.status === 'pending' && (
                                <div className="flex gap-0.5 ml-auto">
                                  <Button size="sm" variant="ghost" className="h-4 w-4 p-0 text-emerald-500 hover:text-emerald-600" onClick={(e) => { e.stopPropagation(); handleAcceptSuggestion(rowIdx); }}>
                                    <Check className="h-3 w-3" />
                                  </Button>
                                  <Button size="sm" variant="ghost" className="h-4 w-4 p-0 text-muted-foreground hover:text-destructive" onClick={(e) => { e.stopPropagation(); rejectSuggestion(rowIdx); }}>
                                    <X className="h-3 w-3" />
                                  </Button>
                                </div>
                              )}
                              {hasSuggestion && rowSuggestion.status === 'accepted' && (
                                <CheckCircle2 className="h-3 w-3 text-emerald-500 shrink-0 ml-auto" />
                              )}
                            </div>
                          </td>
                          {/* Remaining columns */}
                          {Array.from({ length: Math.min(row.length - 1, 49) }, (_, colIdx) => {
                            const cellVal = row[colIdx + 1];
                            const isNum = isNumericCell(cellVal);
                            return (
                              <td key={colIdx + 1} className={cn(
                                "py-1 px-2 whitespace-nowrap border-r border-border/5 tabular-nums font-sans",
                                isNum ? "text-right" : "text-left"
                              )}>
                                {formatCellValue(cellVal)}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </ScrollArea>
            </CardContent>
          </Card>
        </div>

        {/* Right: Field list with grouped sections */}
        <div className="lg:col-span-2">
          <Card className="border-border/30">
            <CardContent className="p-3">
              {selectedRows.size > 0 && (
                <div className="mb-3 p-2 rounded bg-primary/10 text-xs text-primary flex items-center gap-2">
                  <Check className="h-3.5 w-3.5" />
                  {selectedRows.size} row{selectedRows.size !== 1 ? 's' : ''} selected — click "Assign" on a field below
                </div>
              )}
              <ScrollArea className="h-[500px]">
                <div className="space-y-4">
                  {/* Income Statement fields */}
                  <div>
                    <h4 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2 px-2">Income Statement</h4>
                    {renderFieldSections(IS_SECTIONS)}
                  </div>

                  {/* Balance Sheet fields */}
                  <div>
                    <h4 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2 px-2">Balance Sheet</h4>
                    {renderFieldSections(BS_SECTIONS)}
                  </div>
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Mapped data preview (§1 + §2: currency formatted) */}
      {mappedCount > 0 && (
        <Card className="border-border/30">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold">Mapped Data Preview</h3>
              <Badge variant="secondary" className="text-[10px]">{mappedCount} field{mappedCount !== 1 ? 's' : ''} mapped</Badge>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border/30">
                    <th className="text-left py-1.5 px-3 text-muted-foreground">Field</th>
                    <th className="text-left py-1.5 px-3 text-muted-foreground">Source Row(s)</th>
                    <th className="text-left py-1.5 px-3 text-muted-foreground">Sheet</th>
                    <th className="text-right py-1.5 px-3 text-muted-foreground">Sample Value</th>
                    <th className="text-center py-1.5 px-3 text-muted-foreground">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(fieldMappings).map(([field, mappings], idx) => {
                    const sample = getSampleValue(field);
                    return (
                      <tr key={field} className={cn(
                        "border-b border-border/10",
                        idx % 2 === 0 ? "bg-transparent" : "bg-muted/5"
                      )}>
                        <td className="py-1.5 px-3 font-medium">{field}</td>
                        <td className="py-1.5 px-3">{mappings.map(m => m.label).join(', ')}</td>
                        <td className="py-1.5 px-3 text-muted-foreground">{mappings[0]?.sheet}</td>
                        <td className="py-1.5 px-3 text-right font-mono tabular-nums">{formatUSD(extractAmount(sample))}</td>
                        <td className="py-1.5 px-3 text-center">
                          <span className="inline-flex items-center gap-1 text-emerald-500 text-[10px]">
                            <CheckCircle2 className="h-3 w-3" />
                            Mapped
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="flex justify-end mt-3">
              <Button size="sm" className="h-7 text-xs" onClick={handleRecalculateWithLog}>
                <RefreshCw className="h-3.5 w-3.5 mr-1" /> Save mapping
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
