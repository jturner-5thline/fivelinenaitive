import { useState } from 'react';
import { Sparkles, Check, X, Clock, ChevronDown, ChevronUp, Loader2, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  useContactFieldSuggestions,
  useFieldSuggestionAction,
  useScanContactForSuggestions,
  getFieldLabel,
  type FieldSuggestion,
} from '@/hooks/useFieldSuggestions';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';

interface ContactFieldSuggestionsProps {
  contactId: string;
  companyId?: string;
}

function confidenceColor(c: number) {
  if (c >= 0.85) return 'text-green-500';
  if (c >= 0.7) return 'text-amber-500';
  return 'text-muted-foreground';
}

function confidenceBadge(c: number) {
  if (c >= 0.85) return 'bg-green-500/10 text-green-600';
  if (c >= 0.7) return 'bg-amber-500/10 text-amber-600';
  return 'bg-muted text-muted-foreground';
}

function SuggestionRow({ suggestion, onAction, isActing }: {
  suggestion: FieldSuggestion;
  onAction: (action: 'accept' | 'reject' | 'snooze', id: string) => void;
  isActing: boolean;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border border-border/50 rounded-lg p-3 space-y-2 hover:bg-muted/30 transition-colors">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <Badge variant="outline" className="text-[10px] shrink-0">
            {getFieldLabel(suggestion.field_name)}
          </Badge>
          <div className="flex items-center gap-1.5 min-w-0 text-xs">
            <span className="text-muted-foreground truncate">{suggestion.current_value || '(empty)'}</span>
            <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0" />
            <span className="font-medium truncate">{suggestion.suggested_value}</span>
          </div>
          <Badge className={cn('text-[9px] shrink-0', confidenceBadge(Number(suggestion.confidence)))}>
            {Math.round(Number(suggestion.confidence) * 100)}%
          </Badge>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-green-600 hover:text-green-700 hover:bg-green-500/10"
                onClick={() => onAction('accept', suggestion.id)}
                disabled={isActing}
              >
                <Check className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Accept & update contact</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-destructive hover:bg-destructive/10"
                onClick={() => onAction('reject', suggestion.id)}
                disabled={isActing}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Reject</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground hover:bg-muted"
                onClick={() => onAction('snooze', suggestion.id)}
                disabled={isActing}
              >
                <Clock className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Snooze</TooltipContent>
          </Tooltip>
          {suggestion.source_snippet && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => setExpanded(!expanded)}
            >
              {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </Button>
          )}
        </div>
      </div>

      {expanded && suggestion.source_snippet && (
        <div className="text-[11px] text-muted-foreground bg-muted/50 rounded p-2 border border-border/30">
          <p className="text-[10px] uppercase font-medium mb-1">Source: {suggestion.source_type}</p>
          <p className="italic">"{suggestion.source_snippet}"</p>
          {suggestion.created_at && (
            <p className="mt-1 text-[10px]">Detected {format(new Date(suggestion.created_at), 'MMM d, yyyy')}</p>
          )}
        </div>
      )}
    </div>
  );
}

export function ContactFieldSuggestions({ contactId, companyId }: ContactFieldSuggestionsProps) {
  const { data: suggestions = [], isLoading } = useContactFieldSuggestions(contactId);
  const action = useFieldSuggestionAction();
  const scan = useScanContactForSuggestions();
  const [lastScannedAt, setLastScannedAt] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    return window.localStorage.getItem(`cfs:lastScan:${contactId}`);
  });

  const handleAction = (type: 'accept' | 'reject' | 'snooze', suggestionId: string) => {
    action.mutate({
      action: type,
      suggestion_id: suggestionId,
      ...(type === 'snooze' ? {
        snooze_until: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      } : {}),
    });
  };

  const handleScan = () => {
    scan.mutate(
      {
        contact_id: contactId,
        source_type: 'manual_scan',
        company_id: companyId,
      },
      {
        onSuccess: (data: any) => {
          const ts = data?.scanned_at || new Date().toISOString();
          setLastScannedAt(ts);
          if (typeof window !== 'undefined') {
            window.localStorage.setItem(`cfs:lastScan:${contactId}`, ts);
          }
        },
      },
    );
  };

  if (isLoading) return null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-1.5">
            <Sparkles className="h-4 w-4 text-primary" />
            AI Field Suggestions
            {suggestions.length > 0 && (
              <Badge variant="secondary" className="text-[10px] ml-1">{suggestions.length}</Badge>
            )}
          </CardTitle>
          <Button
            variant="outline"
            size="sm"
            className="text-xs h-7 gap-1"
            onClick={handleScan}
            disabled={scan.isPending}
          >
            {scan.isPending ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Sparkles className="h-3 w-3" />
            )}
            Scan
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {suggestions.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-3">
            {lastScannedAt
              ? `No changes detected — last scanned ${format(new Date(lastScannedAt), 'MMM d, h:mm a')}`
              : 'No pending suggestions — click Scan to check email & calendar activity'}
          </p>
        ) : (
          <div className="space-y-2">
            {suggestions.map((s) => (
              <SuggestionRow
                key={s.id}
                suggestion={s}
                onAction={handleAction}
                isActing={action.isPending}
              />
            ))}
            {suggestions.length > 1 && (
              <div className="flex gap-2 pt-1">
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs h-7 gap-1 flex-1"
                  onClick={() => action.mutate({
                    action: 'bulk_accept',
                    suggestion_ids: suggestions.map(s => s.id),
                  })}
                  disabled={action.isPending}
                >
                  <Check className="h-3 w-3" /> Accept All
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs h-7 gap-1 flex-1"
                  onClick={() => action.mutate({
                    action: 'bulk_reject',
                    suggestion_ids: suggestions.map(s => s.id),
                  })}
                  disabled={action.isPending}
                >
                  <X className="h-3 w-3" /> Reject All
                </Button>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
