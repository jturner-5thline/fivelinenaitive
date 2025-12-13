import { useParams, Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { ArrowLeft, Building2, User, Calendar, Landmark, TrendingUp, FileText, Clock } from 'lucide-react';
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

  return (
    <>
      <Helmet>
        <title>{deal.name} - nAItive</title>
        <meta name="description" content={`Deal details for ${deal.name} with ${deal.company}`} />
      </Helmet>

      <div className="min-h-screen bg-background">
        <DashboardHeader />

        <main className="container mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:px-8">
          {/* Back button */}
          <Button variant="ghost" size="sm" className="mb-6 gap-2" asChild>
            <Link to="/dashboard">
              <ArrowLeft className="h-4 w-4" />
              Back to Pipeline
            </Link>
          </Button>

          {/* Header */}
          <div className="mb-8">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h1 className="text-3xl font-semibold text-foreground mb-2">{deal.name}</h1>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Building2 className="h-4 w-4" />
                  <span className="text-lg">{deal.company}</span>
                </div>
              </div>
              <div className="text-right">
                <div className="flex items-center gap-2 text-3xl font-bold text-foreground">
                  <TrendingUp className="h-6 w-6 text-success" />
                  {formatValue(deal.value)}
                </div>
                <span className="text-sm text-muted-foreground">Deal Value</span>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Badge className={`${stageConfig.color} text-white border-0`}>
                {stageConfig.label}
              </Badge>
              <Badge className={`${statusConfig.color} text-white border-0`}>
                {statusConfig.label}
              </Badge>
              <Badge variant="secondary">
                {ENGAGEMENT_TYPE_CONFIG[deal.engagementType].label}
              </Badge>
            </div>
          </div>

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
                      <div className="flex items-center gap-2">
                        <Calendar className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium">{deal.updatedAt}</span>
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
