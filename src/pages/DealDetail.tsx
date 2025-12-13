import { useParams, Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { ArrowLeft, Building2, User, Calendar, Landmark, FileText, Clock } from 'lucide-react';
import { differenceInMinutes, differenceInHours, differenceInDays, differenceInWeeks } from 'date-fns';
import { DashboardHeader } from '@/components/dashboard/DashboardHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { mockDeals } from '@/data/mockDeals';
import { STAGE_CONFIG, STATUS_CONFIG, ENGAGEMENT_TYPE_CONFIG } from '@/types/deal';
import { ActivityTimeline, ActivityItem } from '@/components/dashboard/ActivityTimeline';

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

export default function DealDetail() {
  const { id } = useParams<{ id: string }>();
  const deal = mockDeals.find((d) => d.id === id);
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
          {/* Back button */}
          <Button variant="ghost" size="sm" className="mb-6 gap-2" asChild>
            <Link to="/dashboard">
              <ArrowLeft className="h-4 w-4" />
              Back to Pipeline
            </Link>
          </Button>

          {/* Header Card */}
          <Card className="mb-6">
            <CardHeader className="pb-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                  <h1 className="text-xl font-semibold text-purple-600">{deal.company}</h1>
                  <p className="text-muted-foreground mt-1">{deal.name}</p>
                </div>
                <span className="text-xl font-semibold text-purple-600">{formatValue(deal.value)}</span>
              </div>
              
              <div className="flex items-center gap-2 mt-4">
                <Badge
                  variant="outline"
                  className={`${statusConfig.badgeColor} text-white border-0 text-xs rounded-lg`}
                >
                  {statusConfig.label}
                </Badge>
                <Badge
                  variant="outline"
                  className="text-xs rounded-lg"
                >
                  {stageConfig.label}
                </Badge>
              </div>

              <p className={`text-sm line-clamp-2 mt-4 ${deal.notes ? 'text-muted-foreground' : 'text-muted-foreground/50 italic'}`}>
                {deal.notes || 'No Status'}
              </p>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between pt-2 border-t border-border">
                <Badge variant="secondary" className="text-xs rounded-lg">
                  {ENGAGEMENT_TYPE_CONFIG[deal.engagementType].label}
                </Badge>
                <div className={`flex items-center gap-1.5 text-xs text-muted-foreground ${timeAgoData.highlightClass}`}>
                  <Clock className="h-3 w-3" />
                  <span>{timeAgoData.text}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Main Content Grid */}
          <div className="grid gap-6 lg:grid-cols-3">
            {/* Left Column - Deal Info */}
            <div className="lg:col-span-2 space-y-6">
              <div className="grid gap-6 md:grid-cols-2">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Deal Information</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Manager</span>
                      <div className="flex items-center gap-2">
                        <User className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium">{deal.manager}</span>
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Lender</span>
                      <div className="flex items-center gap-2">
                        <Landmark className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium">{deal.lender}</span>
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Contact</span>
                      <span className="font-medium">{deal.contact}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Engagement Type</span>
                      <span className="font-medium">{ENGAGEMENT_TYPE_CONFIG[deal.engagementType].label}</span>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Timeline</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Created</span>
                      <div className="flex items-center gap-2">
                        <Calendar className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium">{deal.createdAt}</span>
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Last Updated</span>
                      <div className={`flex items-center gap-2 ${timeAgoData.highlightClass}`}>
                        <Clock className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium">{timeAgoData.text}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {deal.notes && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <FileText className="h-5 w-5" />
                      Notes
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-muted-foreground">{deal.notes}</p>
                  </CardContent>
                </Card>
              )}

              {/* Actions */}
              <div className="flex gap-3">
                <Button>Edit Deal</Button>
                <Button variant="outline">Export Details</Button>
                <Button variant="destructive">Delete Deal</Button>
              </div>
            </div>

            {/* Right Column - Activity Timeline */}
            <div className="lg:col-span-1">
              <Card className="sticky top-24">
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
