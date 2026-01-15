import { Bell, Check, Mail, Building2, User } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useFlexInfoNotifications } from '@/hooks/useFlexInfoNotifications';
import { formatDistanceToNow } from 'date-fns';
import { toast } from '@/hooks/use-toast';

interface FlexInfoNotificationsPanelProps {
  dealId: string | undefined;
}

export function FlexInfoNotificationsPanel({ dealId }: FlexInfoNotificationsPanelProps) {
  const { notifications, isLoading, pendingCount, approveAccess } = useFlexInfoNotifications(dealId);

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

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Bell className="h-4 w-4" />
          Info Requests
          {pendingCount > 0 && (
            <Badge variant="destructive" className="ml-auto">
              {pendingCount} pending
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {notifications.map((notification) => (
          <div
            key={notification.id}
            className={`p-3 rounded-lg border ${
              notification.status === 'pending'
                ? 'bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800'
                : 'bg-muted/50 border-border'
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground">
                  {notification.message}
                </p>
                <div className="flex flex-wrap items-center gap-2 mt-1.5 text-xs text-muted-foreground">
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
                <p className="text-xs text-muted-foreground mt-1">
                  {formatDistanceToNow(new Date(notification.created_at), { addSuffix: true })}
                </p>
              </div>
              <div className="flex-shrink-0">
                {notification.status === 'pending' ? (
                  <Button
                    size="sm"
                    onClick={() => handleApprove(notification.id)}
                    className="h-8"
                  >
                    <Check className="h-3.5 w-3.5 mr-1" />
                    Approve Access
                  </Button>
                ) : (
                  <Badge variant="secondary" className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                    <Check className="h-3 w-3 mr-1" />
                    Approved
                  </Badge>
                )}
              </div>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
