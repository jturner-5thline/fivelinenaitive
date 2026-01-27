import { useState, useRef, useEffect, useCallback } from 'react';
import { Check, Loader2, Clock, AlertCircle, Send, Eye, CloudOff, RefreshCw, LayoutList, LayoutGrid, GalleryHorizontal, ChevronLeft, ChevronRight } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import useEmblaCarousel from 'embla-carousel-react';
import { FlexSyncStatusBadge, FlexSyncHistory } from '@/components/deal/FlexSyncHistory';
import { useLatestFlexSync } from '@/hooks/useFlexSyncHistory';
import { useDealOwnership } from '@/hooks/useDealOwnership';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
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
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { AutoSaveStatus } from '@/hooks/useAutoSave';
import { WriteUpCompanyOverviewTab } from './writeup/WriteUpCompanyOverviewTab';
import { WriteUpFinancialTab } from './writeup/WriteUpFinancialTab';
import { WriteUpCompanyHighlightsTab } from './writeup/WriteUpCompanyHighlightsTab';
import { WriteUpKeyItemsTab } from './writeup/WriteUpKeyItemsTab';
import { WriteUpOwnershipTab } from './writeup/WriteUpOwnershipTab';

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

export interface DealWriteUpData {
  companyName: string;
  companyUrl: string;
  linkedinUrl: string;
  industries: string[];
  location: string;
  yearFounded: string;
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
  description: string;
  keyItems: KeyItem[];
  companyHighlights: CompanyHighlight[];
  financialYears: FinancialYear[];
  financialComments: FinancialComment[];
  publishAsAnonymous: boolean;
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
  description: deal?.narrative || '',
  keyItems: [],
  companyHighlights: [],
  financialYears: [],
  financialComments: [],
  publishAsAnonymous: false,
});

interface DealWriteUpProps {
  dealId: string;
  data: DealWriteUpData;
  onChange: (data: DealWriteUpData) => void;
  onSave: () => void;
  onCancel: () => void;
  isSaving?: boolean;
  autoSaveStatus?: AutoSaveStatus;
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

const INDUSTRY_OPTIONS = [
  'Technology',
  'Healthcare',
  'Finance',
  'Manufacturing',
  'Retail',
  'Real Estate',
  'Energy',
  'Transportation',
  'Media',
  'Other',
];

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

type ViewMode = 'tabs' | 'long' | 'carousel';

const CAROUSEL_SECTIONS = [
  { id: 'company-overview', title: 'Company Overview' },
  { id: 'financial', title: 'Financial' },
  { id: 'highlights', title: 'Company Highlights' },
  { id: 'key-items', title: 'Key Items' },
  { id: 'ownership', title: 'Ownership' },
];

export const DealWriteUp = ({ dealId, data, onChange, onSave, onCancel, isSaving, autoSaveStatus = 'idle' }: DealWriteUpProps) => {
  const queryClient = useQueryClient();
  const [isPushingToFlex, setIsPushingToFlex] = useState(false);
  const [isUnpublishing, setIsUnpublishing] = useState(false);
  const [isRepublishing, setIsRepublishing] = useState(false);
  const [isPendingPublish, setIsPendingPublish] = useState(false);
  const [publishCountdown, setPublishCountdown] = useState(0);
  const [showFlexConfirmDialog, setShowFlexConfirmDialog] = useState(false);
  const [showUnpublishDialog, setShowUnpublishDialog] = useState(false);
  const publishTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const countdownIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const pendingPublishToastIdRef = useRef<string | number | null>(null);
  const { data: latestSync } = useLatestFlexSync(dealId);
  const { owners } = useDealOwnership(dealId);
  
  // View mode state: 'tabs', 'long', or 'carousel'
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    try {
      const saved = localStorage.getItem(WRITEUP_VIEW_MODE_KEY) as ViewMode | null;
      if (saved === 'long' || saved === 'carousel') return saved;
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

  // Carousel state
  const [emblaRef, emblaApi] = useEmblaCarousel({ loop: false, skipSnaps: false });
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [canScrollPrev, setCanScrollPrev] = useState(false);
  const [canScrollNext, setCanScrollNext] = useState(false);

  const scrollPrev = useCallback(() => emblaApi?.scrollPrev(), [emblaApi]);
  const scrollNext = useCallback(() => emblaApi?.scrollNext(), [emblaApi]);
  const scrollTo = useCallback((index: number) => emblaApi?.scrollTo(index), [emblaApi]);

  const onSelect = useCallback(() => {
    if (!emblaApi) return;
    setSelectedIndex(emblaApi.selectedScrollSnap());
    setCanScrollPrev(emblaApi.canScrollPrev());
    setCanScrollNext(emblaApi.canScrollNext());
  }, [emblaApi]);

  useEffect(() => {
    if (!emblaApi) return;
    onSelect();
    emblaApi.on('select', onSelect);
    emblaApi.on('reInit', onSelect);
    return () => {
      emblaApi.off('select', onSelect);
      emblaApi.off('reInit', onSelect);
    };
  }, [emblaApi, onSelect]);
  
  // Check if currently published on FLEx
  const isPublishedOnFlex = latestSync?.status === 'success';
  // Check if deal was unpublished (can be re-published)
  const isUnpublishedFromFlex = latestSync?.status === 'unpublished';

  const updateField = <K extends keyof DealWriteUpData>(field: K, value: DealWriteUpData[K]) => {
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
    publishAsAnonymous: data.publishAsAnonymous,
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
      <div className="flex justify-between py-1.5 border-b border-border/50 last:border-0">
        <span className="text-muted-foreground text-sm">{label}</span>
        <span className="text-sm font-medium text-right max-w-[60%] truncate">{value}</span>
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

  return (
    <Card className="w-full max-w-full">
      <CardHeader>
        <div className="flex items-center justify-between gap-4 min-w-0">
          <div className="min-w-0 flex items-center gap-3">
            <CardTitle>Deal Write Up</CardTitle>
            <Badge 
              variant={isPublishedOnFlex ? 'green' : data.status === 'Closed' ? 'gray' : 'amber'}
              className="shrink-0"
            >
              {isPublishedOnFlex ? 'Published' : data.status === 'Closed' ? 'Closed' : 'Draft'}
            </Badge>
            <CardDescription className="hidden sm:block">Create, edit, and manage deal listings</CardDescription>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <FlexSyncStatusBadge dealId={dealId} />
            <AutoSaveIndicator status={autoSaveStatus} />
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6 min-w-0">
        {/* FLEx Sync History */}
        <FlexSyncHistory dealId={dealId} />
        
        {/* Edit Deal Section with Tabs or Long View */}
        <div className="border rounded-lg p-6 space-y-6 min-w-0">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">Edit Deal</h3>
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
                    <ToggleGroupItem value="carousel" aria-label="Carousel view" size="sm">
                      <GalleryHorizontal className="h-4 w-4" />
                    </ToggleGroupItem>
                  </TooltipTrigger>
                  <TooltipContent>Carousel view</TooltipContent>
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
          
          {viewMode === 'tabs' && (
            <Tabs defaultValue="company-overview" className="w-full">
              <TabsList className="grid w-full grid-cols-5">
                <TabsTrigger value="company-overview" className="min-w-0 truncate">Company Overview</TabsTrigger>
                <TabsTrigger value="financial" className="min-w-0 truncate">Financial</TabsTrigger>
                <TabsTrigger value="highlights" className="min-w-0 truncate">Company Highlights</TabsTrigger>
                <TabsTrigger value="key-items" className="min-w-0 truncate">Key Items</TabsTrigger>
                <TabsTrigger value="ownership" className="min-w-0 truncate">Ownership</TabsTrigger>
              </TabsList>
              
              <TabsContent value="company-overview" className="mt-6">
                <WriteUpCompanyOverviewTab data={data} updateField={updateField} />
              </TabsContent>
              
              <TabsContent value="financial" className="mt-6">
                <WriteUpFinancialTab data={data} updateField={updateField} />
              </TabsContent>
              
              <TabsContent value="highlights" className="mt-6">
                <WriteUpCompanyHighlightsTab data={data} updateField={updateField} />
              </TabsContent>
              
              <TabsContent value="key-items" className="mt-6">
                <WriteUpKeyItemsTab data={data} updateField={updateField} />
              </TabsContent>

              <TabsContent value="ownership" className="mt-6">
                <WriteUpOwnershipTab dealId={dealId} />
              </TabsContent>
            </Tabs>
          )}

          {viewMode === 'carousel' && (
            <div className="space-y-4">
              {/* Carousel Navigation Header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 flex-wrap min-w-0">
                  {CAROUSEL_SECTIONS.map((section, index) => (
                    <button
                      key={section.id}
                      onClick={() => scrollTo(index)}
                      className={cn(
                        "px-3 py-1.5 text-sm font-medium rounded-md transition-colors",
                        selectedIndex === index
                          ? "bg-primary text-primary-foreground"
                          : "text-muted-foreground hover:text-foreground hover:bg-muted"
                      )}
                    >
                      {section.title}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8"
                    onClick={scrollPrev}
                    disabled={!canScrollPrev}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8"
                    onClick={scrollNext}
                    disabled={!canScrollNext}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {/* Carousel Container */}
              <div className="overflow-hidden" ref={emblaRef}>
                <div className="flex">
                  <div className="flex-[0_0_100%] min-w-0 px-1">
                    <div className="border rounded-lg p-6 bg-muted/20">
                      <h4 className="text-base font-semibold text-foreground mb-4 border-b pb-2">Company Overview</h4>
                      <WriteUpCompanyOverviewTab data={data} updateField={updateField} />
                    </div>
                  </div>
                  <div className="flex-[0_0_100%] min-w-0 px-1">
                    <div className="border rounded-lg p-6 bg-muted/20">
                      <h4 className="text-base font-semibold text-foreground mb-4 border-b pb-2">Financial</h4>
                      <WriteUpFinancialTab data={data} updateField={updateField} />
                    </div>
                  </div>
                  <div className="flex-[0_0_100%] min-w-0 px-1">
                    <div className="border rounded-lg p-6 bg-muted/20">
                      <h4 className="text-base font-semibold text-foreground mb-4 border-b pb-2">Company Highlights</h4>
                      <WriteUpCompanyHighlightsTab data={data} updateField={updateField} />
                    </div>
                  </div>
                  <div className="flex-[0_0_100%] min-w-0 px-1">
                    <div className="border rounded-lg p-6 bg-muted/20">
                      <h4 className="text-base font-semibold text-foreground mb-4 border-b pb-2">Key Items</h4>
                      <WriteUpKeyItemsTab data={data} updateField={updateField} />
                    </div>
                  </div>
                  <div className="flex-[0_0_100%] min-w-0 px-1">
                    <div className="border rounded-lg p-6 bg-muted/20">
                      <h4 className="text-base font-semibold text-foreground mb-4 border-b pb-2">Ownership</h4>
                      <WriteUpOwnershipTab dealId={dealId} />
                    </div>
                  </div>
                </div>
              </div>

              {/* Dot indicators */}
              <div className="flex justify-center gap-2">
                {CAROUSEL_SECTIONS.map((section, index) => (
                  <button
                    key={section.id}
                    onClick={() => scrollTo(index)}
                    className={cn(
                      "h-2 rounded-full transition-all duration-200",
                      selectedIndex === index
                        ? "w-6 bg-primary"
                        : "w-2 bg-muted-foreground/30 hover:bg-muted-foreground/50"
                    )}
                    aria-label={`Go to ${section.title}`}
                  />
                ))}
              </div>
            </div>
          )}

          {viewMode === 'long' && (
            <div className="space-y-8">
              {/* Company Overview Section */}
              <div className="space-y-4">
                <div className="border-b pb-2">
                  <h4 className="text-base font-semibold text-foreground">Company Overview</h4>
                </div>
                <WriteUpCompanyOverviewTab data={data} updateField={updateField} />
              </div>
              
              {/* Financial Section */}
              <div className="space-y-4">
                <div className="border-b pb-2">
                  <h4 className="text-base font-semibold text-foreground">Financial</h4>
                </div>
                <WriteUpFinancialTab data={data} updateField={updateField} />
              </div>
              
              {/* Company Highlights Section */}
              <div className="space-y-4">
                <div className="border-b pb-2">
                  <h4 className="text-base font-semibold text-foreground">Company Highlights</h4>
                </div>
                <WriteUpCompanyHighlightsTab data={data} updateField={updateField} />
              </div>
              
              {/* Key Items Section */}
              <div className="space-y-4">
                <div className="border-b pb-2">
                  <h4 className="text-base font-semibold text-foreground">Key Items</h4>
                </div>
                <WriteUpKeyItemsTab data={data} updateField={updateField} />
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

          {/* Publish as Anonymous */}
          <div className="flex items-start space-x-3 border-t pt-4">
            <Checkbox
              id="publishAsAnonymous"
              checked={data.publishAsAnonymous}
              onCheckedChange={(checked) => updateField('publishAsAnonymous', checked as boolean)}
            />
            <div className="grid gap-1.5 leading-none">
              <label
                htmlFor="publishAsAnonymous"
                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
              >
                Publish as Anonymous Deal
              </label>
              <p className="text-xs text-muted-foreground">
                Company name, website, and LinkedIn will be hidden. Users must request access and be approved to see these details.
              </p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-between pt-4 border-t">
            <div className="text-xs text-muted-foreground">
              Changes are saved automatically
            </div>
            <div className="flex gap-3 flex-wrap justify-end">
              <Button variant="outline" onClick={onCancel}>
                Done
              </Button>
              <Button 
                variant="secondary" 
                onClick={onSave} 
                disabled={isSaving || autoSaveStatus === 'saving'}
              >
                {isSaving || autoSaveStatus === 'saving' ? 'Saving...' : 'Save Now'}
              </Button>
              {isPublishedOnFlex ? (
                <>
                  <Button 
                    variant="default"
                    onClick={() => setShowFlexConfirmDialog(true)}
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
                  onClick={handleRepublishToFlex}
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
                  onClick={() => setShowFlexConfirmDialog(true)}
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
              )}
            </div>
          </div>
        </div>
      </CardContent>

      {/* Push to FLEx Confirmation Dialog */}
      <AlertDialog open={showFlexConfirmDialog} onOpenChange={setShowFlexConfirmDialog}>
        <AlertDialogContent className="max-w-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Eye className="h-5 w-5" />
              Preview Data for FLEx
            </AlertDialogTitle>
            <AlertDialogDescription>
              Review the deal information that will be sent to FLEx. Make sure all details are correct before proceeding.
            </AlertDialogDescription>
          </AlertDialogHeader>
          
          <ScrollArea className="max-h-[60vh] pr-4">
            <div className="space-y-4">
              {/* Company Information */}
              <div className="rounded-lg border bg-muted/30 p-4">
                <h4 className="font-semibold text-sm mb-3 flex items-center gap-2">
                  Company Information
                  {data.publishAsAnonymous && (
                    <Badge variant="secondary" className="text-xs">Anonymous</Badge>
                  )}
                </h4>
                <div className="space-y-1">
                  <DataPreviewRow label="Company Name" value={data.companyName} />
                  <DataPreviewRow label="Website" value={data.companyUrl} />
                  <DataPreviewRow label="LinkedIn" value={data.linkedinUrl} />
                  <DataPreviewRow label="Industry" value={data.industries.join(', ') || '—'} />
                  <DataPreviewRow label="Location" value={data.location} />
                  <DataPreviewRow label="Year Founded" value={data.yearFounded || '—'} />
                  <DataPreviewRow label="Headcount" value={data.headcount || '—'} />
                </div>
              </div>

              {/* Deal Details */}
              <div className="rounded-lg border bg-muted/30 p-4">
                <h4 className="font-semibold text-sm mb-3">Deal Details</h4>
                <div className="space-y-1">
                  <DataPreviewRow label="Deal Type" value={data.dealTypes.join(', ') || '—'} />
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
            </div>
          </ScrollArea>

          <AlertDialogFooter>
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

    </Card>
  );
};

