import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useDealEmails, DealEmailWithMessage } from '@/hooks/useDealEmails';
import { useGmail } from '@/hooks/useGmail';
import { formatDistanceToNow, format } from 'date-fns';
import {
  Mail,
  Star,
  Unlink,
  Loader2,
  Inbox,
  ExternalLink,
  RefreshCw,
} from 'lucide-react';
import { toast } from 'sonner';
import { Link } from 'react-router-dom';

interface DealEmailsTabProps {
  dealId: string;
}

export function DealEmailsTab({ dealId }: DealEmailsTabProps) {
  const { emails, isLoading, fetchEmails, unlinkEmail } = useDealEmails(dealId);
  const { status } = useGmail();
  const [emailToUnlink, setEmailToUnlink] = useState<DealEmailWithMessage | null>(null);
  const [isUnlinking, setIsUnlinking] = useState(false);

  const handleUnlink = async () => {
    if (!emailToUnlink) return;

    setIsUnlinking(true);
    const success = await unlinkEmail(emailToUnlink.id);
    setIsUnlinking(false);

    if (success) {
      toast.success('Email unlinked from deal');
    } else {
      toast.error('Failed to unlink email');
    }
    setEmailToUnlink(null);
  };

  if (!status.connected) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center">
              <Mail className="h-5 w-5 text-muted-foreground" />
            </div>
            <div>
              <CardTitle className="text-lg">Deal Emails</CardTitle>
              <CardDescription>Track email correspondence for this deal</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center py-8 text-center">
            <Mail className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="font-medium mb-2">Gmail not connected</h3>
            <p className="text-sm text-muted-foreground mb-4 max-w-md">
              Connect your Gmail account to link emails to this deal.
            </p>
            <Button asChild variant="outline">
              <Link to="/integrations">
                <Mail className="mr-2 h-4 w-4" />
                Connect Gmail
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <Mail className="h-5 w-5 text-primary" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <CardTitle className="text-lg">Deal Emails</CardTitle>
                {emails.length > 0 && (
                  <Badge variant="secondary">{emails.length}</Badge>
                )}
              </div>
              <CardDescription>Email correspondence linked to this deal</CardDescription>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={fetchEmails} disabled={isLoading}>
              <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link to="/integrations">
                <ExternalLink className="mr-2 h-4 w-4" />
                Link Emails
              </Link>
            </Button>
          </div>
        </div>
      </CardHeader>
      
      <Separator />
      
      <CardContent className="p-4">
        {isLoading && emails.length === 0 ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : emails.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <Inbox className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="font-medium mb-2">No emails linked</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Link emails from your inbox to track correspondence for this deal.
            </p>
            <Button asChild variant="outline" size="sm">
              <Link to="/integrations">
                <Mail className="mr-2 h-4 w-4" />
                Go to Gmail
              </Link>
            </Button>
          </div>
        ) : (
          <ScrollArea className="h-[400px]">
            <div className="space-y-2">
              {emails.map((email) => (
                <div
                  key={email.id}
                  className="p-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-3 min-w-0 flex-1">
                      {email.message?.is_starred && (
                        <Star className="h-4 w-4 fill-yellow-400 text-yellow-400 shrink-0 mt-1" />
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium truncate">
                            {email.message?.from_name || email.message?.from_email || 'Unknown sender'}
                          </span>
                        </div>
                        <p className="text-sm text-foreground truncate">
                          {email.message?.subject || '(No subject)'}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">
                          {email.message?.snippet}
                        </p>
                        <div className="flex items-center gap-2 mt-1">
                          {email.message?.received_at && (
                            <span className="text-xs text-muted-foreground">
                              {format(new Date(email.message.received_at), 'MMM d, yyyy h:mm a')}
                            </span>
                          )}
                          <span className="text-xs text-muted-foreground">
                            · Linked {formatDistanceToNow(new Date(email.linked_at), { addSuffix: true })}
                          </span>
                        </div>
                        {email.notes && (
                          <p className="text-xs text-muted-foreground mt-1 italic">
                            Note: {email.notes}
                          </p>
                        )}
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="shrink-0 text-muted-foreground hover:text-destructive"
                      onClick={() => setEmailToUnlink(email)}
                    >
                      <Unlink className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </CardContent>

      <AlertDialog open={!!emailToUnlink} onOpenChange={() => setEmailToUnlink(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unlink Email</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to unlink this email from the deal? The email will remain in your Gmail inbox.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleUnlink} disabled={isUnlinking}>
              {isUnlinking ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Unlinking...
                </>
              ) : (
                'Unlink'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
