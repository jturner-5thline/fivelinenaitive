import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Link2, Copy, Check, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';

type CompanyRole = Database['public']['Enums']['company_role'];

interface ShareInviteLinkDialogProps {
  companyId: string;
  companyName: string;
  isAdmin?: boolean;
}

export function ShareInviteLinkDialog({ companyId, companyName, isAdmin = false }: ShareInviteLinkDialogProps) {
  const [open, setOpen] = useState(false);
  const [role, setRole] = useState<CompanyRole>('member');
  const [isGenerating, setIsGenerating] = useState(false);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const generateInviteLink = async () => {
    setIsGenerating(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error('You must be logged in to generate invite links');
        return;
      }

      // Create invitation record without sending email
      // Use a placeholder email that indicates it's a link-based invite
      const placeholderEmail = `link-invite-${Date.now()}@placeholder.local`;
      
      const { data: invitation, error } = await supabase
        .from('company_invitations')
        .insert({
          company_id: companyId,
          email: placeholderEmail,
          role,
          invited_by: user.id,
          email_status: 'pending', // Use 'pending' status for link-only invites
        })
        .select('token')
        .single();

      if (error) {
        console.error('Database error:', error);
        throw error;
      }

      if (!invitation?.token) {
        console.error('No token returned:', invitation);
        throw new Error('No token returned from invitation creation');
      }

      const baseUrl = 'https://naitive.co';
      const link = `${baseUrl}/accept-invite?token=${invitation.token}`;
      setInviteLink(link);
      toast.success('Invite link generated! Share it with your team member.');
    } catch (error: any) {
      console.error('Error generating invite link:', error);
      toast.error('Failed to generate invite link');
    } finally {
      setIsGenerating(false);
    }
  };

  const copyToClipboard = async () => {
    if (!inviteLink) return;
    
    try {
      await navigator.clipboard.writeText(inviteLink);
      setCopied(true);
      toast.success('Link copied to clipboard!');
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      toast.error('Failed to copy link');
    }
  };

  const handleClose = () => {
    setOpen(false);
    setInviteLink(null);
    setCopied(false);
    setRole('member');
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => {
      if (!isOpen) handleClose();
      else setOpen(true);
    }}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Link2 className="h-4 w-4" />
          Share Invite Link
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Share Invite Link</DialogTitle>
          <DialogDescription>
            Generate a shareable link to invite someone to {companyName}. 
            They can use this link to join without needing an email invitation.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {isAdmin ? (
            <div className="space-y-2">
              <Label htmlFor="role">Role</Label>
              <Select value={role} onValueChange={(value: CompanyRole) => setRole(value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="member">Member</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                The person who uses this link will be assigned this role.
              </p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              The person who uses this link will join as a <strong>Member</strong>.
            </p>
          )}

          {inviteLink ? (
            <div className="space-y-2">
              <Label>Invite Link</Label>
              <div className="flex gap-2">
                <Input 
                  value={inviteLink} 
                  readOnly 
                  className="font-mono text-xs"
                />
                <Button 
                  type="button" 
                  size="icon" 
                  variant="outline"
                  onClick={copyToClipboard}
                >
                  {copied ? (
                    <Check className="h-4 w-4 text-green-500" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                This link expires in 7 days. Share it via Slack, text, or any other method.
              </p>
            </div>
          ) : (
            <Button 
              onClick={generateInviteLink} 
              disabled={isGenerating}
              className="w-full"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Link2 className="mr-2 h-4 w-4" />
                  Generate Invite Link
                </>
              )}
            </Button>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            {inviteLink ? 'Done' : 'Cancel'}
          </Button>
          {inviteLink && (
            <Button onClick={generateInviteLink} disabled={isGenerating}>
              Generate New Link
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
