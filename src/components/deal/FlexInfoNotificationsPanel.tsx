import { useState } from 'react';
import { Bell, Check, Mail, Building2, User, X, ChevronDown, ChevronUp } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { useFlexInfoNotifications } from '@/hooks/useFlexInfoNotifications';
import { formatDistanceToNow } from 'date-fns';
import { toast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

interface FlexInfoNotificationsPanelProps {
  dealId: string | undefined;
}

const INFO_REQUESTS_COLLAPSED_KEY = 'info-requests-panel-collapsed';

export function FlexInfoNotificationsPanel({ dealId }: FlexInfoNotificationsPanelProps) {
  const [isOpen, setIsOpen] = useState(() => {
    const stored = localStorage.getItem(INFO_REQUESTS_COLLAPSED_KEY);
    return stored === null ? true : stored !== 'true';
  });

  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);
    localStorage.setItem(INFO_REQUESTS_COLLAPSED_KEY, (!open).toString());
  };
  const { notifications, isLoading, pendingCount, approveAccess, denyAccess } = useFlexInfoNotifications(dealId);

  const handleApprove = async (notificationId: string) => {
    const success = await approveAccess(notificationId);
    if (success) {
      toast({
        title: 'Access Approved',
        description: 'The lender has been granted access to the deal information.',
      });
    } else {
      toast({
        title: 'Error',
        description: 'Failed to approve access. Please try again.',
        variant: 'destructive',
      });
    }
  };

  const handleDeny = async (notificationId: string) => {
    const success = await denyAccess(notificationId);
    if (success) {
      toast({
        title: 'Access Denied',
        description: 'The lender request has been denied.',
      });
    } else {
      toast({
        title: 'Error',
        description: 'Failed to deny access. Please try again.',
        variant: 'destructive',
      });
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Bell className="h-4 w-4" />
            Info Requests
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (notifications.length === 0) {
    return null;
  }

  const getStatusStyles = (status: string) => {
    switch (status) {
      case 'pending':
        return {
          container: 'bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800 ring-2 ring-amber-300 dark:ring-amber-700',
          dot: 'bg-amber-500',
          label: 'New',
        };
      case 'read':
        return {
          container: 'bg-muted/30 border-border',
          dot: 'bg-muted-foreground/50',
          label: 'Viewed',
        };
      case 'approved':
        return {
          container: 'bg-green-50/50 dark:bg-green-950/10 border-green-200 dark:border-green-800/50',
          dot: 'bg-green-500',
          label: 'Approved',
        };
      case 'denied':
        return {
          container: 'bg-destructive/5 dark:bg-destructive/10 border-destructive/20 dark:border-destructive/30',
          dot: 'bg-destructive',
          label: 'Denied',
        };
      default:
        return {
          container: 'bg-muted/50 border-border',
          dot: 'bg-muted-foreground/50',
          label: status,
        };
    }
  };

  // Calculate max height for ~2 items (each item is roughly 100px)
  const maxScrollHeight = 220;

  return (
    <Card>
      <Collapsible open={isOpen} onOpenChange={handleOpenChange}>
        <CardHeader className="pb-3">
          <CollapsibleTrigger asChild>
            <button className="w-full flex items-center justify-between text-left hover:bg-muted/50 -mx-2 px-2 py-1 rounded-md transition-colors">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Bell className="h-4 w-4" />
                Info Requests
                {pendingCount > 0 && (
                  <Badge variant="destructive" className="ml-2">
                    {pendingCount} new
                  </Badge>
                )}
                {notifications.length > 0 && (
                  <Badge variant="secondary" className="ml-1">
                    {notifications.length}
                  </Badge>
                )}
              </CardTitle>
              {isOpen ? (
                <ChevronUp className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              )}
            </button>
          </CollapsibleTrigger>
        </CardHeader>
        <CollapsibleContent>
          <CardContent className="pt-0">
            <ScrollArea style={{ maxHeight: maxScrollHeight }} className="pr-3">
              <div className="space-y-3">
                {notifications.map((notification) => {
                  const styles = getStatusStyles(notification.status);
                  return (
                    <div
                      key={notification.id}
                      className={cn(
                        'p-3 rounded-lg border transition-all relative',
                        styles.container
                      )}
                    >
                      {/* Status indicator dot */}
                      {notification.status === 'pending' && (
                        <span className="absolute -top-1 -right-1 flex h-3 w-3">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-3 w-3 bg-amber-500"></span>
                        </span>
                      )}
                      
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className={cn('w-2 h-2 rounded-full flex-shrink-0', styles.dot)} />
                            <p className={cn(
                              'text-sm font-medium text-foreground',
                              notification.status === 'read' && 'text-muted-foreground'
                            )}>
                              {notification.message}
                            </p>
                          </div>
                          <div className="flex flex-wrap items-center gap-2 mt-1.5 text-xs text-muted-foreground ml-4">
                            {notification.company_name && (
                              <span className="flex items-center gap-1">
                                <Building2 className="h-3 w-3" />
                                {notification.company_name}
                              </span>
                            )}
                            {notification.user_email && (
                              <span className="flex items-center gap-1">
                                <Mail className="h-3 w-3" />
                                {notification.user_email}
                              </span>
                            )}
                            {notification.lender_name && (
                              <span className="flex items-center gap-1">
                                <User className="h-3 w-3" />
                                {notification.lender_name}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground mt-1 ml-4">
                            {formatDistanceToNow(new Date(notification.created_at), { addSuffix: true })}
                          </p>
                        </div>
                        <div className="flex-shrink-0 flex items-center gap-2">
                          {notification.status === 'approved' ? (
                            <Badge variant="secondary" className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                              <Check className="h-3 w-3 mr-1" />
                              Approved
                            </Badge>
                          ) : notification.status === 'denied' ? (
                            <Badge variant="secondary" className="bg-destructive/10 text-destructive">
                              <X className="h-3 w-3 mr-1" />
                              Denied
                            </Badge>
                          ) : notification.status === 'read' ? (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleDeny(notification.id)}
                                className="h-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                              >
                                <X className="h-3.5 w-3.5 mr-1" />
                                Deny
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleApprove(notification.id)}
                                className="h-8"
                              >
                                <Check className="h-3.5 w-3.5 mr-1" />
                                Approve
                              </Button>
                            </>
                          ) : (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleDeny(notification.id)}
                                className="h-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                              >
                                <X className="h-3.5 w-3.5 mr-1" />
                                Deny
                              </Button>
                              <Button
                                size="sm"
                                onClick={() => handleApprove(notification.id)}
                                className="h-8"
                              >
                                <Check className="h-3.5 w-3.5 mr-1" />
                                Approve
                              </Button>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
            {notifications.length > 2 && (
              <p className="text-xs text-muted-foreground text-center mt-2">
                Scroll to see {notifications.length - 2} more
              </p>
            )}
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
