import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { UserPlus, Loader2, Shield, User } from 'lucide-react';
import { useCompany, CompanyRole } from '@/hooks/useCompany';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

const inviteSchema = z.object({
  email: z.string().trim().email({ message: "Please enter a valid email address" }),
  role: z.enum(['admin', 'member'] as const),
});

type InviteFormData = z.infer<typeof inviteSchema>;

interface InviteMemberDialogProps {
  companyId: string;
  companyName: string;
}

export function InviteMemberDialog({ companyId, companyName }: InviteMemberDialogProps) {
  const [open, setOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { members } = useCompany();

  const form = useForm<InviteFormData>({
    resolver: zodResolver(inviteSchema),
    defaultValues: {
      email: '',
      role: 'member',
    },
  });

  const onSubmit = async (data: InviteFormData) => {
    setIsSubmitting(true);

    try {
      // Check if email is already a member
      const existingMember = members.find(m => m.email?.toLowerCase() === data.email.toLowerCase());
      if (existingMember) {
        toast({
          title: "Already a member",
          description: "This user is already a member of your company.",
          variant: "destructive",
        });
        setIsSubmitting(false);
        return;
      }

      // Get current user info for the invite email
      const { data: { user } } = await supabase.auth.getUser();
      const { data: profile } = await supabase
        .from('profiles')
        .select('display_name')
        .eq('user_id', user?.id)
        .single();

      // Create the invitation
      const { data: invitation, error: inviteError } = await supabase
        .from('company_invitations')
        .insert({
          company_id: companyId,
          email: data.email.toLowerCase(),
          role: data.role,
          invited_by: user?.id,
        })
        .select()
        .single();

      if (inviteError) {
        if (inviteError.code === '23505') {
          toast({
            title: "Invitation exists",
            description: "An invitation has already been sent to this email address.",
            variant: "destructive",
          });
        } else {
          throw inviteError;
        }
        setIsSubmitting(false);
        return;
      }

      // Send the invitation email
      const { error: emailError } = await supabase.functions.invoke('send-invite', {
        body: {
          invitationId: invitation.id,
          email: data.email,
          companyName,
          inviterName: profile?.display_name || user?.email || 'A team member',
          role: data.role === 'admin' ? 'Admin' : 'User',
          token: invitation.token,
        },
      });

      if (emailError) {
        console.error('Email error:', emailError);
        toast({
          title: "Invitation created",
          description: "Invitation saved but email could not be sent. The user can still join via the invite link.",
        });
      } else {
        toast({
          title: "Invitation sent",
          description: `An invitation has been sent to ${data.email}`,
        });
      }

      form.reset();
      setOpen(false);
    } catch (error: any) {
      console.error('Error sending invitation:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to send invitation",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <UserPlus className="h-4 w-4 mr-2" />
          Invite Member
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invite Team Member</DialogTitle>
          <DialogDescription>
            Send an email invitation to join {companyName}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email Address</FormLabel>
                  <FormControl>
                    <Input
                      type="email"
                      placeholder="colleague@company.com"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="role"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Role</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a role" />
                      </SelectTrigger>
                    </FormControl>
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
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex justify-end gap-2 pt-4">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Sending...
                  </>
                ) : (
                  'Send Invitation'
                )}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
