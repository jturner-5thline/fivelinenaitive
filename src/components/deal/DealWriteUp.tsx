import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { dealTypeIdsToLabels } from '@/utils/dealTypeLabels';
import { Check, Loader2, Clock, AlertCircle, Send, Eye, CloudOff, RefreshCw, LayoutList, LayoutGrid, AlertTriangle, Wand2, FileText, Database, CheckCircle2, FileDown } from 'lucide-react';
import { NaitiveIcon as Sparkles } from '@/components/NaitiveIcon';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { FlexSyncStatusBadge, FlexSyncHistory } from '@/components/deal/FlexSyncHistory';
import { FlexPublishToggle } from '@/components/deal/FlexPublishToggle';
import { useLatestFlexSync } from '@/hooks/useFlexSyncHistory';
import { useFlexChangedFields } from '@/hooks/useFlexChangedFields';
import { useDealOwnership } from '@/hooks/useDealOwnership';
import { useDealSpaceAutoFill, ExtractedWriteUpField } from '@/hooks/useDealSpaceAutoFill';
import { useDealSpaceMemo, MEMO_SECTIONS } from '@/hooks/useDealSpaceMemo';
import { usePageAccessFlags } from '@/hooks/useFeatureFlags';
import { useDemoCapabilities } from '@/hooks/useDemoCapabilities';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import ReactMarkdown from 'react-markdown';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { AutoSaveStatus } from '@/hooks/useAutoSave';
import { WriteUpCompanyOverviewTab } from './writeup/WriteUpCompanyOverviewTab';
import { WriteUpFinancialTab } from './writeup/WriteUpFinancialTab';
import { WriteUpCompanyHighlightsTab } from './writeup/WriteUpCompanyHighlightsTab';
import { WriteUpKeyItemsTab } from './writeup/WriteUpKeyItemsTab';
import { WriteUpOwnershipTab } from './writeup/WriteUpOwnershipTab';
import { WriteUpAutoFillDialog } from './WriteUpAutoFillDialog';
import { coerceWriteUpFieldValue, normalizeDealWriteUpData } from '@/lib/writeUpFieldCoercion';
import { BrandedDocStudioDialog } from './BrandedDocStudioDialog';
import { WriteUpPreviewDialog } from './writeup/WriteUpPreviewDialog';
import { OverwriteProtectionDialog } from './writeup/OverwriteProtectionDialog';
import { UserEditedFieldWrapper } from './writeup/UserEditedFieldWrapper';
import { archiveApprovedWriteUp } from '@/lib/archiveWriteUp';
import { useAuth } from '@/contexts/AuthContext';
import { canUse5thLineProprietaryActions } from '@/lib/proprietaryAccess';

export interface KeyItem {
  id: string;
  title: string;
  description: string;
}

export interface CompanyHighlight {
  id: string;
  title: string;
  description: string;
}

export interface FinancialYear {
  id: string;
  year: string;
  revenue: string;
  gross_margin: string;
  ebitda: string;
}

export interface FinancialComment {
  id: string;
  title: string;
  description: string;
}

export interface TeamMember {
  id: string;
  name: string;
  title: string;
  linkedin: string;
}

export interface ExistingDebtItem {
  id: string;
  lender: string;
  amount: string; // formatted currency string e.g. "$3.00MM"
  type: string;
  maturityDate: string | null; // ISO yyyy-mm-dd or null
  notes: string;
}

export interface DealWriteUpData {
  companyName: string;
  companyUrl: string;
  linkedinUrl: string;
  industries: string[];
  location: string;
  yearFounded: string;
  customerBase: string[];
  headcount: string;
  dealTypes: string[];
  billingModels: string[];
  profitability: string;
  grossMargins: string;
  capitalAsk: string;
  financialDataAsOf: Date | null;
  accountingSystem: string;
  status: string;
  useOfFunds: string;
  existingDebtDetails: string;
  existingDebtItems: ExistingDebtItem[];
  existingDebtLegacyDismissed: boolean;
  description: string;
  keyItems: KeyItem[];
  companyHighlights: CompanyHighlight[];
  financialYears: FinancialYear[];
  financialComments: FinancialComment[];
  publishAsAnonymous: boolean;
  team: TeamMember[];
  visibleMetrics: VisibleMetrics;
  financialColumnVisibility: FinancialColumnVisibility;
}

export interface VisibleMetrics {
  yoy_growth: boolean;
  this_year_revenue: boolean;
  last_year_revenue: boolean;
  gross_margins: boolean;
}

export interface FinancialColumnVisibility {
  showRevGrowth: boolean;
  showGmDelta: boolean;
  showEbitdaDelta: boolean;
}

export interface DealDataForWriteUp {
  company?: string;
  dealTypes?: string[] | null;
  value?: number;
  narrative?: string | null;
  status?: string;
}

export const getEmptyDealWriteUpData = (deal?: DealDataForWriteUp): DealWriteUpData => ({
  companyName: deal?.company || '',
  companyUrl: '',
  linkedinUrl: '',
  industries: [],
  location: '',
  yearFounded: '',
  customerBase: [],
  headcount: '',
  dealTypes: deal?.dealTypes || [],
  billingModels: [],
  profitability: '',
  grossMargins: '',
  capitalAsk: deal?.value ? `$${deal.value.toLocaleString()}` : '',
  financialDataAsOf: null,
  accountingSystem: '',
  status: deal?.status === 'active' ? 'Published' : deal?.status === 'closed' ? 'Closed' : 'Draft',
  useOfFunds: '',
  existingDebtDetails: '',
  existingDebtItems: [],
  existingDebtLegacyDismissed: false,
  description: deal?.narrative || '',
  keyItems: [],
  companyHighlights: [],
  financialYears: [],
  financialComments: [],
  publishAsAnonymous: false,
  team: [],
  visibleMetrics: { yoy_growth: true, this_year_revenue: true, last_year_revenue: true, gross_margins: true },
  financialColumnVisibility: { showRevGrowth: true, showGmDelta: true, showEbitdaDelta: true },
});

interface DealWriteUpProps {
  dealId: string;
  data: DealWriteUpData;
  onChange: (data: DealWriteUpData) => void;
  onSave: () => void;
  onCancel: () => void;
  isSaving?: boolean;
  autoSaveStatus?: AutoSaveStatus;
  markFieldEdited?: (field: string) => void;
  isFieldEdited?: (field: string) => boolean;
  editedCount?: number;
  editedFieldKeys?: string[];
  resetAllEditFlags?: () => void;
}

const AutoSaveIndicator = ({ status }: { status: AutoSaveStatus }) => {
  if (status === 'idle') return null;

  return (
    <div className="flex items-center gap-1.5 text-xs">
      {status === 'pending' && (
        <>
          <Clock className="h-3 w-3 text-muted-foreground" />
          <span className="text-muted-foreground">Unsaved changes</span>
        </>
      )}
      {status === 'saving' && (
        <>
          <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
          <span className="text-muted-foreground">Saving...</span>
        </>
      )}
      {status === 'saved' && (
        <>
          <Check className="h-3 w-3 text-green-600" />
          <span className="text-green-600">Saved</span>
        </>
      )}
      {status === 'error' && (
        <>
          <AlertCircle className="h-3 w-3 text-destructive" />
          <span className="text-destructive">Save failed</span>
        </>
      )}
    </div>
  );
};


const LOCATION_OPTIONS = [
  'California',
  'New York',
  'Texas',
  'Florida',
  'Illinois',
  'Washington',
  'Massachusetts',
  'Colorado',
  'Other',
];

const DEAL_TYPE_OPTIONS = [
  'Growth Capital',
  'Acquisition',
  'Refinance',
  'Working Capital',
  'Bridge Loan',
  'Term Loan',
  'Other',
];

const BILLING_MODEL_OPTIONS = [
  'Subscription',
  'Transaction',
  'License',
  'Usage-based',
  'Hybrid',
  'Other',
];

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

const STATUS_OPTIONS = [
  'Draft',
  'Published',
  'Under Review',
  'Closed',
];

const WRITEUP_VIEW_MODE_KEY = 'deal-writeup-view-mode';

type ViewMode = 'tabs' | 'long';

export const DealWriteUp = ({ dealId, data: incomingData, onChange, onSave, onCancel, isSaving, autoSaveStatus = 'idle', markFieldEdited, isFieldEdited, editedCount = 0, editedFieldKeys = [], resetAllEditFlags }: DealWriteUpProps) => {
  // Defensive normalization: guarantees array-typed fields are always arrays
  // before any child renders. Prevents the entire write-up tree from
  // crashing when bad data (e.g. AI-extracted free-text in billingModels)
  // sneaks through.
  const data = useMemo(() => normalizeDealWriteUpData(incomingData), [incomingData]);
  const queryClient = useQueryClient();
  const { hasPageAccess } = usePageAccessFlags();
  const { user: currentUser } = useAuth();
  const { canPushFlex: demoCanPushFlex, canAiSync: demoCanAiSync, isDemoUser } = useDemoCapabilities();
  const canPushToFlex = hasPageAccess('flex_push') && demoCanPushFlex;
  // 5th Line proprietary actions: Auto-Fill, Generate AI Memo, and
  // Branded Document. Gated to the 5th Line company account at the UI
  // layer; the server-side handlers re-check the same gate.
  const isProprietaryUser = canUse5thLineProprietaryActions(currentUser);
  const canAutoFill =
    isProprietaryUser && hasPageAccess('autofill_deal_space') && demoCanAiSync;
  const canGenerateMemo =
    isProprietaryUser && hasPageAccess('generate_ai_memo') && demoCanAiSync;
  const canUseBrandedDocument = isProprietaryUser;
  const [isPushingToFlex, setIsPushingToFlex] = useState(false);
  const [isUnpublishing, setIsUnpublishing] = useState(false);
  const [isRepublishing, setIsRepublishing] = useState(false);
  const [isPendingPublish, setIsPendingPublish] = useState(false);
  const [publishCountdown, setPublishCountdown] = useState(0);
  const [showFlexConfirmDialog, setShowFlexConfirmDialog] = useState(false);
  const [showPreviewDialog, setShowPreviewDialog] = useState(false);
  const [showUnpublishDialog, setShowUnpublishDialog] = useState(false);
  const [showEmptyFieldsWarning, setShowEmptyFieldsWarning] = useState(false);
  const publishTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const countdownIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const pendingPublishToastIdRef = useRef<string | number | null>(null);
  const { data: latestSync } = useLatestFlexSync(dealId);
  const { owners, totalEquityRaised } = useDealOwnership(dealId);
  
  // Fetch deal manager from deals table and subscribe to changes
  const [dealManager, setDealManager] = useState<string>('');
  useEffect(() => {
    const fetchManager = async () => {
      const { data: dealRow } = await supabase.from('deals').select('manager').eq('id', dealId).single();
      if (dealRow?.manager) setDealManager(dealRow.manager);
    };
    fetchManager();
    
    const channel = supabase.channel(`deal-manager-${dealId}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'deals', filter: `id=eq.${dealId}` }, (payload) => {
        if (payload.new?.manager !== undefined) {
          setDealManager(payload.new.manager || '');
        }
      })
      .subscribe();
    
    return () => { supabase.removeChannel(channel); };
  }, [dealId]);

  // Fetch company-level disclaimer
  const [companyDisclaimer, setCompanyDisclaimer] = useState('');
  useEffect(() => {
    (async () => {
      const { data: dealRow } = await supabase.from('deals').select('company_id').eq('id', dealId).single();
      if (!dealRow?.company_id) return;
      const { data: settings } = await supabase
        .from('company_settings')
        .select('disclaimer')
        .eq('company_id', dealRow.company_id)
        .maybeSingle();
      setCompanyDisclaimer((settings as any)?.disclaimer || '');
    })();
  }, [dealId]);
  
  // Auto-fill from Deal Space
  const { isExtracting, extractedFields, extractWriteUpData, clearExtractedFields } = useDealSpaceAutoFill(dealId);
  const [showAutoFillDialog, setShowAutoFillDialog] = useState(false);
  const [autoFilledFields, setAutoFilledFields] = useState<Set<string>>(new Set());
  const [autoFillFailedFields, setAutoFillFailedFields] = useState<string[]>([]);
  const [autoFillDocumentCount, setAutoFillDocumentCount] = useState(0);
  const [autoFillSourceCount, setAutoFillSourceCount] = useState(0);
  // Store citations per field for persistent display
  const [fieldCitations, setFieldCitations] = useState<Record<string, any[]>>({});

  // AI Memo generation
  const { isGenerating: isMemoGenerating, isRegenerating, memoContent, memoSections, generateFullMemo, regenerateSection } = useDealSpaceMemo(dealId);
  const [showMemoDialog, setShowMemoDialog] = useState(false);
  const [showBrandedStudio, setShowBrandedStudio] = useState(false);

  // Generate Complete Write-Up (single primary action)
  const [isGeneratingComplete, setIsGeneratingComplete] = useState(false);
  const [aiPopulated, setAiPopulated] = useState(false);
  const [draftGeneratedAt, setDraftGeneratedAt] = useState<Date | null>(null);
  const [isDraftApproved, setIsDraftApproved] = useState(false);
  const [isApprovingDraft, setIsApprovingDraft] = useState(false);
  const [approvedVersion, setApprovedVersion] = useState<number | null>(null);
  
  // Overwrite protection
  const [showOverwriteDialog, setShowOverwriteDialog] = useState(false);
  const [pendingAutoFillAction, setPendingAutoFillAction] = useState<(() => void) | null>(null);
  
  // View mode state: 'tabs', 'long', or 'carousel'
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    try {
      const saved = localStorage.getItem(WRITEUP_VIEW_MODE_KEY) as ViewMode | null;
      if (saved === 'long') return saved;
      return 'tabs';
    } catch {
      return 'tabs';
    }
  });

  // Persist view mode to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(WRITEUP_VIEW_MODE_KEY, viewMode);
    } catch {
      // Ignore storage errors
    }
  }, [viewMode]);

  
  // Check if currently published on FLEx
  const isPublishedOnFlex = latestSync?.status === 'success';
  // Check if deal was unpublished (can be re-published)
  const isUnpublishedFromFlex = latestSync?.status === 'unpublished';

  // Track fields changed since last FLEx sync
  const changedFields = useFlexChangedFields(data, latestSync, isPublishedOnFlex);

  // Detect empty fields across all tabs for FLEx warning
  const emptyFields = useMemo(() => {
    const fields: { section: string; field: string }[] = [];
    
    // Company Overview section
    if (!data.companyName?.trim()) fields.push({ section: 'Company Overview', field: 'Company Name' });
    if (!data.companyUrl?.trim()) fields.push({ section: 'Company Overview', field: 'Company Website' });
    if (!data.industries || data.industries.length === 0) fields.push({ section: 'Company Overview', field: 'Industry' });
    if (!data.location?.trim()) fields.push({ section: 'Company Overview', field: 'Location' });
    if (!data.yearFounded?.trim()) fields.push({ section: 'Company Overview', field: 'Year Founded' });
    if (!data.headcount?.trim()) fields.push({ section: 'Company Overview', field: 'Headcount' });
    if (!data.dealTypes || data.dealTypes.length === 0) fields.push({ section: 'Company Overview', field: 'Deal Type' });
    if (!data.capitalAsk?.trim()) fields.push({ section: 'Company Overview', field: 'Capital Ask' });
    if (!data.description?.trim()) fields.push({ section: 'Company Overview', field: 'Description' });
    if (!data.useOfFunds?.trim()) fields.push({ section: 'Company Overview', field: 'Use of Funds' });
    
    // Financial section
    if (!data.billingModels || data.billingModels.length === 0) fields.push({ section: 'Financial', field: 'Billing Model' });
    if (!data.profitability?.trim()) fields.push({ section: 'Financial', field: 'Profitability' });
    if (!data.grossMargins?.trim()) fields.push({ section: 'Financial', field: 'Gross Margins' });
    if (!data.financialDataAsOf) fields.push({ section: 'Financial', field: 'Financial Data As Of' });
    if (!data.accountingSystem?.trim()) fields.push({ section: 'Financial', field: 'Accounting System' });
    if (!data.financialYears || data.financialYears.length === 0) fields.push({ section: 'Financial', field: 'Financial Years Data' });
    
    // Company Highlights section
    if (!data.companyHighlights || data.companyHighlights.length === 0) fields.push({ section: 'Company Highlights', field: 'Company Highlights' });
    
    // Key Items section
    if (!data.keyItems || data.keyItems.length === 0) fields.push({ section: 'Key Items', field: 'Key Items' });
    
    // Ownership section (check via owners from hook)
    if (!owners || owners.length === 0) fields.push({ section: 'Ownership', field: 'Ownership / Cap Table' });
    if (!totalEquityRaised?.trim()) fields.push({ section: 'Ownership', field: 'Total Equity Raised' });
    
    return fields;
  }, [data, owners, totalEquityRaised]);

  // Group empty fields by section for display
  const emptyFieldsBySection = useMemo(() => {
    const grouped: Record<string, string[]> = {};
    for (const { section, field } of emptyFields) {
      if (!grouped[section]) grouped[section] = [];
      grouped[section].push(field);
    }
    return grouped;
  }, [emptyFields]);

  const handleFlexButtonClick = () => {
    if (emptyFields.length > 0) {
      setShowEmptyFieldsWarning(true);
    } else {
      setShowFlexConfirmDialog(true);
    }
  };

  const handleProceedWithEmptyFields = () => {
    setShowEmptyFieldsWarning(false);
    setShowFlexConfirmDialog(true);
  };

  const updateField = <K extends keyof DealWriteUpData>(field: K, value: DealWriteUpData[K]) => {
    markFieldEdited?.(field as string);
    onChange({ ...data, [field]: value });
  };

  // Format currency value (e.g., "2500000" -> "$2,500,000" or "2.5M" -> "$2.5M")
  const formatCurrency = (value: string): string => {
    if (!value) return '';
    // If already formatted with $, just return it
    if (value.startsWith('$')) return value;
    // Try to parse as number and format
    const numericValue = value.replace(/[^0-9.]/g, '');
    if (numericValue && !isNaN(parseFloat(numericValue))) {
      const num = parseFloat(numericValue);
      // Check if original had M/K suffix
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

  // Format percentage value (e.g., "75" -> "75%")
  const formatPercentage = (value: string): string => {
    if (!value) return '';
    // If already has %, return it
    if (value.includes('%')) return value;
    // Try to parse and format
    const numericValue = value.replace(/[^0-9.]/g, '');
    if (numericValue && !isNaN(parseFloat(numericValue))) {
      return `${numericValue}%`;
    }
    return value;
  };

  // Parse currency string to numeric value (e.g., "$24.72MM" -> 24720000)
  const parseCurrencyToNumber = (value: string): number | null => {
    if (!value) return null;
    const cleanValue = value.replace(/[$,\s]/g, '').toUpperCase();
    const numericMatch = cleanValue.match(/^(-?\(?)(\d+\.?\d*)(MM|M|K|B)?\)?$/);
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

  // Parse year string to numeric value (e.g., "2024", "FY2024", "2024E" -> 2024)
  const parseYearToNumber = (yearStr: string): number | null => {
    if (!yearStr) return null;
    const match = yearStr.match(/(\d{4})/);
    return match ? parseInt(match[1], 10) : null;
  };

  // Calculate YoY revenue growth for a given row based on actual year values
  const calculateRevenueGrowth = (index: number): string | null => {
    if (data.financialYears.length < 2) return null;
    
    const currentRow = data.financialYears[index];
    const currentYear = parseYearToNumber(currentRow.year);
    
    if (currentYear === null) return null;
    
    // Find the row with the previous year (currentYear - 1)
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

  const getWriteUpPayload = () => ({
    companyName: data.companyName,
    companyUrl: data.companyUrl,
    linkedinUrl: data.linkedinUrl,
    industry: data.industries.join(', '),
    location: data.location,
    yearFounded: data.yearFounded,
    customerBase: data.customerBase?.join(', ') || '',
    headcount: data.headcount,
    dealType: data.dealTypes.join(', '),
    billingModel: data.billingModels.join(', '),
    profitability: data.profitability,
    grossMargins: data.grossMargins,
    capitalAsk: data.capitalAsk,
    financialDataAsOf: data.financialDataAsOf?.toISOString() || null,
    accountingSystem: data.accountingSystem,
    status: data.status,
    useOfFunds: data.useOfFunds,
    existingDebtDetails: data.existingDebtDetails,
    description: data.description,
    keyItems: data.keyItems,
    companyHighlights: data.companyHighlights,
    financialYears: data.financialYears,
    financialComments: data.financialComments,
    ownership: owners,
    totalEquityRaised: totalEquityRaised,
    publishAsAnonymous: data.publishAsAnonymous,
    team: data.team.filter(m => m.name.trim()).map(m => ({
      name: m.name,
      title: m.title,
      linkedin: m.linkedin || undefined,
    })),
    visibleMetrics: data.visibleMetrics,
  });

  const cancelPendingPublish = () => {
    if (publishTimeoutRef.current) {
      clearTimeout(publishTimeoutRef.current);
      publishTimeoutRef.current = null;
    }
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }
    if (pendingPublishToastIdRef.current) {
      toast.dismiss(pendingPublishToastIdRef.current);
      pendingPublishToastIdRef.current = null;
    }
    setIsPendingPublish(false);
    setPublishCountdown(0);
    setIsPushingToFlex(false);
    toast.info('Publish to FLEx cancelled');
  };

  const executePublishToFlex = async () => {
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        toast.error('You must be logged in to push to FLEx');
        return;
      }

      const writeUpPayload = getWriteUpPayload();

      const { data: result, error } = await supabase.functions.invoke('push-to-flex', {
        body: { dealId, writeUpData: writeUpPayload },
      });

      if (error) {
        console.error('Push to FLEx error:', error);
        toast.error('Failed to push to FLEx', {
          description: error.message || 'Please try again later',
        });
        return;
      }

      // Invalidate sync history cache
      await queryClient.invalidateQueries({ queryKey: ['flex-sync-history', dealId] });
      await queryClient.invalidateQueries({ queryKey: ['flex-sync-latest', dealId] });

      toast.success('Deal pushed to FLEx successfully', {
        description: 'The deal data has been synced with FLEx',
        duration: 5000,
        action: {
          label: 'Undo',
          onClick: async () => {
            try {
              const { error: undoError } = await supabase.functions.invoke('push-to-flex', {
                body: { dealId, action: 'unpublish' },
              });
              
              if (undoError) {
                toast.error('Failed to undo publish');
                return;
              }
              
              await queryClient.invalidateQueries({ queryKey: ['flex-sync-history', dealId] });
              await queryClient.invalidateQueries({ queryKey: ['flex-sync-latest', dealId] });
              toast.success('Publish undone', { description: 'Deal has been unpublished from FLEx' });
            } catch {
              toast.error('Failed to undo publish');
            }
          },
        },
      });
    } catch (error) {
      console.error('Push to FLEx error:', error);
      toast.error('Failed to push to FLEx', {
        description: error instanceof Error ? error.message : 'An unexpected error occurred',
      });
    } finally {
      setIsPushingToFlex(false);
      setIsPendingPublish(false);
      setPublishCountdown(0);
    }
  };

  const handlePushToFlex = async () => {
    if (isPushingToFlex || isPendingPublish) return;
    
    setIsPushingToFlex(true);
    setShowFlexConfirmDialog(false);
    
    try {
      // First save any pending changes
      await onSave();
      
      // Start the 7-second countdown
      const DELAY_SECONDS = 7;
      const TOTAL_MS = DELAY_SECONDS * 1000;
      const startTime = Date.now();
      setIsPendingPublish(true);
      setPublishCountdown(DELAY_SECONDS);
      
      const renderToastContent = (remaining: number, progress: number) => () => (
        <div className="flex flex-col gap-2 w-full min-w-[280px] p-4 bg-background border rounded-lg shadow-lg">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
              <span className="font-medium text-sm">Publishing to FLEx in {remaining}s</span>
            </div>
            <button
              onClick={cancelPendingPublish}
              className="text-xs font-medium px-2 py-1 rounded bg-muted hover:bg-muted/80 transition-colors"
            >
              Cancel
            </button>
          </div>
          <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
            <div 
              className="h-full transition-all duration-100 ease-linear rounded-full"
              style={{ 
                width: `${progress}%`,
                background: `linear-gradient(90deg, hsl(45, 93%, 47%) 0%, hsl(85, 70%, 45%) 50%, hsl(142, 71%, 45%) 100%)`
              }}
            />
          </div>
        </div>
      );
      
      // Show pending toast with progress bar
      pendingPublishToastIdRef.current = toast.custom(
        renderToastContent(DELAY_SECONDS, 0),
        { duration: Infinity }
      );

      // Update countdown and progress every 100ms for smooth animation
      countdownIntervalRef.current = setInterval(() => {
        const elapsed = Date.now() - startTime;
        const remaining = Math.max(0, Math.ceil((TOTAL_MS - elapsed) / 1000));
        const progress = Math.min(100, (elapsed / TOTAL_MS) * 100);
        
        setPublishCountdown(remaining);
        
        if (pendingPublishToastIdRef.current && remaining > 0) {
          toast.custom(
            renderToastContent(remaining, progress),
            { id: pendingPublishToastIdRef.current, duration: Infinity }
          );
        }
      }, 100);

      // Schedule the actual publish
      publishTimeoutRef.current = setTimeout(async () => {
        if (countdownIntervalRef.current) {
          clearInterval(countdownIntervalRef.current);
          countdownIntervalRef.current = null;
        }
        if (pendingPublishToastIdRef.current) {
          toast.dismiss(pendingPublishToastIdRef.current);
          pendingPublishToastIdRef.current = null;
        }
        await executePublishToFlex();
      }, DELAY_SECONDS * 1000);
      
    } catch (error) {
      console.error('Push to FLEx error:', error);
      toast.error('Failed to push to FLEx', {
        description: error instanceof Error ? error.message : 'An unexpected error occurred',
      });
      setIsPushingToFlex(false);
      setIsPendingPublish(false);
    }
  };

  const handleUnpublishFromFlex = async () => {
    if (isUnpublishing) return;
    
    setIsUnpublishing(true);
    setShowUnpublishDialog(false);
    
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        toast.error('You must be logged in to unpublish from FLEx');
        return;
      }

      const { data: result, error } = await supabase.functions.invoke('push-to-flex', {
        body: { dealId, action: 'unpublish' },
      });

      if (error) {
        console.error('Unpublish from FLEx error:', error);
        toast.error('Failed to unpublish from FLEx', {
          description: error.message || 'Please try again later',
        });
        return;
      }

      // Invalidate sync history cache
      await queryClient.invalidateQueries({ queryKey: ['flex-sync-history', dealId] });
      await queryClient.invalidateQueries({ queryKey: ['flex-sync-latest', dealId] });

      toast.success('Deal unpublished from FLEx', {
        description: 'The deal has been removed from FLEx',
      });
    } catch (error) {
      console.error('Unpublish from FLEx error:', error);
      toast.error('Failed to unpublish from FLEx', {
        description: error instanceof Error ? error.message : 'An unexpected error occurred',
      });
    } finally {
      setIsUnpublishing(false);
    }
  };

  const handleRepublishToFlex = async () => {
    if (isRepublishing) return;
    
    setIsRepublishing(true);
    
    try {
      // First save any pending changes
      await onSave();
      
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        toast.error('You must be logged in to re-publish to FLEx');
        return;
      }

      const writeUpPayload = getWriteUpPayload();

      const { data: result, error } = await supabase.functions.invoke('push-to-flex', {
        body: { dealId, writeUpData: writeUpPayload },
      });

      if (error) {
        console.error('Re-publish to FLEx error:', error);
        toast.error('Failed to re-publish to FLEx', {
          description: error.message || 'Please try again later',
        });
        return;
      }

      // Invalidate sync history cache
      await queryClient.invalidateQueries({ queryKey: ['flex-sync-history', dealId] });
      await queryClient.invalidateQueries({ queryKey: ['flex-sync-latest', dealId] });

      toast.success('Deal re-published to FLEx', {
        description: 'The deal is now live on FLEx again',
        duration: 5000,
        action: {
          label: 'Undo',
          onClick: async () => {
            try {
              const { error: undoError } = await supabase.functions.invoke('push-to-flex', {
                body: { dealId, action: 'unpublish' },
              });
              
              if (undoError) {
                toast.error('Failed to undo re-publish');
                return;
              }
              
              await queryClient.invalidateQueries({ queryKey: ['flex-sync-history', dealId] });
              await queryClient.invalidateQueries({ queryKey: ['flex-sync-latest', dealId] });
              toast.success('Re-publish undone', { description: 'Deal has been unpublished from FLEx' });
            } catch {
              toast.error('Failed to undo re-publish');
            }
          },
        },
      });
    } catch (error) {
      console.error('Re-publish to FLEx error:', error);
      toast.error('Failed to re-publish to FLEx', {
        description: error instanceof Error ? error.message : 'An unexpected error occurred',
      });
    } finally {
      setIsRepublishing(false);
    }
  };

  const DataPreviewRow = ({ label, value }: { label: string; value: string | null | undefined }) => {
    if (!value) return null;
    return (
      <div
        className="grid gap-3 py-1.5 border-b border-border/50 last:border-0 sm:grid-cols-[minmax(140px,220px)_minmax(0,1fr)] min-w-0"
      >
        <span className="text-muted-foreground text-sm min-w-0">{label}</span>
        <span
          className="text-sm font-medium min-w-0 max-w-full sm:text-right"
          style={{ overflowWrap: 'anywhere', wordBreak: 'break-word' }}
        >
          {value}
        </span>
      </div>
    );
  };

  const addKeyItem = () => {
    const newItem: KeyItem = {
      id: crypto.randomUUID(),
      title: '',
      description: '',
    };
    updateField('keyItems', [...data.keyItems, newItem]);
  };

  const updateKeyItem = (id: string, field: 'title' | 'description', value: string) => {
    updateField(
      'keyItems',
      data.keyItems.map(item => 
        item.id === id ? { ...item, [field]: value } : item
      )
    );
  };

  const deleteKeyItem = (id: string) => {
    updateField('keyItems', data.keyItems.filter(item => item.id !== id));
  };

  const addCompanyHighlight = () => {
    const newHighlight: CompanyHighlight = {
      id: crypto.randomUUID(),
      title: '',
      description: '',
    };
    updateField('companyHighlights', [...data.companyHighlights, newHighlight]);
  };

  const updateCompanyHighlight = (id: string, field: 'title' | 'description', value: string) => {
    updateField(
      'companyHighlights',
      data.companyHighlights.map(item => 
        item.id === id ? { ...item, [field]: value } : item
      )
    );
  };

  const deleteCompanyHighlight = (id: string) => {
    updateField('companyHighlights', data.companyHighlights.filter(item => item.id !== id));
  };

  // Sort financial years chronologically by year value
  const sortFinancialYearsChronologically = (years: FinancialYear[]): FinancialYear[] => {
    return [...years].sort((a, b) => {
      // Parse year values - handle formats like "2023", "FY2023", "2023E", etc.
      const parseYear = (yearStr: string): number => {
        if (!yearStr) return Infinity; // Empty years go to the end
        const match = yearStr.match(/(\d{4})/);
        return match ? parseInt(match[1], 10) : Infinity;
      };
      return parseYear(b.year) - parseYear(a.year);
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
    // Add new year and sort (empty years will go to end)
    updateField('financialYears', sortFinancialYearsChronologically([...data.financialYears, newYear]));
  };

  const updateFinancialYear = (id: string, field: keyof Omit<FinancialYear, 'id'>, value: string) => {
    const updatedYears = data.financialYears.map(item => 
      item.id === id ? { ...item, [field]: value } : item
    );
    // Re-sort when year field is updated
    if (field === 'year') {
      updateField('financialYears', sortFinancialYearsChronologically(updatedYears));
    } else {
      updateField('financialYears', updatedYears);
    }
  };

  const deleteFinancialYear = (id: string) => {
    updateField('financialYears', data.financialYears.filter(item => item.id !== id));
  };

  // Auto-fill handlers
  const handleAutoFillClick = async () => {
    const result = await extractWriteUpData();
    if (result && result.extractedFields.length > 0) {
      setAutoFillDocumentCount(result.documentCount);
      setAutoFillSourceCount(result.sourceCount);
      setShowAutoFillDialog(true);
    } else if (result) {
      toast.info('No extractable data found in Deal Space');
    }
  };

  const applyAutoFillFields = (selectedFields: ExtractedWriteUpField[], skipEdited: boolean) => {
    const newData = { ...data };
    const appliedFieldNames = new Set<string>();
    const citations: Record<string, any[]> = {};
    const failedFields: string[] = [];

    for (const field of selectedFields) {
      const fieldName = field.field as keyof DealWriteUpData;
      // Skip user-edited fields if requested
      if (skipEdited && isFieldEdited?.(fieldName)) continue;
      if (!(fieldName in newData)) continue;
      try {
        const coerced = coerceWriteUpFieldValue(fieldName, field.value);
        (newData as Record<string, unknown>)[fieldName] = coerced;
        appliedFieldNames.add(fieldName);
        if ((field as any).sources && (field as any).sources.length > 0) {
          citations[fieldName] = (field as any).sources;
        }
      } catch (err) {
        console.error(`[Auto-fill] Failed to apply field "${fieldName}":`, err);
        failedFields.push(fieldName);
      }
    }

    if (!skipEdited) {
      // "Overwrite all" resets edit flags
      resetAllEditFlags?.();
    }

    onChange(newData);
    setAutoFilledFields(appliedFieldNames);
    setFieldCitations(prev => ({ ...prev, ...citations }));

    if (failedFields.length === 0) {
      clearExtractedFields();
      setAutoFillFailedFields([]);
      toast.success(`Auto-filled ${appliedFieldNames.size} field${appliedFieldNames.size !== 1 ? 's' : ''}`, {
        description: skipEdited && editedCount > 0
          ? `Skipped ${editedCount} manually edited field${editedCount !== 1 ? 's' : ''}`
          : 'Review the highlighted fields — hover citation chips to see sources',
      });
    } else {
      // Keep the dialog open so the user can see inline warnings on failed cards.
      setAutoFillFailedFields(failedFields);
      toast.warning(
        `Applied ${appliedFieldNames.size} field${appliedFieldNames.size !== 1 ? 's' : ''} — ${failedFields.length} need manual selection`,
        { description: failedFields.join(', ') },
      );
    }
    return failedFields;
  };

  const handleApplyAutoFill = (selectedFields: ExtractedWriteUpField[]) => {
    // Check if any selected fields are user-edited
    const editedIncoming = selectedFields.filter(f => isFieldEdited?.(f.field as string));
    
    if (editedIncoming.length > 0) {
      // Show overwrite protection dialog
      setPendingAutoFillAction(() => () => applyAutoFillFields(selectedFields, false));
      setShowOverwriteDialog(true);
      // Store fields for "keep edits" path
      (window as any).__pendingAutoFillFields = selectedFields;
      return [] as string[];
    } else {
      return applyAutoFillFields(selectedFields, false);
    }
  };

  // Build a "Lender Market Update" markdown block from the live deal_lenders
  // table — same source the Funding Source Pipeline Snapshot uses. Buckets lenders
  // into Active / In Review / Passed groups so the AI draft mirrors the
  // Status Report's lender summary.
  const buildLenderMarketUpdate = async (): Promise<string> => {
    try {
      const { data: rows } = await supabase
        .from('deal_lenders')
        .select('name, stage, tracking_status, pass_reason, notes')
        .eq('deal_id', dealId);
      const lenders = (rows || []) as any[];
      if (lenders.length === 0) return 'No funding sources have been added to this deal yet.';
      const passed = lenders.filter(l => /pass/i.test(l.stage || '') || /pass/i.test(l.tracking_status || ''));
      const inReview = lenders.filter(l => !passed.includes(l) && /(review|terms|diligence)/i.test(l.stage || ''));
      const active = lenders.filter(l => !passed.includes(l) && !inReview.includes(l));
      const fmt = (label: string, list: any[]) =>
        `**${label} (${list.length})**\n` +
        (list.length
          ? list
              .map(
                (l) =>
                  `- ${l.name}${l.stage ? ` — ${l.stage}` : ''}${
                    l.pass_reason ? ` (Pass reason: ${l.pass_reason})` : ''
                  }`,
              )
              .join('\n')
          : '- None');
      return [fmt('Active / On Deck', active), fmt('In Review', inReview), fmt('Passed', passed)].join('\n\n');
    } catch (e) {
      console.error('buildLenderMarketUpdate failed', e);
      return 'Lender pipeline data unavailable.';
    }
  };

  // Marker prefix used to identify AI-generated commentary/key-item entries
  // so regenerating replaces (rather than duplicates) them in-place inside
  // the existing template fields.
  const AI_DRAFT_TAG = '[AI Draft] ';

  /**
   * Map the generated narrative sections into the *existing* Deal Write-Up
   * template fields (Company Overview description, Use of Funds, Financial
   * Commentary entries, Key Items). No separate draft container — the user
   * reviews and edits each section in its real home in the form.
   */
  const populateTemplateFromDraft = (
    sectionsByKey: Record<string, string>,
    fallbackContent: string,
    lenderMarketUpdate: string,
  ): number => {
    const get = (k: string) => (sectionsByKey[k] || '').trim();
    const exec = get('executive_overview') || fallbackContent.slice(0, 800);
    const overview =
      get('facility_overview') ||
      [data.companyName, data.location, data.industries?.join(', ')]
        .filter(Boolean)
        .join(' • ');
    const financialProfile = get('financial_profile');
    const uop =
      (get('facility_overview').match(/use of proceeds[\s\S]*/i)?.[0] || '').trim() ||
      (data.capitalAsk ? `Capital ask: ${data.capitalAsk}` : '');
    const keyRisks = get('key_risks');
    const commentary = get('recommendation');

    const next: DealWriteUpData = { ...data } as DealWriteUpData;
    let touched = 0;

    // Company Overview field — combine Executive Summary (lead) + Overview
    const composedOverview = [
      exec ? `Executive Summary\n${exec}` : '',
      overview ? `Company Overview\n${overview}` : '',
    ].filter(Boolean).join('\n\n');
    if (composedOverview && composedOverview !== (next.description || '').trim()) {
      (next as any).description = composedOverview;
      touched++;
    }

    // Use of Funds / Use of Proceeds
    if (uop && uop !== (next.useOfFunds || '').trim()) {
      (next as any).useOfFunds = uop;
      touched++;
    }

    // Helper: upsert a titled entry into a list field, replacing any prior
    // AI Draft entry with the same canonical title so regen stays clean.
    const upsertCommented = (
      list: Array<{ id: string; title: string; description: string }>,
      title: string,
      content: string,
    ) => {
      if (!content) return list;
      const taggedTitle = `${AI_DRAFT_TAG}${title}`;
      const existingIdx = list.findIndex(i => i.title === taggedTitle);
      if (existingIdx >= 0) {
        const copy = [...list];
        copy[existingIdx] = { ...copy[existingIdx], description: content };
        return copy;
      }
      return [
        ...list,
        { id: crypto.randomUUID(), title: taggedTitle, description: content },
      ];
    };

    let financialComments = next.financialComments || [];
    const beforeFC = financialComments;
    financialComments = upsertCommented(financialComments, 'Financial Profile', financialProfile);
    financialComments = upsertCommented(financialComments, 'Lender Market Update', lenderMarketUpdate);
    financialComments = upsertCommented(financialComments, '5th Line Commentary', commentary);
    if (financialComments !== beforeFC) {
      (next as any).financialComments = financialComments;
      touched++;
    }

    let keyItems = next.keyItems || [];
    const beforeKI = keyItems;
    keyItems = upsertCommented(keyItems as any, 'Key Risks / Mitigants', keyRisks) as any;
    if (keyItems !== beforeKI) {
      (next as any).keyItems = keyItems;
      touched++;
    }

    if (touched > 0) onChange(next);
    return touched;
  };

  const handleGenerateCompleteWriteUp = async () => {
    setIsGeneratingComplete(true);
    setIsDraftApproved(false);
    setApprovedVersion(null);
    try {
      // 1. Auto-fill all extractable fields from every source
      const extract = await extractWriteUpData();
      if (extract && extract.extractedFields.length > 0) {
        applyAutoFillFields(extract.extractedFields, true);
      }
      // 2. Generate AI memo narrative (also pulls from Deal Space + DR)
      const memo = await generateFullMemo();
      // 3. Pull live lender pipeline for the market update
      const lenderMarketUpdate = await buildLenderMarketUpdate();
      // 4. Write each generated section directly into the existing template
      //    fields (Company Overview, Use of Funds, Financial Commentary, Key
      //    Items). Nothing is exported or archived until the user approves.
      const touched = populateTemplateFromDraft(
        memo?.sections || {},
        memo?.content || '',
        lenderMarketUpdate,
      );
      setAiPopulated(touched > 0);
      setDraftGeneratedAt(new Date());
      toast.success('Write-up populated from AI', {
        description:
          touched > 0
            ? `Updated ${touched} template section${touched === 1 ? '' : 's'}. Review and approve when ready.`
            : 'No new content was generated.',
      });
    } catch (err) {
      console.error('Generate Complete Write-Up failed', err);
      toast.error('Could not generate complete write-up');
    } finally {
      setIsGeneratingComplete(false);
    }
  };

  // Build the archival HTML directly from the live template fields so the
  // approved/archived version always reflects what the user actually sees.
  const buildWriteUpHtmlFromTemplate = (): string => {
    const esc = (s: string) =>
      (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const block = (title: string, body: string) =>
      body
        ? `<section style="margin:0 0 24px 0;"><h2 style="font-size:16px;margin:0 0 8px 0;">${esc(title)}</h2><div style="white-space:pre-wrap;font-size:13px;line-height:1.55;">${esc(body)}</div></section>`
        : '';
    const parts: string[] = [];
    parts.push(block('Company Overview', data.description || ''));
    parts.push(block('Use of Funds', data.useOfFunds || ''));
    (data.financialComments || []).forEach(c => {
      const t = (c.title || '').replace(AI_DRAFT_TAG, '');
      parts.push(block(t || 'Commentary', c.description || ''));
    });
    (data.keyItems || []).forEach(c => {
      const t = (c.title || '').replace(AI_DRAFT_TAG, '');
      parts.push(block(t || 'Key Item', c.description || ''));
    });
    return parts.filter(Boolean).join('\n');
  };

  const handleApproveDraft = async () => {
    setIsApprovingDraft(true);
    try {
      const html = buildWriteUpHtmlFromTemplate();
      const res = await archiveApprovedWriteUp({
        dealId,
        dealName: data.companyName || null,
        companyName: data.companyName || null,
        html,
        title: `Write-Up — ${data.companyName || 'Deal'}`,
      });
      if (res.ok) {
        setIsDraftApproved(true);
        setApprovedVersion(res.version ?? null);
        toast.success(`Approved & archived to Data Room (v${res.version ?? '?'} )`);
        // Open the branded document studio so the approved draft can be exported
        setShowBrandedStudio(true);
      } else {
        toast.error('Approval failed — could not archive to Data Room');
      }
    } finally {
      setIsApprovingDraft(false);
    }
  };

  return (
    <Card className="w-full max-w-full">
      <CardHeader>
        <div className="flex items-center justify-between gap-4 min-w-0">
          <div className="min-w-0 flex items-center gap-3">
            <CardTitle>Deal Write Up</CardTitle>
            <Badge variant="outline" className="shrink-0 h-5 px-1.5 text-[10px] font-medium uppercase tracking-wide border-amber-400/40 text-amber-300 bg-amber-400/10">
              Beta
            </Badge>
            {canPushToFlex && (
            <Badge 
              variant={isPublishedOnFlex ? 'green' : data.status === 'Closed' ? 'gray' : 'amber'}
              className="shrink-0"
            >
              {isPublishedOnFlex ? 'Published' : data.status === 'Closed' ? 'Closed' : 'Draft'}
            </Badge>
            )}
            <CardDescription className="hidden sm:block">Create, edit, and manage deal listings</CardDescription>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            {canPushToFlex && <FlexPublishToggle dealId={dealId} />}
            <Button 
              variant="outline"
              size="sm"
              onClick={() => setShowPreviewDialog(true)}
            >
              <Eye className="h-4 w-4 mr-2" />
              Preview
            </Button>
            {canPushToFlex && <FlexSyncStatusBadge dealId={dealId} />}
            <AutoSaveIndicator status={autoSaveStatus} />
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6 min-w-0">
        {/* FLEx Sync History */}
        {canPushToFlex && <FlexSyncHistory dealId={dealId} />}
        
        {/* Edit Deal Section with Tabs or Long View */}
        <div className="border rounded-lg p-6 space-y-6 min-w-0">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <h3 className="text-lg font-semibold">Edit Deal</h3>
              {(canAutoFill || canGenerateMemo || canUseBrandedDocument) && (
                <TooltipProvider>
                  <div className="flex items-center gap-2">
                    {/* Primary unified action */}
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="default"
                          size="sm"
                          onClick={handleGenerateCompleteWriteUp}
                          disabled={
                            isGeneratingComplete || isExtracting || isMemoGenerating
                          }
                          className="gap-2"
                        >
                          {isGeneratingComplete || isExtracting || isMemoGenerating ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Wand2 className="h-4 w-4" />
                          )}
                          Generate Complete Write-Up
                          <Sparkles className="h-3.5 w-3.5" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent className="max-w-[280px]">
                        <p className="font-semibold">Run all three tools in sequence</p>
                        <p className="text-[11px] opacity-80 mt-1">
                          Auto-fills every form field from Deal Space, Data Room,
                          lender notes &amp; checklist, then drafts an editable AI
                          narrative. Nothing is exported until you approve.
                        </p>
                      </TooltipContent>
                    </Tooltip>

                    {/* Secondary icon-only tools */}
                    <div className="flex items-center gap-1 border-l border-border/40 pl-2 ml-1">
                      {canAutoFill && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={handleAutoFillClick}
                              disabled={isExtracting}
                              aria-label="Auto-Fill from Deal Space"
                            >
                              {isExtracting ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Database className="h-4 w-4 text-primary" />
                              )}
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Auto-Fill from Deal Space</TooltipContent>
                        </Tooltip>
                      )}
                      {canGenerateMemo && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={async () => {
                                const result = await generateFullMemo();
                                if (result && result.content) setShowMemoDialog(true);
                              }}
                              disabled={isMemoGenerating}
                              aria-label="Generate AI Memo"
                            >
                              {isMemoGenerating ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Sparkles className="h-4 w-4 text-primary" />
                              )}
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Generate AI Memo</TooltipContent>
                        </Tooltip>
                      )}
                      {canUseBrandedDocument && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => setShowBrandedStudio(true)}
                              aria-label="Branded Document"
                            >
                              <FileText className="h-4 w-4 text-primary" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Branded Document</TooltipContent>
                        </Tooltip>
                      )}
                    </div>
                  </div>
                </TooltipProvider>
              )}
              {autoFilledFields.size > 0 && (
                <Badge variant="secondary" className="gap-1 text-xs bg-primary/10 text-primary border-primary/20">
                  <Sparkles className="h-3 w-3" />
                  {autoFilledFields.size} field{autoFilledFields.size !== 1 ? 's' : ''} auto-filled
                </Badge>
              )}
            </div>
            <TooltipProvider>
              <ToggleGroup 
                type="single" 
                value={viewMode} 
                onValueChange={(value) => value && setViewMode(value as ViewMode)}
                className="border rounded-md"
              >
                <Tooltip>
                  <TooltipTrigger asChild>
                    <ToggleGroupItem value="tabs" aria-label="Tabbed view" size="sm">
                      <LayoutGrid className="h-4 w-4" />
                    </ToggleGroupItem>
                  </TooltipTrigger>
                  <TooltipContent>Tabbed view</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <ToggleGroupItem value="long" aria-label="Long form view" size="sm">
                      <LayoutList className="h-4 w-4" />
                    </ToggleGroupItem>
                  </TooltipTrigger>
                  <TooltipContent>Long form view</TooltipContent>
                </Tooltip>
              </ToggleGroup>
            </TooltipProvider>
          </div>

          {aiPopulated && (
            <div
              className={cn(
                'rounded-lg border p-3 flex items-start gap-3',
                isDraftApproved
                  ? 'border-emerald-500/30 bg-emerald-500/5'
                  : 'border-amber-500/30 bg-amber-500/5',
              )}
            >
              {isDraftApproved ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
              ) : (
                <Sparkles className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
              )}
              <div className="flex-1 min-w-0">
                <p className={cn('text-sm font-semibold', isDraftApproved ? 'text-emerald-500' : 'text-amber-500')}>
                  {isDraftApproved
                    ? `Approved write-up archived${approvedVersion ? ` (v${approvedVersion})` : ''}`
                    : 'AI populated the template — review and approve'}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {isDraftApproved
                    ? 'You can export a branded document or keep editing to create a new version.'
                    : 'Edit any field below in place. Nothing is exported until you approve.'}
                  {draftGeneratedAt ? ` · Generated ${draftGeneratedAt.toLocaleString()}` : ''}
                </p>
              </div>
              <div className="flex gap-2 shrink-0">
                {isDraftApproved ? (
                  <Button size="sm" onClick={() => setShowBrandedStudio(true)} className="gap-1.5">
                    <FileDown className="h-3.5 w-3.5" />
                    Export Branded
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    onClick={handleApproveDraft}
                    disabled={isApprovingDraft}
                    className="gap-1.5"
                  >
                    {isApprovingDraft ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <CheckCircle2 className="h-3.5 w-3.5" />
                    )}
                    Approve &amp; Archive
                  </Button>
                )}
              </div>
            </div>
          )}

          {viewMode === 'tabs' && (
            <Tabs defaultValue="company-overview" className="w-full">
              <TabsList className="grid w-full grid-cols-5 gap-2 bg-transparent p-1 h-auto [&>span]:hidden">
                <TabsTrigger value="company-overview" className="min-w-0 truncate rounded-md border border-white/5 bg-white/5 hover:bg-white/10 hover:border-white/20 data-[state=active]:bg-[rgba(126,184,247,0.1)] data-[state=active]:border-[rgba(126,184,247,0.25)] data-[state=active]:text-primary data-[state=active]:shadow-[inset_0_1px_1px_rgba(126,184,247,0.1)]">Company Overview</TabsTrigger>
                <TabsTrigger value="financial" className="min-w-0 truncate rounded-md border border-white/5 bg-white/5 hover:bg-white/10 hover:border-white/20 data-[state=active]:bg-[rgba(126,184,247,0.1)] data-[state=active]:border-[rgba(126,184,247,0.25)] data-[state=active]:text-primary data-[state=active]:shadow-[inset_0_1px_1px_rgba(126,184,247,0.1)]">Financial</TabsTrigger>
                <TabsTrigger value="highlights" className="min-w-0 truncate rounded-md border border-white/5 bg-white/5 hover:bg-white/10 hover:border-white/20 data-[state=active]:bg-[rgba(126,184,247,0.1)] data-[state=active]:border-[rgba(126,184,247,0.25)] data-[state=active]:text-primary data-[state=active]:shadow-[inset_0_1px_1px_rgba(126,184,247,0.1)]">Company Highlights</TabsTrigger>
                <TabsTrigger value="key-items" className="min-w-0 truncate rounded-md border border-white/5 bg-white/5 hover:bg-white/10 hover:border-white/20 data-[state=active]:bg-[rgba(126,184,247,0.1)] data-[state=active]:border-[rgba(126,184,247,0.25)] data-[state=active]:text-primary data-[state=active]:shadow-[inset_0_1px_1px_rgba(126,184,247,0.1)]">Key Items</TabsTrigger>
                <TabsTrigger value="ownership" className="min-w-0 truncate rounded-md border border-white/5 bg-white/5 hover:bg-white/10 hover:border-white/20 data-[state=active]:bg-[rgba(126,184,247,0.1)] data-[state=active]:border-[rgba(126,184,247,0.25)] data-[state=active]:text-primary data-[state=active]:shadow-[inset_0_1px_1px_rgba(126,184,247,0.1)]">Ownership</TabsTrigger>
              </TabsList>
              
              <TabsContent value="company-overview" className="mt-6">
                <WriteUpCompanyOverviewTab dealId={dealId} data={data} updateField={updateField} onChange={onChange} changedFields={changedFields} isFieldEdited={isFieldEdited} />
              </TabsContent>
              
              <TabsContent value="financial" className="mt-6">
                <WriteUpFinancialTab data={data} updateField={updateField} changedFields={changedFields} isFieldEdited={isFieldEdited} />
              </TabsContent>
              
              <TabsContent value="highlights" className="mt-6">
                <WriteUpCompanyHighlightsTab data={data} updateField={updateField} changedFields={changedFields} isFieldEdited={isFieldEdited} />
              </TabsContent>
              
              <TabsContent value="key-items" className="mt-6">
                <WriteUpKeyItemsTab data={data} updateField={updateField} changedFields={changedFields} isFieldEdited={isFieldEdited} />
              </TabsContent>

              <TabsContent value="ownership" className="mt-6">
                <WriteUpOwnershipTab dealId={dealId} />
              </TabsContent>
            </Tabs>
          )}

          {viewMode === 'long' && (
            <div className="space-y-8">
              {/* Company Overview Section */}
              <div className="space-y-4">
                <div className="border-b pb-2">
                  <h4 className="text-base font-semibold text-foreground">Company Overview</h4>
                </div>
              <WriteUpCompanyOverviewTab dealId={dealId} data={data} updateField={updateField} onChange={onChange} changedFields={changedFields} isFieldEdited={isFieldEdited} />
              </div>
              
              {/* Financial Section */}
              <div className="space-y-4">
                <div className="border-b pb-2">
                  <h4 className="text-base font-semibold text-foreground">Financial</h4>
                </div>
                <WriteUpFinancialTab data={data} updateField={updateField} changedFields={changedFields} isFieldEdited={isFieldEdited} />
              </div>
              
              {/* Company Highlights Section */}
              <div className="space-y-4">
                <div className="border-b pb-2">
                  <h4 className="text-base font-semibold text-foreground">Company Highlights</h4>
                </div>
                <WriteUpCompanyHighlightsTab data={data} updateField={updateField} changedFields={changedFields} isFieldEdited={isFieldEdited} />
              </div>
              
              {/* Key Items Section */}
              <div className="space-y-4">
                <div className="border-b pb-2">
                  <h4 className="text-base font-semibold text-foreground">Key Items</h4>
                </div>
                <WriteUpKeyItemsTab data={data} updateField={updateField} changedFields={changedFields} isFieldEdited={isFieldEdited} />
              </div>

              {/* Ownership Section */}
              <div className="space-y-4">
                <div className="border-b pb-2">
                  <h4 className="text-base font-semibold text-foreground">Ownership</h4>
                </div>
                <WriteUpOwnershipTab dealId={dealId} />
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex items-center justify-between pt-4 border-t">
            <div className="text-xs text-muted-foreground">
              Changes are saved automatically
            </div>
            <div className="flex gap-3 flex-wrap justify-end">
              <Button 
                variant="secondary" 
                onClick={onSave} 
                disabled={isSaving || autoSaveStatus === 'saving'}
              >
                {isSaving || autoSaveStatus === 'saving' ? 'Saving...' : 'Save Now'}
              </Button>
              {canPushToFlex && (isPublishedOnFlex ? (
                <>
                  <Button 
                    variant="default"
                    onClick={handleFlexButtonClick}
                    disabled={isPushingToFlex || isUnpublishing}
                  >
                    {isPushingToFlex ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Updating...
                      </>
                    ) : (
                      <>
                        <Send className="h-4 w-4 mr-2" />
                        Update on FLEx
                      </>
                    )}
                  </Button>
                  <Button 
                    variant="outline"
                    onClick={() => setShowUnpublishDialog(true)}
                    disabled={isUnpublishing || isPushingToFlex}
                    className="text-destructive hover:text-destructive"
                  >
                    {isUnpublishing ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Unpublishing...
                      </>
                    ) : (
                      <>
                        <CloudOff className="h-4 w-4 mr-2" />
                        Unpublish from FLEx
                      </>
                    )}
                  </Button>
                </>
              ) : isUnpublishedFromFlex ? (
                <Button 
                  variant="default"
                  onClick={handleFlexButtonClick}
                  disabled={isRepublishing}
                >
                  {isRepublishing ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Re-publishing...
                    </>
                  ) : (
                    <>
                      <RefreshCw className="h-4 w-4 mr-2" />
                      Re-publish to FLEx
                    </>
                  )}
                </Button>
              ) : (
                <Button 
                  variant="default"
                  onClick={handleFlexButtonClick}
                  disabled={isPushingToFlex}
                >
                  {isPushingToFlex ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Pushing...
                    </>
                  ) : (
                    <>
                      <Send className="h-4 w-4 mr-2" />
                      Push to FLEx
                    </>
                  )}
                </Button>
              ))}
            </div>
          </div>
        </div>
      </CardContent>

      {/* Push to FLEx Confirmation Dialog */}
      <AlertDialog open={showFlexConfirmDialog} onOpenChange={setShowFlexConfirmDialog}>
        <AlertDialogContent
          className="!grid-cols-none !block sm:!flex flex flex-col overflow-hidden p-0 !max-w-none"
          style={{
            width: 'min(96vw, 1200px)',
            maxWidth: '96vw',
            maxHeight: '90vh',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          <AlertDialogHeader className="p-6 pb-2 shrink-0">
            <AlertDialogTitle className="flex items-center gap-2">
              <Eye className="h-5 w-5" />
              Preview Data for FLEx
            </AlertDialogTitle>
            <AlertDialogDescription>
              Review the deal information that will be sent to FLEx. Make sure all details are correct before proceeding.
            </AlertDialogDescription>
          </AlertDialogHeader>
          
          <ScrollArea
            className="px-6"
            style={{
              flex: '1 1 auto',
              minHeight: 0,
              minWidth: 0,
              overflow: 'auto',
            }}
          >
            <div className="space-y-4 min-w-0 max-w-full" style={{ overflowWrap: 'anywhere' }}>
              {/* Company Information */}
              <div className="rounded-lg border bg-muted/30 p-4">
                <h4 className="font-semibold text-sm mb-3">
                  Company Information
                </h4>
                <div className="space-y-1">
                  <DataPreviewRow label="Company Name" value={data.companyName} />
                  <DataPreviewRow label="Website" value={data.companyUrl} />
                  <DataPreviewRow label="LinkedIn" value={data.linkedinUrl} />
                  <DataPreviewRow label="Industry" value={data.industries.join(', ') || '—'} />
                  <DataPreviewRow label="Location" value={data.location} />
                  <DataPreviewRow label="Year Founded" value={data.yearFounded || '—'} />
                  <DataPreviewRow label="Customer Base" value={data.customerBase?.join(', ') || '—'} />
                  <DataPreviewRow label="Headcount" value={data.headcount || '—'} />
                </div>
              </div>

              {/* Deal Details */}
              <div className="rounded-lg border bg-muted/30 p-4">
                <h4 className="font-semibold text-sm mb-3">Deal Details</h4>
                <div className="space-y-1">
                  <DataPreviewRow label="Deal Type" value={dealTypeIdsToLabels(data.dealTypes).join(', ') || '—'} />
                  <DataPreviewRow label="Capital Ask" value={data.capitalAsk} />
                  <DataPreviewRow label="Status" value={data.status} />
                  <DataPreviewRow label="Billing Model" value={data.billingModels.join(', ') || '—'} />
                  <DataPreviewRow label="Profitability" value={data.profitability} />
                  <DataPreviewRow label="Gross Margins" value={data.grossMargins} />
                </div>
              </div>

              {/* Financials */}
              <div className="rounded-lg border bg-muted/30 p-4">
                <h4 className="font-semibold text-sm mb-3">Financials</h4>
                <div className="space-y-1">
                  <DataPreviewRow 
                    label="Financial Data As Of" 
                    value={data.financialDataAsOf ? format(data.financialDataAsOf, 'MMM d, yyyy') : undefined} 
                  />
                  <DataPreviewRow label="Accounting System" value={data.accountingSystem} />
                </div>
              </div>

              {/* Additional Details */}
              {(data.useOfFunds || data.existingDebtDetails || data.description) && (
                <div className="rounded-lg border bg-muted/30 p-4">
                  <h4 className="font-semibold text-sm mb-3">Additional Details</h4>
                  <div className="space-y-3">
                    {data.useOfFunds && (
                      <div>
                        <span className="text-muted-foreground text-sm">Use of Funds</span>
                        <p className="text-sm mt-1">{data.useOfFunds}</p>
                      </div>
                    )}
                    {data.existingDebtDetails && (
                      <div>
                        <span className="text-muted-foreground text-sm">Existing Debt</span>
                        <p className="text-sm mt-1">{data.existingDebtDetails}</p>
                      </div>
                    )}
                    {data.description && (
                      <div>
                        <span className="text-muted-foreground text-sm">Description</span>
                        <p className="text-sm mt-1 line-clamp-3">{data.description}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}


              {/* Key Items */}
              {data.keyItems.length > 0 && (
                <div className="rounded-lg border bg-muted/30 p-4">
                  <h4 className="font-semibold text-sm mb-3">Key Items ({data.keyItems.length})</h4>
                  <div className="space-y-2">
                    {data.keyItems.map((item, index) => (
                      <div key={item.id} className="text-sm">
                        <span className="font-medium">{index + 1}. {item.title || 'Untitled'}</span>
                        {item.description && (
                          <p className="text-muted-foreground text-xs mt-0.5 line-clamp-2">{item.description}</p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {/* Team */}
              {(data.team || []).filter(m => m.name.trim()).length > 0 && (
                <div className="rounded-lg border bg-muted/30 p-4">
                  <h4 className="font-semibold text-sm mb-3">Team ({(data.team || []).filter(m => m.name.trim()).length})</h4>
                  <div className="space-y-2">
                    {(data.team || []).filter(m => m.name.trim()).map((member, index) => (
                      <div key={member.id || index} className="text-sm">
                        <span className="font-medium">{member.name}</span>
                        {member.title && <span className="text-muted-foreground"> — {member.title}</span>}
                        {member.linkedin && (
                          <span className="text-muted-foreground text-xs ml-2">({member.linkedin})</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </ScrollArea>

          <AlertDialogFooter className="p-6 pt-2 shrink-0">
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handlePushToFlex} disabled={isPushingToFlex}>
              {isPushingToFlex ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Pushing...
                </>
              ) : (
                <>
                  <Send className="h-4 w-4 mr-2" />
                  Confirm & Push to FLEx
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Preview Dialog (view-only) */}
      <WriteUpPreviewDialog
        open={showPreviewDialog}
        onOpenChange={setShowPreviewDialog}
        data={data}
        owners={owners}
        totalEquityRaised={totalEquityRaised}
        dealManager={dealManager}
        disclaimer={companyDisclaimer}
      />

      {/* Unpublish from FLEx Confirmation Dialog */}
      <AlertDialog open={showUnpublishDialog} onOpenChange={setShowUnpublishDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <CloudOff className="h-5 w-5 text-destructive" />
              Unpublish from FLEx
            </AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to unpublish this deal from FLEx? The deal will no longer be visible to lenders on the platform.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleUnpublishFromFlex} 
              disabled={isUnpublishing}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isUnpublishing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Unpublishing...
                </>
              ) : (
                <>
                  <CloudOff className="h-4 w-4 mr-2" />
                  Unpublish
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Auto-Fill Dialog */}
      <WriteUpAutoFillDialog
        open={showAutoFillDialog}
        onOpenChange={setShowAutoFillDialog}
        extractedFields={extractedFields}
        currentData={data}
        onApply={handleApplyAutoFill}
        documentCount={autoFillDocumentCount}
        sourceCount={autoFillSourceCount}
        failedFields={autoFillFailedFields}
      />

      {/* Branded Document Studio */}
      <BrandedDocStudioDialog
        open={showBrandedStudio}
        onOpenChange={setShowBrandedStudio}
        dealId={dealId}
        companyName={data.companyName || 'Subject Company'}
      />

      {/* Empty Fields Warning Dialog */}
      <AlertDialog open={showEmptyFieldsWarning} onOpenChange={setShowEmptyFieldsWarning}>
        <AlertDialogContent className="max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-amber-600">
              <AlertTriangle className="h-5 w-5" />
              Incomplete Write-Up
            </AlertDialogTitle>
            <AlertDialogDescription>
              Some fields in your deal write-up are empty. Are you sure you want to proceed with publishing?
            </AlertDialogDescription>
          </AlertDialogHeader>
          
          <ScrollArea className="max-h-[40vh] pr-4">
            <div className="space-y-3">
              {Object.entries(emptyFieldsBySection).map(([section, fields]) => (
                <div key={section} className="rounded-lg border bg-muted/30 p-3">
                  <h4 className="font-semibold text-sm mb-2 text-foreground">{section}</h4>
                  <ul className="space-y-1">
                    {fields.map((field) => (
                      <li key={field} className="text-sm text-muted-foreground flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                        {field}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </ScrollArea>

          <AlertDialogFooter>
            <AlertDialogCancel>Go Back to Edit</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleProceedWithEmptyFields}
              className="bg-amber-600 hover:bg-amber-700"
            >
              Proceed Anyway
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* AI Memo Dialog */}
      <Dialog open={showMemoDialog} onOpenChange={setShowMemoDialog}>
        <DialogContent className="sm:max-w-[750px] max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              AI-Generated Lender Memo
              <span className="ml-2 text-[10px] font-normal text-muted-foreground bg-muted px-1.5 py-0.5 rounded">Powered by Claude</span>
            </DialogTitle>
            <DialogDescription>
              Structured memo generated from all deal data using Claude AI. You can regenerate individual sections.
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="flex-1 max-h-[60vh] pr-4">
            {memoContent ? (
              <div className="space-y-4">
                {MEMO_SECTIONS.map((section) => {
                  const sectionContent = memoSections[section.key];
                  if (!sectionContent && !memoContent.includes(section.heading)) return null;
                  return (
                    <div key={section.key} className="group relative border rounded-lg p-4">
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="font-semibold text-sm">{section.heading}</h3>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 gap-1.5 text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={() => regenerateSection(section.key)}
                          disabled={isRegenerating === section.key}
                        >
                          {isRegenerating === section.key ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <RefreshCw className="h-3 w-3" />
                          )}
                          Regenerate
                        </Button>
                      </div>
                      <div className="prose prose-sm dark:prose-invert max-w-none text-sm">
                        <ReactMarkdown>{sectionContent || ''}</ReactMarkdown>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                <Sparkles className="h-8 w-8 mx-auto mb-3 opacity-50" />
                <p>Generating memo...</p>
              </div>
            )}
          </ScrollArea>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setShowMemoDialog(false)}>
              Close
            </Button>
            <Button
              onClick={() => {
                navigator.clipboard.writeText(memoContent);
                toast.success('Memo copied to clipboard');
              }}
              disabled={!memoContent}
              className="gap-2"
            >
              Copy Memo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Overwrite Protection Dialog */}
      <OverwriteProtectionDialog
        open={showOverwriteDialog}
        onOpenChange={setShowOverwriteDialog}
        editedFieldCount={editedCount}
        onKeepEdits={() => {
          setShowOverwriteDialog(false);
          const fields = (window as any).__pendingAutoFillFields;
          if (fields) {
            applyAutoFillFields(fields, true);
            delete (window as any).__pendingAutoFillFields;
          }
        }}
        onOverwriteAll={() => {
          setShowOverwriteDialog(false);
          if (pendingAutoFillAction) {
            pendingAutoFillAction();
            setPendingAutoFillAction(null);
          }
          delete (window as any).__pendingAutoFillFields;
        }}
      />

    </Card>
  );
};

