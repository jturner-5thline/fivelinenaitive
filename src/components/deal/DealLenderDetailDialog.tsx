import { useMemo, useRef, useState, DragEvent, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2, Mail, Phone, User, Briefcase, ThumbsDown, CheckCircle, ExternalLink, Globe, Paperclip, Upload, Trash2, FileText, Loader2, FolderOpen, ChevronLeft, ChevronRight, ArrowRight, Pencil, DollarSign, MapPin, Tag, Banknote, X, Save, Settings2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Checkbox } from '@/components/ui/checkbox';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible';
import { Label } from '@/components/ui/label';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useDealsContext } from '@/contexts/DealsContext';
import { useLenderAttachments, LenderAttachment, LENDER_ATTACHMENT_CATEGORIES, LenderAttachmentCategory } from '@/hooks/useLenderAttachments';
import { useLenderContacts } from '@/hooks/useLenderContacts';
import { useAuth } from '@/contexts/AuthContext';
import { usePreferences } from '@/contexts/PreferencesContext';
import { useLenderSectionOrder, LenderSectionId } from '@/hooks/useLenderSectionOrder';
import { LenderSectionReorderDialog } from '@/components/lenders/LenderSectionReorderDialog';
import { AddLenderContactDialog } from '@/components/lenders/AddLenderContactDialog';
import { LenderContactsList } from '@/components/lenders/LenderContactsList';
import { ActivityTimeline, ActivityItem } from '@/components/deals/ActivityTimeline';
import { OutstandingItem } from '@/hooks/useOutstandingItems';
import { cn } from '@/lib/utils';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useMasterLenders, MasterLender } from '@/hooks/useMasterLenders';

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
}

interface DealLenderDetailDialogProps {
  lenderName: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // Deal-specific props
  outstandingItems: OutstandingItem[];
  onUpdateOutstandingItem: (id: string, updates: Partial<OutstandingItem>) => void;
  activities: ActivityItem[];
  getLenderDeals: (lenderName: string) => Array<{
    dealId: string;
    dealName: string;
    company: string;
    lenderInfo: {
      status: string;
      trackingStatus: string;
    } | null;
  }>;
  lenderStatusConfig: Record<string, { label: string }>;
  lenderTrackingStatusConfig: Record<string, { label: string }>;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// Helper to convert MasterLender to LenderInfo for dialog compatibility
function masterLenderToLenderInfo(lender: MasterLender): LenderInfo {
  return {
    id: lender.id,
    name: lender.name,
    contact: {
      name: lender.contact_name || '',
      title: lender.contact_title || '',
      email: lender.email || '',
      phone: '',
    },
    preferences: [
      ...(lender.loan_types || []),
      ...(lender.industries || []),
      lender.geo,
    ].filter(Boolean) as string[],
    website: lender.lender_one_pager_url || undefined,
    description: lender.company_requirements || undefined,
    lenderType: lender.lender_type || undefined,
    minDeal: lender.min_deal,
    maxDeal: lender.max_deal,
    geo: lender.geo,
    industries: lender.industries,
    loanTypes: lender.loan_types,
    minRevenue: lender.min_revenue,
    ebitdaMin: lender.ebitda_min,
    companyRequirements: lender.company_requirements,
    upfrontChecklist: lender.upfront_checklist,
    postTermSheetChecklist: lender.post_term_sheet_checklist,
    b2bB2c: lender.b2b_b2c,
    lenderNotes: lender.deal_structure_notes,
    tier: lender.tier,
    relationshipOwners: lender.relationship_owners,
  };
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
      
      <div 
        ref={scrollRef}
        className="overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-muted scrollbar-track-transparent"
      >
        <div className="flex gap-3 px-1" style={{ minWidth: 'min-content' }}>
          {children}
        </div>
      </div>
      
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

export function DealLenderDetailDialog({ 
  lenderName, 
  open, 
  onOpenChange, 
  outstandingItems,
  onUpdateOutstandingItem,
  activities,
  getLenderDeals,
  lenderStatusConfig,
  lenderTrackingStatusConfig,
}: DealLenderDetailDialogProps) {
  const { deals } = useDealsContext();
  const { user } = useAuth();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<LenderAttachmentCategory>('general');
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [isReorderDialogOpen, setIsReorderDialogOpen] = useState(false);
  
  const { lenders: masterLenders } = useMasterLenders();
  const { sectionOrder, setSectionOrderDirect, resetToDefault } = useLenderSectionOrder();
  const { formatCurrencyValue } = usePreferences();

  // Find lender from master lenders
  const masterLender = useMemo(() => {
    if (!lenderName) return null;
    return masterLenders.find(l => l.name === lenderName) || null;
  }, [lenderName, masterLenders]);

  const lender = useMemo(() => {
    if (!masterLender) return null;
    return masterLenderToLenderInfo(masterLender);
  }, [masterLender]);
  
  const { attachments, isLoading: isLoadingAttachments, uploadMultipleAttachments, deleteAttachment } = useLenderAttachments(
    open ? lenderName : null
  );
  
  const { contacts: additionalContacts, addContact, deleteContact: deleteAdditionalContact } = useLenderContacts(
    open ? lender?.id ?? null : null
  );

  // Deal-specific data
  const lenderOutstandingItems = useMemo(() => {
    if (!lenderName) return [];
    return outstandingItems.filter(
      item => !item.deliveredToLenders.includes(lenderName) && (Array.isArray(item.requestedBy) 
        ? item.requestedBy.includes(lenderName)
        : item.requestedBy === lenderName)
    );
  }, [outstandingItems, lenderName]);

  const lenderActivities = useMemo(() => {
    if (!lenderName) return [];
    return activities.filter(
      activity => activity.description?.includes(lenderName) || 
        activity.metadata?.lenderName === lenderName
    );
  }, [activities, lenderName]);

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
        if (dealLender.trackingStatus === 'passed' && dealLender.passReason) {
          passReasons.push({
            dealId: deal.id,
            dealName: deal.name,
            company: deal.company,
            reason: dealLender.passReason,
          });
          activeAndPassedDealIds.add(deal.id);
        } else if (dealLender.trackingStatus === 'active' && dealLender.stage?.toLowerCase() !== 'passed') {
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

  if (!lenderName) return null;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl max-h-[80vh] min-h-0 overflow-hidden !flex !flex-col">
          <DialogHeader className="flex flex-col gap-1 pr-8">
            <div className="flex flex-row items-center justify-between gap-4">
              <DialogTitle className="flex items-center gap-2 text-xl text-foreground">
                {lender?.tier && (
                  <Badge 
                    variant={lender.tier === '1' || lender.tier === 'T1' ? 'green' : lender.tier === '2' || lender.tier === 'T2' ? 'blue' : lender.tier === '3' || lender.tier === 'T3' ? 'amber' : 'purple'} 
                    className="text-xs font-bold px-2 py-0.5"
                  >
                    {lender.tier.startsWith('T') ? lender.tier : `T${lender.tier}`}
                  </Badge>
                )}
                <span className="whitespace-nowrap">{lenderName}</span>
              </DialogTitle>
              <div className="flex items-center gap-1">
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
                  <TooltipContent>Customize layout</TooltipContent>
                </Tooltip>
              </div>
            </div>
            {lender?.lenderType && (
              <div className="flex flex-wrap gap-1.5">
                {lender.lenderType.split(',').map((type, idx) => (
                  <Badge key={idx} variant="outline" className="text-xs font-normal">
                    {type.trim()}
                  </Badge>
                ))}
              </div>
            )}
          </DialogHeader>

          <Tabs defaultValue="this-deal" className="flex-1 flex flex-col min-h-0">
            <TabsList className="grid w-full grid-cols-2 shrink-0">
              <TabsTrigger value="this-deal">This Deal</TabsTrigger>
              <TabsTrigger value="about">About {lenderName}</TabsTrigger>
            </TabsList>
            
            <TabsContent value="this-deal" className="flex-1 min-h-0 overflow-y-auto pr-2 mt-4">
              <div className="space-y-6">
                {/* Outstanding Items for this Lender */}
                <section>
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                    Requested Items
                  </h3>
                  {lenderOutstandingItems.length > 0 ? (
                    <div className="space-y-2">
                      {lenderOutstandingItems.map((item) => (
                        <div 
                          key={item.id} 
                          className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg text-sm"
                        >
                          <Checkbox
                            checked={false}
                            onCheckedChange={(checked) => {
                              if (checked && lenderName) {
                                onUpdateOutstandingItem(item.id, {
                                  deliveredToLenders: [...item.deliveredToLenders, lenderName]
                                });
                              }
                            }}
                          />
                          <span className="flex-1">{item.text}</span>
                          {item.approved ? (
                            <Badge variant="secondary" className="text-xs bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">Approved</Badge>
                          ) : item.received ? (
                            <Badge variant="secondary" className="text-xs bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">Received</Badge>
                          ) : (
                            <Badge variant="secondary" className="text-xs bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">Requested</Badge>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground italic">No items requested by this lender</p>
                  )}
                </section>

                <Separator />

                {/* Activity History for this Lender */}
                <section>
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                    Activity History
                  </h3>
                  {lenderActivities.length > 0 ? (
                    <ActivityTimeline activities={lenderActivities} />
                  ) : (
                    <p className="text-sm text-muted-foreground italic">No activity recorded for this lender on this deal</p>
                  )}
                </section>
              </div>
            </TabsContent>
            
            <TabsContent value="about" className="flex-1 min-h-0 overflow-y-auto pr-2 mt-4">
              <div className="space-y-6">
                {lender ? (
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
                                            ? `${formatCurrencyValue(lender.minDeal)} - ${formatCurrencyValue(lender.maxDeal)}`
                                            : lender.minDeal
                                            ? `${formatCurrencyValue(lender.minDeal)}+`
                                            : `Up to ${formatCurrencyValue(lender.maxDeal!)}`}
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
                                          {lender.geo.split(/[,;\n]+/).map((g) => g.trim()).filter(g => g).map((geo, idx) => (
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
                                        <span className="text-sm">{formatCurrencyValue(lender.minRevenue)}</span>
                                      </div>
                                    </div>
                                  )}
                                  {lender.ebitdaMin && (
                                    <div className="flex items-start gap-3">
                                      <DollarSign className="h-4 w-4 text-muted-foreground mt-0.5" />
                                      <div>
                                        <span className="text-sm font-medium">Min EBITDA: </span>
                                        <span className="text-sm">{formatCurrencyValue(lender.ebitdaMin)}</span>
                                      </div>
                                    </div>
                                  )}
                                  {lender.companyRequirements && (
                                    <div className="flex items-start gap-3">
                                      <Briefcase className="h-4 w-4 text-muted-foreground mt-0.5" />
                                      <div>
                                        <span className="text-sm font-medium block mb-1.5">Company Requirements:</span>
                                        <div className="flex flex-wrap gap-1.5">
                                          {lender.companyRequirements.split(/[,;\n]+/).map((r) => r.trim()).filter(r => r).map((req, idx) => (
                                            <Badge key={idx} variant="amber" className="text-xs">
                                              {req}
                                            </Badge>
                                          ))}
                                        </div>
                                      </div>
                                    </div>
                                  )}
                                  {!lender.minDeal && !lender.maxDeal && !lender.geo && (!lender.industries || lender.industries.length === 0) && (!lender.loanTypes || lender.loanTypes.length === 0) && !lender.minRevenue && !lender.ebitdaMin && !lender.companyRequirements && !lender.b2bB2c && (
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
                                  <div className="grid gap-3">
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
                                    {!lender.contact.name && !lender.contact.email && !lender.contact.phone && additionalContacts.length === 0 && (
                                      <p className="text-muted-foreground text-sm italic">No contact info</p>
                                    )}
                                  </div>
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
                                  isEditMode={false}
                                />
                              </section>
                              {showSeparator && <Separator className="my-6" />}
                            </div>
                          );

                        case 'lender-notes':
                          return (
                            <div key={sectionId}>
                              <section>
                                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                                  Lender Notes
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
                                  <p className="text-muted-foreground text-sm">No deals sent to this lender</p>
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
                                  Deals Passed ({lenderDeals.passReasons.length})
                                </h3>
                                {lenderDeals.passReasons.length > 0 ? (
                                  <HorizontalScrollContainer>
                                    {lenderDeals.passReasons.map((deal) => (
                                      <Tooltip key={deal.dealId}>
                                        <TooltipTrigger asChild>
                                          <div 
                                            className="flex-shrink-0 w-[140px] p-3 bg-muted/50 rounded-lg hover:bg-muted transition-colors cursor-pointer group border border-border/50 hover:border-border relative"
                                            onClick={() => handleNavigateToDeal(deal.dealId)}
                                          >
                                            <ArrowRight className="h-3 w-3 absolute top-2 right-2 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                                            <p className="font-medium text-sm truncate mb-1 pr-4">{deal.company}</p>
                                            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{deal.reason}</p>
                                          </div>
                                        </TooltipTrigger>
                                        <TooltipContent side="bottom" className="max-w-[250px]">
                                          <p className="font-medium">{deal.company}</p>
                                          <p className="text-xs text-muted-foreground">Reason: {deal.reason}</p>
                                        </TooltipContent>
                                      </Tooltip>
                                    ))}
                                  </HorizontalScrollContainer>
                                ) : (
                                  <p className="text-muted-foreground text-sm">No deals passed by this lender</p>
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
                                
                                {lender.website && (
                                  <a
                                    href={lender.website.startsWith('http') ? lender.website : `https://${lender.website}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg hover:bg-muted transition-colors mb-3"
                                  >
                                    <Globe className="h-4 w-4 text-primary shrink-0" />
                                    <div className="min-w-0 flex-1">
                                      <p className="font-medium truncate">One Pager / Website</p>
                                      <p className="text-xs text-muted-foreground truncate">{lender.website}</p>
                                    </div>
                                    <ExternalLink className="h-4 w-4 text-muted-foreground shrink-0" />
                                  </a>
                                )}
                                
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
                                        {isDragging ? "Drop files here" : "Drag & drop or click to upload"}
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
                                ) : !lender.website ? (
                                  <p className="text-muted-foreground text-sm">No attachments uploaded</p>
                                ) : null}
                              </section>
                              {showSeparator && <Separator className="my-6" />}
                            </div>
                          );

                        default:
                          return null;
                      }
                    })}
                  </>
                ) : (
                  <p className="text-muted-foreground text-sm italic">
                    No lender information found in the directory.
                  </p>
                )}
              </div>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>

      <LenderSectionReorderDialog
        open={isReorderDialogOpen}
        onOpenChange={setIsReorderDialogOpen}
        sectionOrder={sectionOrder}
        onSave={setSectionOrderDirect}
        onReset={resetToDefault}
      />
    </>
  );
}
