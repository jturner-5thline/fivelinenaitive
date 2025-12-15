import { useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { ArrowLeft, User, FileText, Clock, Undo2, Building2, Plus, X, ChevronDown, ChevronUp, ChevronRight, Paperclip, File, Trash2, Upload, Download } from 'lucide-react';
import { DealMilestones } from '@/components/dashboard/DealMilestones';
import { differenceInMinutes, differenceInHours, differenceInDays, differenceInWeeks } from 'date-fns';
import { DashboardHeader } from '@/components/dashboard/DashboardHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { mockDeals } from '@/data/mockDeals';
import { Deal, DealStatus, DealStage, EngagementType, LenderStatus, LenderStage, LenderSubstage, LenderTrackingStatus, DealLender, DealMilestone, STAGE_CONFIG, STATUS_CONFIG, ENGAGEMENT_TYPE_CONFIG, MANAGERS, LENDER_STATUS_CONFIG, LENDER_STAGE_CONFIG, LENDER_TRACKING_STATUS_CONFIG } from '@/types/deal';
import { useLenders } from '@/contexts/LendersContext';
import { useLenderStages } from '@/contexts/LenderStagesContext';
import { usePreferences } from '@/contexts/PreferencesContext';
import { ActivityTimeline, ActivityItem } from '@/components/dashboard/ActivityTimeline';
import { InlineEditField } from '@/components/ui/inline-edit-field';
import { OutstandingItems, OutstandingItem } from '@/components/deal/OutstandingItems';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { toast } from '@/hooks/use-toast';
import { exportDealToCSV, exportDealToPDF, exportDealToWord } from '@/utils/dealExport';


// Mock activity data - in a real app this would come from the database
const getMockActivities = (dealId: string): ActivityItem[] => [
  {
    id: '1',
    type: 'created',
    description: 'Deal created',
    user: 'Sarah Chen',
    timestamp: '2024-01-15T09:00:00Z',
  },
  {
    id: '2',
    type: 'stage_change',
    description: 'Stage changed',
    user: 'Sarah Chen',
    timestamp: '2024-01-16T14:30:00Z',
    metadata: { from: 'Prospecting', to: 'Initial Review' },
  },
  {
    id: '3',
    type: 'note_added',
    description: 'Added note about revenue growth',
    user: 'Michael Roberts',
    timestamp: '2024-01-17T10:15:00Z',
  },
  {
    id: '4',
    type: 'contact_added',
    description: 'Added contact John Smith',
    user: 'Sarah Chen',
    timestamp: '2024-01-18T11:00:00Z',
  },
  {
    id: '5',
    type: 'stage_change',
    description: 'Stage changed',
    user: 'Jennifer Walsh',
    timestamp: '2024-01-19T09:45:00Z',
    metadata: { from: 'Initial Review', to: 'Due Diligence' },
  },
  {
    id: '6',
    type: 'value_updated',
    description: 'Deal value updated to $15M',
    user: 'Sarah Chen',
    timestamp: '2024-01-20T16:00:00Z',
  },
  {
    id: '7',
    type: 'comment',
    description: 'Team discussion about APAC expansion plans',
    user: 'Emma Thompson',
    timestamp: '2024-01-20T17:30:00Z',
  },
];

interface EditHistory {
  deal: Deal;
  field: string;
  timestamp: Date;
}

export default function DealDetail() {
  const { id } = useParams<{ id: string }>();
  const { getLenderNames, getLenderDetails } = useLenders();
  const { stages: configuredStages, substages: configuredSubstages } = useLenderStages();
  const { formatCurrencyValue } = usePreferences();
  const lenderNames = getLenderNames();
  const initialDeal = mockDeals.find((d) => d.id === id);
  const [deal, setDeal] = useState<Deal | undefined>(initialDeal);
  const [editHistory, setEditHistory] = useState<EditHistory[]>([]);
  const [lenderSearchQuery, setLenderSearchQuery] = useState('');
  const [isLenderDropdownOpen, setIsLenderDropdownOpen] = useState(false);
  const [statusHistory, setStatusHistory] = useState<{ note: string; timestamp: Date }[]>([]);
  const [isStatusHistoryExpanded, setIsStatusHistoryExpanded] = useState(false);
  const [selectedLenderName, setSelectedLenderName] = useState<string | null>(null);
  const [removedLenders, setRemovedLenders] = useState<{ lender: DealLender; timestamp: string; id: string }[]>([]);
  const [outstandingItems, setOutstandingItems] = useState<OutstandingItem[]>([]);
  const [isLendersExpanded, setIsLendersExpanded] = useState(true);
  const [attachmentFilter, setAttachmentFilter] = useState<'all' | 'term-sheets' | 'credit-file' | 'reports'>('all');
  const [attachments, setAttachments] = useState<{ id: string; name: string; type: string; size: string; uploadedAt: string; category: 'term-sheets' | 'credit-file' | 'reports' }[]>([
    { id: '1', name: 'Term Sheet v2.pdf', type: 'pdf', size: '245 KB', uploadedAt: '2024-01-18', category: 'term-sheets' },
    { id: '2', name: 'Financial Model.xlsx', type: 'xlsx', size: '1.2 MB', uploadedAt: '2024-01-17', category: 'credit-file' },
    { id: '3', name: 'Due Diligence Checklist.docx', type: 'docx', size: '89 KB', uploadedAt: '2024-01-15', category: 'credit-file' },
    { id: '4', name: 'Q4 Performance Report.pdf', type: 'pdf', size: '512 KB', uploadedAt: '2024-01-14', category: 'reports' },
  ]);
  const filteredAttachments = attachmentFilter === 'all' 
    ? attachments 
    : attachments.filter(a => a.category === attachmentFilter);
  const baseActivities = getMockActivities(id || '');

  // Combine base activities with lender removal activities
  const activities: ActivityItem[] = [
    ...removedLenders.map(item => ({
      id: item.id,
      type: 'lender_removed' as const,
      description: `Removed lender ${item.lender.name}`,
      user: 'You',
      timestamp: item.timestamp,
      metadata: { lenderName: item.lender.name, lenderData: item.lender },
      onUndo: () => {
        // Restore the lender
        setDeal(prev => {
          if (!prev) return prev;
          return { ...prev, lenders: [...(prev.lenders || []), item.lender], updatedAt: new Date().toISOString() };
        });
        // Remove from removed lenders list
        setRemovedLenders(prev => prev.filter(r => r.id !== item.id));
        toast({
          title: "Lender restored",
          description: `${item.lender.name} has been restored to the deal.`,
        });
      },
    })),
    ...baseActivities,
  ].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  // Get all deals where selected lender appears
  const getLenderDeals = useCallback((lenderName: string) => {
    return mockDeals
      .filter(d => d.lenders?.some(l => l.name === lenderName))
      .map(d => ({
        dealId: d.id,
        dealName: d.name,
        company: d.company,
        lenderInfo: d.lenders?.find(l => l.name === lenderName),
      }));
  }, []);

  const addLender = useCallback((lenderName: string) => {
    if (!deal || !lenderName.trim()) return;
    
    const newLender: DealLender = {
      id: `l${Date.now()}`,
      name: lenderName.trim(),
      status: 'in-review',
      stage: 'reviewing-drl',
      trackingStatus: 'active',
    };
    const updatedLenders = [...(deal.lenders || []), newLender];
    setDeal(prev => {
      if (!prev) return prev;
      setEditHistory(history => [...history, { deal: prev, field: 'lenders', timestamp: new Date() }]);
      return { ...prev, lenders: updatedLenders, updatedAt: new Date().toISOString() };
    });
    toast({
      title: "Lender added",
      description: `${lenderName} has been added to the deal.`,
    });
  }, [deal]);

  const addMilestone = useCallback((milestone: Omit<DealMilestone, 'id'>) => {
    if (!deal) return;
    const newMilestone: DealMilestone = {
      ...milestone,
      id: `m${Date.now()}`,
    };
    setDeal(prev => {
      if (!prev) return prev;
      setEditHistory(history => [...history, { deal: prev, field: 'milestones', timestamp: new Date() }]);
      return { ...prev, milestones: [...(prev.milestones || []), newMilestone], updatedAt: new Date().toISOString() };
    });
    toast({
      title: "Milestone added",
      description: `"${milestone.title}" has been added.`,
    });
  }, [deal]);

  const updateMilestone = useCallback((id: string, updates: Partial<DealMilestone>) => {
    setDeal(prev => {
      if (!prev) return prev;
      setEditHistory(history => [...history, { deal: prev, field: 'milestones', timestamp: new Date() }]);
      const updatedMilestones = (prev.milestones || []).map(m =>
        m.id === id ? { ...m, ...updates } : m
      );
      return { ...prev, milestones: updatedMilestones, updatedAt: new Date().toISOString() };
    });
  }, []);

  const deleteMilestone = useCallback((id: string) => {
    setDeal(prev => {
      if (!prev) return prev;
      setEditHistory(history => [...history, { deal: prev, field: 'milestones', timestamp: new Date() }]);
      return { ...prev, milestones: (prev.milestones || []).filter(m => m.id !== id), updatedAt: new Date().toISOString() };
    });
    toast({
      title: "Milestone deleted",
    });
  }, []);

  const addOutstandingItem = useCallback((text: string, requestedBy: string[]) => {
    const newItem: OutstandingItem = {
      id: `oi${Date.now()}`,
      text,
      completed: false,
      received: false,
      approved: false,
      deliveredToLenders: [],
      createdAt: new Date().toISOString(),
      requestedBy,
    };
    setOutstandingItems(prev => [...prev, newItem]);
    toast({
      title: "Item added",
    });
  }, []);

  const updateOutstandingItem = useCallback((id: string, updates: Partial<OutstandingItem>) => {
    setOutstandingItems(prev =>
      prev.map(item => (item.id === id ? { ...item, ...updates } : item))
    );
  }, []);

  const deleteOutstandingItem = useCallback((id: string) => {
    setOutstandingItems(prev => prev.filter(item => item.id !== id));
    toast({
      title: "Item removed",
    });
  }, []);

  if (!deal) {
    return (
      <div className="min-h-screen bg-background">
        <DashboardHeader />
        <main className="container mx-auto max-w-5xl px-4 py-8">
          <div className="text-center">
            <h1 className="text-2xl font-semibold text-foreground mb-4">Deal Not Found</h1>
            <Button asChild>
              <Link to="/dashboard">Back to Dashboard</Link>
            </Button>
          </div>
        </main>
      </div>
    );
  }

  const stageConfig = STAGE_CONFIG[deal.stage];
  const statusConfig = STATUS_CONFIG[deal.status];

  const formatValue = (value: number) => formatCurrencyValue(value);

  const formatFee = (value: number) => formatCurrencyValue(value);

  const parseFee = (valueStr: string): number => {
    const cleaned = valueStr.replace(/[^0-9.]/g, '');
    return (parseFloat(cleaned) || 0) * 1000;
  };

  const parseValue = (valueStr: string): number => {
    const upperStr = valueStr.toUpperCase();
    const cleaned = valueStr.replace(/[^0-9.]/g, '');
    const numValue = parseFloat(cleaned) || 0;
    
    // If the string contains MM, it's already in millions
    if (upperStr.includes('MM') || upperStr.includes('M')) {
      return numValue * 1000000;
    }
    // If the string contains K, it's in thousands
    if (upperStr.includes('K')) {
      return numValue * 1000;
    }
    // If the number is >= 1000, assume it's the actual value (e.g., 15000000)
    if (numValue >= 1000) {
      return numValue;
    }
    // Otherwise assume it's in millions (e.g., typing "15" means $15M)
    return numValue * 1000000;
  };

  const getTimeAgoData = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    
    const minutes = differenceInMinutes(now, date);
    const hours = differenceInHours(now, date);
    const days = differenceInDays(now, date);
    const weeks = differenceInWeeks(now, date);
    
    let text: string;
    let highlightClass = '';
    
    if (minutes < 60) {
      text = `${minutes} Min. Ago`;
    } else if (hours < 24) {
      text = `${hours} Hours Ago`;
    } else if (days < 7) {
      text = `${days} Days Ago`;
      if (days > 3) {
        highlightClass = 'bg-warning/20 px-1.5 py-0.5 rounded';
      }
    } else if (days <= 30) {
      text = `${weeks} Weeks Ago`;
      highlightClass = 'bg-destructive/20 px-1.5 py-0.5 rounded';
    } else {
      text = 'Over 30 Days';
      highlightClass = 'bg-destructive/20 px-1.5 py-0.5 rounded';
    }
    
    return { text, highlightClass };
  };

  const updateDeal = useCallback((field: keyof Deal, value: string | number) => {
    setDeal(prev => {
      if (!prev) return prev;
      // Save current state to history before updating
      setEditHistory(history => [...history, { deal: prev, field, timestamp: new Date() }]);
      const updated = { ...prev, [field]: value, updatedAt: new Date().toISOString() };
      toast({
        title: "Deal updated",
        description: `${field.charAt(0).toUpperCase() + field.slice(1)} has been updated.`,
      });
      return updated;
    });
  }, []);

  const handleUndo = useCallback(() => {
    if (editHistory.length === 0) return;
    
    const lastEdit = editHistory[editHistory.length - 1];
    setDeal(lastEdit.deal);
    setEditHistory(history => history.slice(0, -1));
    
    toast({
      title: "Change undone",
      description: `Reverted ${lastEdit.field} to previous value.`,
    });
  }, [editHistory]);

  const timeAgoData = getTimeAgoData(deal.updatedAt);

  return (
    <>
      <Helmet>
        <title>{deal.name} - nAItive</title>
        <meta name="description" content={`Deal details for ${deal.name} with ${deal.company}`} />
      </Helmet>

      <div className="min-h-screen bg-background">
        <DashboardHeader />

        <main className="container mx-auto max-w-7xl px-4 py-3 sm:px-6 lg:px-8">
          {/* Back button and Undo */}
          <div className="flex items-center justify-between mb-3">
            <Button variant="ghost" size="sm" className="gap-2" asChild>
              <Link to="/dashboard">
                <ArrowLeft className="h-4 w-4" />
                Back to Pipeline
              </Link>
            </Button>
            <div className="flex items-center gap-2">
              {editHistory.length > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2"
                  onClick={handleUndo}
                >
                  <Undo2 className="h-4 w-4" />
                  Undo ({editHistory.length})
                </Button>
              )}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-2">
                    <Download className="h-4 w-4" />
                    Export
                    <ChevronDown className="h-3 w-3" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => {
                    exportDealToCSV(deal);
                    toast({ title: "CSV exported", description: "Deal data exported to CSV file." });
                  }}>
                    <FileText className="h-4 w-4 mr-2" />
                    Export as CSV
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => {
                    exportDealToPDF(deal);
                    toast({ title: "PDF exported", description: "Deal report exported to PDF." });
                  }}>
                    <FileText className="h-4 w-4 mr-2" />
                    Export as PDF
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={async () => {
                    await exportDealToWord(deal);
                    toast({ title: "Word document exported", description: "Deal report exported to Word document." });
                  }}>
                    <FileText className="h-4 w-4 mr-2" />
                    Export as Word
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          {/* Header Card */}
          <Card className="mb-6">
            <CardHeader className="pb-4">
              <div className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-4">
                <InlineEditField
                  value={deal.company}
                  onSave={(value) => updateDeal('company', value)}
                  displayClassName="text-5xl font-semibold text-purple-600"
                />
                <InlineEditField
                  value={formatValue(deal.value)}
                  onSave={(value) => updateDeal('value', parseValue(value))}
                  displayClassName="text-5xl font-semibold text-purple-600"
                />
              </div>
              
              <div className="flex items-center gap-2 mt-4">
                <Select
                  value={deal.status}
                  onValueChange={(value: DealStatus) => updateDeal('status', value)}
                >
                  <SelectTrigger className={`w-auto ${statusConfig.badgeColor} text-white border-0 text-xs rounded-lg h-6 px-2`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(STATUS_CONFIG).map(([key, config]) => (
                      <SelectItem key={key} value={key}>
                        <div className="flex items-center gap-2">
                          <span className={`h-2 w-2 rounded-full ${config.dotColor}`} />
                          {config.label}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select
                  value={deal.stage}
                  onValueChange={(value: DealStage) => updateDeal('stage', value)}
                >
                  <SelectTrigger className="w-auto text-xs rounded-lg h-6 px-2 border">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(STAGE_CONFIG).map(([key, config]) => (
                      <SelectItem key={key} value={key}>
                        {config.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <div className="flex items-start justify-between gap-4 border-t border-border mt-4 pt-4">
                <div className="w-[60%] flex items-start gap-2 pl-4">
                  <span className="text-lg text-foreground/90 mt-0.5">•</span>
                  <InlineEditField
                    value={deal.notes || ''}
                    onSave={(value) => {
                      if (deal.notes && deal.notes.trim()) {
                        setStatusHistory(prev => [...prev, { note: deal.notes!, timestamp: new Date() }]);
                      }
                      updateDeal('notes', value);
                    }}
                    type="textarea"
                    placeholder="Click to add status notes..."
                    displayClassName="text-lg text-foreground/90"
                  />
                </div>
                <div className={`flex items-center gap-2 text-sm text-muted-foreground shrink-0 ${timeAgoData.highlightClass}`}>
                  <Clock className="h-4 w-4" />
                  <span>{timeAgoData.text}</span>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              {/* Milestones */}
              <DealMilestones
                milestones={deal.milestones || []}
                onAdd={addMilestone}
                onUpdate={updateMilestone}
                onDelete={deleteMilestone}
              />
            </CardContent>
          </Card>

          {/* Main Content Grid */}
          <div className="grid gap-6 lg:grid-cols-3 items-start">
            {/* Left Column - Notes & Actions */}
            <div className="lg:col-span-2 flex flex-col gap-6">
              {statusHistory.length > 0 && (
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
                    <CardTitle className="text-lg flex items-center gap-2">
                      <FileText className="h-5 w-5" />
                      Status History
                    </CardTitle>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 text-xs gap-1"
                      onClick={() => setIsStatusHistoryExpanded(!isStatusHistoryExpanded)}
                    >
                      {isStatusHistoryExpanded ? (
                        <>
                          <ChevronUp className="h-4 w-4" />
                          Hide
                        </>
                      ) : (
                        <>
                          <ChevronDown className="h-4 w-4" />
                          Show ({statusHistory.length})
                        </>
                      )}
                    </Button>
                  </CardHeader>
                  {isStatusHistoryExpanded && (
                    <CardContent className="space-y-3 pt-0">
                      {[...statusHistory].reverse().map((item, index) => (
                        <div key={index} className="text-sm p-3 bg-muted/50 rounded-lg">
                          <p className="text-muted-foreground">{item.note}</p>
                          <p className="text-xs text-muted-foreground/70 mt-1">
                            {item.timestamp.toLocaleDateString()} at {item.timestamp.toLocaleTimeString()}
                          </p>
                        </div>
                      ))}
                    </CardContent>
                  )}
                </Card>
              )}

              {/* Outstanding Items */}
              <OutstandingItems
                items={outstandingItems}
                lenderNames={deal.lenders?.map(l => l.name) || []}
                onAdd={addOutstandingItem}
                onUpdate={updateOutstandingItem}
                onDelete={deleteOutstandingItem}
              />

              {/* Lenders Card */}
              <Collapsible open={isLendersExpanded} onOpenChange={setIsLendersExpanded}>
                <Card>
                  <CardHeader className="pb-4">
                    <div className="flex items-center justify-between">
                      <CollapsibleTrigger asChild>
                        <button className="flex items-center gap-2 hover:text-primary transition-colors">
                          {isLendersExpanded ? (
                            <ChevronDown className="h-4 w-4 text-muted-foreground" />
                          ) : (
                            <ChevronRight className="h-4 w-4 text-muted-foreground" />
                          )}
                          <CardTitle className="text-lg text-purple-600">
                            Lenders
                          </CardTitle>
                          {deal.lenders && deal.lenders.length > 0 && (
                            <span className="text-sm font-normal text-muted-foreground">
                              ({deal.lenders.length})
                            </span>
                          )}
                        </button>
                      </CollapsibleTrigger>
                      {deal.lenders && deal.lenders.length > 0 && (
                        <div className="flex items-center gap-4">
                          {(['active', 'on-hold', 'on-deck', 'passed'] as LenderTrackingStatus[])
                            .map(trackingStatus => {
                              const count = deal.lenders?.filter(l => l.trackingStatus === trackingStatus).length || 0;
                              if (count === 0) return null;
                              const config = LENDER_TRACKING_STATUS_CONFIG[trackingStatus];
                              return (
                                <div key={trackingStatus} className="flex items-center gap-1.5 text-sm">
                                  <span className={`h-2.5 w-2.5 rounded-full ${config.color}`} />
                                  <span className="text-muted-foreground">{config.label}</span>
                                  <span className="font-medium">{count}</span>
                                </div>
                              );
                            })}
                        </div>
                      )}
                    </div>
                  </CardHeader>
                  <CollapsibleContent>
                    <CardContent>
                  <div className="space-y-4">
                    {deal.lenders && deal.lenders.length > 0 && (
                      <>
                        {deal.lenders.map((lender, index) => {
                          const lenderOutstandingItems = outstandingItems.filter(
                            item => Array.isArray(item.requestedBy) 
                              ? item.requestedBy.includes(lender.name)
                              : item.requestedBy === lender.name
                          );
                          return (
                          <div key={lender.id} className={`${index > 0 ? 'pt-4 border-t border-border' : ''}`}>
                            <div className="grid grid-cols-[140px_120px_160px_140px_1fr] items-center gap-3">
                            <button 
                              className="font-medium truncate text-left hover:text-primary hover:underline cursor-pointer"
                              onClick={() => setSelectedLenderName(lender.name)}
                            >
                              {lender.name}
                            </button>
                            <Select
                              value={lender.status}
                              onValueChange={(value: LenderStatus) => {
                                const updatedLenders = deal.lenders?.map(l => 
                                  l.id === lender.id ? { ...l, status: value } : l
                                );
                                updateDeal('lenders', updatedLenders as any);
                              }}
                            >
                              <SelectTrigger className="w-full h-7 text-xs rounded-lg px-2">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {Object.entries(LENDER_STATUS_CONFIG).map(([key, config]) => (
                                  <SelectItem key={key} value={key}>
                                    {config.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <Select
                              value={lender.stage}
                              onValueChange={(value: LenderStage) => {
                                const updatedLenders = deal.lenders?.map(l => 
                                  l.id === lender.id ? { ...l, stage: value } : l
                                );
                                updateDeal('lenders', updatedLenders as any);
                              }}
                            >
                              <SelectTrigger className="w-full h-7 text-xs rounded-lg px-2 bg-secondary border-0 justify-start">
                                <SelectValue>
                                  {configuredStages.find(s => s.id === lender.stage)?.label || lender.stage}
                                </SelectValue>
                              </SelectTrigger>
                              <SelectContent>
                                {configuredStages.map((stage) => (
                                  <SelectItem key={stage.id} value={stage.id}>
                                    {stage.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <Select
                              value={lender.substage || ''}
                              onValueChange={(value: LenderSubstage) => {
                                const updatedLenders = deal.lenders?.map(l => 
                                  l.id === lender.id ? { ...l, substage: value || undefined } : l
                                );
                                updateDeal('lenders', updatedLenders as any);
                              }}
                            >
                              <SelectTrigger className="w-full h-7 text-xs rounded-lg px-2 bg-muted/50 border-0 justify-start">
                                <SelectValue placeholder="Substage">
                                  {lender.substage ? (configuredSubstages.find(s => s.id === lender.substage)?.label || lender.substage) : 'Substage'}
                                </SelectValue>
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="">None</SelectItem>
                                {configuredSubstages.map((substage) => (
                                  <SelectItem key={substage.id} value={substage.id}>
                                    {substage.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <div className="flex justify-end">
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7 text-muted-foreground hover:text-destructive"
                                  >
                                    <X className="h-4 w-4" />
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>Are you sure you want to delete {lender.name}?</AlertDialogTitle>
                                    <AlertDialogDescription>
                                      This will remove the lender from this deal. This action cannot be undone.
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                    <AlertDialogAction
                                      onClick={() => {
                                        const removedLender = lender;
                                        const updatedLenders = deal.lenders?.filter(l => l.id !== lender.id);
                                        setDeal(prev => {
                                          if (!prev) return prev;
                                          setEditHistory(history => [...history, { deal: prev, field: 'lenders', timestamp: new Date() }]);
                                          return { ...prev, lenders: updatedLenders, updatedAt: new Date().toISOString() };
                                        });
                                        // Add to removed lenders for activity tracking
                                        setRemovedLenders(prev => [...prev, {
                                          lender: removedLender,
                                          timestamp: new Date().toISOString(),
                                          id: `removed-${Date.now()}`,
                                        }]);
                                        toast({
                                          title: "Lender removed",
                                          description: `${lender.name} has been removed from the deal.`,
                                        });
                                      }}
                                    >
                                      Delete
                                    </AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            </div>
                          </div>
                          {lenderOutstandingItems.length > 0 && (
                            <div className="ml-2 mt-2 space-y-1">
                              {lenderOutstandingItems.map((item) => (
                                <div 
                                  key={item.id} 
                                  className="flex items-center gap-2 text-xs text-muted-foreground pl-2 border-l-2 border-muted"
                                >
                                  <span className={item.deliveredToLenders.includes(lender.name) ? "line-through" : ""}>
                                    {item.text}
                                  </span>
                                  {item.deliveredToLenders.includes(lender.name) ? (
                                    <span className="text-emerald-600 text-[10px] font-medium">Delivered</span>
                                  ) : item.approved ? (
                                    <span className="text-emerald-600 text-[10px] font-medium">Approved</span>
                                  ) : item.received ? (
                                    <span className="text-blue-600 text-[10px] font-medium">Received</span>
                                  ) : (
                                    <span className="text-amber-600 text-[10px] font-medium">Pending</span>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                          </div>
                          );
                        })}
                      </>
                    )}
                    <div className={`${deal.lenders && deal.lenders.length > 0 ? 'pt-4 border-t border-border' : ''}`}>
                      <div className="relative w-1/2">
                        <Input
                          placeholder="Type to add a lender..."
                          value={lenderSearchQuery}
                          onChange={(e) => {
                            setLenderSearchQuery(e.target.value);
                            setIsLenderDropdownOpen(true);
                          }}
                          onFocus={() => {
                            setIsLenderDropdownOpen(true);
                          }}
                          onBlur={(e) => {
                            // Delay closing to allow click on dropdown items
                            setTimeout(() => setIsLenderDropdownOpen(false), 150);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && lenderSearchQuery.trim()) {
                              const availableLenders = lenderNames.filter(
                                name => !deal.lenders?.some(l => l.name === name) &&
                                name.toLowerCase().includes(lenderSearchQuery.toLowerCase())
                              );
                              if (availableLenders.length > 0) {
                                addLender(availableLenders[0]);
                              } else {
                                addLender(lenderSearchQuery);
                              }
                              setLenderSearchQuery('');
                              setIsLenderDropdownOpen(false);
                            }
                            if (e.key === 'Escape') {
                              setIsLenderDropdownOpen(false);
                            }
                          }}
                          className="h-8 text-sm"
                        />
                        {isLenderDropdownOpen && (
                          <div className="absolute z-50 mt-1 w-full bg-popover border border-border rounded-md shadow-lg max-h-48 overflow-auto">
                            {lenderNames.filter(
                              name => !deal.lenders?.some(l => l.name === name) &&
                              name.toLowerCase().includes(lenderSearchQuery.toLowerCase())
                            ).map((lenderName) => (
                              <button
                                key={lenderName}
                                className="w-full text-left px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground cursor-pointer"
                                onClick={() => {
                                  addLender(lenderName);
                                  setLenderSearchQuery('');
                                  setIsLenderDropdownOpen(false);
                                }}
                              >
                                {lenderName}
                              </button>
                            ))}
                            {lenderNames.filter(
                              name => !deal.lenders?.some(l => l.name === name) &&
                              name.toLowerCase().includes(lenderSearchQuery.toLowerCase())
                            ).length === 0 && (
                              <button
                                className="w-full text-left px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground cursor-pointer"
                                onClick={() => {
                                  addLender(lenderSearchQuery);
                                  setLenderSearchQuery('');
                                  setIsLenderDropdownOpen(false);
                                }}
                              >
                                Add "{lenderSearchQuery}" as new lender
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                    </CardContent>
                  </CollapsibleContent>
                </Card>
              </Collapsible>
            </div>

            {/* Right Column - Deal Info & Activity */}
            <div className="lg:col-span-1 flex flex-col gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg font-semibold text-purple-700">Deal Information</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Deal Manager</span>
                    <div className="flex items-center gap-2">
                      <User className="h-4 w-4 text-muted-foreground" />
                      <Select
                        value={deal.manager}
                        onValueChange={(value) => updateDeal('manager', value)}
                      >
                        <SelectTrigger className="w-auto h-auto p-0 border-0 font-medium bg-transparent hover:bg-muted/50 rounded px-1">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {MANAGERS.map((manager) => (
                            <SelectItem key={manager} value={manager}>
                              {manager}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Engagement Type</span>
                    <Select
                      value={deal.engagementType}
                      onValueChange={(value: EngagementType) => updateDeal('engagementType', value)}
                    >
                      <SelectTrigger className="w-auto h-auto p-0 border-0 font-medium bg-transparent hover:bg-muted/50 rounded px-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(ENGAGEMENT_TYPE_CONFIG).map(([key, config]) => (
                          <SelectItem key={key} value={key}>
                            {config.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Total Fee</span>
                    <InlineEditField
                      value={formatFee(deal.totalFee)}
                      onSave={(value) => updateDeal('totalFee', parseFee(value))}
                      displayClassName="font-medium text-purple-600"
                    />
                  </div>
                </CardContent>
              </Card>

              {/* Attachments & Documents */}
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg font-semibold text-purple-700 flex items-center gap-2">
                      <Paperclip className="h-5 w-5" />
                      Attachments
                    </CardTitle>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 gap-1"
                      onClick={() => {
                        const newAttachment = {
                          id: `att-${Date.now()}`,
                          name: 'New Document.pdf',
                          type: 'pdf',
                          size: '0 KB',
                          uploadedAt: new Date().toISOString().split('T')[0],
                          category: attachmentFilter === 'all' ? 'credit-file' : attachmentFilter,
                        } as const;
                        setAttachments(prev => [...prev, newAttachment]);
                        toast({ title: 'Attachment added' });
                      }}
                    >
                      <Upload className="h-4 w-4" />
                      Upload
                    </Button>
                  </div>
                  {/* Filter tabs */}
                  <div className="flex gap-1 mt-3">
                    {[
                      { value: 'all', label: 'All' },
                      { value: 'term-sheets', label: 'Term Sheets' },
                      { value: 'credit-file', label: 'Credit File' },
                      { value: 'reports', label: 'Reports' },
                    ].map((filter) => (
                      <Button
                        key={filter.value}
                        variant={attachmentFilter === filter.value ? 'secondary' : 'ghost'}
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => setAttachmentFilter(filter.value as typeof attachmentFilter)}
                      >
                        {filter.label}
                      </Button>
                    ))}
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  {filteredAttachments.length > 0 ? (
                    <div className="space-y-2">
                      {filteredAttachments.map((attachment) => (
                        <div
                          key={attachment.id}
                          className="flex items-center justify-between p-2 bg-muted/50 rounded-lg group hover:bg-muted transition-colors"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <File className="h-4 w-4 text-muted-foreground shrink-0" />
                            <div className="min-w-0">
                              <p className="text-sm font-medium truncate">{attachment.name}</p>
                              <p className="text-xs text-muted-foreground">
                                {attachment.size} • {attachment.uploadedAt}
                              </p>
                            </div>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                            onClick={() => {
                              setAttachments(prev => prev.filter(a => a.id !== attachment.id));
                              toast({ title: 'Attachment removed' });
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      No attachments in this category
                    </p>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg font-semibold text-purple-700">
                    Activity
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ActivityTimeline activities={activities} />
                </CardContent>
              </Card>
            </div>
          </div>
        </main>
      </div>

      {/* Lender Detail Dialog */}
      <Dialog open={!!selectedLenderName} onOpenChange={(open) => !open && setSelectedLenderName(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{selectedLenderName}</DialogTitle>
          </DialogHeader>
          {selectedLenderName && (() => {
            const lenderDetails = getLenderDetails(selectedLenderName);
            const lenderOutstandingItems = outstandingItems.filter(
              item => !item.deliveredToLenders.includes(selectedLenderName) && (Array.isArray(item.requestedBy) 
                ? item.requestedBy.includes(selectedLenderName)
                : item.requestedBy === selectedLenderName)
            );
            const lenderActivities = activities.filter(
              activity => activity.description?.includes(selectedLenderName) || 
                activity.metadata?.lenderName === selectedLenderName
            );
            return (
              <Tabs defaultValue="this-deal" className="w-full">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="this-deal">This Deal</TabsTrigger>
                  <TabsTrigger value="about">About {selectedLenderName}</TabsTrigger>
                </TabsList>
                
                <TabsContent value="this-deal" className="space-y-6 mt-4">
                  {/* Outstanding Items for this Lender */}
                  <div>
                    <h4 className="text-sm font-semibold mb-2">Requested Items</h4>
                    {lenderOutstandingItems.length > 0 ? (
                      <div className="space-y-2">
                        {lenderOutstandingItems.map((item) => (
                          <div 
                            key={item.id} 
                            className="flex items-center gap-3 p-2 bg-muted/50 rounded-lg text-sm"
                          >
                            <Checkbox
                              checked={false}
                              onCheckedChange={(checked) => {
                                if (checked && selectedLenderName) {
                                  updateOutstandingItem(item.id, {
                                    deliveredToLenders: [...item.deliveredToLenders, selectedLenderName]
                                  });
                                }
                              }}
                            />
                            <span className="flex-1">{item.text}</span>
                            {item.approved ? (
                              <Badge variant="secondary" className="text-xs bg-emerald-100 text-emerald-700">Approved</Badge>
                            ) : item.received ? (
                              <Badge variant="secondary" className="text-xs bg-blue-100 text-blue-700">Received</Badge>
                            ) : (
                              <Badge variant="secondary" className="text-xs bg-amber-100 text-amber-700">Requested</Badge>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground italic">No items requested by this lender</p>
                    )}
                  </div>

                  {/* Activity History for this Lender */}
                  <div>
                    <h4 className="text-sm font-semibold mb-2">Activity History</h4>
                    {lenderActivities.length > 0 ? (
                      <ActivityTimeline activities={lenderActivities} />
                    ) : (
                      <p className="text-sm text-muted-foreground italic">No activity recorded for this lender on this deal</p>
                    )}
                  </div>
                </TabsContent>
                
                <TabsContent value="about" className="space-y-6 mt-4">
                  {/* Contact Information */}
                  <div>
                    <h4 className="text-sm font-semibold mb-2">Contact Information</h4>
                    {lenderDetails?.contact.name ? (
                      <div className="space-y-1 text-sm">
                        <p><span className="text-muted-foreground">Name:</span> {lenderDetails.contact.name}</p>
                        <p><span className="text-muted-foreground">Email:</span> {lenderDetails.contact.email}</p>
                        <p><span className="text-muted-foreground">Phone:</span> {lenderDetails.contact.phone}</p>
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground italic">No contact information available</p>
                    )}
                  </div>

                  {/* Deal Preferences */}
                  <div>
                    <h4 className="text-sm font-semibold mb-2">Deal Preferences</h4>
                    {lenderDetails?.preferences && lenderDetails.preferences.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {lenderDetails.preferences.map((pref, idx) => (
                          <Badge key={idx} variant="secondary" className="text-xs">{pref}</Badge>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground italic">No preferences listed</p>
                    )}
                  </div>

                  {/* All Deals with this Lender */}
                  <div>
                    <h4 className="text-sm font-semibold mb-2">Deals with {selectedLenderName}</h4>
                    <div className="space-y-2">
                      {getLenderDeals(selectedLenderName).map((dealInfo) => (
                        <div key={dealInfo.dealId} className="flex items-center justify-between p-2 bg-muted/50 rounded-lg text-sm">
                          <div>
                            <p className="font-medium">{dealInfo.company}</p>
                            <p className="text-xs text-muted-foreground">{dealInfo.dealName}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            {dealInfo.lenderInfo && (
                              <>
                                <Badge variant="outline" className="text-xs">
                                  {LENDER_STATUS_CONFIG[dealInfo.lenderInfo.status].label}
                                </Badge>
                                <Badge variant="secondary" className="text-xs">
                                  {LENDER_TRACKING_STATUS_CONFIG[dealInfo.lenderInfo.trackingStatus].label}
                                </Badge>
                              </>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </TabsContent>
              </Tabs>
            );
          })()}
        </DialogContent>
      </Dialog>
    </>
  );
}
