import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Users, Loader2, Shield, User, CheckCircle, XCircle } from 'lucide-react';
import { useCompany, CompanyRole } from '@/hooks/useCompany';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';

interface BulkInviteDialogProps {
  companyId: string;
  companyName: string;
}

interface InviteResult {
  email: string;
  status: 'success' | 'error' | 'skipped';
  message: string;
}

export function BulkInviteDialog({ companyId, companyName }: BulkInviteDialogProps) {
  const [open, setOpen] = useState(false);
  const [emails, setEmails] = useState('');
  const [role, setRole] = useState<'admin' | 'member'>('member');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [results, setResults] = useState<InviteResult[]>([]);
  const [showResults, setShowResults] = useState(false);
  const { members } = useCompany();

  const parseEmails = (input: string): string[] => {
    // Split by comma, semicolon, newline, or space
    const emails = input
      .split(/[,;\n\s]+/)
      .map(e => e.trim().toLowerCase())
      .filter(e => e.length > 0);
    
    // Remove duplicates
    return [...new Set(emails)];
  };

  const isValidEmail = (email: string): boolean => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  };

  const handleSubmit = async () => {
    const emailList = parseEmails(emails);
    
    if (emailList.length === 0) {
      toast({
        title: "No emails",
        description: "Please enter at least one email address.",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);
    setResults([]);
    const inviteResults: InviteResult[] = [];

    try {
      // Get current user info
      const { data: { user } } = await supabase.auth.getUser();
      const { data: profile } = await supabase
        .from('profiles')
        .select('display_name')
        .eq('user_id', user?.id)
        .single();

      const inviterName = profile?.display_name || user?.email || 'A team member';

      for (const email of emailList) {
        // Validate email format
        if (!isValidEmail(email)) {
          inviteResults.push({
            email,
            status: 'error',
            message: 'Invalid email format',
          });
          continue;
        }

        // Check if already a member
        const existingMember = members.find(m => m.email?.toLowerCase() === email);
        if (existingMember) {
          inviteResults.push({
            email,
            status: 'skipped',
            message: 'Already a member',
          });
          continue;
        }

        try {
          // Create the invitation
          const { data: invitation, error: inviteError } = await supabase
            .from('company_invitations')
            .insert({
              company_id: companyId,
              email,
              role,
              invited_by: user?.id,
            })
            .select()
            .single();

          if (inviteError) {
            if (inviteError.code === '23505') {
              inviteResults.push({
                email,
                status: 'skipped',
                message: 'Invitation already pending',
              });
            } else {
              inviteResults.push({
                email,
                status: 'error',
                message: inviteError.message,
              });
            }
            continue;
          }

          // Send the invitation email
          await supabase.functions.invoke('send-invite', {
            body: {
              invitationId: invitation.id,
              email,
              companyName,
              inviterName,
              role: role === 'admin' ? 'Admin' : 'User',
              token: invitation.token,
            },
          });

          inviteResults.push({
            email,
            status: 'success',
            message: 'Invitation sent',
          });
        } catch (error: any) {
          inviteResults.push({
            email,
            status: 'error',
            message: error.message || 'Failed to send',
          });
        }
      }

      setResults(inviteResults);
      setShowResults(true);

      const successCount = inviteResults.filter(r => r.status === 'success').length;
      const errorCount = inviteResults.filter(r => r.status === 'error').length;
      const skippedCount = inviteResults.filter(r => r.status === 'skipped').length;

      if (successCount > 0) {
        toast({
          title: "Invitations sent",
          description: `${successCount} invitation${successCount !== 1 ? 's' : ''} sent${errorCount > 0 ? `, ${errorCount} failed` : ''}${skippedCount > 0 ? `, ${skippedCount} skipped` : ''}`,
        });
      } else if (errorCount > 0) {
        toast({
          title: "Failed to send invitations",
          description: "Check the results for details.",
          variant: "destructive",
        });
      }
    } catch (error: any) {
      console.error('Bulk invite error:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to process invitations",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    setOpen(false);
    setEmails('');
    setRole('member');
    setResults([]);
    setShowResults(false);
  };

  const emailCount = parseEmails(emails).length;

  return (
    <Dialog open={open} onOpenChange={(isOpen) => isOpen ? setOpen(true) : handleClose()}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Users className="h-4 w-4 mr-2" />
          Bulk Invite
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Bulk Invite Team Members</DialogTitle>
          <DialogDescription>
            Invite multiple people at once to join {companyName}
          </DialogDescription>
        </DialogHeader>

        {!showResults ? (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Email Addresses</Label>
              <Textarea
                placeholder="Enter email addresses separated by commas, semicolons, or new lines&#10;&#10;e.g.&#10;john@example.com&#10;jane@example.com, bob@example.com"
                value={emails}
                onChange={(e) => setEmails(e.target.value)}
                rows={6}
                className="resize-none"
              />
              {emailCount > 0 && (
                <p className="text-sm text-muted-foreground">
                  {emailCount} email{emailCount !== 1 ? 's' : ''} detected
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label>Role for all invites</Label>
              <Select value={role} onValueChange={(v) => setRole(v as 'admin' | 'member')}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">
                    <div className="flex items-center gap-2">
                      <Shield className="h-4 w-4 text-primary" />
                      Admin
                    </div>
                  </SelectItem>
                  <SelectItem value="member">
                    <div className="flex items-center gap-2">
                      <User className="h-4 w-4 text-muted-foreground" />
                      User
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <Button type="button" variant="outline" onClick={handleClose}>
                Cancel
              </Button>
              <Button onClick={handleSubmit} disabled={isSubmitting || emailCount === 0}>
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Sending...
                  </>
                ) : (
                  `Send ${emailCount} Invitation${emailCount !== 1 ? 's' : ''}`
                )}
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <ScrollArea className="h-64 rounded-md border p-3">
              <div className="space-y-2">
                {results.map((result, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between py-2 border-b last:border-0"
                  >
                    <span className="text-sm truncate flex-1 mr-2">{result.email}</span>
                    {result.status === 'success' && (
                      <Badge variant="outline" className="text-green-600 border-green-200 bg-green-50 dark:bg-green-950/30">
                        <CheckCircle className="h-3 w-3 mr-1" />
                        Sent
                      </Badge>
                    )}
                    {result.status === 'error' && (
                      <Badge variant="destructive" className="text-xs">
                        <XCircle className="h-3 w-3 mr-1" />
                        {result.message}
                      </Badge>
                    )}
                    {result.status === 'skipped' && (
                      <Badge variant="secondary" className="text-xs">
                        {result.message}
                      </Badge>
                    )}
                  </div>
                ))}
              </div>
            </ScrollArea>

            <div className="flex justify-between items-center pt-2">
              <div className="text-sm text-muted-foreground">
                {results.filter(r => r.status === 'success').length} sent,{' '}
                {results.filter(r => r.status === 'skipped').length} skipped,{' '}
                {results.filter(r => r.status === 'error').length} failed
              </div>
              <Button onClick={handleClose}>Done</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
