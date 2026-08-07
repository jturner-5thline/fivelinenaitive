import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Video, Phone, ExternalLink, ChevronDown, ChevronRight, Clock, Users, FileText, Link2, MoreVertical, Unlink, ArrowRightLeft, Sparkles, History } from 'lucide-react';
import { LinkedCallActionsDialog } from './LinkedCallActionsDialog';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { format, formatDuration, intervalToDuration } from 'date-fns';
import { Loader2 } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ClaapDealSelector } from './ClaapDealSelector';
import { useClaapCallActions } from '@/hooks/useClaapCallActions';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { FundingSourcePickerDialog } from './FundingSourcePickerDialog';
import { ClaapLinkHistoryPanel } from './ClaapLinkHistoryPanel';
import { UnlinkReasonDialog } from './UnlinkReasonDialog';
import {
  resolveRecordingRowId,
  useClaapFundingSourceLinkActions,
} from '@/hooks/useClaapFundingSourceLinks';
import { useQueryClient } from '@tanstack/react-query';

export type ClaapEntityType = 'contact' | 'company' | 'lender';

interface ClaapCallsSectionProps {
  entityType: ClaapEntityType;
  entityId: string;
  entityName?: string;
  entityEmail?: string;
  entityDomain?: string;
  contactIds?: string[]; // For company: affiliated contact IDs
}

interface ClaapCall {
  id: string;
  title: string | null;
  started_at: string | null;
  created_at: string;
  duration_seconds: number | null;
  recording_url: string | null;
  call_type: string | null;
  match_source: string | null;
  transcript: string | null;
  ai_summary: string | null;
  organizer_email: string | null;
  deal_id: string | null;
  /** claap_recordings.id when a mirrored recording row exists. */
  recordingRowId?: string | null;
  /** claap_recording_links.id for the funding-source link (lender view). */
  linkId?: string | null;
  linkStatus?: 'pending' | 'confirmed' | 'rejected' | null;
  /** True when the call reaches this funding source via claap_meetings.matched_lender_id. */
  viaMatchedLender?: boolean;
}

function formatCallDuration(seconds: number | null): string {
  if (!seconds) return '—';
  const duration = intervalToDuration({ start: 0, end: seconds * 1000 });
  const parts: string[] = [];
  if (duration.hours) parts.push(`${duration.hours}h`);
  if (duration.minutes) parts.push(`${duration.minutes}m`);
  if (duration.seconds && !duration.hours) parts.push(`${duration.seconds}s`);
  return parts.join(' ') || '< 1m';
}

function callTypeBadgeVariant(callType: string | null): 'default' | 'secondary' | 'outline' {
  if (!callType) return 'outline';
  if (callType.toLowerCase().includes('deal')) return 'default';
  if (callType.toLowerCase().includes('lender')) return 'secondary';
  return 'outline';
}

function CallCard({
  call,
  entityType,
  entityId,
}: {
  call: ClaapCall;
  entityType: ClaapEntityType;
  entityId: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [dealSelectorOpen, setDealSelectorOpen] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [fsPickerOpen, setFsPickerOpen] = useState(false);
  const [unlinkReasonOpen, setUnlinkReasonOpen] = useState(false);
  const { linkToDeal, changeDeal, unlinkFromDeal } = useClaapCallActions();
  const { unlink, relink, linkToFundingSource } = useClaapFundingSourceLinkActions();
  const qc = useQueryClient();
  const hasTranscript = !!(call.transcript || call.ai_summary);
  const isLenderView = entityType === 'lender';
  const isUnlinked = call.linkStatus === 'rejected';

  const handleUnlinkFundingSource = async (reason?: string) => {
    if (call.linkId) {
      await unlink(call.linkId, reason);
      return;
    }
    // No link row: the call reaches this funding source via matched_lender_id.
    const { error } = await (supabase.from('claap_meetings') as any)
      .update({ matched_lender_id: null })
      .eq('id', call.id);
    if (error) return;
    await qc.invalidateQueries({ queryKey: ['claap-calls'] });
  };

  const handleLinkFundingSource = async (lenderId: string, lenderName: string) => {
    const rowId = call.recordingRowId || (await resolveRecordingRowId((call as any).claap_id));
    if (!rowId) {
      await (supabase.from('claap_meetings') as any).update({ matched_lender_id: lenderId }).eq('id', call.id);
      await qc.invalidateQueries({ queryKey: ['claap-calls'] });
      return;
    }
    await linkToFundingSource(rowId, lenderId, lenderName);
  };

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        onClick={() => setActionsOpen(true)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setActionsOpen(true); } }}
        className="p-3 rounded-md border border-border/50 hover:bg-muted/30 transition-colors cursor-pointer"
      >
        <div className="flex items-start gap-2.5">
          <div className="mt-0.5 p-1.5 rounded-md bg-primary/10 text-primary">
            <Video className="h-3.5 w-3.5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-medium truncate">{call.title || 'Untitled Call'}</span>
              {call.call_type && (
                <Badge variant={callTypeBadgeVariant(call.call_type)} className="text-[10px] px-1.5 py-0 h-4 shrink-0">
                  {call.call_type}
                </Badge>
              )}
              {isLenderView && isUnlinked && (
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 shrink-0 border-destructive/40 text-destructive">
                  Unlinked
                </Badge>
              )}
              {call.deal_id && (
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 shrink-0 border-green-500/30 text-green-600">
                  Linked
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {call.started_at ? format(new Date(call.started_at), 'MMM d, yyyy h:mm a') : format(new Date(call.created_at), 'MMM d, yyyy')}
              </span>
              <span>{formatCallDuration(call.duration_seconds)}</span>
              {call.organizer_email && (
                <span className="flex items-center gap-1 truncate">
                  <Users className="h-3 w-3" />
                  {call.organizer_email}
                </span>
              )}
            </div>

            {hasTranscript && (
              <Collapsible open={expanded} onOpenChange={setExpanded}>
                <CollapsibleTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-5 px-1.5 mt-1 text-xs text-muted-foreground hover:text-foreground"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <FileText className="h-3 w-3 mr-1" />
                    {expanded ? 'Hide' : 'Show'} summary
                    {expanded ? <ChevronDown className="h-3 w-3 ml-0.5" /> : <ChevronRight className="h-3 w-3 ml-0.5" />}
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent onClick={(e) => e.stopPropagation()}>
                  <div className="mt-2 p-2 rounded bg-muted/50 text-xs text-muted-foreground whitespace-pre-wrap max-h-32 overflow-y-auto">
                    {call.ai_summary || (call.transcript?.substring(0, 500) + (call.transcript && call.transcript.length > 500 ? '...' : ''))}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            )}
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-6 w-6 p-0 shrink-0" onClick={(e) => e.stopPropagation()}>
                <MoreVertical className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
              {!call.deal_id ? (
                <DropdownMenuItem onClick={() => setDealSelectorOpen(true)}>
                  <Link2 className="h-3.5 w-3.5 mr-2" />
                  Link to Deal
                </DropdownMenuItem>
              ) : (
                <>
                  <DropdownMenuItem onClick={() => setDealSelectorOpen(true)}>
                    <ArrowRightLeft className="h-3.5 w-3.5 mr-2" />
                    Change Deal
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => unlinkFromDeal.mutate({ meetingId: call.id })} className="text-destructive">
                    <Unlink className="h-3.5 w-3.5 mr-2" />
                    Remove Deal Link
                  </DropdownMenuItem>
                </>
              )}
              {isLenderView && (
                <>
                  <DropdownMenuSeparator />
                  {isUnlinked ? (
                    <DropdownMenuItem onClick={() => { void relink(call.linkId!); }}>
                      <Link2 className="h-3.5 w-3.5 mr-2" />
                      Relink to this funding source
                    </DropdownMenuItem>
                  ) : (
                    <DropdownMenuItem onClick={() => setUnlinkReasonOpen(true)} className="text-destructive">
                      <Unlink className="h-3.5 w-3.5 mr-2" />
                      Unlink from this funding source
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem onClick={() => setFsPickerOpen(true)}>
                    <ArrowRightLeft className="h-3.5 w-3.5 mr-2" />
                    Link to another funding source
                  </DropdownMenuItem>
                </>
              )}
              {call.recording_url && (
                <DropdownMenuItem asChild>
                  <a href={call.recording_url} target="_blank" rel="noreferrer">
                    <ExternalLink className="h-3.5 w-3.5 mr-2" />
                    Open Recording
                  </a>
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      <ClaapDealSelector
        open={dealSelectorOpen}
        onOpenChange={setDealSelectorOpen}
        onSelect={(dealId, dealName) => {
          if (call.deal_id) {
            changeDeal.mutate({ meetingId: call.id, newDealId: dealId, newDealName: dealName });
          } else {
            linkToDeal.mutate({ meetingId: call.id, dealId, dealName });
          }
        }}
        title={call.deal_id ? 'Change Linked Deal' : 'Link Call to Deal'}
      />
      <FundingSourcePickerDialog
        open={fsPickerOpen}
        onOpenChange={setFsPickerOpen}
        excludeIds={isLenderView ? [entityId] : []}
        onSelect={(lenderId, lenderName) => { void handleLinkFundingSource(lenderId, lenderName); }}
      />
      <LinkedCallActionsDialog
        open={actionsOpen}
        onOpenChange={setActionsOpen}
        recordingTitle={call.title}
        meetingId={call.id}
      />
      <UnlinkReasonDialog
        open={unlinkReasonOpen}
        onOpenChange={setUnlinkReasonOpen}
        title="Unlink from this funding source"
        onConfirm={async (reason) => { await handleUnlinkFundingSource(reason); }}
      />
    </>
  );
}

export function ClaapCallsSection({ entityType, entityId, entityName, entityEmail, entityDomain, contactIds }: ClaapCallsSectionProps) {
  const [showUnlinked, setShowUnlinked] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const { data: allCallsData, isLoading } = useQuery({
    queryKey: ['claap-calls', entityType, entityId],
    queryFn: async () => {
      const allCalls: ClaapCall[] = [];
      const seenIds = new Set<string>();

      const addCalls = (data: any[] | null) => {
        if (!data) return;
        for (const c of data) {
          if (!seenIds.has(c.id)) {
            seenIds.add(c.id);
            allCalls.push(c);
          }
        }
      };

      if (entityType === 'contact') {
        // Direct match
        const { data: directMatches } = await supabase
          .from('claap_meetings')
          .select('id, title, started_at, created_at, duration_seconds, recording_url, call_type, match_source, transcript, ai_summary, organizer_email, deal_id')
          .eq('matched_contact_id', entityId)
          .order('started_at', { ascending: false })
          .limit(50);
        addCalls(directMatches);

        // Also match by participant email
        if (entityEmail) {
          const { data: participantMatches } = await supabase
            .from('claap_meeting_participants')
            .select('meeting_id')
            .eq('email', entityEmail)
            .limit(50);
          if (participantMatches?.length) {
            const meetingIds = participantMatches.map(p => p.meeting_id);
            const { data: emailCalls } = await supabase
              .from('claap_meetings')
              .select('id, title, started_at, created_at, duration_seconds, recording_url, call_type, match_source, transcript, ai_summary, organizer_email, deal_id')
              .in('id', meetingIds)
              .order('started_at', { ascending: false });
            addCalls(emailCalls);
          }
        }
      } else if (entityType === 'company') {
        // Direct match
        const { data: directMatches } = await supabase
          .from('claap_meetings')
          .select('id, title, started_at, created_at, duration_seconds, recording_url, call_type, match_source, transcript, ai_summary, organizer_email, deal_id')
          .eq('matched_crm_company_id', entityId)
          .order('started_at', { ascending: false })
          .limit(50);
        addCalls(directMatches);

        // Calls from affiliated contacts
        if (contactIds?.length) {
          const { data: contactCalls } = await supabase
            .from('claap_meetings')
            .select('id, title, started_at, created_at, duration_seconds, recording_url, call_type, match_source, transcript, ai_summary, organizer_email, deal_id')
            .in('matched_contact_id', contactIds)
            .order('started_at', { ascending: false })
            .limit(50);
          addCalls(contactCalls);
        }
      } else if (entityType === 'lender') {
        // Direct match
        const { data: directMatches } = await supabase
          .from('claap_meetings')
          .select('id, title, started_at, created_at, duration_seconds, recording_url, call_type, match_source, transcript, ai_summary, organizer_email, deal_id')
          .eq('matched_lender_id', entityId)
          .order('started_at', { ascending: false })
          .limit(50);
        addCalls((directMatches || []).map((c: any) => ({ ...c, viaMatchedLender: true })));

        // Auto- and manually-linked recordings (attendee email domain / title match)
        const { data: links } = await (supabase.from('claap_recording_links') as any)
          .select('id, recording_id, review_status')
          .eq('entity_type', 'lender')
          .eq('entity_id', entityId)
          .eq('link_role', 'funding_source')
          .limit(200);
        const linkRows = (links || []) as any[];
        const recordingIds = linkRows.map((l) => l.recording_id).filter(Boolean);
        if (recordingIds.length) {
          const { data: recordings } = await supabase
            .from('claap_recordings')
            .select('id, external_id')
            .in('id', recordingIds);
          const recRows = (recordings || []) as any[];
          const byRecordingId = new Map(linkRows.map((l) => [l.recording_id, l]));
          // external_id -> { link, recordingRowId }
          const byExternalId = new Map<string, { linkId: string; linkStatus: string; recordingRowId: string }>();
          for (const r of recRows) {
            const link = byRecordingId.get(r.id);
            if (r.external_id && link) {
              byExternalId.set(r.external_id, { linkId: link.id, linkStatus: link.review_status, recordingRowId: r.id });
            }
          }
          const externalIds = Array.from(byExternalId.keys());
          if (externalIds.length) {
            const { data: linkedCalls } = await supabase
              .from('claap_meetings')
              .select('id, claap_id, title, started_at, created_at, duration_seconds, recording_url, call_type, match_source, transcript, ai_summary, organizer_email, deal_id')
              .in('claap_id', externalIds)
              .order('started_at', { ascending: false })
              .limit(200);
            const decorated = (linkedCalls || []).map((c: any) => {
              const meta = byExternalId.get(c.claap_id);
              return {
                ...c,
                linkId: meta?.linkId ?? null,
                linkStatus: (meta?.linkStatus ?? null) as any,
                recordingRowId: meta?.recordingRowId ?? null,
              };
            });
            addCalls(decorated);
          }
        }
      }

      // Sort by date descending
      allCalls.sort((a, b) => {
        const da = a.started_at || a.created_at;
        const db = b.started_at || b.created_at;
        return new Date(db).getTime() - new Date(da).getTime();
      });

      return allCalls;
    },
    enabled: !!entityId,
  });

  const unlinkedCount = (allCallsData || []).filter(c => c.linkStatus === 'rejected').length;
  const visibleCalls = (allCallsData || []).filter(c => showUnlinked || c.linkStatus !== 'rejected');
  const q = callSearch.trim().toLowerCase();
  const calls = q
    ? visibleCalls.filter((c: any) =>
        [c.title, c.id, c.claap_id, c.recordingRowId, c.organizer_email]
          .filter(Boolean)
          .some((v: any) => String(v).toLowerCase().includes(q)),
      )
    : visibleCalls;

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-1.5">
            <Video className="h-4 w-4" /> Call Recordings
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-4">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!calls.length && !unlinkedCount) return null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-1.5">
          <Video className="h-4 w-4" /> Call Recordings
          <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4">
            {q ? `${calls.length}/${visibleCalls.length}` : calls.length}
          </Badge>
          {entityType === 'lender' && (
            <span className="ml-auto flex items-center gap-1">
              {unlinkedCount > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-5 px-1.5 text-[10px] text-muted-foreground hover:text-foreground"
                  onClick={() => setShowUnlinked(v => !v)}
                >
                  {showUnlinked ? 'Hide' : 'Show'} unlinked ({unlinkedCount})
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                className="h-5 px-1.5 text-[10px] text-muted-foreground hover:text-foreground"
                onClick={() => setShowHistory(v => !v)}
              >
                <History className="h-3 w-3 mr-1" />
                {showHistory ? 'Hide' : 'Link'} history
              </Button>
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {entityType === 'lender' && showHistory && (
          <ClaapLinkHistoryPanel entityId={entityId} showRecordingTitle className="mb-3" />
        )}
        {visibleCalls.length > 3 && (
          <div className="relative mb-2">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={callSearch}
              onChange={(e) => setCallSearch(e.target.value)}
              placeholder="Search recording title or ID…"
              className="h-7 pl-7 text-xs"
            />
          </div>
        )}
        {q && calls.length === 0 && (
          <p className="py-2 text-xs italic text-muted-foreground">No recordings match “{callSearch}”.</p>
        )}
        <ScrollArea className={calls.length > 4 ? 'max-h-80' : undefined}>
          <div className="space-y-2 pr-7">
            {calls.map(call => (
              <CallCard key={call.id} call={call} entityType={entityType} entityId={entityId} />
            ))}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
