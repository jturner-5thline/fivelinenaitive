import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Video, Clock, Link2, MoreVertical, Unlink, ArrowRightLeft, EyeOff, RefreshCw, Eye, Lock, ExternalLink, CheckCircle2 } from 'lucide-react';
import { format } from 'date-fns';
import { ClaapDealSelector } from './ClaapDealSelector';
import { useClaapCallActions } from '@/hooks/useClaapCallActions';
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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

export interface ClaapCallData {
  id: string;
  title: string | null;
  started_at: string | null;
  created_at: string;
  duration_seconds: number | null;
  recording_url: string | null;
  call_type: string | null;
  match_source: string | null;
  match_status: string | null;
  match_method: string | null;
  match_confidence: number | null;
  match_reason: string | null;
  match_candidates: any | null;
  manually_locked: boolean | null;
  deal_id: string | null;
  deal_name?: string | null;
}

function getMatchStatusBadge(status: string | null, method: string | null) {
  const s = status || 'unmatched';
  const configs: Record<string, { label: string; className: string }> = {
    matched: { label: 'Auto-matched', className: 'bg-green-500/15 text-green-700 dark:text-green-400 border-green-500/20' },
    manually_linked: { label: 'Manual', className: 'bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/20' },
    needs_review: { label: 'Needs Review', className: 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/20' },
    suggested: { label: 'Suggested', className: 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/20' },
    unmatched: { label: 'Unmatched', className: 'bg-muted text-muted-foreground' },
    ignored: { label: 'Ignored', className: 'bg-muted/50 text-muted-foreground/60' },
  };
  return configs[s] || configs.unmatched;
}

function getConfidenceBadge(confidence: number | null) {
  if (!confidence) return null;
  if (confidence >= 75) return { label: 'High', className: 'text-green-600' };
  if (confidence >= 50) return { label: 'Medium', className: 'text-amber-600' };
  return { label: 'Low', className: 'text-red-600' };
}

function formatDuration(seconds: number | null) {
  if (!seconds) return '';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

interface ClaapCallMatchCardProps {
  call: ClaapCallData;
  showDealName?: boolean;
  compact?: boolean;
}

export function ClaapCallMatchCard({ call, showDealName = true, compact = false }: ClaapCallMatchCardProps) {
  const [dealSelectorOpen, setDealSelectorOpen] = useState(false);
  const [dealSelectorMode, setDealSelectorMode] = useState<'link' | 'change'>('link');
  const [unlinkConfirmOpen, setUnlinkConfirmOpen] = useState(false);
  const { linkToDeal, changeDeal, unlinkFromDeal, setIgnored, isLoading } = useClaapCallActions();

  const statusBadge = getMatchStatusBadge(call.match_status, call.match_method);
  const confidenceBadge = getConfidenceBadge(call.match_confidence);
  const suggestedDealIds = call.match_candidates?.map((c: any) => c.deal_id) || [];

  const handleDealSelect = (dealId: string, dealName: string) => {
    if (dealSelectorMode === 'link') {
      linkToDeal.mutate({ meetingId: call.id, dealId, dealName });
    } else {
      changeDeal.mutate({ meetingId: call.id, newDealId: dealId, newDealName: dealName });
    }
  };

  return (
    <>
      <div className={`border rounded-lg ${compact ? 'p-2' : 'p-3'} space-y-1.5 ${call.match_status === 'ignored' ? 'opacity-60' : ''}`}>
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <Video className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            {call.recording_url ? (
              <a href={call.recording_url} target="_blank" rel="noreferrer" className="text-sm font-medium truncate text-primary hover:underline">
                {call.title || 'Untitled Call'}
              </a>
            ) : (
              <span className="text-sm font-medium truncate">{call.title || 'Untitled Call'}</span>
            )}
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <Badge variant="outline" className={`text-[10px] ${statusBadge.className}`}>
              {statusBadge.label}
            </Badge>
            {call.manually_locked && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger>
                    <Lock className="h-3 w-3 text-muted-foreground" />
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="text-xs">Manually locked — auto-matching won't overwrite</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-6 w-6 p-0" disabled={isLoading}>
                  <MoreVertical className="h-3.5 w-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {!call.deal_id && (
                  <DropdownMenuItem onClick={() => { setDealSelectorMode('link'); setDealSelectorOpen(true); }}>
                    <Link2 className="h-3.5 w-3.5 mr-2" />
                    Link to Deal
                  </DropdownMenuItem>
                )}
                {call.deal_id && (
                  <>
                    <DropdownMenuItem onClick={() => { setDealSelectorMode('change'); setDealSelectorOpen(true); }}>
                      <ArrowRightLeft className="h-3.5 w-3.5 mr-2" />
                      Change Deal
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setUnlinkConfirmOpen(true)} className="text-destructive">
                      <Unlink className="h-3.5 w-3.5 mr-2" />
                      Remove Deal Link
                    </DropdownMenuItem>
                  </>
                )}
                <DropdownMenuSeparator />
                {call.match_status !== 'ignored' ? (
                  <DropdownMenuItem onClick={() => setIgnored.mutate({ meetingId: call.id, ignored: true })}>
                    <EyeOff className="h-3.5 w-3.5 mr-2" />
                    Ignore Call
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem onClick={() => setIgnored.mutate({ meetingId: call.id, ignored: false })}>
                    <Eye className="h-3.5 w-3.5 mr-2" />
                    Restore Call
                  </DropdownMenuItem>
                )}
                {call.recording_url && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem asChild>
                      <a href={call.recording_url} target="_blank" rel="noreferrer">
                        <ExternalLink className="h-3.5 w-3.5 mr-2" />
                        Open Recording
                      </a>
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Meta row */}
        <div className="flex items-center gap-3 flex-wrap text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {call.started_at
              ? format(new Date(call.started_at), 'MMM d, yyyy h:mm a')
              : format(new Date(call.created_at), 'MMM d, yyyy')}
          </span>
          {call.duration_seconds && <span>{formatDuration(call.duration_seconds)}</span>}
          {confidenceBadge && (
            <span className={`font-medium ${confidenceBadge.className}`}>
              {call.match_confidence}% {confidenceBadge.label}
            </span>
          )}
        </div>

        {/* Deal / reason row */}
        {showDealName && call.deal_name && (
          <div className="flex items-center gap-1.5 text-xs">
            <CheckCircle2 className="h-3 w-3 text-green-500 shrink-0" />
            <span className="text-muted-foreground">Linked to</span>
            <span className="font-medium truncate">{call.deal_name}</span>
          </div>
        )}
        {call.match_reason && (
          <p className="text-xs text-muted-foreground truncate">{call.match_reason}</p>
        )}

        {/* Suggested matches for needs_review */}
        {call.match_status === 'needs_review' && suggestedDealIds.length > 0 && (
          <div className="pt-1">
            <Button
              variant="outline"
              size="sm"
              className="h-6 text-xs"
              onClick={() => { setDealSelectorMode('link'); setDealSelectorOpen(true); }}
            >
              <CheckCircle2 className="h-3 w-3 mr-1" />
              Review {suggestedDealIds.length} suggested match{suggestedDealIds.length > 1 ? 'es' : ''}
            </Button>
          </div>
        )}
      </div>

      <ClaapDealSelector
        open={dealSelectorOpen}
        onOpenChange={setDealSelectorOpen}
        onSelect={handleDealSelect}
        title={dealSelectorMode === 'link' ? 'Link Call to Deal' : 'Change Linked Deal'}
        suggestedDealIds={suggestedDealIds}
      />

      <AlertDialog open={unlinkConfirmOpen} onOpenChange={setUnlinkConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove deal link?</AlertDialogTitle>
            <AlertDialogDescription>
              This will unlink "{call.title || 'Untitled Call'}" from {call.deal_name || 'its current deal'}. The call will appear as unmatched.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => unlinkFromDeal.mutate({ meetingId: call.id })}>
              Remove Link
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
