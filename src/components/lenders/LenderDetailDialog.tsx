import { useMemo, useRef, useState, DragEvent, useEffect, useCallback, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2, Mail, Phone, User, Briefcase, ThumbsDown, CheckCircle, ExternalLink, Globe, Paperclip, Upload, Trash2, FileText, Loader2, FolderOpen, ChevronLeft, ChevronRight, ArrowRight, Pencil, DollarSign, MapPin, Tag, Banknote, X, Save, Settings2, ChevronDown, History, Clock, MessageSquare as MessageSquareIcon, Video } from 'lucide-react';
import { ClaapCallsSection } from '@/components/claap/ClaapCallsSection';
import { CopyableText } from '@/components/ui/CopyableText';
import { LenderNotesPopover, LenderFlagIndicator } from '@/components/lenders/LenderNotesPopover';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useDealsContext } from '@/contexts/DealsContext';
import { usePipelineContext } from '@/contexts/PipelineContext';
import { isActiveLenderDeal, normalizeLenderStatus } from '@/lib/lenderActiveDeals';
import { useLenderAttachments, LenderAttachment, LENDER_ATTACHMENT_CATEGORIES, LenderAttachmentCategory } from '@/hooks/useLenderAttachments';
import { useLenderContacts } from '@/hooks/useLenderContacts';
import { useAuth } from '@/contexts/AuthContext';
import { usePreferences } from '@/contexts/PreferencesContext';
import { useLenderSectionOrder, LenderSectionId } from '@/hooks/useLenderSectionOrder';
import { LenderSectionReorderDialog } from './LenderSectionReorderDialog';
import { AddLenderContactDialog } from './AddLenderContactDialog';
import { LenderContactsList } from './LenderContactsList';
import { cn } from '@/lib/utils';
import { getIndustryOptions, useIndustryOptionsList } from '@/lib/industryOptions';
import { LOAN_TYPE_OPTIONS } from '@/constants/loanTypes';
import { COMPANY_REQUIREMENT_OPTIONS } from '@/constants/companyRequirements';
import { GEO_OPTIONS } from '@/constants/geoOptions';
import { useLenderAuditLog } from '@/hooks/useLenderAuditLog';
import { useDealStages } from '@/contexts/DealStagesContext';
import { useLenderLabelResolver } from '@/hooks/useLenderLabelResolver';
import { format } from 'date-fns';
import { formatLenderCurrency, formatCurrencyInput } from '@/utils/formatLenderCurrency';
import { toast } from 'sonner';
import { useLenderCriteriaOptions } from '@/hooks/useLenderCriteriaOptions';

const CRITERIA_YES_NO = ['Yes', 'No'] as const;
const B2B_B2C_OPTIONS = ['B2B', 'B2C', 'Both'] as const;
const CRITERIA_NONE = '__none__';

function CriteriaSelect({
  value,
  onChange,
  options,
  placeholder = 'Select…',
}: {
  value?: string;
  onChange: (next: string) => void;
  options: readonly string[];
  placeholder?: string;
}) {
  const current = (value || '').trim();
  const base = options.length ? options : CRITERIA_YES_NO;
  const allOptions = current && !base.some(o => o.toLowerCase() === current.toLowerCase())
    ? [...base, current]
    : [...base];
  return (
    <Select
      value={current || CRITERIA_NONE}
      onValueChange={(v) => onChange(v === CRITERIA_NONE ? '' : v)}
    >
      <SelectTrigger className="text-sm h-9">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent className="app-dropdown-surface lender-edit-popover">
        <SelectItem value={CRITERIA_NONE}>—</SelectItem>
        {allOptions.map(opt => (
          <SelectItem key={opt} value={opt}>{opt}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

const LENDER_TYPE_OPTIONS = [
  'Alternative',
  'Asset-Based Lender',
  'Bank',
  'Distressed / Specialty',
  'Equipment Financing',
  'Equity',
  'Mezzanine',
  'Real Estate',
  'SBA',
];

interface LenderInfo {
  id?: string;
  name: string;
  contact: {
    name: string;
    title: string;
    email: string;
    phone: string;
  };
  preferences: string[];
  website?: string;
  description?: string;
  lenderType?: string;
  minDeal?: number | null;
  maxDeal?: number | null;
  geo?: string | null;
  industries?: string[] | null;
  loanTypes?: string[] | null;
  minRevenue?: number | null;
  ebitdaMin?: number | null;
  companyRequirements?: string | null;
  upfrontChecklist?: string | null;
  postTermSheetChecklist?: string | null;
  b2bB2c?: string | null;
  lenderNotes?: string | null;
  tier?: string | null;
  relationshipOwners?: string | null;
  websiteUrl?: string | null;
  linkedinUrl?: string | null;
  address?: string | null;
  phoneMain?: string | null;
  sponsorship?: string | null;
  cashBurn?: string | null;
  subDebt?: string | null;
  refinancing?: string | null;
  industriesToAvoid?: string[] | null;
  nda?: string | null;
  referralLender?: string | null;
  referralFeeOffered?: string | null;
  referralAgreement?: string | null;
  aboutNotes?: string | null;
  fundingSourceNotes?: string | null;
  lenderOnePagerUrl?: string | null;
}

export interface LenderEditData {
  name: string;
  contactName: string;
  contactPhone: string;
  email: string;
  lenderType: string;
  minDeal: string;
  maxDeal: string;
  geo: string;
  industries: string;
  loanTypes: string;
  description: string;
  minRevenue: string;
  ebitdaMin: string;
  companyRequirements: string;
  lenderNotes: string;
  tier: string;
  relationshipOwners: string;
  websiteUrl: string;
  linkedinUrl: string;
  address: string;
  phoneMain: string;
  contactTitle?: string;
  b2bB2c?: string;
  sponsorship?: string;
  cashBurn?: string;
  subDebt?: string;
  refinancing?: string;
  industriesToAvoid?: string;
  nda?: string;
  referralLender?: string;
  referralFeeOffered?: string;
  referralAgreement?: string;
  aboutNotes?: string;
  fundingSourceNotes?: string;
  lenderOnePagerUrl?: string;
  upfrontChecklist?: string;
  postTermSheetChecklist?: string;
}

interface LenderDetailDialogProps {
  lender: LenderInfo | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEdit?: (lenderName: string) => void;
  onDelete?: (lenderName: string) => void;
  onSave?: (lenderId: string, data: LenderEditData) => Promise<void>;
  initialEditMode?: boolean;
}

function buildEditForm(lender: LenderInfo): LenderEditData {
  return {
    name: lender.name || '',
    contactName: lender.contact.name || '',
    contactPhone: lender.contact.phone || '',
    email: lender.contact.email || '',
    lenderType: lender.lenderType || '',
    minDeal: lender.minDeal?.toString() || '',
    maxDeal: lender.maxDeal?.toString() || '',
    geo: lender.geo || '',
    industries: lender.industries?.join(', ') || '',
    loanTypes: lender.loanTypes?.join(', ') || '',
    description: lender.description || '',
    minRevenue: lender.minRevenue?.toString() || '',
    ebitdaMin: lender.ebitdaMin?.toString() || '',
    companyRequirements: lender.companyRequirements || '',
    lenderNotes: lender.lenderNotes || '',
    tier: lender.tier?.replace(/^T/, '') || '',
    relationshipOwners: lender.relationshipOwners || '',
    websiteUrl: lender.websiteUrl || '',
    linkedinUrl: lender.linkedinUrl || '',
    address: lender.address || '',
    phoneMain: lender.phoneMain || '',
    contactTitle: lender.contact.title || '',
    b2bB2c: lender.b2bB2c || '',
    sponsorship: lender.sponsorship || '',
    cashBurn: lender.cashBurn || '',
    subDebt: lender.subDebt || '',
    refinancing: lender.refinancing || '',
    industriesToAvoid: lender.industriesToAvoid?.join(', ') || '',
    nda: lender.nda || '',
    referralLender: lender.referralLender || '',
    referralFeeOffered: lender.referralFeeOffered || '',
    referralAgreement: lender.referralAgreement || '',
    aboutNotes: lender.aboutNotes || '',
    fundingSourceNotes: lender.fundingSourceNotes || '',
    lenderOnePagerUrl: lender.lenderOnePagerUrl || '',
    upfrontChecklist: lender.upfrontChecklist || '',
    postTermSheetChecklist: lender.postTermSheetChecklist || '',
  };
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// Horizontal scroll container with fade indicators
function HorizontalScrollContainer({ children }: { children: React.ReactNode }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showLeftFade, setShowLeftFade] = useState(false);
  const [showRightFade, setShowRightFade] = useState(false);

  const checkScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    
    setShowLeftFade(el.scrollLeft > 0);
    setShowRightFade(el.scrollLeft < el.scrollWidth - el.clientWidth - 1);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    
    checkScroll();
    el.addEventListener('scroll', checkScroll);
    
    // Check on resize
    const resizeObserver = new ResizeObserver(checkScroll);
    resizeObserver.observe(el);
    
    return () => {
      el.removeEventListener('scroll', checkScroll);
      resizeObserver.disconnect();
    };
  }, [checkScroll]);

  const scrollBy = (direction: 'left' | 'right') => {
    const el = scrollRef.current;
    if (!el) return;
    const amount = direction === 'left' ? -160 : 160;
    el.scrollBy({ left: amount, behavior: 'smooth' });
  };

  return (
    <div className="relative">
      {/* Left fade + arrow */}
      <div 
        className={cn(
          "absolute left-0 top-0 bottom-2 w-12 bg-gradient-to-r from-background to-transparent z-10 pointer-events-none transition-opacity duration-200",
          showLeftFade ? "opacity-100" : "opacity-0"
        )}
      />
      {showLeftFade && (
        <Button
          variant="ghost"
          size="icon"
          className="absolute left-0 top-1/2 -translate-y-1/2 z-20 h-8 w-8 rounded-full bg-background/80 shadow-md hover:bg-background"
          onClick={() => scrollBy('left')}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
      )}
      
      {/* Scrollable content */}
      <div 
        ref={scrollRef}
        className="overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-muted scrollbar-track-transparent"
      >
        <div className="flex gap-3 px-1" style={{ minWidth: 'min-content' }}>
          {children}
        </div>
      </div>
      
      {/* Right fade + arrow */}
      <div 
        className={cn(
          "absolute right-0 top-0 bottom-2 w-12 bg-gradient-to-l from-background to-transparent z-10 pointer-events-none transition-opacity duration-200",
          showRightFade ? "opacity-100" : "opacity-0"
        )}
      />
      {showRightFade && (
        <Button
          variant="ghost"
          size="icon"
          className="absolute right-0 top-1/2 -translate-y-1/2 z-20 h-8 w-8 rounded-full bg-background/80 shadow-md hover:bg-background"
          onClick={() => scrollBy('right')}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}

// Editable deal tile for inline stage/notes editing
function EditableDealTile({ 
  deal,
  stages,
  onUpdateLender,
  onNavigate,
  formatCurrency,
  variant = 'active',
}: { 
  deal: { dealId: string; company: string; stage: string; value: number; manager: string; lenderId: string; notes: string; passed?: boolean; passReason?: string };
  stages: { id: string; label: string }[];
  onUpdateLender: (lenderId: string, updates: Record<string, unknown>) => Promise<void>;
  onNavigate: (dealId: string) => void;
  formatCurrency: (value: number) => string;
  variant?: 'active' | 'sent';
}) {
  const { resolveStage } = useLenderLabelResolver();
  const stageLabel = resolveStage(deal.stage);
  const [isEditing, setIsEditing] = useState(false);
  const [editStage, setEditStage] = useState(deal.stage);
  const [editNotes, setEditNotes] = useState(deal.notes);
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const updates: Record<string, unknown> = {};
      if (editStage !== deal.stage) updates.stage = editStage;
      if (editNotes !== deal.notes) updates.notes = editNotes;
      
      if (Object.keys(updates).length > 0) {
        await onUpdateLender(deal.lenderId, updates);
        toast.success('Lender updated');
      }
      setIsEditing(false);
    } catch (err) {
      toast.error('Failed to update lender');
    } finally {
      setIsSaving(false);
    }
  };

  if (isEditing) {
    return (
      <div 
        className="flex-shrink-0 w-[220px] p-3 bg-muted/50 rounded-lg border border-primary/30 space-y-2"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="font-medium text-sm truncate">{deal.company}</p>
        <div>
          <Label className="text-xs text-muted-foreground">Stage</Label>
          <Select value={editStage} onValueChange={setEditStage}>
            <SelectTrigger className="h-7 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="z-[9999]">
              {stages.map((s) => (
                <SelectItem key={s.id} value={s.id} className="text-xs">{s.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">Notes</Label>
          <Textarea
            value={editNotes}
            onChange={(e) => setEditNotes(e.target.value)}
            placeholder="Add notes..."
            rows={2}
            className="text-xs resize-none"
          />
        </div>
        <div className="flex gap-1.5">
          <Button size="sm" className="h-6 text-xs flex-1" onClick={handleSave} disabled={isSaving}>
            {isSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Save'}
          </Button>
          <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => { setIsEditing(false); setEditStage(deal.stage); setEditNotes(deal.notes); }} disabled={isSaving}>
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div 
      className={cn(
        "flex-shrink-0 w-[180px] p-3 bg-muted/50 rounded-lg hover:bg-muted transition-colors cursor-pointer group border border-border/50 hover:border-border relative",
        deal.passed && "border-l-2 border-l-destructive"
      )}
      onClick={() => onNavigate(deal.dealId)}
    >
      <div className="absolute top-2 right-2 flex items-center gap-0.5">
        <button
          className="p-1 rounded hover:bg-background/80 text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity z-10"
          onClick={(e) => { e.stopPropagation(); e.preventDefault(); setIsEditing(true); }}
          title="Edit stage & notes"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
      </div>
      <p className="font-medium text-sm truncate mb-1 pr-6">{deal.company}</p>
      <p className="text-lg font-semibold text-primary">{formatCurrency(deal.value)}</p>
      <Badge variant="outline" className="text-[10px] mt-1 font-normal">{deal.stage}</Badge>
      {deal.notes && (
        <p className="text-[10px] text-muted-foreground mt-1 line-clamp-2">{deal.notes}</p>
      )}
      <p className="text-xs text-muted-foreground mt-1 truncate">{deal.manager}</p>
    </div>
  );
}

export function LenderDetailDialog({ lender, open, onOpenChange, onEdit, onDelete, onSave, initialEditMode = false }: LenderDetailDialogProps) {
  const { deals, updateLender: updateDealLender } = useDealsContext();
  const { pipelines } = usePipelineContext();
  const { stages } = useDealStages();
  const criteriaOptions = useLenderCriteriaOptions();
  const { user } = useAuth();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<LenderAttachmentCategory>('general');
  const [isEditMode, setIsEditMode] = useState(initialEditMode);
  const [isSaving, setIsSaving] = useState(false);
  const [isReorderDialogOpen, setIsReorderDialogOpen] = useState(false);
  const [industrySearchEdit, setIndustrySearchEdit] = useState('');
  const [loanTypeSearchEdit, setLoanTypeSearchEdit] = useState('');
  const [reqSearchEdit, setReqSearchEdit] = useState('');
  const [geoSearchEdit, setGeoSearchEdit] = useState('');
  const [editForm, setEditForm] = useState<LenderEditData>({
    name: '',
    contactName: '',
    contactPhone: '',
    email: '',
    lenderType: '',
    minDeal: '',
    maxDeal: '',
    geo: '',
    industries: '',
    loanTypes: '',
    description: '',
    minRevenue: '',
    ebitdaMin: '',
    companyRequirements: '',
    lenderNotes: '',
    tier: '',
    relationshipOwners: '',
    websiteUrl: '',
    linkedinUrl: '',
    address: '',
    phoneMain: '',
    contactTitle: '',
    b2bB2c: '',
    sponsorship: '',
    cashBurn: '',
    subDebt: '',
    refinancing: '',
    industriesToAvoid: '',
    nda: '',
    referralLender: '',
    referralFeeOffered: '',
    referralAgreement: '',
    aboutNotes: '',
    fundingSourceNotes: '',
    lenderOnePagerUrl: '',
    upfrontChecklist: '',
    postTermSheetChecklist: '',
  });
  
  const { sectionOrder, setSectionOrderDirect, resetToDefault } = useLenderSectionOrder();
  
  const { attachments, isLoading: isLoadingAttachments, uploadMultipleAttachments, deleteAttachment } = useLenderAttachments(
    open ? lender?.name ?? null : null
  );
  
  const { contacts: additionalContacts, addContact, updateContact: updateAdditionalContact, deleteContact: deleteAdditionalContact } = useLenderContacts(
    open ? lender?.id ?? null : null
  );

  const { entries: auditEntries, isLoading: isLoadingAudit, logChange } = useLenderAuditLog(
    open ? lender?.id : undefined
  );

  // Initialize edit form when entering edit mode or when lender changes
  useEffect(() => {
    if (lender && isEditMode) {
      setEditForm(buildEditForm(lender));
    }
  }, [lender, isEditMode]);

  // Reset edit mode when dialog closes, or set it when opened with initialEditMode
  useEffect(() => {
    if (!open) {
      setIsEditMode(false);
    } else if (initialEditMode) {
      setIsEditMode(true);
    }
  }, [open, initialEditMode]);

  const handleEnterEditMode = () => {
    if (lender) {
      setEditForm(buildEditForm(lender));
      setIsEditMode(true);
    }
  };

  const handleCancelEdit = () => {
    setIsEditMode(false);
  };

  const handleSaveEdit = async () => {
    if (!lender?.id || !onSave) return;
    
    setIsSaving(true);
    try {
      // Detect changed fields for audit log
      const fieldMap: Record<string, { label: string; oldVal: string; newVal: string }> = {};
      const checkField = (key: keyof LenderEditData, label: string, oldValue: string) => {
        const newVal = editForm[key];
        if (oldValue !== newVal) {
          fieldMap[key] = { label, oldVal: oldValue, newVal };
        }
      };
      checkField('name', 'Name', lender.name || '');
      checkField('tier', 'Tier', lender.tier?.replace(/^T/, '') || '');
      checkField('lenderType', 'Funding Source Type', lender.lenderType || '');
      checkField('minDeal', 'Min Deal Size', lender.minDeal?.toString() || '');
      checkField('maxDeal', 'Max Deal Size', lender.maxDeal?.toString() || '');
      checkField('geo', 'Geography', lender.geo || '');
      checkField('industries', 'Industries', lender.industries?.join(', ') || '');
      checkField('loanTypes', 'Loan Types', lender.loanTypes?.join(', ') || '');
      checkField('description', 'Description', lender.description || '');
      checkField('minRevenue', 'Min Revenue', lender.minRevenue?.toString() || '');
      checkField('ebitdaMin', 'EBITDA Min', lender.ebitdaMin?.toString() || '');
      checkField('companyRequirements', 'Company Requirements', lender.companyRequirements || '');
      checkField('lenderNotes', 'Funding Source Notes', lender.lenderNotes || '');
      checkField('relationshipOwners', 'Relationship Owners', lender.relationshipOwners || '');

      await onSave(lender.id, editForm);

      // Log each changed field
      const changedKeys = Object.keys(fieldMap);
      if (changedKeys.length > 0) {
        for (const key of changedKeys) {
          const { label, oldVal, newVal } = fieldMap[key];
          await logChange('updated', label, oldVal, newVal);
        }
      }

      setIsEditMode(false);
    } finally {
      setIsSaving(false);
    }
  };

  const handleNavigateToDeal = (dealId: string) => {
    onOpenChange(false);
    navigate(`/deal/${dealId}`);
  };

  const startUpload = async (files: File[]) => {
    if (!files.length) return;
    if (!lender?.name) {
      toast.error('Upload failed — please try again');
      return;
    }
    setIsUploading(true);
    try {
      const results = await uploadMultipleAttachments(files, selectedCategory);
      if (!results || results.length === 0) {
        toast.error('Upload failed — please try again');
      }
    } catch (err) {
      console.error('Lender attachment upload failed:', err);
      toast.error('Upload failed — please try again');
    } finally {
      setIsUploading(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      const list = Array.from(files);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      void startUpload(list);
    }
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = e.dataTransfer.files;
    if (files.length > 0) {
      void startUpload(Array.from(files));
    }
  };

  const getCategoryLabel = (value: string) => {
    return LENDER_ATTACHMENT_CATEGORIES.find(c => c.value === value)?.label || value;
  };

  // Group attachments by category
  const groupedAttachments = useMemo(() => {
    const groups: Record<string, LenderAttachment[]> = {};
    attachments.forEach(att => {
      const cat = att.category || 'general';
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(att);
    });
    return groups;
  }, [attachments]);

  const handleDeleteAttachment = async (attachment: LenderAttachment) => {
    await deleteAttachment(attachment);
  };

  // Find all deals where this funding source is involved
  const lenderDeals = useMemo(() => {
    if (!lender) return { active: [], sent: [], passReasons: [] };

    const active: { dealId: string; dealName: string; company: string; stage: string; status: string; value: number; manager: string; lenderId: string; notes: string }[] = [];
    const sent: { dealId: string; dealName: string; company: string; stage: string; dateSent: string; value: number; manager: string; passed?: boolean; passReason?: string; lenderId: string; notes: string }[] = [];
    const passReasons: { dealId: string; dealName: string; company: string; reason: string }[] = [];
    const activeDealIds = new Set<string>();

    // Shared active/inactive rules (kept in sync with the directory "N active" badge).
    const normalizeStatus = normalizeLenderStatus;
    const pipelineNameById = new Map(pipelines.map(p => [p.id, normalizeStatus(p.name)]));

    deals.forEach(deal => {
      const dealLender = deal.lenders?.find(l => l.name === lender.name);
      if (dealLender) {
        const isActive = isActiveLenderDeal(deal as any, dealLender as any, pipelineNameById);
        const inactive = !isActive;
        const passed = normalizeStatus(dealLender.trackingStatus) === 'passed'
          || normalizeStatus(dealLender.stage) === 'passed';



        if (inactive) {
          if (passed && dealLender.passReason) {
            passReasons.push({
              dealId: deal.id,
              dealName: deal.name,
              company: deal.company,
              reason: dealLender.passReason,
            });
          }
          sent.push({
            dealId: deal.id,
            dealName: deal.name,
            company: deal.company,
            stage: dealLender.stage,
            dateSent: dealLender.updatedAt || deal.createdAt,
            value: deal.value,
            manager: deal.manager,
            passed,
            passReason: dealLender.passReason,
            lenderId: dealLender.id,
            notes: dealLender.notes || '',
          });
        } else {
          active.push({
            dealId: deal.id,
            dealName: deal.name,
            company: deal.company,
            stage: dealLender.stage,
            status: dealLender.trackingStatus,
            value: deal.value,
            manager: deal.manager,
            lenderId: dealLender.id,
            notes: dealLender.notes || '',
          });
          activeDealIds.add(deal.id);
        }
      }
    });

    // Second pass: everything else that isn't active and wasn't already listed.
    const sentDealIds = new Set(sent.map(s => s.dealId));
    deals.forEach(deal => {
      const dealLender = deal.lenders?.find(l => l.name === lender.name);
      if (dealLender && !activeDealIds.has(deal.id) && !sentDealIds.has(deal.id)) {
        sent.push({
          dealId: deal.id,
          dealName: deal.name,
          company: deal.company,
          stage: dealLender.stage,
          dateSent: dealLender.updatedAt || deal.createdAt,
          value: deal.value,
          manager: deal.manager,
          passed: false,
          lenderId: dealLender.id,
          notes: dealLender.notes || '',
        });
      }
    });


    return { active, sent, passReasons };
  }, [lender, deals, pipelines]);

  const { formatCurrencyValue } = usePreferences();

  if (!lender) return null;

  return (
    <Dialog open={open} onOpenChange={(newOpen) => {
      if (!newOpen && isEditMode) {
        setIsEditMode(false);
      }
      onOpenChange(newOpen);
    }}>
      <DialogContent
        overlayClassName="bg-slate-900/25"
        className="w-[min(1100px,calc(100vw-2rem))] max-w-[min(1100px,calc(100vw-2rem))] max-h-[calc(100dvh-2rem)] min-h-0 overflow-hidden !flex !flex-col gap-0 p-0 border-transparent glass-border-soft shadow-2xl shadow-black/20"
      >
        <div className="shrink-0 px-6 pt-5 pb-4 border-b border-border/60">
        <DialogHeader className="flex flex-col gap-1 pr-8 min-w-0">
          <div className="flex flex-row items-center justify-between gap-2 min-w-0">
            <DialogTitle className="flex items-center gap-2 text-xl text-foreground min-w-0 flex-1">
              {isEditMode ? (
                <Select
                  value={editForm.tier || 'none'}
                  onValueChange={(value) => setEditForm({ ...editForm, tier: value === 'none' ? '' : value })}
                >
                  <SelectTrigger className="w-[80px] h-8 text-foreground">
                    <SelectValue placeholder="Tier" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    <SelectItem value="1">T1</SelectItem>
                    <SelectItem value="2">T2</SelectItem>
                    <SelectItem value="3">T3</SelectItem>
                  </SelectContent>
                </Select>
              ) : lender.tier ? (
                <Badge 
                  variant={lender.tier === '1' || lender.tier === 'T1' ? 'green' : lender.tier === '2' || lender.tier === 'T2' ? 'blue' : lender.tier === '3' || lender.tier === 'T3' ? 'amber' : 'purple'} 
                  className="text-xs font-bold px-2 py-0.5"
                >
                  {lender.tier.startsWith('T') ? lender.tier : `T${lender.tier}`}
                </Badge>
              ) : null}
              
              {isEditMode ? (
                <Input
                  value={editForm.name}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  className="h-8 text-lg font-semibold max-w-[300px] text-foreground"
                  placeholder="Lender name"
                />
              ) : (
                <>
                  <span className="truncate">{lender.name}</span>
                  <LenderFlagIndicator lenderName={lender.name} />
                </>
              )}
            </DialogTitle>
            <div className="flex items-center gap-1 shrink-0">
              {!isEditMode && (
                <>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 gap-1.5"
                    onClick={() => navigate(`/lenders/${encodeURIComponent(lender.name)}/history`)}
                    title="View deal history"
                  >
                    <History className="h-4 w-4" />
                    Deal history
                  </Button>
                  <LenderNotesPopover lenderName={lender.name} masterLenderId={lender.id} side="bottom" />
                </>
              )}
              {isEditMode ? (
                <>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 gap-1.5"
                    onClick={handleCancelEdit}
                    disabled={isSaving}
                  >
                    <X className="h-4 w-4" />
                    Cancel
                  </Button>
                  <Button
                    variant="default"
                    size="sm"
                    className="h-8 gap-1.5"
                    onClick={handleSaveEdit}
                    disabled={isSaving}
                  >
                    {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    Save
                  </Button>
                </>
              ) : (
                <>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => setIsReorderDialogOpen(true)}
                      >
                        <Settings2 className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">Customize layout</TooltipContent>
                  </Tooltip>
                  {onSave && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={handleEnterEditMode}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="bottom">Edit lender</TooltipContent>
                    </Tooltip>
                  )}
                  {onDelete && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                          onClick={() => {
                            onOpenChange(false);
                            onDelete(lender.name);
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="bottom">Delete lender</TooltipContent>
                    </Tooltip>
                  )}
                </>
              )}
            </div>
          </div>
          {!isEditMode && lender.lenderType && (
            <div className="flex flex-wrap gap-1.5">
              {lender.lenderType.split(',').map((type, idx) => (
                <Badge key={idx} variant="outline" className="text-xs font-normal">
                  {type.trim()}
                </Badge>
              ))}
            </div>
          )}
        </DialogHeader>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-6 py-5">
          <div className="space-y-6">
            {/* Edit Mode: Description/Notes */}
            {isEditMode ? (
              <>
                <section>
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                    About / Notes
                  </h3>
                  <Textarea
                    value={editForm.description}
                    onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                    placeholder="Additional notes about the funding source..."
                    rows={3}
                    className="text-sm"
                  />
                </section>
                <Separator />

                {/* Edit Mode: Funding Source Type */}
                <section>
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                    Funding Source Type
                  </h3>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="w-full justify-between h-auto min-h-[2.25rem] text-sm font-normal">
                        {editForm.lenderType ? (
                          <span className="flex flex-wrap gap-1">
                            {editForm.lenderType.split(',').map((t, i) => (
                              <Badge key={i} variant="secondary" className="text-xs">{t.trim()}</Badge>
                            ))}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">Select lender types</span>
                        )}
                        <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0 ml-1" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent
                      className="w-56 p-2 z-[9999] text-slate-100"
                      align="start"
                      onOpenAutoFocus={(e) => e.preventDefault()}
                      onCloseAutoFocus={(e) => e.preventDefault()}
                      style={{
                        background: 'hsl(220 45% 12%)',
                        borderColor: 'hsl(220 45% 40% / 0.28)',
                      }}
                    >
                      <div
                        className="space-y-1 max-h-[300px] overflow-y-auto overscroll-contain pr-1"
                        onWheel={(e) => e.stopPropagation()}
                        onTouchMove={(e) => e.stopPropagation()}
                      >
                        {LENDER_TYPE_OPTIONS.map((type) => {
                          const current = editForm.lenderType ? editForm.lenderType.split(',').map(t => t.trim()).filter(Boolean) : [];
                          const isSelected = current.includes(type);
                          return (
                            <button
                              key={type}
                              type="button"
                              className="flex items-center gap-2 w-full px-2 py-1.5 text-sm rounded hover:bg-muted/50 text-left"
                              onPointerDown={(e) => {
                                // Prevent focus shift / outside-close races inside Dialog focus trap
                                e.preventDefault();
                                e.stopPropagation();
                                const newTypes = isSelected
                                  ? current.filter(t => t !== type)
                                  : [...current, type];
                                setEditForm({ ...editForm, lenderType: newTypes.join(',') });
                              }}
                              onClick={(e) => {
                                // Keyboard activation fallback (Enter/Space)
                                e.preventDefault();
                                e.stopPropagation();
                              }}
                            >
                              <Checkbox checked={isSelected} className="pointer-events-none" />
                              {type}
                            </button>
                          );
                        })}
                      </div>
                    </PopoverContent>
                  </Popover>
                </section>
                <Separator />

                {/* Edit Mode: Contact Information */}
                <section>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                      Contact
                    </h3>
                    {lender?.id && (
                      <AddLenderContactDialog onAdd={addContact} />
                    )}
                  </div>
                  <div className="grid gap-3">
                    {(additionalContacts.length > 0 || (editForm.contactName || editForm.email || editForm.contactPhone)) && (
                      <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground">Primary Contact</Label>
                        <Select
                          value="__current"
                          onValueChange={async (val) => {
                            if (val === '__current' || !lender?.id) return;
                            const promoted = additionalContacts.find((c) => c.id === val);
                            if (!promoted) return;
                            const prevPrimary = {
                              name: editForm.contactName,
                              email: editForm.email,
                              phone: editForm.contactPhone,
                            };
                            // Promote selected contact into primary form fields
                            setEditForm((f) => ({
                              ...f,
                              contactName: promoted.name || '',
                              email: promoted.email || '',
                              contactPhone: promoted.phone || '',
                            }));
                            // Remove the promoted contact from the additional list
                            await deleteAdditionalContact(promoted.id);
                            // Demote the previous primary into an additional contact if it had data
                            if (prevPrimary.name || prevPrimary.email || prevPrimary.phone) {
                              await addContact({
                                name: prevPrimary.name || 'Previous Primary',
                                email: prevPrimary.email || null,
                                phone: prevPrimary.phone || null,
                              });
                            }
                            toast.success(`${promoted.name} is now the primary contact — save to persist`);
                          }}
                        >
                          <SelectTrigger className="text-sm h-9">
                            <SelectValue placeholder="Select primary contact" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__current">
                              {editForm.contactName || 'Unnamed primary'}
                              {editForm.email ? ` — ${editForm.email}` : ''}
                            </SelectItem>
                            {additionalContacts.map((c) => (
                              <SelectItem key={c.id} value={c.id}>
                                {c.name}{c.email ? ` — ${c.email}` : ''}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <p className="text-xs text-muted-foreground">
                          Switching promotes the selected contact and moves the current primary into Additional Contacts.
                        </p>
                      </div>
                    )}
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">Primary Contact Name</Label>
                      <Input
                        value={editForm.contactName}
                        onChange={(e) => setEditForm({ ...editForm, contactName: e.target.value })}
                        placeholder="Primary contact name"
                        className="text-sm"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">Primary Email</Label>
                      <Input
                        type="email"
                        value={editForm.email}
                        onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                        placeholder="email@example.com"
                        className="text-sm"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">Primary Phone</Label>
                      <Input
                        type="tel"
                        value={editForm.contactPhone}
                        onChange={(e) => setEditForm({ ...editForm, contactPhone: e.target.value })}
                        placeholder="(555) 123-4567"
                        className="text-sm"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">Relationship Owner(s)</Label>
                      <Input
                        value={editForm.relationshipOwners}
                        onChange={(e) => setEditForm({ ...editForm, relationshipOwners: e.target.value })}
                        placeholder="e.g., John Smith, Jane Doe"
                        className="text-sm"
                      />
                      <p className="text-xs text-muted-foreground">Comma-separated list of owners</p>
                    </div>
                  </div>
                  <LenderContactsList 
                    contacts={additionalContacts} 
                    onDelete={deleteAdditionalContact}
                    onUpdate={updateAdditionalContact}
                    isEditMode={true}
                  />
                </section>
                <Separator />

                {/* Edit Mode: Business Info */}
                <section>
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                    Business Info
                  </h3>
                  <div className="grid gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">Website</Label>
                      <Input
                        type="url"
                        value={editForm.websiteUrl}
                        onChange={(e) => setEditForm({ ...editForm, websiteUrl: e.target.value })}
                        placeholder="https://example.com"
                        className="text-sm"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">LinkedIn</Label>
                      <Input
                        type="url"
                        value={editForm.linkedinUrl}
                        onChange={(e) => setEditForm({ ...editForm, linkedinUrl: e.target.value })}
                        placeholder="https://www.linkedin.com/company/..."
                        className="text-sm"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">Phone</Label>
                      <Input
                        type="tel"
                        value={editForm.phoneMain}
                        onChange={(e) => setEditForm({ ...editForm, phoneMain: e.target.value })}
                        placeholder="(555) 123-4567"
                        className="text-sm"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">Address</Label>
                      <Textarea
                        value={editForm.address}
                        onChange={(e) => setEditForm({ ...editForm, address: e.target.value })}
                        placeholder="Street, City, State, Zip"
                        rows={2}
                        className="text-sm"
                      />
                    </div>
                  </div>
                </section>
                <Separator />

                {/* Edit Mode: Lending Criteria */}
                <section>
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                    Lending Criteria
                  </h3>
                  <div className="grid gap-4">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground">Min Deal Size</Label>
                        <Input
                          type="text"
                          inputMode="numeric"
                          value={formatCurrencyInput(editForm.minDeal)}
                          onChange={(e) => setEditForm({ ...editForm, minDeal: e.target.value.replace(/[^0-9]/g, '') })}
                          placeholder="e.g., $500,000"
                          className="text-sm"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground">Max Deal Size</Label>
                        <Input
                          type="text"
                          inputMode="numeric"
                          value={formatCurrencyInput(editForm.maxDeal)}
                          onChange={(e) => setEditForm({ ...editForm, maxDeal: e.target.value.replace(/[^0-9]/g, '') })}
                          placeholder="e.g., $25,000,000"
                          className="text-sm"
                        />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">Geographic Preference</Label>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button variant="outline" className="w-full justify-between h-auto min-h-[2.25rem] text-sm font-normal">
                            {editForm.geo ? (
                              <span className="flex flex-wrap gap-1">
                                {editForm.geo.split(',').filter(t => t.trim()).map((t, i) => (
                                  <Badge key={i} variant="secondary" className="text-xs">{t.trim()}</Badge>
                                ))}
                              </span>
                            ) : (
                              <span className="text-muted-foreground">Select regions</span>
                            )}
                            <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0 ml-1" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent
                          className="lender-edit-popover w-64 p-2 z-[9999]"
                          align="start"
                          onKeyDown={(e) => { if (e.key === 'Escape') e.stopPropagation(); }}
                        >
                          <div className="mb-2">
                            <Input
                              placeholder="Search regions..."
                              value={geoSearchEdit}
                              onChange={(e) => setGeoSearchEdit(e.target.value)}
                              className="h-7 text-xs"
                            />
                          </div>
                          <div className="space-y-0.5 max-h-[300px] overflow-y-auto overscroll-contain pr-1" onWheel={(e) => e.stopPropagation()} onTouchMove={(e) => e.stopPropagation()}>
                            {(geoSearchEdit
                              ? GEO_OPTIONS.filter(o => o.toLowerCase().includes(geoSearchEdit.toLowerCase()))
                              : GEO_OPTIONS
                            ).map((geo) => {
                              const current = editForm.geo ? editForm.geo.split(',').map(t => t.trim()).filter(Boolean) : [];
                              const isSelected = current.includes(geo);
                              return (
                                <button
                                  key={geo}
                                  type="button"
                                  className="flex items-center gap-2 w-full px-2 py-1 text-xs rounded hover:bg-muted/50 text-left"
                                  onPointerDown={(e) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                    const newGeos = isSelected
                                      ? current.filter(t => t !== geo)
                                      : [...current, geo];
                                    setEditForm({ ...editForm, geo: newGeos.join(',') });
                                    }}
                                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
                                >
                                  <Checkbox checked={isSelected} className="pointer-events-none h-3.5 w-3.5" />
                                  {geo}
                                </button>
                              );
                            })}
                          </div>
                        </PopoverContent>
                      </Popover>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">Industries</Label>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button variant="outline" className="w-full justify-between h-auto min-h-[2.25rem] text-sm font-normal">
                            {editForm.industries ? (
                              <span className="flex flex-wrap gap-1">
                                {editForm.industries.split(',').filter(t => t.trim()).map((t, i) => (
                                  <Badge key={i} variant="secondary" className="text-xs">{t.trim()}</Badge>
                                ))}
                              </span>
                            ) : (
                              <span className="text-muted-foreground">Select industries</span>
                            )}
                            <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0 ml-1" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent
                          className="lender-edit-popover w-64 p-2 z-[9999]"
                          align="start"
                          onKeyDown={(e) => { if (e.key === 'Escape') e.stopPropagation(); }}
                        >
                          <div className="mb-2">
                            <Input
                              placeholder="Search industries..."
                              value={industrySearchEdit}
                              onChange={(e) => setIndustrySearchEdit(e.target.value)}
                              className="h-7 text-xs"
                            />
                          </div>
                          <div className="space-y-0.5 max-h-[300px] overflow-y-auto overscroll-contain pr-1" onWheel={(e) => e.stopPropagation()} onTouchMove={(e) => e.stopPropagation()}>
                            {(industrySearchEdit
                              ? getIndustryOptions().filter(o => o.toLowerCase().includes(industrySearchEdit.toLowerCase()))
                              : getIndustryOptions()
                            ).map((industry) => {
                              const current = editForm.industries ? editForm.industries.split(',').map(t => t.trim()).filter(Boolean) : [];
                              const isSelected = current.includes(industry);
                              return (
                                <button
                                  key={industry}
                                  type="button"
                                  className="flex items-center gap-2 w-full px-2 py-1 text-xs rounded hover:bg-muted/50 text-left"
                                  onPointerDown={(e) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                    const newIndustries = isSelected
                                      ? current.filter(t => t !== industry)
                                      : [...current, industry];
                                    setEditForm({ ...editForm, industries: newIndustries.join(',') });
                                    }}
                                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
                                >
                                  <Checkbox checked={isSelected} className="pointer-events-none h-3.5 w-3.5" />
                                  {industry}
                                </button>
                              );
                            })}
                          </div>
                        </PopoverContent>
                      </Popover>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">Loan Types</Label>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button variant="outline" className="w-full justify-between h-auto min-h-[2.25rem] text-sm font-normal">
                            {editForm.loanTypes ? (
                              <span className="flex flex-wrap gap-1">
                                {editForm.loanTypes.split(',').filter(t => t.trim()).map((t, i) => (
                                  <Badge key={i} variant="secondary" className="text-xs">{t.trim()}</Badge>
                                ))}
                              </span>
                            ) : (
                              <span className="text-muted-foreground">Select loan types</span>
                            )}
                            <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0 ml-1" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent
                          className="lender-edit-popover w-64 p-2 z-[9999]"
                          align="start"
                          onKeyDown={(e) => { if (e.key === 'Escape') e.stopPropagation(); }}
                        >
                          <div className="mb-2">
                            <Input
                              placeholder="Search loan types..."
                              value={loanTypeSearchEdit}
                              onChange={(e) => setLoanTypeSearchEdit(e.target.value)}
                              className="h-7 text-xs"
                            />
                          </div>
                          <div className="space-y-0.5 max-h-[300px] overflow-y-auto overscroll-contain pr-1" onWheel={(e) => e.stopPropagation()} onTouchMove={(e) => e.stopPropagation()}>
                            {(loanTypeSearchEdit
                              ? LOAN_TYPE_OPTIONS.filter(o => o.toLowerCase().includes(loanTypeSearchEdit.toLowerCase()))
                              : LOAN_TYPE_OPTIONS
                            ).map((loanType) => {
                              const current = editForm.loanTypes ? editForm.loanTypes.split(',').map(t => t.trim()).filter(Boolean) : [];
                              const isSelected = current.includes(loanType);
                              return (
                                <button
                                  key={loanType}
                                  type="button"
                                  className="flex items-center gap-2 w-full px-2 py-1 text-xs rounded hover:bg-muted/50 text-left"
                                  onPointerDown={(e) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                    const newTypes = isSelected
                                      ? current.filter(t => t !== loanType)
                                      : [...current, loanType];
                                    setEditForm({ ...editForm, loanTypes: newTypes.join(',') });
                                    }}
                                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
                                >
                                  <Checkbox checked={isSelected} className="pointer-events-none h-3.5 w-3.5" />
                                  {loanType}
                                </button>
                              );
                            })}
                          </div>
                        </PopoverContent>
                      </Popover>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground">Min Revenue</Label>
                        <Input
                          type="text"
                          inputMode="numeric"
                          value={formatCurrencyInput(editForm.minRevenue)}
                          onChange={(e) => setEditForm({ ...editForm, minRevenue: e.target.value.replace(/[^0-9]/g, '') })}
                          placeholder="e.g., $5,000,000"
                          className="text-sm"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground">Min EBITDA</Label>
                        <Input
                          type="text"
                          inputMode="numeric"
                          value={formatCurrencyInput(editForm.ebitdaMin)}
                          onChange={(e) => setEditForm({ ...editForm, ebitdaMin: e.target.value.replace(/[^0-9]/g, '') })}
                          placeholder="e.g., $1,000,000"
                          className="text-sm"
                        />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">Company Requirements</Label>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button variant="outline" className="w-full justify-between h-auto min-h-[2.25rem] text-sm font-normal">
                            {editForm.companyRequirements ? (
                              <span className="flex flex-wrap gap-1">
                                {editForm.companyRequirements.split(',').filter(t => t.trim()).map((t, i) => (
                                  <Badge key={i} variant="secondary" className="text-xs">{t.trim()}</Badge>
                                ))}
                              </span>
                            ) : (
                              <span className="text-muted-foreground">Select requirements</span>
                            )}
                            <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0 ml-1" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent
                          className="lender-edit-popover w-72 p-2 z-[9999]"
                          align="start"
                          onKeyDown={(e) => { if (e.key === 'Escape') e.stopPropagation(); }}
                        >
                          <div className="mb-2">
                            <Input
                              placeholder="Search requirements..."
                              value={reqSearchEdit}
                              onChange={(e) => setReqSearchEdit(e.target.value)}
                              className="h-7 text-xs"
                            />
                          </div>
                          <div className="space-y-0.5 max-h-[300px] overflow-y-auto overscroll-contain pr-1" onWheel={(e) => e.stopPropagation()} onTouchMove={(e) => e.stopPropagation()}>
                            {(reqSearchEdit
                              ? COMPANY_REQUIREMENT_OPTIONS.filter(o => o.toLowerCase().includes(reqSearchEdit.toLowerCase()))
                              : COMPANY_REQUIREMENT_OPTIONS
                            ).map((req) => {
                              const current = editForm.companyRequirements ? editForm.companyRequirements.split(',').map(t => t.trim()).filter(Boolean) : [];
                              const isSelected = current.includes(req);
                              return (
                                <button
                                  key={req}
                                  type="button"
                                  className="flex items-center gap-2 w-full px-2 py-1 text-xs rounded hover:bg-muted/50 text-left"
                                  onPointerDown={(e) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                    const newReqs = isSelected
                                      ? current.filter(t => t !== req)
                                      : [...current, req];
                                    setEditForm({ ...editForm, companyRequirements: newReqs.join(',') });
                                    }}
                                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
                                >
                                  <Checkbox checked={isSelected} className="pointer-events-none h-3.5 w-3.5" />
                                  {req}
                                </button>
                              );
                            })}
                          </div>
                        </PopoverContent>
                      </Popover>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground">Sponsorship</Label>
                        <CriteriaSelect
                          value={editForm.sponsorship}
                          onChange={(v) => setEditForm({ ...editForm, sponsorship: v })}
                          options={criteriaOptions.sponsorship}
                          placeholder="Sponsorship required?"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground">Cash Burn</Label>
                        <CriteriaSelect
                          value={editForm.cashBurn}
                          onChange={(v) => setEditForm({ ...editForm, cashBurn: v })}
                          options={criteriaOptions.cashBurn}
                          placeholder="Cash burn OK?"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground">Sub Debt</Label>
                        <CriteriaSelect
                          value={editForm.subDebt}
                          onChange={(v) => setEditForm({ ...editForm, subDebt: v })}
                          options={criteriaOptions.subDebt}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground">Refinancing</Label>
                        <CriteriaSelect
                          value={editForm.refinancing}
                          onChange={(v) => setEditForm({ ...editForm, refinancing: v })}
                          options={criteriaOptions.refinancing}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground">B2B / B2C</Label>
                        <CriteriaSelect
                          value={editForm.b2bB2c}
                          onChange={(v) => setEditForm({ ...editForm, b2bB2c: v })}
                          options={criteriaOptions.b2bB2c.length ? criteriaOptions.b2bB2c : B2B_B2C_OPTIONS}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground">NDA</Label>
                        <CriteriaSelect
                          value={editForm.nda}
                          onChange={(v) => setEditForm({ ...editForm, nda: v })}
                          options={criteriaOptions.nda}
                        />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">Industries to Avoid</Label>
                      <Input
                        value={editForm.industriesToAvoid || ''}
                        onChange={(e) => setEditForm({ ...editForm, industriesToAvoid: e.target.value })}
                        placeholder="Comma-separated list"
                        className="text-sm"
                      />
                    </div>
                  </div>
                </section>
                <Separator />

                {/* Edit Mode: Referral & Checklists */}
                <section>
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                    Referral & Checklists
                  </h3>
                  <div className="grid gap-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground">Referral Funding Source</Label>
                        <Input
                          value={editForm.referralLender || ''}
                          onChange={(e) => setEditForm({ ...editForm, referralLender: e.target.value })}
                          className="text-sm"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground">Referral Fee Offered</Label>
                        <Input
                          value={editForm.referralFeeOffered || ''}
                          onChange={(e) => setEditForm({ ...editForm, referralFeeOffered: e.target.value })}
                          className="text-sm"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground">Referral Agreement</Label>
                        <Input
                          value={editForm.referralAgreement || ''}
                          onChange={(e) => setEditForm({ ...editForm, referralAgreement: e.target.value })}
                          className="text-sm"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground">One Pager URL</Label>
                        <Input
                          type="url"
                          value={editForm.lenderOnePagerUrl || ''}
                          onChange={(e) => setEditForm({ ...editForm, lenderOnePagerUrl: e.target.value })}
                          className="text-sm"
                        />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">Upfront Checklist</Label>
                      <Textarea
                        value={editForm.upfrontChecklist || ''}
                        onChange={(e) => setEditForm({ ...editForm, upfrontChecklist: e.target.value })}
                        rows={3}
                        className="text-sm"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">Post-Term Sheet Checklist</Label>
                      <Textarea
                        value={editForm.postTermSheetChecklist || ''}
                        onChange={(e) => setEditForm({ ...editForm, postTermSheetChecklist: e.target.value })}
                        rows={3}
                        className="text-sm"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">About Notes</Label>
                      <Textarea
                        value={editForm.aboutNotes || ''}
                        onChange={(e) => setEditForm({ ...editForm, aboutNotes: e.target.value })}
                        rows={3}
                        className="text-sm"
                      />
                    </div>
                  </div>
                </section>
                <Separator />

                {/* Edit Mode: Funding Source Notes */}
                <section>
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                    Funding Source Notes
                  </h3>
                  <Textarea
                    value={editForm.lenderNotes}
                    onChange={(e) => setEditForm({ ...editForm, lenderNotes: e.target.value })}
                    placeholder="Add your notes about this funding source..."
                    rows={4}
                    className="text-sm"
                  />
                </section>
                <Separator />
              </>
            ) : (
              <>
                {sectionOrder.map((sectionId, index) => {
                  const showSeparator = index < sectionOrder.length - 1;
                  
                  switch (sectionId) {
                    case 'lending-criteria':
                      return (
                        <div key={sectionId}>
                          <section>
                            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                              Lending Criteria
                            </h3>
                            <div className="grid gap-3">
                              {(lender.minDeal || lender.maxDeal) && (
                                <div className="flex items-start gap-3">
                                  <DollarSign className="h-4 w-4 text-muted-foreground mt-0.5" />
                                  <div>
                                    <span className="text-sm font-medium">Deal Size: </span>
                                    <span className="text-sm">
                                      {lender.minDeal && lender.maxDeal
                                        ? `${formatLenderCurrency(lender.minDeal)} - ${formatLenderCurrency(lender.maxDeal)}`
                                        : lender.minDeal
                                        ? `${formatLenderCurrency(lender.minDeal)}+`
                                        : `Up to ${formatLenderCurrency(lender.maxDeal)}`}
                                    </span>
                                  </div>
                                </div>
                              )}
                              {lender.geo && (
                                <div className="flex items-start gap-3">
                                  <MapPin className="h-4 w-4 text-muted-foreground mt-0.5" />
                                  <div>
                                    <span className="text-sm font-medium block mb-1.5">Geography:</span>
                                    <div className="flex flex-wrap gap-1.5">
                                      {lender.geo.split(/[,;\n]+/).map((g, idx) => g.trim()).filter(g => g).map((geo, idx) => (
                                        <Badge key={idx} variant="green" className="text-xs">
                                          {geo}
                                        </Badge>
                                      ))}
                                    </div>
                                  </div>
                                </div>
                              )}
                              {lender.industries && lender.industries.length > 0 && (
                                <div className="flex items-start gap-3">
                                  <Briefcase className="h-4 w-4 text-muted-foreground mt-0.5" />
                                  <div>
                                    <span className="text-sm font-medium block mb-1.5">Industries:</span>
                                    <div className="flex flex-wrap gap-1.5">
                                      {lender.industries.map((industry, idx) => (
                                        <Badge key={idx} variant="blue" className="text-xs">
                                          {industry}
                                        </Badge>
                                      ))}
                                    </div>
                                  </div>
                                </div>
                              )}
                              {lender.loanTypes && lender.loanTypes.length > 0 && (
                                <div className="flex items-start gap-3">
                                  <Banknote className="h-4 w-4 text-muted-foreground mt-0.5" />
                                  <div>
                                    <span className="text-sm font-medium block mb-1.5">Loan Types:</span>
                                    <div className="flex flex-wrap gap-1.5">
                                      {lender.loanTypes.map((loanType, idx) => (
                                        <Badge key={idx} variant="purple" className="text-xs">
                                          {loanType}
                                        </Badge>
                                      ))}
                                    </div>
                                  </div>
                                </div>
                              )}
                              {lender.b2bB2c && (
                                <div className="flex items-start gap-3">
                                  <Tag className="h-4 w-4 text-muted-foreground mt-0.5" />
                                  <div>
                                    <span className="text-sm font-medium">B2B vs B2C: </span>
                                    <Badge variant="cyan" className="text-xs ml-1">
                                      {lender.b2bB2c}
                                    </Badge>
                                  </div>
                                </div>
                              )}
                              {lender.minRevenue && (
                                <div className="flex items-start gap-3">
                                  <DollarSign className="h-4 w-4 text-muted-foreground mt-0.5" />
                                  <div>
                                    <span className="text-sm font-medium">Min Revenue: </span>
                                    <span className="text-sm">{formatLenderCurrency(lender.minRevenue)}</span>
                                  </div>
                                </div>
                              )}
                              {lender.ebitdaMin && (
                                <div className="flex items-start gap-3">
                                  <DollarSign className="h-4 w-4 text-muted-foreground mt-0.5" />
                                  <div>
                                    <span className="text-sm font-medium">Min EBITDA: </span>
                                    <span className="text-sm">{formatLenderCurrency(lender.ebitdaMin)}</span>
                                  </div>
                                </div>
                              )}
                              {lender.companyRequirements && (
                                <div className="flex items-start gap-3">
                                  <Briefcase className="h-4 w-4 text-muted-foreground mt-0.5" />
                                  <div>
                                    <span className="text-sm font-medium block mb-1.5">Company Requirements:</span>
                                    <div className="flex flex-wrap gap-1.5">
                                      {lender.companyRequirements.split(/[,;\n]+/).map((r, idx) => r.trim()).filter(r => r).map((req, idx) => (
                                        <Badge key={idx} variant="amber" className="text-xs">
                                          {req}
                                        </Badge>
                                      ))}
                                    </div>
                                  </div>
                                </div>
                              )}
                              {([
                                ['Sponsorship', lender.sponsorship],
                                ['Cash Burn', lender.cashBurn],
                                ['Sub Debt', lender.subDebt],
                                ['Refinancing', lender.refinancing],
                                ['NDA', lender.nda],
                                ['Referral Funding Source', lender.referralLender],
                                ['Referral Fee Offered', lender.referralFeeOffered],
                                ['Referral Agreement', lender.referralAgreement],
                              ] as [string, string | null | undefined][]).filter(([, v]) => v && v.trim()).map(([label, value]) => (
                                <div key={label} className="flex items-start gap-3">
                                  <Tag className="h-4 w-4 text-muted-foreground mt-0.5" />
                                  <div>
                                    <span className="text-sm font-medium">{label}: </span>
                                    <span className="text-sm">{value}</span>
                                  </div>
                                </div>
                              ))}
                              {lender.industriesToAvoid && lender.industriesToAvoid.length > 0 && (
                                <div className="flex items-start gap-3">
                                  <Briefcase className="h-4 w-4 text-muted-foreground mt-0.5" />
                                  <div>
                                    <span className="text-sm font-medium block mb-1.5">Industries to Avoid:</span>
                                    <div className="flex flex-wrap gap-1.5">
                                      {lender.industriesToAvoid.map((industry, idx) => (
                                        <Badge key={idx} variant="destructive" className="text-xs">
                                          {industry}
                                        </Badge>
                                      ))}
                                    </div>
                                  </div>
                                </div>
                              )}
                              {!lender.minDeal && !lender.maxDeal && !lender.geo && (!lender.industries || lender.industries.length === 0) && (!lender.loanTypes || lender.loanTypes.length === 0) && !lender.minRevenue && !lender.ebitdaMin && !lender.companyRequirements && !lender.b2bB2c && !lender.sponsorship && !lender.cashBurn && !lender.subDebt && !lender.refinancing && !lender.nda && !lender.referralLender && !lender.referralFeeOffered && !lender.referralAgreement && (!lender.industriesToAvoid || lender.industriesToAvoid.length === 0) && (
                                <p className="text-muted-foreground text-sm">No lending criteria specified</p>
                              )}
                            </div>
                          </section>
                          {showSeparator && <Separator className="my-6" />}
                        </div>
                      );

                    case 'about':
                      if (!lender.description) return null;
                      return (
                        <div key={sectionId}>
                          <section>
                            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                              About
                            </h3>
                            <p className="text-sm leading-relaxed">{lender.description}</p>
                          </section>
                          {showSeparator && <Separator className="my-6" />}
                        </div>
                      );

                    case 'upfront-checklist':
                      if (!lender.upfrontChecklist) return null;
                      return (
                        <div key={sectionId}>
                          <Collapsible defaultOpen className="space-y-2">
                            <CollapsibleTrigger className="flex items-center gap-2 w-full group">
                              <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-data-[state=open]:rotate-90" />
                              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                                Upfront Checklist
                              </h3>
                              <Badge variant="secondary" className="text-xs ml-auto">
                                {lender.upfrontChecklist.split(/[,;\n]+/).filter(i => i.trim()).length}
                              </Badge>
                            </CollapsibleTrigger>
                            <CollapsibleContent>
                              <div className="flex flex-wrap gap-1.5 pt-2">
                                {lender.upfrontChecklist.split(/[,;\n]+/).map((item, idx) => {
                                  const trimmed = item.trim();
                                  return trimmed ? (
                                    <Badge key={idx} variant="green" className="text-xs">
                                      {trimmed}
                                    </Badge>
                                  ) : null;
                                })}
                              </div>
                            </CollapsibleContent>
                          </Collapsible>
                          {showSeparator && <Separator className="my-6" />}
                        </div>
                      );

                    case 'post-term-sheet-checklist':
                      if (!lender.postTermSheetChecklist) return null;
                      return (
                        <div key={sectionId}>
                          <Collapsible defaultOpen className="space-y-2">
                            <CollapsibleTrigger className="flex items-center gap-2 w-full group">
                              <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-data-[state=open]:rotate-90" />
                              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                                Post-Term Sheet Checklist
                              </h3>
                              <Badge variant="secondary" className="text-xs ml-auto">
                                {lender.postTermSheetChecklist.split(/[,;\n]+/).filter(i => i.trim()).length}
                              </Badge>
                            </CollapsibleTrigger>
                            <CollapsibleContent>
                              <div className="flex flex-wrap gap-1.5 pt-2">
                                {lender.postTermSheetChecklist.split(/[,;\n]+/).map((item, idx) => {
                                  const trimmed = item.trim();
                                  return trimmed ? (
                                    <Badge key={idx} variant="amber" className="text-xs">
                                      {trimmed}
                                    </Badge>
                                  ) : null;
                                })}
                              </div>
                            </CollapsibleContent>
                          </Collapsible>
                          {showSeparator && <Separator className="my-6" />}
                        </div>
                      );

                    case 'contact-info':
                      return (
                        <div key={sectionId}>
                          <section>
                            <div className="flex items-center justify-between mb-3">
                              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                                Contact
                              </h3>
                              {lender.id && (
                                <AddLenderContactDialog onAdd={addContact} />
                              )}
                            </div>
                            <div className="grid grid-cols-2 gap-6">
                              {/* Left column - Contact details */}
                              <div className="grid gap-3">
                                {additionalContacts.length > 0 && lender.id && onSave && (
                                  <div className="space-y-1">
                                    <Label className="text-xs text-muted-foreground">Primary Contact</Label>
                                    <Select
                                      value="__current"
                                      onValueChange={async (val) => {
                                        if (val === '__current' || !lender.id || !onSave) return;
                                        const promoted = additionalContacts.find((c) => c.id === val);
                                        if (!promoted) return;
                                        const prev = {
                                          name: lender.contact.name || '',
                                          email: lender.contact.email || '',
                                          phone: lender.contact.phone || '',
                                        };
                                        // Persist master lender primary swap
                                        await onSave(lender.id, {
                                          ...editForm,
                                          contactName: promoted.name || '',
                                          email: promoted.email || '',
                                          contactPhone: promoted.phone || '',
                                        } as LenderEditData);
                                        await deleteAdditionalContact(promoted.id);
                                        if (prev.name || prev.email || prev.phone) {
                                          await addContact({
                                            name: prev.name || 'Previous Primary',
                                            email: prev.email || null,
                                            phone: prev.phone || null,
                                          });
                                        }
                                        await logChange('updated', 'Primary Contact', prev.name, promoted.name);
                                        toast.success(`${promoted.name} is now the primary contact`);
                                      }}
                                    >
                                      <SelectTrigger className="text-sm h-8">
                                        <SelectValue />
                                      </SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="__current">
                                          {lender.contact.name || 'Unnamed'}{lender.contact.email ? ` — ${lender.contact.email}` : ''}
                                        </SelectItem>
                                        {additionalContacts.map((c) => (
                                          <SelectItem key={c.id} value={c.id}>
                                            {c.name}{c.email ? ` — ${c.email}` : ''}
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  </div>
                                )}
                                {lender.contact.name && (
                                  <div className="flex items-center gap-3">
                                    <User className="h-4 w-4 text-muted-foreground" />
                                    <span>
                                      {lender.contact.name}{lender.contact.title && `, ${lender.contact.title}`}
                                    </span>
                                  </div>
                                )}
                                {lender.contact.email && (
                                  <div className="flex items-center gap-3">
                                    <Mail className="h-4 w-4 text-muted-foreground" />
                                    <CopyableText text={lender.contact.email} href={`mailto:${lender.contact.email}`} className="text-primary hover:underline" iconSize="h-3.5 w-3.5" />
                                  </div>
                                )}
                                {lender.contact.phone && (
                                  <div className="flex items-center gap-3">
                                    <Phone className="h-4 w-4 text-muted-foreground" />
                                    <CopyableText text={lender.contact.phone} href={`tel:${lender.contact.phone}`} className="hover:underline" iconSize="h-3.5 w-3.5" />
                                  </div>
                                )}
                                {!lender.contact.name && !lender.contact.email && !lender.contact.phone && additionalContacts.length === 0 && (
                                  <p className="text-muted-foreground text-sm italic">No contact info</p>
                                )}
                              </div>
                              {/* Right column - Relationship Owners */}
                              <div>
                                <Label className="text-xs text-muted-foreground mb-2 block">Relationship Owner(s)</Label>
                                {lender.relationshipOwners ? (
                                  <div className="flex flex-wrap gap-1.5">
                                    {lender.relationshipOwners.split(',').map((owner, idx) => (
                                      <Badge key={idx} variant="secondary" className="text-xs">
                                        {owner.trim()}
                                      </Badge>
                                    ))}
                                  </div>
                                ) : (
                                  <p className="text-muted-foreground text-sm italic">None assigned</p>
                                )}
                              </div>
                            </div>
                            <LenderContactsList 
                              contacts={additionalContacts} 
                              onDelete={deleteAdditionalContact}
                              onUpdate={updateAdditionalContact}
                              isEditMode={false}
                            />
                          </section>
                          <section className="mt-6">
                            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                              Business Info
                            </h3>
                            <div className="grid grid-cols-2 gap-x-6 gap-y-3">
                              <div className="flex items-start gap-3">
                                <Globe className="h-4 w-4 text-muted-foreground mt-0.5" />
                                <div className="min-w-0 flex-1">
                                  <div className="text-xs text-muted-foreground mb-0.5">Website</div>
                                  {lender.websiteUrl ? (
                                    <a
                                      href={/^https?:\/\//i.test(lender.websiteUrl) ? lender.websiteUrl : `https://${lender.websiteUrl}`}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-sm text-primary hover:underline break-all"
                                    >
                                      {lender.websiteUrl}
                                    </a>
                                  ) : onSave ? (
                                    <button
                                      type="button"
                                      onClick={handleEnterEditMode}
                                      className="text-sm text-muted-foreground italic hover:text-foreground hover:underline"
                                    >
                                      Add website
                                    </button>
                                  ) : (
                                    <span className="text-sm text-muted-foreground italic">—</span>
                                  )}
                                </div>
                              </div>
                              <div className="flex items-start gap-3">
                                <ExternalLink className="h-4 w-4 text-muted-foreground mt-0.5" />
                                <div className="min-w-0 flex-1">
                                  <div className="text-xs text-muted-foreground mb-0.5">LinkedIn</div>
                                  {lender.linkedinUrl ? (
                                    <a
                                      href={/^https?:\/\//i.test(lender.linkedinUrl) ? lender.linkedinUrl : `https://${lender.linkedinUrl}`}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-sm text-primary hover:underline break-all"
                                    >
                                      {lender.linkedinUrl}
                                    </a>
                                  ) : onSave ? (
                                    <button
                                      type="button"
                                      onClick={handleEnterEditMode}
                                      className="text-sm text-muted-foreground italic hover:text-foreground hover:underline"
                                    >
                                      Add LinkedIn
                                    </button>
                                  ) : (
                                    <span className="text-sm text-muted-foreground italic">—</span>
                                  )}
                                </div>
                              </div>
                              <div className="flex items-start gap-3">
                                <Phone className="h-4 w-4 text-muted-foreground mt-0.5" />
                                <div className="min-w-0 flex-1">
                                  <div className="text-xs text-muted-foreground mb-0.5">Phone</div>
                                  {lender.phoneMain ? (
                                    <CopyableText
                                      text={lender.phoneMain}
                                      href={`tel:${lender.phoneMain}`}
                                      className="text-sm hover:underline"
                                      iconSize="h-3.5 w-3.5"
                                    />
                                  ) : onSave ? (
                                    <button
                                      type="button"
                                      onClick={handleEnterEditMode}
                                      className="text-sm text-muted-foreground italic hover:text-foreground hover:underline"
                                    >
                                      Add phone
                                    </button>
                                  ) : (
                                    <span className="text-sm text-muted-foreground italic">—</span>
                                  )}
                                </div>
                              </div>
                              <div className="flex items-start gap-3">
                                <MapPin className="h-4 w-4 text-muted-foreground mt-0.5" />
                                <div className="min-w-0 flex-1">
                                  <div className="text-xs text-muted-foreground mb-0.5">Address</div>
                                  {lender.address ? (
                                    <p className="text-sm whitespace-pre-wrap break-words">{lender.address}</p>
                                  ) : onSave ? (
                                    <button
                                      type="button"
                                      onClick={handleEnterEditMode}
                                      className="text-sm text-muted-foreground italic hover:text-foreground hover:underline"
                                    >
                                      Add address
                                    </button>
                                  ) : (
                                    <span className="text-sm text-muted-foreground italic">—</span>
                                  )}
                                </div>
                              </div>
                            </div>
                          </section>
                          {showSeparator && <Separator className="my-6" />}
                        </div>
                      );

                    case 'additional-preferences':
                      return (
                        <div key={sectionId}>
                          <section>
                            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                              Additional Preferences
                            </h3>
                            {lender.preferences.length > 0 ? (
                              <div className="flex flex-wrap gap-2">
                                {lender.preferences.map((pref) => (
                                  <Badge key={pref} variant="secondary">
                                    {pref}
                                  </Badge>
                                ))}
                              </div>
                            ) : (
                              <div className="flex items-center justify-between gap-3 rounded-md border border-dashed border-border/60 px-4 py-3">
                                <p className="text-sm text-muted-foreground italic">
                                  No additional preferences recorded
                                </p>
                                {onSave && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={handleEnterEditMode}
                                    className="gap-1.5"
                                  >
                                    <Pencil className="h-3.5 w-3.5" />
                                    Add preferences
                                  </Button>
                                )}
                              </div>
                            )}
                          </section>
                          {showSeparator && <Separator className="my-6" />}
                        </div>
                      );

                    case 'lender-notes':
                      return (
                        <div key={sectionId}>
                          <section>
                            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                              Funding Source Notes
                            </h3>
                            {lender.lenderNotes ? (
                              <p className="text-sm leading-relaxed whitespace-pre-wrap">{lender.lenderNotes}</p>
                            ) : (
                              <p className="text-muted-foreground text-sm italic">No notes added yet</p>
                            )}
                          </section>
                          {showSeparator && <Separator className="my-6" />}
                        </div>
                      );

                    case 'active-deals':
                      return (
                        <div key={sectionId}>
                          <section>
                            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3 flex items-center gap-2">
                              <CheckCircle className="h-4 w-4 text-green-500" />
                              Active Deals ({lenderDeals.active.length})
                            </h3>
                            {lenderDeals.active.length > 0 ? (
                              <HorizontalScrollContainer>
                                {lenderDeals.active.map((deal) => (
                                  <EditableDealTile
                                    key={deal.dealId}
                                    deal={deal}
                                    stages={stages}
                                    onUpdateLender={updateDealLender}
                                    onNavigate={handleNavigateToDeal}
                                    formatCurrency={formatCurrencyValue}
                                    variant="active"
                                  />
                                ))}
                              </HorizontalScrollContainer>
                            ) : (
                              <p className="text-muted-foreground text-sm">No active deals with this funding source</p>
                            )}
                          </section>
                          {showSeparator && <Separator className="my-6" />}
                        </div>
                      );

                    case 'attachments':
                      if (!user) return null;
                      return (
                        <div key={sectionId}>
                          <section>
                            <div className="flex items-center justify-between mb-3">
                              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                                <Paperclip className="h-4 w-4" />
                                Attachments ({attachments.length + (lender.website ? 1 : 0)})
                              </h3>
                            </div>
                            
                            <div className="flex items-center gap-2 mb-3">
                              <FolderOpen className="h-4 w-4 text-muted-foreground" />
                              <Select value={selectedCategory} onValueChange={(v) => setSelectedCategory(v as LenderAttachmentCategory)} disabled={isUploading}>
                                <SelectTrigger className="flex-1">
                                  <SelectValue placeholder="Select category" />
                                </SelectTrigger>
                                <SelectContent>
                                  {LENDER_ATTACHMENT_CATEGORIES.map((cat) => (
                                    <SelectItem key={cat.value} value={cat.value}>
                                      {cat.label}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <div
                              onDragOver={isUploading ? undefined : handleDragOver}
                              onDragLeave={isUploading ? undefined : handleDragLeave}
                              onDrop={isUploading ? undefined : handleDrop}
                              onClick={() => !isUploading && fileInputRef.current?.click()}
                              className={cn(
                                "border-2 border-dashed rounded-lg p-4 mb-3 text-center transition-colors",
                                isUploading
                                  ? "border-muted-foreground/25 bg-muted/40 cursor-wait"
                                  : "cursor-pointer " + (isDragging
                                    ? "border-primary bg-primary/5"
                                    : "border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/50")
                              )}
                            >
                              <input
                                type="file"
                                multiple
                                ref={fileInputRef}
                                onChange={handleFileChange}
                                className="hidden"
                                disabled={isUploading}
                              />
                              <div className="flex flex-col items-center gap-2 py-2">
                                {isUploading ? (
                                  <>
                                    <Loader2 className="h-6 w-6 animate-spin text-primary" />
                                    <p className="text-sm text-muted-foreground">Uploading…</p>
                                  </>
                                ) : (
                                  <>
                                    <Upload className={cn(
                                      "h-6 w-6 transition-colors",
                                      isDragging ? "text-primary" : "text-muted-foreground"
                                    )} />
                                    <p className="text-sm text-muted-foreground">
                                      {isDragging ? "Drop files here" : "Drag & drop or click to upload (multiple files supported)"}
                                    </p>
                                  </>
                                )}
                              </div>
                            </div>
                            
                            {isLoadingAttachments ? (
                              <div className="flex items-center justify-center py-4">
                                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                              </div>
                            ) : attachments.length > 0 ? (
                              <div className="space-y-4">
                                {Object.entries(groupedAttachments).map(([category, catAttachments]) => (
                                  <div key={category}>
                                    <div className="flex items-center gap-2 mb-2">
                                      <Badge variant="secondary" className="text-xs">
                                        {getCategoryLabel(category)}
                                      </Badge>
                                      <span className="text-xs text-muted-foreground">
                                        ({catAttachments.length})
                                      </span>
                                    </div>
                                    <div className="space-y-2">
                                      {catAttachments.map((attachment) => (
                                        <div
                                          key={attachment.id}
                                          className="flex items-center justify-between p-3 bg-muted/50 rounded-lg group"
                                        >
                                          <a
                                            href={attachment.url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="flex items-center gap-3 flex-1 min-w-0 hover:text-primary"
                                          >
                                            <FileText className="h-4 w-4 shrink-0" />
                                            <div className="min-w-0">
                                              <p className="font-medium truncate">{attachment.name}</p>
                                              <p className="text-xs text-muted-foreground">
                                                {formatFileSize(attachment.size_bytes)}
                                              </p>
                                            </div>
                                          </a>
                                          <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity text-destructive hover:text-destructive"
                                            onClick={() => handleDeleteAttachment(attachment)}
                                          >
                                            <Trash2 className="h-4 w-4" />
                                          </Button>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <p className="text-muted-foreground text-sm">No attachments uploaded</p>
                            )}
                          </section>
                          {showSeparator && <Separator className="my-6" />}
                        </div>
                      );

                    case 'deals-sent':
                      return (
                        <div key={sectionId}>
                          <section>
                            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3 flex items-center gap-2">
                              <Briefcase className="h-4 w-4 text-primary" />
                              Deals Sent ({lenderDeals.sent.length})
                            </h3>
                            {lenderDeals.sent.length > 0 ? (
                              <HorizontalScrollContainer>
                                {lenderDeals.sent.map((deal) => (
                                  <EditableDealTile
                                    key={deal.dealId}
                                    deal={deal}
                                    stages={stages}
                                    onUpdateLender={updateDealLender}
                                    onNavigate={handleNavigateToDeal}
                                    formatCurrency={formatCurrencyValue}
                                    variant="sent"
                                  />
                                ))}
                              </HorizontalScrollContainer>
                            ) : (
                              <p className="text-muted-foreground text-sm">No deals have been sent to this funding source</p>
                            )}
                          </section>
                          {showSeparator && <Separator className="my-6" />}
                        </div>
                      );

                    case 'pass-reasons':
                      return (
                        <div key={sectionId}>
                          <section>
                            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3 flex items-center gap-2">
                              <ThumbsDown className="h-4 w-4 text-destructive" />
                              Pass Reasons ({lenderDeals.passReasons.length})
                            </h3>
                            {lenderDeals.passReasons.length > 0 ? (
                              <HorizontalScrollContainer>
                                {lenderDeals.passReasons.map((item) => (
                                  <Tooltip key={item.dealId}>
                                    <TooltipTrigger asChild>
                                      <div 
                                        className="flex-shrink-0 w-[140px] p-3 bg-muted/50 rounded-lg hover:bg-muted transition-colors cursor-pointer group border border-border/50 hover:border-border relative"
                                        onClick={() => handleNavigateToDeal(item.dealId)}
                                      >
                                        <ArrowRight className="h-3 w-3 absolute top-2 right-2 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                                        <p className="font-medium text-sm truncate mb-1 pr-4">{item.company}</p>
                                        <p className="text-xs text-destructive/80 line-clamp-2">{item.reason}</p>
                                      </div>
                                    </TooltipTrigger>
                                    <TooltipContent side="bottom" className="max-w-[200px]">
                                      <p className="font-medium">{item.company}</p>
                                      <p className="text-xs text-muted-foreground">Reason: {item.reason}</p>
                                    </TooltipContent>
                                  </Tooltip>
                                ))}
                              </HorizontalScrollContainer>
                            ) : (
                              <p className="text-muted-foreground text-sm">No pass history with this funding source</p>
                            )}
                          </section>
                        </div>
                      );

                    case 'change-log':
                      return (
                        <div key={sectionId}>
                          <section>
                            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3 flex items-center gap-2">
                              <History className="h-4 w-4" />
                              Change Log ({auditEntries.length})
                            </h3>
                            {isLoadingAudit ? (
                              <p className="text-sm text-muted-foreground">Loading...</p>
                            ) : auditEntries.length > 0 ? (
                              <div className="space-y-2 max-h-60 overflow-y-auto">
                                {auditEntries.map((entry) => (
                                  <div key={entry.id} className="flex items-start gap-3 text-sm">
                                    <Clock className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-baseline gap-1 flex-wrap">
                                        <span className="font-medium text-foreground">
                                          {entry.field_changed || entry.action}
                                        </span>
                                        {entry.action === 'updated' && entry.field_changed && (
                                          <span className="text-muted-foreground">updated</span>
                                        )}
                                      </div>
                                      {entry.old_value && entry.new_value && (
                                        <p className="text-xs text-muted-foreground mt-0.5 truncate">
                                          <span className="line-through">{entry.old_value.substring(0, 60)}</span>
                                          {' → '}
                                          <span className="text-foreground">{entry.new_value.substring(0, 60)}</span>
                                        </p>
                                      )}
                                      {!entry.old_value && entry.new_value && (
                                        <p className="text-xs text-muted-foreground mt-0.5 truncate">
                                          Set to: <span className="text-foreground">{entry.new_value.substring(0, 80)}</span>
                                        </p>
                                      )}
                                      <div className="flex items-center gap-2 mt-0.5">
                                        {entry.user_display_name && (
                                          <span className="text-xs text-primary font-medium">{entry.user_display_name}</span>
                                        )}
                                        <span className="text-xs text-muted-foreground">
                                          {format(new Date(entry.created_at), 'MMM d, h:mm a')}
                                        </span>
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <p className="text-muted-foreground text-sm">No changes recorded yet</p>
                            )}
                          </section>
                          {showSeparator && <Separator className="mt-6" />}
                        </div>
                      );

                    default:
                      return null;
                  }
                })}
              </>
            )}

            {/* Call Recordings */}
            {lender?.id && (
              <ClaapCallsSection entityType="lender" entityId={lender.id} entityName={lender.name} />
            )}
          </div>
        </div>
      </DialogContent>
      
      <LenderSectionReorderDialog
        open={isReorderDialogOpen}
        onOpenChange={setIsReorderDialogOpen}
        sectionOrder={sectionOrder}
        onSave={setSectionOrderDirect}
        onReset={resetToDefault}
      />
    </Dialog>
  );
}