import { useMemo, useRef, useState, DragEvent, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2, Mail, Phone, User, Briefcase, ThumbsDown, CheckCircle, ExternalLink, Globe, Paperclip, Upload, Trash2, FileText, Loader2, FolderOpen, ChevronLeft, ChevronRight, ArrowRight, Pencil, DollarSign, MapPin, Tag, Banknote, X, Save } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible';
import { Input } from '@/components/ui/input';
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
import { useLenderAttachments, LenderAttachment, LENDER_ATTACHMENT_CATEGORIES, LenderAttachmentCategory } from '@/hooks/useLenderAttachments';
import { useAuth } from '@/contexts/AuthContext';
import { usePreferences } from '@/contexts/PreferencesContext';
import { cn } from '@/lib/utils';

interface LenderInfo {
  id?: string;
  name: string;
  contact: {
    name: string;
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
}

export interface LenderEditData {
  name: string;
  contactName: string;
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
}

interface LenderDetailDialogProps {
  lender: LenderInfo | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEdit?: (lenderName: string) => void;
  onDelete?: (lenderName: string) => void;
  onSave?: (lenderId: string, data: LenderEditData) => Promise<void>;
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

export function LenderDetailDialog({ lender, open, onOpenChange, onEdit, onDelete, onSave }: LenderDetailDialogProps) {
  const { deals } = useDealsContext();
  const { user } = useAuth();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<LenderAttachmentCategory>('general');
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [isEditMode, setIsEditMode] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editForm, setEditForm] = useState<LenderEditData>({
    name: '',
    contactName: '',
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
  });
  
  const { attachments, isLoading: isLoadingAttachments, uploadMultipleAttachments, deleteAttachment } = useLenderAttachments(
    open ? lender?.name ?? null : null
  );

  // Initialize edit form when entering edit mode or when lender changes
  useEffect(() => {
    if (lender && isEditMode) {
      setEditForm({
        name: lender.name || '',
        contactName: lender.contact.name || '',
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
      });
    }
  }, [lender, isEditMode]);

  // Reset edit mode when dialog closes
  useEffect(() => {
    if (!open) {
      setIsEditMode(false);
    }
  }, [open]);

  const handleEnterEditMode = () => {
    if (lender) {
      setEditForm({
        name: lender.name || '',
        contactName: lender.contact.name || '',
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
      });
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
      await onSave(lender.id, editForm);
      setIsEditMode(false);
    } finally {
      setIsSaving(false);
    }
  };

  const handleNavigateToDeal = (dealId: string) => {
    onOpenChange(false);
    navigate(`/deal/${dealId}`);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      setPendingFiles(Array.from(files));
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleConfirmUpload = async () => {
    if (pendingFiles.length > 0) {
      setIsUploading(true);
      await uploadMultipleAttachments(pendingFiles, selectedCategory);
      setIsUploading(false);
      setPendingFiles([]);
      setSelectedCategory('general');
    }
  };

  const handleCancelUpload = () => {
    setPendingFiles([]);
    setSelectedCategory('general');
  };

  const handleRemovePendingFile = (index: number) => {
    setPendingFiles(prev => prev.filter((_, i) => i !== index));
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
      setPendingFiles(Array.from(files));
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

  // Find all deals where this lender is involved
  const lenderDeals = useMemo(() => {
    if (!lender) return { active: [], sent: [], passReasons: [] };

    const active: { dealId: string; dealName: string; company: string; stage: string; status: string; value: number; manager: string }[] = [];
    const sent: { dealId: string; dealName: string; company: string; stage: string; dateSent: string; value: number; manager: string }[] = [];
    const passReasons: { dealId: string; dealName: string; company: string; reason: string }[] = [];
    const activeAndPassedDealIds = new Set<string>();

    deals.forEach(deal => {
      const dealLender = deal.lenders?.find(l => l.name === lender.name);
      if (dealLender) {
        // Check if passed (has pass reason)
        if (dealLender.trackingStatus === 'passed' && dealLender.passReason) {
          passReasons.push({
            dealId: deal.id,
            dealName: deal.name,
            company: deal.company,
            reason: dealLender.passReason,
          });
          activeAndPassedDealIds.add(deal.id);
        } else if (dealLender.trackingStatus === 'active' && dealLender.stage?.toLowerCase() !== 'passed') {
          // Only add to active if stage is NOT "Passed" (case-insensitive)
          active.push({
            dealId: deal.id,
            dealName: deal.name,
            company: deal.company,
            stage: dealLender.stage,
            status: dealLender.trackingStatus,
            value: deal.value,
            manager: deal.manager,
          });
          activeAndPassedDealIds.add(deal.id);
        }
      }
    });

    // Second pass: add to "sent" only if not already in active or passReasons
    deals.forEach(deal => {
      const dealLender = deal.lenders?.find(l => l.name === lender.name);
      if (dealLender && !activeAndPassedDealIds.has(deal.id)) {
        sent.push({
          dealId: deal.id,
          dealName: deal.name,
          company: deal.company,
          stage: dealLender.stage,
          dateSent: dealLender.updatedAt || deal.createdAt,
          value: deal.value,
          manager: deal.manager,
        });
      }
    });

    return { active, sent, passReasons };
  }, [lender, deals]);

  const { formatCurrencyValue } = usePreferences();

  if (!lender) return null;

  return (
    <Dialog open={open} onOpenChange={(newOpen) => {
      if (!newOpen && isEditMode) {
        setIsEditMode(false);
      }
      onOpenChange(newOpen);
    }}>
      <DialogContent className="max-w-2xl max-h-[85vh]">
        <DialogHeader className="flex flex-row items-start justify-between gap-4 pr-8">
          <DialogTitle className="flex items-center gap-2 text-xl">
            <Building2 className="h-6 w-6" />
            {isEditMode ? (
              <Input
                value={editForm.name}
                onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                className="h-8 text-lg font-semibold max-w-[200px]"
                placeholder="Lender name"
              />
            ) : (
              <>
                <span>{lender.name}</span>
                {lender.lenderType && (
                  <Badge variant="outline" className="ml-1 text-xs font-normal">
                    {lender.lenderType}
                  </Badge>
                )}
              </>
            )}
          </DialogTitle>
          <div className="flex items-center gap-1">
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
                    <TooltipContent>Edit lender</TooltipContent>
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
                    <TooltipContent>Delete lender</TooltipContent>
                  </Tooltip>
                )}
              </>
            )}
          </div>
        </DialogHeader>

        <ScrollArea className="max-h-[calc(85vh-100px)] pr-4">
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
                    placeholder="Additional notes about the lender..."
                    rows={3}
                    className="text-sm"
                  />
                </section>
                <Separator />

                {/* Edit Mode: Lender Type */}
                <section>
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                    Lender Type
                  </h3>
                  <Input
                    value={editForm.lenderType}
                    onChange={(e) => setEditForm({ ...editForm, lenderType: e.target.value })}
                    placeholder="e.g., Bank, Venture Debt, ABL"
                    className="text-sm"
                  />
                </section>
                <Separator />

                {/* Edit Mode: Contact Information */}
                <section>
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                    Contact Information
                  </h3>
                  <div className="grid gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">Contact Name</Label>
                      <Input
                        value={editForm.contactName}
                        onChange={(e) => setEditForm({ ...editForm, contactName: e.target.value })}
                        placeholder="Primary contact name"
                        className="text-sm"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">Email</Label>
                      <Input
                        type="email"
                        value={editForm.email}
                        onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                        placeholder="email@example.com"
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
                        <Label className="text-xs text-muted-foreground">Min Deal Size ($)</Label>
                        <Input
                          type="number"
                          value={editForm.minDeal}
                          onChange={(e) => setEditForm({ ...editForm, minDeal: e.target.value })}
                          placeholder="e.g., 1000000"
                          className="text-sm"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground">Max Deal Size ($)</Label>
                        <Input
                          type="number"
                          value={editForm.maxDeal}
                          onChange={(e) => setEditForm({ ...editForm, maxDeal: e.target.value })}
                          placeholder="e.g., 25000000"
                          className="text-sm"
                        />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">Geographic Preference</Label>
                      <Input
                        value={editForm.geo}
                        onChange={(e) => setEditForm({ ...editForm, geo: e.target.value })}
                        placeholder="e.g., US, North America, Global"
                        className="text-sm"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">Industries (comma-separated)</Label>
                      <Input
                        value={editForm.industries}
                        onChange={(e) => setEditForm({ ...editForm, industries: e.target.value })}
                        placeholder="e.g., SaaS, Healthcare, Technology"
                        className="text-sm"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">Loan Types (comma-separated)</Label>
                      <Input
                        value={editForm.loanTypes}
                        onChange={(e) => setEditForm({ ...editForm, loanTypes: e.target.value })}
                        placeholder="e.g., Term Loan, Revolver, ABL"
                        className="text-sm"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground">Min Revenue ($)</Label>
                        <Input
                          type="number"
                          value={editForm.minRevenue}
                          onChange={(e) => setEditForm({ ...editForm, minRevenue: e.target.value })}
                          placeholder="e.g., 5000000"
                          className="text-sm"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground">Min EBITDA ($)</Label>
                        <Input
                          type="number"
                          value={editForm.ebitdaMin}
                          onChange={(e) => setEditForm({ ...editForm, ebitdaMin: e.target.value })}
                          placeholder="e.g., 1000000"
                          className="text-sm"
                        />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">Company Requirements</Label>
                      <Textarea
                        value={editForm.companyRequirements}
                        onChange={(e) => setEditForm({ ...editForm, companyRequirements: e.target.value })}
                        placeholder="e.g., Must be profitable, 2+ years in business..."
                        rows={2}
                        className="text-sm"
                      />
                    </div>
                  </div>
                </section>
                <Separator />
              </>
            ) : (
              <>
                {/* View Mode: Lending Criteria - MOVED TO TOP */}
                <section>
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                    Lending Criteria
                  </h3>
                  <div className="grid gap-3">
                    {/* Deal Size Range */}
                    {(lender.minDeal || lender.maxDeal) && (
                      <div className="flex items-start gap-3">
                        <DollarSign className="h-4 w-4 text-muted-foreground mt-0.5" />
                        <div>
                          <span className="text-sm font-medium">Deal Size: </span>
                          <span className="text-sm">
                            {lender.minDeal && lender.maxDeal
                              ? `${formatCurrencyValue(lender.minDeal)} - ${formatCurrencyValue(lender.maxDeal)}`
                              : lender.minDeal
                              ? `${formatCurrencyValue(lender.minDeal)}+`
                              : `Up to ${formatCurrencyValue(lender.maxDeal!)}`}
                          </span>
                        </div>
                      </div>
                    )}
                    
                    {/* Geographic Preferences */}
                    {lender.geo && (
                      <div className="flex items-start gap-3">
                        <MapPin className="h-4 w-4 text-muted-foreground mt-0.5" />
                        <div>
                          <span className="text-sm font-medium">Geography: </span>
                          <span className="text-sm">{lender.geo}</span>
                        </div>
                      </div>
                    )}

                    {/* Industries */}
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

                    {/* Loan Types */}
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

                    {/* B2B/B2C */}
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

                    {/* Minimum Revenue */}
                    {lender.minRevenue && (
                      <div className="flex items-start gap-3">
                        <DollarSign className="h-4 w-4 text-muted-foreground mt-0.5" />
                        <div>
                          <span className="text-sm font-medium">Min Revenue: </span>
                          <span className="text-sm">{formatCurrencyValue(lender.minRevenue)}</span>
                        </div>
                      </div>
                    )}

                    {/* Minimum EBITDA */}
                    {lender.ebitdaMin && (
                      <div className="flex items-start gap-3">
                        <DollarSign className="h-4 w-4 text-muted-foreground mt-0.5" />
                        <div>
                          <span className="text-sm font-medium">Min EBITDA: </span>
                          <span className="text-sm">{formatCurrencyValue(lender.ebitdaMin)}</span>
                        </div>
                      </div>
                    )}

                    {/* Company Requirements */}
                    {lender.companyRequirements && (
                      <div className="flex items-start gap-3">
                        <Briefcase className="h-4 w-4 text-muted-foreground mt-0.5" />
                        <div>
                          <span className="text-sm font-medium block mb-1">Company Requirements:</span>
                          <p className="text-sm text-muted-foreground">{lender.companyRequirements}</p>
                        </div>
                      </div>
                    )}

                    {!lender.minDeal && !lender.maxDeal && !lender.geo && (!lender.industries || lender.industries.length === 0) && (!lender.loanTypes || lender.loanTypes.length === 0) && !lender.minRevenue && !lender.ebitdaMin && !lender.companyRequirements && !lender.b2bB2c && (
                      <p className="text-muted-foreground text-sm">No lending criteria specified</p>
                    )}
                  </div>
                </section>

                <Separator />

                {/* View Mode: About (Description) - MOVED AFTER Lending Criteria */}
                {lender.description && (
                  <>
                    <section>
                      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                        About
                      </h3>
                      <p className="text-sm leading-relaxed">{lender.description}</p>
                    </section>
                    <Separator />
                  </>
                )}

                {/* View Mode: Upfront Checklist */}
                {lender.upfrontChecklist && (
                  <>
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
                    <Separator />
                  </>
                )}

                {/* View Mode: Post-Term Sheet Checklist */}
                {lender.postTermSheetChecklist && (
                  <>
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
                    <Separator />
                  </>
                )}

                {/* View Mode: Contact Information */}
                <section>
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                    Contact Information
                  </h3>
                  <div className="grid gap-3">
                    {lender.website && (
                      <div className="flex items-center gap-3">
                        <Globe className="h-4 w-4 text-muted-foreground" />
                        <a 
                          href={lender.website.startsWith('http') ? lender.website : `https://${lender.website}`} 
                          target="_blank" 
                          rel="noopener noreferrer" 
                          className="text-primary hover:underline flex items-center gap-1"
                        >
                          {lender.website.replace(/^https?:\/\//, '')}
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      </div>
                    )}
                    {lender.contact.name && (
                      <div className="flex items-center gap-3">
                        <User className="h-4 w-4 text-muted-foreground" />
                        <span>{lender.contact.name}</span>
                      </div>
                    )}
                    {lender.contact.email && (
                      <div className="flex items-center gap-3">
                        <Mail className="h-4 w-4 text-muted-foreground" />
                        <a href={`mailto:${lender.contact.email}`} className="text-primary hover:underline">
                          {lender.contact.email}
                        </a>
                      </div>
                    )}
                    {lender.contact.phone && (
                      <div className="flex items-center gap-3">
                        <Phone className="h-4 w-4 text-muted-foreground" />
                        <a href={`tel:${lender.contact.phone}`} className="hover:underline">
                          {lender.contact.phone}
                        </a>
                      </div>
                    )}
                    {!lender.website && !lender.contact.name && !lender.contact.email && !lender.contact.phone && (
                      <p className="text-muted-foreground text-sm">No contact information available</p>
                    )}
                  </div>
                </section>

                <Separator />

                {/* View Mode: Additional Preferences */}
                {lender.preferences.length > 0 && (
                  <section>
                    <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                      Additional Preferences
                    </h3>
                    <div className="flex flex-wrap gap-2">
                      {lender.preferences.map((pref, idx) => (
                        <Badge key={idx} variant="secondary">
                          {pref}
                        </Badge>
                      ))}
                    </div>
                  </section>
                )}

                {lender.preferences.length > 0 && <Separator />}
              </>
            )}

            {/* Active Deals - Always visible */}
            <section>
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3 flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-green-500" />
                Active Deals ({lenderDeals.active.length})
              </h3>
              {lenderDeals.active.length > 0 ? (
                <HorizontalScrollContainer>
                  {lenderDeals.active.map((deal) => (
                    <Tooltip key={deal.dealId}>
                      <TooltipTrigger asChild>
                        <div 
                          className="flex-shrink-0 w-[140px] p-3 bg-muted/50 rounded-lg hover:bg-muted transition-colors cursor-pointer group border border-border/50 hover:border-border relative"
                          onClick={() => handleNavigateToDeal(deal.dealId)}
                        >
                          <ArrowRight className="h-3 w-3 absolute top-2 right-2 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                          <p className="font-medium text-sm truncate mb-1 pr-4">{deal.company}</p>
                          <p className="text-lg font-semibold text-primary">{formatCurrencyValue(deal.value)}</p>
                          <p className="text-xs text-muted-foreground mt-1 truncate">{deal.manager}</p>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent side="bottom" className="max-w-[200px]">
                        <p className="font-medium">{deal.company}</p>
                        <p className="text-xs text-muted-foreground">Stage: {deal.stage}</p>
                        {deal.manager && <p className="text-xs text-muted-foreground">Manager: {deal.manager}</p>}
                      </TooltipContent>
                    </Tooltip>
                  ))}
                </HorizontalScrollContainer>
              ) : (
                <p className="text-muted-foreground text-sm">No active deals with this lender</p>
              )}
            </section>

            <Separator />

            {/* Attachments Section - Always visible */}
            {user && (
              <>
                <section>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                      <Paperclip className="h-4 w-4" />
                      Attachments ({attachments.length})
                    </h3>
                  </div>
                  
                  {/* Pending Files - Category Selection */}
                  {pendingFiles.length > 0 ? (
                    <div className="border rounded-lg p-4 mb-3 bg-muted/30">
                      <div className="space-y-2 mb-3 max-h-32 overflow-y-auto">
                        {pendingFiles.map((file, index) => (
                          <div key={index} className="flex items-center gap-3">
                            <FileText className="h-4 w-4 text-primary flex-shrink-0" />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate">{file.name}</p>
                              <p className="text-xs text-muted-foreground">{formatFileSize(file.size)}</p>
                            </div>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 text-muted-foreground hover:text-destructive"
                              onClick={() => handleRemovePendingFile(index)}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        ))}
                      </div>
                      <p className="text-xs text-muted-foreground mb-2">
                        {pendingFiles.length} file{pendingFiles.length > 1 ? 's' : ''} selected
                      </p>
                      <div className="flex items-center gap-2 mb-3">
                        <FolderOpen className="h-4 w-4 text-muted-foreground" />
                        <Select value={selectedCategory} onValueChange={(v) => setSelectedCategory(v as LenderAttachmentCategory)}>
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
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          onClick={handleConfirmUpload}
                          disabled={isUploading}
                          className="flex-1"
                        >
                          {isUploading ? (
                            <>
                              <Loader2 className="h-4 w-4 animate-spin mr-2" />
                              Uploading...
                            </>
                          ) : (
                            <>
                              <Upload className="h-4 w-4 mr-2" />
                              Upload {pendingFiles.length > 1 ? `${pendingFiles.length} Files` : ''}
                            </>
                          )}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={handleCancelUpload}
                          disabled={isUploading}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    /* Drag and Drop Zone */
                    <div
                      onDragOver={handleDragOver}
                      onDragLeave={handleDragLeave}
                      onDrop={handleDrop}
                      onClick={() => fileInputRef.current?.click()}
                      className={cn(
                        "border-2 border-dashed rounded-lg p-4 mb-3 text-center cursor-pointer transition-colors",
                        isDragging 
                          ? "border-primary bg-primary/5" 
                          : "border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/50"
                      )}
                    >
                      <input
                        type="file"
                        multiple
                        ref={fileInputRef}
                        onChange={handleFileChange}
                        className="hidden"
                      />
                      <div className="flex flex-col items-center gap-2 py-2">
                        <Upload className={cn(
                          "h-6 w-6 transition-colors",
                          isDragging ? "text-primary" : "text-muted-foreground"
                        )} />
                        <p className="text-sm text-muted-foreground">
                          {isDragging ? "Drop files here" : "Drag & drop or click to upload (multiple files supported)"}
                        </p>
                      </div>
                    </div>
                  )}
                  
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
                <Separator />
              </>
            )}

            {/* Deals Sent - Always visible */}
            <section>
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3 flex items-center gap-2">
                <Briefcase className="h-4 w-4 text-primary" />
                Deals Sent ({lenderDeals.sent.length})
              </h3>
              {lenderDeals.sent.length > 0 ? (
                <HorizontalScrollContainer>
                  {lenderDeals.sent.map((deal) => (
                    <Tooltip key={deal.dealId}>
                      <TooltipTrigger asChild>
                        <div 
                          className="flex-shrink-0 w-[140px] p-3 bg-muted/50 rounded-lg hover:bg-muted transition-colors cursor-pointer group border border-border/50 hover:border-border relative"
                          onClick={() => handleNavigateToDeal(deal.dealId)}
                        >
                          <ArrowRight className="h-3 w-3 absolute top-2 right-2 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                          <p className="font-medium text-sm truncate mb-1 pr-4">{deal.company}</p>
                          <p className="text-lg font-semibold text-primary">{formatCurrencyValue(deal.value)}</p>
                          <p className="text-xs text-muted-foreground mt-1 truncate">{deal.manager}</p>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent side="bottom" className="max-w-[200px]">
                        <p className="font-medium">{deal.company}</p>
                        <p className="text-xs text-muted-foreground">Stage: {deal.stage}</p>
                        {deal.manager && <p className="text-xs text-muted-foreground">Manager: {deal.manager}</p>}
                      </TooltipContent>
                    </Tooltip>
                  ))}
                </HorizontalScrollContainer>
              ) : (
                <p className="text-muted-foreground text-sm">No deals have been sent to this lender</p>
              )}
            </section>

            <Separator />

            {/* Pass Reasons - Always visible */}
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
                <p className="text-muted-foreground text-sm">No pass history with this lender</p>
              )}
            </section>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}