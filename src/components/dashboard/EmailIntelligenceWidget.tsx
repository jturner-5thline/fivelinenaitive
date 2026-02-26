import { useEffect } from 'react';
import { Mail, Tag, ArrowRight, Inbox, ExternalLink } from 'lucide-react';
import { NaitiveIcon as Sparkles } from '@/components/NaitiveIcon';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useDashboardLayout } from '@/contexts/DashboardLayoutContext';
import { useGmail } from '@/hooks/useGmail';
import { formatDistanceToNow } from 'date-fns';
import { useNavigate } from 'react-router-dom';

export function EmailIntelligenceWidget() {
  const { toggles } = useDashboardLayout();
  const { status, messages, isLoading, listMessages } = useGmail();
  const navigate = useNavigate();

  useEffect(() => {
    if (status.connected) {
      listMessages({ maxResults: 5 });
    }
  }, [status.connected, listMessages]);

  if (toggles.hideEmailHints) return null;

  // Not connected state
  if (!status.connected) {
    return (
      <Card className="h-full flex flex-col border-primary/10 bg-gradient-to-br from-primary/5 to-transparent">
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-medium flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            Email Intelligence
          </CardTitle>
        </CardHeader>
        <CardContent className="flex-1 flex flex-col items-center justify-center gap-3 text-center">
          <div className="p-3 rounded-full bg-primary/10">
            <Mail className="h-6 w-6 text-primary" />
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">Connect your Gmail</p>
            <p className="text-xs text-muted-foreground mt-1">
              Link your email in Integrations to see your inbox here.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="mt-1"
            onClick={() => navigate('/integrations')}
          >
            Go to Integrations
          </Button>
        </CardContent>
      </Card>
    );
  }

  // Connected + loading
  if (isLoading && messages.length === 0) {
    return (
      <Card className="h-full flex flex-col border-primary/10 bg-gradient-to-br from-primary/5 to-transparent">
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-medium flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            Email Intelligence
            <Badge variant="outline" className="text-[10px] text-green-500 border-green-500/30">Connected</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {[1, 2, 3].map(i => (
            <Skeleton key={i} className="h-14 w-full rounded-lg" />
          ))}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="h-full flex flex-col border-primary/10 bg-gradient-to-br from-primary/5 to-transparent">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-medium flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            Email Intelligence
            <Badge variant="outline" className="text-[10px] text-green-500 border-green-500/30">Connected</Badge>
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs gap-1"
            onClick={() => navigate('/integrations')}
          >
            <Inbox className="h-3 w-3" />
            Full Inbox
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-2 overflow-auto">
        {messages.length === 0 ? (
          <div className="text-center py-6">
            <p className="text-sm text-muted-foreground">No recent emails found.</p>
          </div>
        ) : (
          messages.map(msg => (
            <div
              key={msg.id}
              className={`flex items-start gap-3 p-2.5 rounded-lg border group cursor-pointer transition-colors hover:bg-muted/30 ${
                !msg.is_read ? 'bg-primary/5 border-primary/20' : 'bg-background/50'
              }`}
            >
              <div className="p-1.5 rounded-md bg-primary/10 shrink-0 mt-0.5">
                <Mail className={`h-3.5 w-3.5 ${!msg.is_read ? 'text-primary' : 'text-muted-foreground'}`} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className={`text-sm truncate ${!msg.is_read ? 'font-semibold text-foreground' : 'font-medium text-foreground'}`}>
                    {msg.from_name || msg.from_email}
                  </p>
                  {!msg.is_read && (
                    <span className="h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
                  )}
                </div>
                <p className="text-xs font-medium text-foreground/80 truncate mt-0.5">
                  {msg.subject || '(No subject)'}
                </p>
                <p className="text-xs text-muted-foreground truncate mt-0.5">
                  {msg.snippet}
                </p>
                <p className="text-[10px] text-muted-foreground mt-1">
                  {formatDistanceToNow(new Date(msg.received_at), { addSuffix: true })}
                </p>
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
