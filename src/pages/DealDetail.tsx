import { useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { ArrowLeft, User, FileText, Clock, Undo2, Building2 } from 'lucide-react';
import { differenceInMinutes, differenceInHours, differenceInDays, differenceInWeeks } from 'date-fns';
import { DashboardHeader } from '@/components/dashboard/DashboardHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { mockDeals } from '@/data/mockDeals';
import { Deal, DealStatus, DealStage, EngagementType, LenderStatus, LenderStage, DealLender, STAGE_CONFIG, STATUS_CONFIG, ENGAGEMENT_TYPE_CONFIG, MANAGERS, LENDERS, LENDER_STATUS_CONFIG, LENDER_STAGE_CONFIG } from '@/types/deal';
import { ActivityTimeline, ActivityItem } from '@/components/dashboard/ActivityTimeline';
import { InlineEditField } from '@/components/ui/inline-edit-field';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from '@/hooks/use-toast';

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
  const initialDeal = mockDeals.find((d) => d.id === id);
  const [deal, setDeal] = useState<Deal | undefined>(initialDeal);
  const [editHistory, setEditHistory] = useState<EditHistory[]>([]);
  const activities = getMockActivities(id || '');

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

  const formatValue = (value: number) => {
    if (value >= 1000000) {
      return `$${(value / 1000000).toFixed(1)}M`;
    }
    return `$${(value / 1000).toFixed(0)}K`;
  };

  const formatFee = (value: number) => {
    return `$${(value / 1000).toFixed(0)}K`;
  };

  const parseFee = (valueStr: string): number => {
    const cleaned = valueStr.replace(/[^0-9.]/g, '');
    return (parseFloat(cleaned) || 0) * 1000;
  };

  const parseValue = (valueStr: string): number => {
    const cleaned = valueStr.replace(/[^0-9.]/g, '');
    return parseFloat(cleaned) || 0;
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

        <main className="container mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          {/* Back button and Undo */}
          <div className="flex items-center justify-between mb-6">
            <Button variant="ghost" size="sm" className="gap-2" asChild>
              <Link to="/dashboard">
                <ArrowLeft className="h-4 w-4" />
                Back to Pipeline
              </Link>
            </Button>
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
          </div>

          {/* Header Card */}
          <Card className="mb-6">
            <CardHeader className="pb-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div className="space-y-2">
                  <InlineEditField
                    value={deal.company}
                    onSave={(value) => updateDeal('company', value)}
                    displayClassName="text-xl font-semibold text-purple-600"
                  />
                  <InlineEditField
                    value={deal.name}
                    onSave={(value) => updateDeal('name', value)}
                    displayClassName="text-muted-foreground"
                  />
                </div>
                <div className="flex items-center justify-center self-stretch">
                  <InlineEditField
                    value={formatValue(deal.value)}
                    onSave={(value) => updateDeal('value', parseValue(value) * 1000000)}
                    displayClassName="text-5xl font-semibold text-purple-600"
                  />
                </div>
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
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between pt-2 border-t border-border">
                <Select
                  value={deal.engagementType}
                  onValueChange={(value: EngagementType) => updateDeal('engagementType', value)}
                >
                  <SelectTrigger className="w-auto text-xs rounded-lg h-6 px-2 bg-secondary border-0">
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
                <div className={`flex items-center gap-1.5 text-xs text-muted-foreground ${timeAgoData.highlightClass}`}>
                  <Clock className="h-3 w-3" />
                  <span>{timeAgoData.text}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Main Content Grid */}
          <div className="grid gap-6 lg:grid-cols-3">
            {/* Left Column - Notes & Actions */}
            <div className="lg:col-span-2 space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <FileText className="h-5 w-5" />
                    Status
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <InlineEditField
                    value={deal.notes || ''}
                    onSave={(value) => updateDeal('notes', value)}
                    type="textarea"
                    placeholder="Click to add notes..."
                    displayClassName="text-muted-foreground"
                  />
                </CardContent>
              </Card>

              {/* Lenders Card */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Building2 className="h-5 w-5" />
                    Lenders
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {deal.lenders && deal.lenders.length > 0 ? (
                    <div className="space-y-4">
                      {deal.lenders.map((lender, index) => (
                        <div key={lender.id} className={`flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 ${index > 0 ? 'pt-4 border-t border-border' : ''}`}>
                          <span className="font-medium min-w-[140px]">{lender.name}</span>
                          <Select
                            value={lender.status}
                            onValueChange={(value: LenderStatus) => {
                              const updatedLenders = deal.lenders?.map(l => 
                                l.id === lender.id ? { ...l, status: value } : l
                              );
                              updateDeal('lenders', updatedLenders as any);
                            }}
                          >
                            <SelectTrigger className="w-auto h-7 text-xs rounded-lg px-2">
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
                            <SelectTrigger className="w-auto h-7 text-xs rounded-lg px-2 bg-secondary border-0">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {Object.entries(LENDER_STAGE_CONFIG).map(([key, config]) => (
                                <SelectItem key={key} value={key}>
                                  {config.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-muted-foreground/50 italic">No lenders added</p>
                  )}
                </CardContent>
              </Card>

              {/* Actions */}
              <div className="flex gap-3">
                <Button variant="outline">Export Details</Button>
                <Button variant="destructive">Delete Deal</Button>
              </div>
            </div>

            {/* Right Column - Deal Info & Activity */}
            <div className="lg:col-span-1 space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Deal Information</CardTitle>
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
                    <span className="font-medium">{ENGAGEMENT_TYPE_CONFIG[deal.engagementType].label}</span>
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

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Clock className="h-5 w-5" />
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
    </>
  );
}
