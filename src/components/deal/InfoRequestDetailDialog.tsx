import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { User, Mail, Building2, DollarSign, Briefcase, Clock, Calendar, ExternalLink } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';

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

interface ExternalProfile {
  id: string;
  external_id: string;
  display_name: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  avatar_url: string | null;
}

interface InfoRequestDetailDialogProps {
  request: InfoRequest | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function InfoRequestDetailDialog({ request, open, onOpenChange }: InfoRequestDetailDialogProps) {
  // Fetch external profile data if we have a requester_user_id
  const { data: profile, isLoading: isLoadingProfile } = useQuery({
    queryKey: ['external-profile', request?.requester_user_id],
    queryFn: async () => {
      if (!request?.requester_user_id) return null;
      
      const { data, error } = await supabase
        .from('external_profiles')
        .select('*')
        .eq('external_id', request.requester_user_id)
        .maybeSingle();

      if (error) {
        console.error('Error fetching external profile:', error);
        return null;
      }

      return data as ExternalProfile | null;
    },
    enabled: !!request?.requester_user_id && open,
  });

  if (!request) return null;

  const displayName = profile?.display_name || 
    (profile?.first_name && profile?.last_name 
      ? `${profile.first_name} ${profile.last_name}` 
      : null) ||
    request.requester_name || 
    'Unknown Requester';

  const email = profile?.email || request.requester_email;
  const initials = displayName
    .split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ExternalLink className="h-4 w-4" />
            Info Request from FLEx
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Requester Info */}
          <div className="flex items-start gap-4">
            {isLoadingProfile ? (
              <Skeleton className="h-14 w-14 rounded-full" />
            ) : (
              <Avatar className="h-14 w-14">
                <AvatarImage src={profile?.avatar_url || undefined} alt={displayName} />
                <AvatarFallback className="text-lg">{initials}</AvatarFallback>
              </Avatar>
            )}
            <div className="flex-1 min-w-0">
              {isLoadingProfile ? (
                <>
                  <Skeleton className="h-5 w-32 mb-2" />
                  <Skeleton className="h-4 w-48" />
                </>
              ) : (
                <>
                  <h3 className="font-semibold text-lg truncate">{displayName}</h3>
                  {email && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Mail className="h-3.5 w-3.5" />
                      <a 
                        href={`mailto:${email}`} 
                        className="hover:underline truncate"
                      >
                        {email}
                      </a>
                    </div>
                  )}
                  {profile?.first_name && profile?.last_name && request.requester_name && 
                   request.requester_name !== `${profile.first_name} ${profile.last_name}` && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Also known as: {request.requester_name}
                    </p>
                  )}
                </>
              )}
            </div>
            <Badge 
              variant={request.status === 'pending' ? 'default' : 'secondary'}
              className={request.status === 'pending' ? 'bg-amber-500' : ''}
            >
              {request.status}
            </Badge>
          </div>

          <Separator />

          {/* Deal Info */}
          <div className="space-y-3">
            <h4 className="text-sm font-medium text-muted-foreground">Deal Information</h4>
            
            <div className="grid gap-3">
              {request.company_name && (
                <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
                  <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div>
                    <p className="text-xs text-muted-foreground">Company</p>
                    <p className="font-medium">{request.company_name}</p>
                  </div>
                </div>
              )}

              {request.industry && (
                <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
                  <Briefcase className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div>
                    <p className="text-xs text-muted-foreground">Industry</p>
                    <p className="font-medium">{request.industry}</p>
                  </div>
                </div>
              )}

              {request.capital_ask && (
                <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
                  <DollarSign className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div>
                    <p className="text-xs text-muted-foreground">Capital Ask</p>
                    <p className="font-medium">{request.capital_ask}</p>
                  </div>
                </div>
              )}
            </div>
          </div>

          <Separator />

          {/* Timestamps */}
          <div className="space-y-2 text-sm">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Calendar className="h-4 w-4" />
              <span>Requested:</span>
              <span className="font-medium text-foreground">
                {format(new Date(request.requested_at || request.created_at), 'PPP p')}
              </span>
            </div>
            {request.external_deal_id && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <ExternalLink className="h-4 w-4" />
                <span>FLEx Deal ID:</span>
                <code className="text-xs bg-muted px-2 py-0.5 rounded font-mono">
                  {request.external_deal_id}
                </code>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
