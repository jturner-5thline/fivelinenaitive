import { useState, useRef } from 'react';
import { Plus, Trash2, Check, Loader2, Clock, AlertCircle, CalendarIcon, Send, Eye, CloudOff, RefreshCw } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { FlexSyncStatusBadge, FlexSyncHistory } from '@/components/deal/FlexSyncHistory';
import { useLatestFlexSync } from '@/hooks/useFlexSyncHistory';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
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
import { cn } from '@/lib/utils';
import { AutoSaveStatus } from '@/hooks/useAutoSave';

export interface KeyItem {
  id: string;
  title: string;
  description: string;
}

export interface DealWriteUpData {
  companyName: string;
  companyUrl: string;
  linkedinUrl: string;
  dataRoomUrl: string;
  industry: string;
  location: string;
  dealType: string;
  billingModel: string;
  profitability: string;
  grossMargins: string;
  capitalAsk: string;
  thisYearRevenue: string;
  lastYearRevenue: string;
  financialDataAsOf: Date | null;
  accountingSystem: string;
  status: string;
  useOfFunds: string;
  existingDebtDetails: string;
  description: string;
  keyItems: KeyItem[];
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
  dataRoomUrl: '',
  industry: '',
  location: '',
  dealType: deal?.dealTypes?.[0] || '',
  billingModel: '',
  profitability: '',
  grossMargins: '',
  capitalAsk: deal?.value ? `$${deal.value.toLocaleString()}` : '',
  thisYearRevenue: '',
  lastYearRevenue: '',
  financialDataAsOf: null,
  accountingSystem: '',
  status: deal?.status === 'active' ? 'Published' : deal?.status === 'closed' ? 'Closed' : 'Draft',
  useOfFunds: '',
  existingDebtDetails: '',
  description: deal?.narrative || '',
  keyItems: [],
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

  const getWriteUpPayload = () => ({
    companyName: data.companyName,
    companyUrl: data.companyUrl,
    linkedinUrl: data.linkedinUrl,
    dataRoomUrl: data.dataRoomUrl,
    industry: data.industry,
    location: data.location,
    dealType: data.dealType,
    billingModel: data.billingModel,
    profitability: data.profitability,
    grossMargins: data.grossMargins,
    capitalAsk: data.capitalAsk,
    thisYearRevenue: data.thisYearRevenue,
    lastYearRevenue: data.lastYearRevenue,
    financialDataAsOf: data.financialDataAsOf?.toISOString() || null,
    accountingSystem: data.accountingSystem,
    status: data.status,
    useOfFunds: data.useOfFunds,
    existingDebtDetails: data.existingDebtDetails,
    description: data.description,
    keyItems: data.keyItems,
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

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Deal Management</CardTitle>
            <CardDescription>Create, edit, and manage deal listings</CardDescription>
          </div>
          <div className="flex items-center gap-3">
            <FlexSyncStatusBadge dealId={dealId} />
            <AutoSaveIndicator status={autoSaveStatus} />
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* FLEx Sync History */}
        <FlexSyncHistory dealId={dealId} />
        
        {/* Edit Deal Section */}
        <div className="border rounded-lg p-6 space-y-6">
          <h3 className="text-lg font-semibold">Edit Deal</h3>
          
          {/* Company Name & URL Row */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="companyName">Company Name *</Label>
              <Input
                id="companyName"
                value={data.companyName}
                onChange={(e) => updateField('companyName', e.target.value)}
                placeholder="TechFlow Solutions"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="companyUrl">Company URL</Label>
              <Input
                id="companyUrl"
                value={data.companyUrl}
                onChange={(e) => updateField('companyUrl', e.target.value)}
                placeholder="example.com"
              />
            </div>
          </div>

          {/* LinkedIn & Data Room Row */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="linkedinUrl">LinkedIn URL</Label>
              <Input
                id="linkedinUrl"
                value={data.linkedinUrl}
                onChange={(e) => updateField('linkedinUrl', e.target.value)}
                placeholder="linkedin.com/company/..."
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="dataRoomUrl">Data Room URL</Label>
              <Input
                id="dataRoomUrl"
                value={data.dataRoomUrl}
                onChange={(e) => updateField('dataRoomUrl', e.target.value)}
                placeholder="https://dataroom.example.com/techflow"
              />
            </div>
          </div>

          {/* Industry & Location Row */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="industry">Industry *</Label>
              <Select value={data.industry} onValueChange={(v) => updateField('industry', v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select industry" />
                </SelectTrigger>
                <SelectContent>
                  {INDUSTRY_OPTIONS.map(option => (
                    <SelectItem key={option} value={option}>{option}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="location">Location *</Label>
              <Select value={data.location} onValueChange={(v) => updateField('location', v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select location" />
                </SelectTrigger>
                <SelectContent>
                  {LOCATION_OPTIONS.map(option => (
                    <SelectItem key={option} value={option}>{option}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Deal Type & Billing Model Row */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="dealType">Deal Type *</Label>
              <Select value={data.dealType} onValueChange={(v) => updateField('dealType', v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select deal type" />
                </SelectTrigger>
                <SelectContent>
                  {DEAL_TYPE_OPTIONS.map(option => (
                    <SelectItem key={option} value={option}>{option}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="billingModel">Billing Model *</Label>
              <Select value={data.billingModel} onValueChange={(v) => updateField('billingModel', v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select billing model" />
                </SelectTrigger>
                <SelectContent>
                  {BILLING_MODEL_OPTIONS.map(option => (
                    <SelectItem key={option} value={option}>{option}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

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

          {/* Capital Ask & This Year Revenue Row */}
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
              <Label htmlFor="thisYearRevenue">This Year Revenue *</Label>
              <Input
                id="thisYearRevenue"
                value={data.thisYearRevenue}
                onChange={(e) => updateField('thisYearRevenue', e.target.value)}
                onBlur={(e) => updateField('thisYearRevenue', formatCurrency(e.target.value))}
                placeholder="$6.2M"
              />
            </div>
          </div>

          {/* Last Year Revenue & Financial Data As Of Row */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="lastYearRevenue">Last Year Revenue *</Label>
              <Input
                id="lastYearRevenue"
                value={data.lastYearRevenue}
                onChange={(e) => updateField('lastYearRevenue', e.target.value)}
                onBlur={(e) => updateField('lastYearRevenue', formatCurrency(e.target.value))}
                placeholder="$5.1M"
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

          {/* Accounting System & Status Row */}
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
            <div className="space-y-2">
              <Label htmlFor="status">Status</Label>
              <Select value={data.status} onValueChange={(v) => updateField('status', v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map(option => (
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

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="description">Description *</Label>
            <Textarea
              id="description"
              value={data.description}
              onChange={(e) => updateField('description', e.target.value)}
              placeholder="Enterprise SaaS platform for workflow automation with strong recurring revenue and expanding customer base."
              className="min-h-[80px]"
            />
          </div>

          {/* Key Items Section */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label>Key Items</Label>
              <Button variant="outline" size="sm" onClick={addKeyItem}>
                <Plus className="h-4 w-4 mr-1" />
                Add Key Item
              </Button>
            </div>
            
            {data.keyItems.map((item) => (
              <div key={item.id} className="border rounded-lg p-4 space-y-3 relative">
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute top-2 right-2 h-8 w-8 text-muted-foreground hover:text-destructive"
                  onClick={() => deleteKeyItem(item.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
                <div className="space-y-2 pr-10">
                  <Label>Title</Label>
                  <Input
                    value={item.title}
                    onChange={(e) => updateKeyItem(item.id, 'title', e.target.value)}
                    placeholder="Strong Market Position"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Description</Label>
                  <Textarea
                    value={item.description}
                    onChange={(e) => updateKeyItem(item.id, 'description', e.target.value)}
                    placeholder="Leading SaaS provider in workflow automation with 150+ enterprise clients."
                    className="min-h-[60px]"
                  />
                </div>
              </div>
            ))}
          </div>

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
            <div className="flex gap-3">
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
                  <DataPreviewRow label="Data Room" value={data.dataRoomUrl} />
                  <DataPreviewRow label="Industry" value={data.industry} />
                  <DataPreviewRow label="Location" value={data.location} />
                </div>
              </div>

              {/* Deal Details */}
              <div className="rounded-lg border bg-muted/30 p-4">
                <h4 className="font-semibold text-sm mb-3">Deal Details</h4>
                <div className="space-y-1">
                  <DataPreviewRow label="Deal Type" value={data.dealType} />
                  <DataPreviewRow label="Capital Ask" value={data.capitalAsk} />
                  <DataPreviewRow label="Status" value={data.status} />
                  <DataPreviewRow label="Billing Model" value={data.billingModel} />
                  <DataPreviewRow label="Profitability" value={data.profitability} />
                  <DataPreviewRow label="Gross Margins" value={data.grossMargins} />
                </div>
              </div>

              {/* Financials */}
              <div className="rounded-lg border bg-muted/30 p-4">
                <h4 className="font-semibold text-sm mb-3">Financials</h4>
                <div className="space-y-1">
                  <DataPreviewRow label="This Year Revenue" value={data.thisYearRevenue} />
                  <DataPreviewRow label="Last Year Revenue" value={data.lastYearRevenue} />
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

