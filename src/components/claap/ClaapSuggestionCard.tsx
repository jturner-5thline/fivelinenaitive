import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Video, Clock, CheckCircle2, X, ArrowRightLeft, EyeOff, Sparkles, ChevronDown, ChevronUp } from 'lucide-react';
import { format } from 'date-fns';
import { ClaapDealSelector } from './ClaapDealSelector';
import { useClaapCallActions } from '@/hooks/useClaapCallActions';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

interface Suggestion {
  id: string;
  deal_id: string | null;
  deal_name?: string;
  lender_name?: string | null;
  company_name?: string | null;
  contact_email?: string | null;
  confidence: number;
  reason: string;
  suggestion_source: string;
  rank: number;
}

interface SuggestionCallData {
  id: string;
  title: string | null;
  started_at: string | null;
  created_at: string;
  duration_seconds: number | null;
  recording_url: string | null;
  match_status: string | null;
  suggestions: Suggestion[];
}

function getConfidenceConfig(confidence: number) {
  if (confidence >= 70) return { label: 'High', className: 'bg-green-500/15 text-green-700 dark:text-green-400 border-green-500/20' };
  if (confidence >= 40) return { label: 'Medium', className: 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/20' };
  return { label: 'Low', className: 'bg-muted text-muted-foreground' };
}

function formatDuration(seconds: number | null) {
  if (!seconds) return '';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export function ClaapSuggestionCard({ call }: { call: SuggestionCallData }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState(false);
  const [dealSelectorOpen, setDealSelectorOpen] = useState(false);
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const { linkToDeal, setIgnored } = useClaapCallActions();

  const topSuggestion = call.suggestions[0];
  const otherSuggestions = call.suggestions.slice(1);
  const hasMultiple = call.suggestions.length > 1;

  const confirmMatch = async (suggestion: Suggestion) => {
    if (!suggestion.deal_id || !suggestion.deal_name) return;
    setLoadingAction(suggestion.id);
    try {
      // Record feedback
      const { data: member } = await supabase
        .from('company_members')
        .select('company_id')
        .eq('user_id', user!.id)
        .maybeSingle();

      await (supabase.from('claap_match_feedback').insert({
        meeting_id: call.id,
        company_id: member?.company_id,
        action: 'confirmed',
        suggested_deal_id: suggestion.deal_id,
        chosen_deal_id: suggestion.deal_id,
        suggestion_id: suggestion.id,
        performed_by: user?.id,
      }) as any);

      // Update suggestion status
      await (supabase.from('claap_match_suggestions')
        .update({ status: 'confirmed', feedback_action: 'confirmed', feedback_at: new Date().toISOString(), feedback_by: user?.id })
        .eq('id', suggestion.id) as any);

      // Link the deal
      linkToDeal.mutate({
        meetingId: call.id,
        dealId: suggestion.deal_id,
        dealName: suggestion.deal_name,
      });
    } catch (err) {
      toast.error('Failed to confirm match');
    } finally {
      setLoadingAction(null);
    }
  };

  const dismissSuggestion = async (suggestion: Suggestion) => {
    setLoadingAction(suggestion.id);
    try {
      const { data: member } = await supabase
        .from('company_members')
        .select('company_id')
        .eq('user_id', user!.id)
        .maybeSingle();

      await (supabase.from('claap_match_feedback').insert({
        meeting_id: call.id,
        company_id: member?.company_id,
        action: 'dismissed',
        suggested_deal_id: suggestion.deal_id,
        suggestion_id: suggestion.id,
        performed_by: user?.id,
      }) as any);

      await (supabase.from('claap_match_suggestions')
        .update({ status: 'dismissed', feedback_action: 'dismissed', feedback_at: new Date().toISOString(), feedback_by: user?.id })
        .eq('id', suggestion.id) as any);

      queryClient.invalidateQueries({ queryKey: ['claap-suggestions'] });
      queryClient.invalidateQueries({ queryKey: ['claap-all-calls'] });
      toast.success('Suggestion dismissed');
    } catch (err) {
      toast.error('Failed to dismiss');
    } finally {
      setLoadingAction(null);
    }
  };

  const handleManualSelect = (dealId: string, dealName: string) => {
    // Record as reassignment feedback if there was a suggestion
    if (topSuggestion?.deal_id) {
      supabase.from('company_members')
        .select('company_id')
        .eq('user_id', user!.id)
        .maybeSingle()
        .then(({ data: member }) => {
          (supabase.from('claap_match_feedback').insert({
            meeting_id: call.id,
            company_id: member?.company_id,
            action: 'reassigned',
            suggested_deal_id: topSuggestion.deal_id,
            chosen_deal_id: dealId,
            performed_by: user?.id,
          }) as any);
        });
    }
    linkToDeal.mutate({ meetingId: call.id, dealId, dealName });
  };

  const renderSuggestionRow = (suggestion: Suggestion, isTop = false) => {
    const conf = getConfidenceConfig(suggestion.confidence);
    const matchType = suggestion.deal_id
      ? 'Deal'
      : suggestion.lender_name
      ? 'Lender'
      : suggestion.company_name
      ? 'Company'
      : suggestion.contact_email
      ? 'Contact'
      : 'Match';
    const matchLabel =
      suggestion.deal_name ||
      suggestion.lender_name ||
      suggestion.company_name ||
      suggestion.contact_email ||
      'Unknown';
    const isDeal = !!suggestion.deal_id;
    return (
      <div key={suggestion.id} className={`flex items-start gap-2 ${isTop ? 'p-2.5 bg-accent/30 rounded-md border border-border/50' : 'p-2 pl-4 border-l-2 border-border/30'}`}>
        <div className="flex-1 min-w-0 space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline" className="text-[10px]">{matchType}</Badge>
            <span className="text-sm font-medium truncate">{matchLabel}</span>
            <Badge variant="outline" className={`text-[10px] ${conf.className}`}>
              {Math.round(suggestion.confidence)}% {conf.label}
            </Badge>
            {suggestion.suggestion_source === 'ai_enhanced' && (
              <Badge variant="outline" className="text-[10px] bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/20">
                <Sparkles className="h-2.5 w-2.5 mr-0.5" />
                AI
              </Badge>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground line-clamp-2">{suggestion.reason}</p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Button
            variant="default"
            size="sm"
            className="h-6 text-[10px] px-2"
            onClick={() => confirmMatch(suggestion)}
            disabled={loadingAction === suggestion.id || !isDeal}
            title={!isDeal ? 'Confirm linking to a deal not yet supported for non-deal matches' : ''}
          >
            <CheckCircle2 className="h-3 w-3 mr-0.5" />
            Confirm
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0"
            onClick={() => dismissSuggestion(suggestion)}
            disabled={loadingAction === suggestion.id}
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
      </div>
    );
  };

  return (
    <>
      <div className="border rounded-lg p-3 space-y-2">
        {/* Call header */}
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
            <Badge variant="outline" className="text-[10px] bg-muted text-muted-foreground">Unmatched</Badge>
          </div>
        </div>

        {/* Meta */}
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {call.started_at
              ? format(new Date(call.started_at), 'MMM d, yyyy h:mm a')
              : format(new Date(call.created_at), 'MMM d, yyyy')}
          </span>
          {call.duration_seconds && <span>{formatDuration(call.duration_seconds)}</span>}
        </div>

        {/* Suggestions */}
        {call.suggestions.length > 0 ? (
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5">
              <Sparkles className="h-3 w-3 text-violet-500" />
              <span className="text-[11px] font-medium text-muted-foreground">
                {call.suggestions.length === 1 ? 'Suggested Match' : `${call.suggestions.length} Suggested Matches`}
              </span>
            </div>
            {renderSuggestionRow(topSuggestion, true)}
            {hasMultiple && (
              <>
                {expanded && otherSuggestions.map(s => renderSuggestionRow(s))}
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-5 text-[10px] w-full"
                  onClick={() => setExpanded(!expanded)}
                >
                  {expanded ? <ChevronUp className="h-3 w-3 mr-1" /> : <ChevronDown className="h-3 w-3 mr-1" />}
                  {expanded ? 'Show less' : `+${otherSuggestions.length} more suggestion${otherSuggestions.length > 1 ? 's' : ''}`}
                </Button>
              </>
            )}
          </div>
        ) : (
          <p className="text-[11px] text-muted-foreground italic">No strong suggestion yet</p>
        )}

        {/* Actions */}
        <div className="flex items-center gap-1.5 pt-1">
          <Button
            variant="outline"
            size="sm"
            className="h-6 text-[10px]"
            onClick={() => setDealSelectorOpen(true)}
          >
            <ArrowRightLeft className="h-3 w-3 mr-1" />
            Choose Deal
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 text-[10px]"
            onClick={() => setIgnored.mutate({ meetingId: call.id, ignored: true })}
          >
            <EyeOff className="h-3 w-3 mr-1" />
            Ignore
          </Button>
        </div>
      </div>

      <ClaapDealSelector
        open={dealSelectorOpen}
        onOpenChange={setDealSelectorOpen}
        onSelect={handleManualSelect}
        title="Link Call to Deal"
        suggestedDealIds={call.suggestions.map(s => s.deal_id).filter(Boolean) as string[]}
      />
    </>
  );
}
