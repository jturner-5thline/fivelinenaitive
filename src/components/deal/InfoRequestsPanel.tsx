import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { format, formatDistanceToNow } from 'date-fns';
import { HelpCircle, MessageSquare, User, Clock, ExternalLink, Building2, DollarSign, Briefcase } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';

interface InfoRequest {
  id: string;
  external_deal_id: string;
  company_name: string | null;
  industry: string | null;
  capital_ask: string | null;
  requester_user_id: string | null;
  requester_email: string | null;
  requester_name: string | null;
  requested_at: string | null;
  status: string;
  created_at: string;
}

export function InfoRequestsPanel() {
  const { data: infoRequests, isLoading } = useQuery({
    queryKey: ['info-requests'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('deal_info_requests')
        .select('*')
        .eq('source', 'flex')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching info requests:', error);
        throw error;
      }

      return data as InfoRequest[];
    },
  });

  const pendingCount = infoRequests?.filter(r => r.status === 'pending').length || 0;

  return (
    <Card id="info-requests-panel">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-medium flex items-center gap-2">
            <HelpCircle className="h-4 w-4" />
            Info Requests
          </CardTitle>
          {pendingCount > 0 && (
            <Badge variant="default" className="bg-amber-500">
              {pendingCount} pending
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="p-3 border rounded-lg">
                <Skeleton className="h-4 w-1/3 mb-2" />
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
                    request.status === 'pending'
                      ? 'bg-amber-50 border-amber-200 dark:bg-amber-950/20 dark:border-amber-800'
                      : 'bg-card'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center">
                        <User className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <div>
                        <p className="text-sm font-medium">
                          {request.requester_name || request.requester_email || 'Unknown Lender'}
                        </p>
                        {request.requester_email && request.requester_name && (
                          <p className="text-xs text-muted-foreground">
                            {request.requester_email}
                          </p>
                        )}
                      </div>
                    </div>
                    <Badge 
                      variant={request.status === 'pending' ? 'default' : 'secondary'}
                      className={request.status === 'pending' ? 'bg-amber-500' : ''}
                    >
                      {request.status}
                    </Badge>
                  </div>
                  
                  {/* Deal info */}
                  <div className="mt-3 p-2 bg-muted/50 rounded-md space-y-1">
                    {request.company_name && (
                      <div className="flex items-center gap-2 text-xs">
                        <Building2 className="h-3 w-3 text-muted-foreground" />
                        <span className="font-medium">{request.company_name}</span>
                      </div>
                    )}
                    {request.industry && (
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Briefcase className="h-3 w-3" />
                        <span>{request.industry}</span>
                      </div>
                    )}
                    {request.capital_ask && (
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <DollarSign className="h-3 w-3" />
                        <span>{request.capital_ask}</span>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-2 text-xs text-muted-foreground mt-2">
                    <Clock className="h-3 w-3" />
                    <span title={format(new Date(request.requested_at || request.created_at), 'PPpp')}>
                      {formatDistanceToNow(new Date(request.requested_at || request.created_at), { addSuffix: true })}
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
