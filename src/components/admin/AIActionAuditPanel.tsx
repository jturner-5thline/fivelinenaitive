import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { Search, ChevronRight, Filter } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';

interface AuditRow {
  id: string;
  user_id: string;
  company_id: string | null;
  action_type: string;
  intent: string | null;
  prompt: string | null;
  resolved_deal_name: string | null;
  resolved_assignee_name: string | null;
  extracted_fields: Record<string, unknown> | null;
  confidence: Record<string, unknown> | null;
  clarification_required: boolean | null;
  clarification_reason: string | null;
  outcome: string;
  outcome_detail: string | null;
  error_message: string | null;
  page_context: Record<string, unknown> | null;
  created_at: string;
  latency_ms?: number | null;
}

const OUTCOME_VARIANT: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  drafted: 'secondary',
  approved: 'default',
  executed: 'default',
  rejected: 'destructive',
  failed: 'destructive',
  cancelled: 'outline',
  clarification: 'outline',
};

function toScore(c: AuditRow['confidence']): number | null {
  if (!c || typeof c !== 'object') return null;
  const vals: number[] = [];
  for (const v of Object.values(c)) {
    if (typeof v === 'number' && Number.isFinite(v)) vals.push(v);
    else if (v && typeof v === 'object' && 'score' in v && typeof (v as { score: unknown }).score === 'number') {
      vals.push((v as { score: number }).score);
    }
  }
  if (!vals.length) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

function getLatency(row: AuditRow): number | null {
  const direct = (row as any).latency_ms;
  if (typeof direct === 'number' && Number.isFinite(direct)) return direct;
  const confidenceLatency = row.confidence && typeof row.confidence === 'object' ? (row.confidence as any).latency_ms : null;
  if (typeof confidenceLatency === 'number' && Number.isFinite(confidenceLatency)) return confidenceLatency;
  const extractedLatency = row.extracted_fields && typeof row.extracted_fields === 'object' ? (row.extracted_fields as any).latency_ms : null;
  if (typeof extractedLatency === 'number' && Number.isFinite(extractedLatency)) return extractedLatency;
  return null;
}

export function AIActionAuditPanel() {
  const [search, setSearch] = useState('');
  const [intentFilter, setIntentFilter] = useState('all');
  const [outcomeFilter, setOutcomeFilter] = useState('all');
  const [confidenceFilter, setConfidenceFilter] = useState('all');
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const { data, isLoading, error } = useQuery({
    queryKey: ['ai-action-audit', outcomeFilter, intentFilter],
    queryFn: async () => {
      let q = supabase
        .from('ai_action_audit')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(500);
      if (outcomeFilter !== 'all') q = q.eq('outcome', outcomeFilter);
      if (intentFilter !== 'all') q = q.eq('intent', intentFilter);
      const { data: rows, error: err } = await q;
      if (err) throw err;
      return (rows ?? []) as AuditRow[];
    },
  });

  const allIntents = useMemo(() => {
    const s = new Set<string>();
    (data ?? []).forEach(r => { if (r.intent) s.add(r.intent); });
    return Array.from(s).sort();
  }, [data]);

  const allOutcomes = useMemo(() => {
    const s = new Set<string>();
    (data ?? []).forEach(r => { if (r.outcome) s.add(r.outcome); });
    return Array.from(s).sort();
  }, [data]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (data ?? []).filter(r => {
      if (term) {
        const hay = [r.prompt, r.intent, r.action_type, r.resolved_deal_name, r.outcome_detail, r.error_message]
          .filter(Boolean).join(' ').toLowerCase();
        if (!hay.includes(term)) return false;
      }
      const score = toScore(r.confidence);
      if (confidenceFilter === 'high' && !(score !== null && score >= 0.8)) return false;
      if (confidenceFilter === 'medium' && !(score !== null && score >= 0.5 && score < 0.8)) return false;
      if (confidenceFilter === 'low' && !(score !== null && score < 0.5)) return false;
      if (confidenceFilter === 'unknown' && score !== null) return false;
      return true;
    });
  }, [data, search, confidenceFilter]);

  return (
    <Card>
      <CardContent className="p-4 space-y-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h3 className="text-sm font-semibold">AI Action Audit</h3>
            <p className="text-xs text-muted-foreground">
              Inspect prompts, intents, confidence, and outcomes for every AI-driven action.
            </p>
          </div>
          <div className="text-xs text-muted-foreground">
            {isLoading ? '—' : `${filtered.length} of ${data?.length ?? 0} actions`}
          </div>
        </div>

        <div className="grid gap-2 md:grid-cols-4">
          <div className="relative md:col-span-2">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search prompt, intent, deal, error…"
              className="pl-8 h-9 text-sm"
            />
          </div>
          <Select value={intentFilter} onValueChange={setIntentFilter}>
            <SelectTrigger className="h-9 text-sm">
              <Filter className="h-3.5 w-3.5 mr-1" />
              <SelectValue placeholder="Intent" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All intents</SelectItem>
              {allIntents.map(i => <SelectItem key={i} value={i}>{i}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={outcomeFilter} onValueChange={setOutcomeFilter}>
            <SelectTrigger className="h-9 text-sm">
              <SelectValue placeholder="Outcome" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All outcomes</SelectItem>
              {['drafted', 'approved', 'executed', 'rejected', 'failed', 'cancelled', 'clarification', ...allOutcomes]
                .filter((v, i, a) => a.indexOf(v) === i)
                .map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={confidenceFilter} onValueChange={setConfidenceFilter}>
            <SelectTrigger className="h-9 text-sm md:col-start-4">
              <SelectValue placeholder="Confidence" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Any confidence</SelectItem>
              <SelectItem value="high">High (≥ 0.80)</SelectItem>
              <SelectItem value="medium">Medium (0.50–0.79)</SelectItem>
              <SelectItem value="low">Low (&lt; 0.50)</SelectItem>
              <SelectItem value="unknown">No score</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {error ? (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
            Failed to load audit log: {(error as Error).message}
          </div>
        ) : isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-10 text-sm text-muted-foreground">
            No AI actions match the current filters.
          </div>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-6" />
                  <TableHead className="w-[140px]">When</TableHead>
                  <TableHead>Intent / Action</TableHead>
                  <TableHead className="hidden lg:table-cell">Prompt</TableHead>
                   <TableHead className="w-[120px]">Confidence</TableHead>
                   <TableHead className="w-[90px]">Latency</TableHead>
                  <TableHead className="w-[140px]">Outcome</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map(row => {
                  const score = toScore(row.confidence);
                  const latency = getLatency(row);
                  const isOpen = !!expanded[row.id];
                  return (
                    <Collapsible key={row.id} asChild open={isOpen} onOpenChange={(o) => setExpanded(p => ({ ...p, [row.id]: o }))}>
                      <>
                        <TableRow className="cursor-pointer">
                          <TableCell>
                            <CollapsibleTrigger asChild>
                              <button className="p-1 hover:bg-muted rounded">
                                <ChevronRight className={cn('h-3.5 w-3.5 transition-transform', isOpen && 'rotate-90')} />
                              </button>
                            </CollapsibleTrigger>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                            {formatDistanceToNow(new Date(row.created_at), { addSuffix: true })}
                          </TableCell>
                          <TableCell>
                            <div className="text-sm font-medium">{row.intent ?? '—'}</div>
                            <div className="text-[11px] text-muted-foreground">{row.action_type}</div>
                          </TableCell>
                          <TableCell className="hidden lg:table-cell max-w-[420px]">
                            <div className="text-xs text-muted-foreground line-clamp-2">
                              {row.prompt ?? '—'}
                            </div>
                          </TableCell>
                           <TableCell>
                            {score === null ? (
                              <Badge variant="outline" className="text-[10px]">n/a</Badge>
                            ) : (
                              <Badge
                                variant={score >= 0.8 ? 'default' : score >= 0.5 ? 'secondary' : 'destructive'}
                                className="text-[10px]"
                              >
                                {(score * 100).toFixed(0)}%
                              </Badge>
                            )}
                          </TableCell>
                           <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                             {typeof latency === 'number' ? `${latency}ms` : '—'}
                           </TableCell>
                          <TableCell>
                            <Badge variant={OUTCOME_VARIANT[row.outcome] ?? 'outline'} className="text-[10px]">
                              {row.outcome}
                            </Badge>
                            {row.clarification_required && (
                              <Badge variant="outline" className="ml-1 text-[10px]">clarify</Badge>
                            )}
                          </TableCell>
                        </TableRow>
                        <CollapsibleContent asChild>
                          <TableRow className="bg-muted/30 hover:bg-muted/30">
                            <TableCell colSpan={7} className="p-4">
                              <div className="grid gap-3 md:grid-cols-2 text-xs">
                                <DetailField label="Prompt" value={row.prompt} mono />
                                <DetailField label="Intent" value={row.intent} />
                                <DetailField label="Resolved deal" value={row.resolved_deal_name} />
                                <DetailField label="Resolved assignee" value={row.resolved_assignee_name} />
                                <DetailField label="Outcome detail" value={row.outcome_detail} />
                                <DetailField label="Latency" value={typeof latency === 'number' ? `${latency}ms` : null} />
                                <DetailField label="Clarification reason" value={row.clarification_reason} />
                                <DetailField label="Error" value={row.error_message} className="text-destructive" />
                                <JsonField label="Confidence" value={row.confidence} />
                                <JsonField label="Extracted fields" value={row.extracted_fields} />
                                <JsonField label="Page context" value={row.page_context} />
                              </div>
                            </TableCell>
                          </TableRow>
                        </CollapsibleContent>
                      </>
                    </Collapsible>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function DetailField({ label, value, mono, className }: { label: string; value: string | null | undefined; mono?: boolean; className?: string }) {
  if (!value) return null;
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-0.5">{label}</div>
      <div className={cn('whitespace-pre-wrap break-words', mono && 'font-mono', className)}>{value}</div>
    </div>
  );
}

function JsonField({ label, value }: { label: string; value: unknown }) {
  if (!value || (typeof value === 'object' && Object.keys(value as object).length === 0)) return null;
  return (
    <div className="md:col-span-2">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-0.5">{label}</div>
      <pre className="bg-background border rounded p-2 text-[11px] overflow-x-auto">
        {JSON.stringify(value, null, 2)}
      </pre>
    </div>
  );
}
