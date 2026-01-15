import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { format, formatDistanceToNow } from 'date-fns';
import { HelpCircle, MessageSquare, User, Clock, ExternalLink, CheckCircle, FlaskConical, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from '@/hooks/use-toast';
import { useAdminRole } from '@/hooks/useAdminRole';

interface InfoRequest {
  id: string;
  lender_name: string | null;
  lender_email: string | null;
  message: string;
  created_at: string;
  read_at: string | null;
  source: 'notification' | 'activity';
}

interface InfoRequestsPanelProps {
  dealId: string;
}

export function InfoRequestsPanel({ dealId }: InfoRequestsPanelProps) {
  const [isTestingRequest, setIsTestingRequest] = useState(false);
  const { isAdmin } = useAdminRole();
  const { data: infoRequests, isLoading, refetch } = useQuery({
    queryKey: ['info-requests', dealId],
    queryFn: async () => {
      // Fetch from flex_notifications
      const { data: notifications, error: notifError } = await supabase
        .from('flex_notifications')
        .select('*')
        .eq('deal_id', dealId)
        .eq('alert_type', 'info_request')
        .order('created_at', { ascending: false });

      if (notifError) {
        console.error('Error fetching notifications:', notifError);
      }

      // Also fetch from activity_logs for info requests
      const { data: activities, error: actError } = await supabase
        .from('activity_logs')
        .select('*')
        .eq('deal_id', dealId)
        .eq('activity_type', 'flex_info_requested')
        .order('created_at', { ascending: false });

      if (actError) {
        console.error('Error fetching activities:', actError);
      }

      // Combine and deduplicate based on timestamp and lender
      const requests: InfoRequest[] = [];
      const seen = new Set<string>();

      // Add notifications first (they have more detail)
      notifications?.forEach((n) => {
        const key = `${n.lender_email || n.lender_name}-${n.created_at}`;
        if (!seen.has(key)) {
          seen.add(key);
          requests.push({
            id: n.id,
            lender_name: n.lender_name,
            lender_email: n.lender_email,
            message: n.message,
            created_at: n.created_at,
            read_at: n.read_at,
            source: 'notification',
          });
        }
      });

      // Add activities that aren't already in notifications
      activities?.forEach((a) => {
        const metadata = a.metadata as { lender_name?: string; lender_email?: string; message?: string } | null;
        const lenderEmail = metadata?.lender_email;
        const lenderName = metadata?.lender_name;
        const key = `${lenderEmail || lenderName}-${a.created_at}`;
        
        if (!seen.has(key)) {
          seen.add(key);
          requests.push({
            id: a.id,
            lender_name: lenderName || null,
            lender_email: lenderEmail || null,
            message: metadata?.message || a.description,
            created_at: a.created_at,
            read_at: null,
            source: 'activity',
          });
        }
      });

      // Sort by date descending
      return requests.sort((a, b) => 
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
    },
    enabled: !!dealId,
  });

  const handleMarkAsRead = async (requestId: string) => {
    const { error } = await supabase
      .from('flex_notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('id', requestId);

    if (error) {
      toast({ title: 'Failed to mark as read', variant: 'destructive' });
    } else {
      refetch();
    }
  };

  const handleTestInfoRequest = async () => {
    setIsTestingRequest(true);
    try {
      const testLenders = [
        { name: 'Test Capital Partners', email: 'test@testcapital.com' },
        { name: 'Demo Finance LLC', email: 'demo@demofinance.com' },
        { name: 'Sample Lending Co', email: 'sample@samplelending.com' },
      ];
      const randomLender = testLenders[Math.floor(Math.random() * testLenders.length)];
      
      const testMessages = [
        'Can you provide the most recent audited financials and any projections for the next 12-24 months?',
        'We would like to see the capitalization table and details on any existing debt facilities.',
        'Please share the company\'s customer concentration breakdown and top 10 customer list.',
        'Could you provide information on the management team backgrounds and any planned hires?',
        'We need details on the current cash runway and monthly burn rate.',
      ];
      const randomMessage = testMessages[Math.floor(Math.random() * testMessages.length)];

      const response = await supabase.functions.invoke('receive-flex-activity', {
        body: {
          event: {
            event_type: 'info_request',
            deal_id: dealId,
            lender_name: randomLender.name,
            lender_email: randomLender.email,
            message: randomMessage,
            timestamp: new Date().toISOString(),
          },
        },
      });

      if (response.error) {
        throw response.error;
      }

      toast({
        title: 'Test info request sent',
        description: `Simulated request from ${randomLender.name}`,
      });
      
      // Refetch after a short delay to allow the webhook to process
      setTimeout(() => refetch(), 1000);
    } catch (error) {
      console.error('Test request failed:', error);
      toast({
        title: 'Test failed',
        description: error instanceof Error ? error.message : 'Failed to send test request',
        variant: 'destructive',
      });
    } finally {
      setIsTestingRequest(false);
    }
  };

  const unreadCount = infoRequests?.filter(r => !r.read_at && r.source === 'notification').length || 0;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-medium flex items-center gap-2">
            <HelpCircle className="h-4 w-4" />
            Info Requests
          </CardTitle>
          <div className="flex items-center gap-2">
            {isAdmin && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs gap-1"
                onClick={handleTestInfoRequest}
                disabled={isTestingRequest}
              >
                {isTestingRequest ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <FlaskConical className="h-3 w-3" />
                )}
                Test
              </Button>
            )}
            {unreadCount > 0 && (
              <Badge variant="default" className="bg-amber-500">
                {unreadCount} new
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="p-3 border rounded-lg">
                <Skeleton className="h-4 w-1/3 mb-2" />
                <Skeleton className="h-3 w-full mb-1" />
                <Skeleton className="h-3 w-2/3" />
              </div>
            ))}
          </div>
        ) : !infoRequests || infoRequests.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <MessageSquare className="h-10 w-10 text-muted-foreground/50 mb-3" />
            <p className="text-sm font-medium text-muted-foreground">
              No info requests yet
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              When lenders request information on FLEx, they'll appear here.
            </p>
          </div>
        ) : (
          <ScrollArea className="h-[400px] pr-2">
            <div className="space-y-3">
              {infoRequests.map((request) => (
                <div
                  key={request.id}
                  className={`p-3 border rounded-lg transition-colors ${
                    !request.read_at && request.source === 'notification'
                      ? 'bg-amber-50 border-amber-200 dark:bg-amber-950/20 dark:border-amber-800'
                      : 'bg-card'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2">
                      <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center">
                        <User className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <div>
                        <p className="text-sm font-medium">
                          {request.lender_name || request.lender_email || 'Unknown Lender'}
                        </p>
                        {request.lender_email && request.lender_name && (
                          <p className="text-xs text-muted-foreground">{request.lender_email}</p>
                        )}
                      </div>
                    </div>
                    {!request.read_at && request.source === 'notification' && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => handleMarkAsRead(request.id)}
                      >
                        <CheckCircle className="h-3 w-3 mr-1" />
                        Mark read
                      </Button>
                    )}
                  </div>
                  
                  <p className="text-sm text-foreground mb-2">
                    {request.message}
                  </p>
                  
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    <span title={format(new Date(request.created_at), 'PPpp')}>
                      {formatDistanceToNow(new Date(request.created_at), { addSuffix: true })}
                    </span>
                    <Badge variant="outline" className="text-[10px] h-4">
                      <ExternalLink className="h-2 w-2 mr-1" />
                      FLEx
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
