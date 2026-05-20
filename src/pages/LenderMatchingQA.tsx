import { useEffect, useMemo, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader2, Play, AlertTriangle, CheckCircle2, XCircle, GitCompare, Plus, Trash2, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { canUse5thLineProprietaryActions } from '@/lib/proprietaryAccess';
import type { AiRecommendation } from '@/hooks/useAiRecommendedLenders';

/* ────────────────────────────────────────────────────────────────────────── */
/* Types                                                                       */
/* ────────────────────────────────────────────────────────────────────────── */

interface QaRun {
  recommendations: (AiRecommendation & { matchScore: number })[];
  hardFiltered: Array<{
    lenderId: string | null;
    lenderName: string;
    tier?: string | null;
    loanTypes?: string[];
    industries?: string[];
    minDeal?: number | null;
    maxDeal?: number | null;
    failedCheck: string;
    failedReason: string;
    hardFilterChecks: { name: string; passed: boolean; reason?: string }[];
    components?: Record<string, number>;
  }>;
  sufficiency: { ok: boolean; missing: string[] };
  generatedAt: string;
  meta?: any;
}

interface DealOption { id: string; company: string; deal_type?: string | null; value?: number | null }

interface Override {
  dealValue?: number;
  dealTypes?: string[];
  industry?: string;
  geo?: string;
  narrativeAppend?: string;
  notesAppend?: string;
}

interface RegressionTest {
  id: string;
  deal_id: string;
  name: string;
  description: string | null;
  must_include_lenders: string[];
  must_exclude_lenders: string[];
  top_n: number;
  criteria_override: Override | null;
}

/* ────────────────────────────────────────────────────────────────────────── */
/* Helpers                                                                     */
/* ────────────────────────────────────────────────────────────────────────── */

const lc = (v: unknown) => String(v ?? '').trim().toLowerCase();

function detectAnomalies(run: QaRun): { level: 'warn' | 'error'; message: string }[] {
  const out: { level: 'warn' | 'error'; message: string }[] = [];
  const recs = run.recommendations ?? [];
  if (!recs.length) return out;
  // 1. Many ties at top
  const scoreBuckets = new Map<number, number>();
  recs.slice(0, 15).forEach(r => scoreBuckets.set(r.matchScore, (scoreBuckets.get(r.matchScore) ?? 0) + 1));
  const maxTie = Math.max(...Array.from(scoreBuckets.values()));
  if (maxTie >= 4) out.push({ level: 'warn', message: `${maxTie} lenders tied at the same score in the top 15 — scoring may be too coarse.` });
  // 2. Too many 0% results
  const zeros = recs.filter(r => r.matchScore === 0).length;
  if (zeros / Math.max(recs.length, 1) > 0.3) out.push({ level: 'warn', message: `${zeros} of ${recs.length} lenders scored 0% — check hard filters and weight calibration.` });
  // 3. Missing rationale
  const noRat = recs.slice(0, 20).filter(r => !r.rationale || r.rationale.length < 20).length;
  if (noRat >= 3) out.push({ level: 'warn', message: `${noRat} top-20 lenders are missing a real rationale (AI re-rank may have failed).` });
  // 4. Recommendations driven by <3 informative features
  const MIN_FEATURES = 3;
  const thin = recs.slice(0, 10).filter(r => {
    const c = r.components || ({} as any);
    const informative = ['type','size','industry','geography','structure','recency','evidence','semantic']
      .filter(k => typeof c[k] === 'number' && c[k] !== 50 && c[k] !== 70 && c[k] !== 100).length;
    return informative < MIN_FEATURES;
  }).length;
  if (thin >= 2) out.push({ level: 'warn', message: `${thin} top-10 recommendations are driven by fewer than ${MIN_FEATURES} informative features.` });
  // 5. AI off
  if (run.meta?.modelUsed === 'deterministic-only') out.push({ level: 'warn', message: 'AI re-rank disabled (no model key) — rationales are deterministic only.' });
  // 6. Sufficiency
  if (run.sufficiency && !run.sufficiency.ok) out.push({ level: 'error', message: `Deal data insufficient: missing ${run.sufficiency.missing.join(', ')}.` });
  return out;
}

function scoreColor(s: number) {
  if (s >= 75) return 'text-emerald-600';
  if (s >= 55) return 'text-amber-600';
  if (s > 0) return 'text-rose-600';
  return 'text-muted-foreground';
}

/* ────────────────────────────────────────────────────────────────────────── */
/* Component                                                                   */
/* ────────────────────────────────────────────────────────────────────────── */

export default function LenderMatchingQA() {
  const navigate = useNavigate();
  const { user, isLoading: authLoading } = useAuth();
  const allowed = canUse5thLineProprietaryActions(user);

  // Deal picker
  const [deals, setDeals] = useState<DealOption[]>([]);
  const [dealId, setDealId] = useState<string | undefined>();
  const [dealSearch, setDealSearch] = useState('');
  const [dealOpen, setDealOpen] = useState(false);

  // Override / simulation
  const [override, setOverride] = useState<Override>({});

  // Runs (baseline + simulated)
  const [baseline, setBaseline] = useState<QaRun | null>(null);
  const [simulated, setSimulated] = useState<QaRun | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Compare
  const [compareA, setCompareA] = useState<string | null>(null);
  const [compareB, setCompareB] = useState<string | null>(null);

  // Regression
  const [tests, setTests] = useState<RegressionTest[]>([]);
  const [regResults, setRegResults] = useState<Record<string, { ok: boolean; misses: string[]; leaks: string[] }>>({});
  const [regRunning, setRegRunning] = useState(false);
  const [newTest, setNewTest] = useState<Partial<RegressionTest>>({ name: '', must_include_lenders: [], must_exclude_lenders: [], top_n: 10 });

  /* Load deals on mount */
  useEffect(() => {
    if (!allowed) return;
    supabase
      .from('deals')
      .select('id, company, deal_type, value')
      .order('updated_at', { ascending: false })
      .limit(300)
      .then(({ data }) => setDeals((data ?? []) as DealOption[]));
  }, [allowed]);

  /* Load regression tests when deal changes */
  useEffect(() => {
    if (!dealId) { setTests([]); setRegResults({}); return; }
    supabase
      .from('lender_qa_regression_tests')
      .select('*')
      .eq('deal_id', dealId)
      .order('created_at', { ascending: false })
      .then(({ data }) => setTests((data ?? []) as any));
    setRegResults({});
  }, [dealId]);

  const filteredDeals = useMemo(() => {
    const q = dealSearch.toLowerCase();
    if (!q) return deals.slice(0, 50);
    return deals.filter(d => d.company?.toLowerCase().includes(q)).slice(0, 50);
  }, [deals, dealSearch]);

  const selectedDeal = useMemo(() => deals.find(d => d.id === dealId), [deals, dealId]);

  async function runQa(opts: { overrideToUse?: Override; isSimulated?: boolean } = {}) {
    if (!dealId) { toast.error('Pick a deal first'); return; }
    setRunning(true); setError(null);
    try {
      const ov = opts.overrideToUse ?? {};
      const { data, error: invokeErr } = await supabase.functions.invoke('recommend-lenders', {
        body: { dealId, qaMode: true, criteriaOverride: Object.keys(ov).length ? ov : undefined },
      });
      if (invokeErr) throw invokeErr;
      const run = data as QaRun;
      if (opts.isSimulated) setSimulated(run); else { setBaseline(run); setSimulated(null); }
    } catch (e: any) {
      setError(e?.message || 'Run failed');
      toast.error('QA run failed', { description: e?.message });
    } finally {
      setRunning(false);
    }
  }

  async function runRegression() {
    if (!tests.length) { toast.message('No regression tests defined for this deal'); return; }
    setRegRunning(true);
    const results: typeof regResults = {};
    for (const t of tests) {
      try {
        const { data, error: invokeErr } = await supabase.functions.invoke('recommend-lenders', {
          body: { dealId: t.deal_id, qaMode: true, criteriaOverride: t.criteria_override ?? undefined },
        });
        if (invokeErr) throw invokeErr;
        const run = data as QaRun;
        const topNames = new Set(run.recommendations.slice(0, t.top_n).map(r => lc(r.lenderName)));
        const allNames = new Set([
          ...run.recommendations.map(r => lc(r.lenderName)),
          ...run.hardFiltered.map(r => lc(r.lenderName)),
        ]);
        const blockedNames = new Set(run.hardFiltered.map(r => lc(r.lenderName)));
        const misses = (t.must_include_lenders ?? []).filter(n => !topNames.has(lc(n)));
        const leaks = (t.must_exclude_lenders ?? []).filter(n => {
          const k = lc(n);
          // "leak" = expected to be excluded but appears in recommendations AND is not hard-filtered
          return allNames.has(k) && !blockedNames.has(k);
        });
        results[t.id] = { ok: misses.length === 0 && leaks.length === 0, misses, leaks };
      } catch (e: any) {
        results[t.id] = { ok: false, misses: ['(error running)'], leaks: [] };
      }
    }
    setRegResults(results);
    setRegRunning(false);
  }

  async function saveTest() {
    if (!dealId || !newTest.name?.trim()) { toast.error('Name required'); return; }
    const { data: u } = await supabase.auth.getUser();
    if (!u?.user) return;
    const { error: insErr } = await supabase.from('lender_qa_regression_tests').insert({
      deal_id: dealId,
      name: newTest.name!.trim(),
      description: newTest.description ?? null,
      must_include_lenders: newTest.must_include_lenders ?? [],
      must_exclude_lenders: newTest.must_exclude_lenders ?? [],
      top_n: newTest.top_n ?? 10,
      criteria_override: null,
      created_by: u.user.id,
    });
    if (insErr) { toast.error('Failed to save test', { description: insErr.message }); return; }
    toast.success('Regression test saved');
    setNewTest({ name: '', must_include_lenders: [], must_exclude_lenders: [], top_n: 10 });
    const { data } = await supabase.from('lender_qa_regression_tests').select('*').eq('deal_id', dealId).order('created_at', { ascending: false });
    setTests((data ?? []) as any);
  }

  async function deleteTest(id: string) {
    const { error: delErr } = await supabase.from('lender_qa_regression_tests').delete().eq('id', id);
    if (delErr) { toast.error('Delete failed'); return; }
    setTests(prev => prev.filter(t => t.id !== id));
  }

  /* ────────────────────────────────────────────────────────────────────────── */
  /* Render                                                                      */
  /* ────────────────────────────────────────────────────────────────────────── */

  if (authLoading) {
    return <div className="flex items-center justify-center min-h-[60vh]"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  }
  if (!allowed) {
    return (
      <div className="max-w-2xl mx-auto p-6">
        <Card>
          <CardHeader>
            <CardTitle>Restricted</CardTitle>
            <CardDescription>The Lender Matching QA harness is only available to 5th Line internal users.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const display = simulated ?? baseline;
  const anomalies = display ? detectAnomalies(display) : [];
  const compareLenders = display
    ? [compareA, compareB].map(name => display.recommendations.find(r => r.lenderName === name) ?? display.hardFiltered.find(r => r.lenderName === name))
    : [null, null];

  return (
    <div className="container mx-auto px-4 py-6 max-w-[1400px]">
      <Helmet><title>Lender Matching QA · naitive</title></Helmet>

      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate('/lenders')}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Lenders
          </Button>
          <div>
            <h1 className="text-2xl font-semibold">Lender Matching QA</h1>
            <p className="text-sm text-muted-foreground">Inspect, simulate and regression-test the recommendation engine. 5th Line internal only.</p>
          </div>
        </div>
      </div>

      {/* Deal picker + run */}
      <Card className="mb-4">
        <CardContent className="pt-6 flex flex-wrap gap-3 items-end">
          <div className="flex-1 min-w-[260px]">
            <Label className="text-xs">Deal</Label>
            <Popover open={dealOpen} onOpenChange={setDealOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-full justify-start font-normal">
                  {selectedDeal ? selectedDeal.company : 'Select a deal…'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="p-0 w-[420px]" align="start">
                <Command shouldFilter={false}>
                  <CommandInput placeholder="Search deals…" value={dealSearch} onValueChange={setDealSearch} />
                  <CommandList>
                    <CommandEmpty>No deals.</CommandEmpty>
                    <CommandGroup>
                      {filteredDeals.map(d => (
                        <CommandItem key={d.id} value={d.id} onSelect={() => { setDealId(d.id); setDealOpen(false); setBaseline(null); setSimulated(null); }}>
                          <div className="flex flex-col">
                            <span>{d.company}</span>
                            <span className="text-xs text-muted-foreground">{d.deal_type || '—'} · {d.value ? `$${Math.round((d.value/1000))}K` : '—'}</span>
                          </div>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>
          <Button onClick={() => runQa({})} disabled={!dealId || running}>
            {running ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Play className="h-4 w-4 mr-2" />}
            Run baseline
          </Button>
        </CardContent>
      </Card>

      {error && <Card className="mb-4 border-destructive"><CardContent className="pt-6 text-sm text-destructive">{error}</CardContent></Card>}

      {display && (
        <>
          {/* Anomalies banner */}
          {anomalies.length > 0 && (
            <Card className="mb-4 border-amber-300/60 bg-amber-50 dark:bg-amber-950/30">
              <CardContent className="pt-6">
                <div className="flex items-center gap-2 mb-2 text-amber-700 dark:text-amber-300">
                  <AlertTriangle className="h-4 w-4" />
                  <span className="font-medium">{anomalies.length} suspicious output{anomalies.length > 1 ? 's' : ''} detected</span>
                </div>
                <ul className="text-sm space-y-1">
                  {anomalies.map((a, i) => (
                    <li key={i} className={a.level === 'error' ? 'text-destructive' : 'text-amber-700 dark:text-amber-300'}>
                      • {a.message}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          {/* Meta */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4 text-sm">
            {[
              ['Evaluated', display.meta?.evaluated ?? '—'],
              ['Scored', display.meta?.scored ?? '—'],
              ['Hard-filtered', display.meta?.hardFilteredCount ?? '—'],
              ['AI model', display.meta?.modelUsed ?? '—'],
              ['Embedded', display.meta?.dealEmbedded ? 'yes' : 'no'],
            ].map(([k, v]) => (
              <Card key={k as string}><CardContent className="py-3"><div className="text-xs text-muted-foreground">{k}</div><div className="font-medium truncate">{String(v)}</div></CardContent></Card>
            ))}
          </div>

          <Tabs defaultValue="candidates" className="w-full">
            <TabsList>
              <TabsTrigger value="candidates">Candidates ({display.recommendations.length})</TabsTrigger>
              <TabsTrigger value="filtered">Hard-filtered ({display.hardFiltered.length})</TabsTrigger>
              <TabsTrigger value="compare">Side-by-side</TabsTrigger>
              <TabsTrigger value="simulate">Simulate</TabsTrigger>
              <TabsTrigger value="regression">Regression</TabsTrigger>
            </TabsList>

            {/* ─── Candidates ──────────────────────────────────────────── */}
            <TabsContent value="candidates">
              <Card>
                <CardContent className="p-0">
                  <ScrollArea className="h-[60vh]">
                    <Table>
                      <TableHeader className="sticky top-0 bg-background">
                        <TableRow>
                          <TableHead className="w-[36px]">#</TableHead>
                          <TableHead>Lender</TableHead>
                          <TableHead className="text-right">Struct.</TableHead>
                          <TableHead className="text-right">Notes/AI</TableHead>
                          <TableHead className="text-right">History</TableHead>
                          <TableHead className="text-right">Pen.</TableHead>
                          <TableHead className="text-right">Boost</TableHead>
                          <TableHead className="text-right">AI adj</TableHead>
                          <TableHead className="text-right">Final</TableHead>
                          <TableHead>Driver</TableHead>
                          <TableHead className="min-w-[300px]">Rationale</TableHead>
                          <TableHead className="w-[60px]" />
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {display.recommendations.map((r, idx) => {
                          const t = r.pipelineTrace;
                          const penTotal = t?.final.penaltyTotal ?? 0;
                          const boostTotal = t?.final.boostTotal ?? 0;
                          const aiAdj = t?.final.aiAdjustment ?? 0;
                          return (
                            <TableRow key={(r.lenderId ?? r.lenderName) + idx}>
                              <TableCell className="text-muted-foreground">{idx + 1}</TableCell>
                              <TableCell>
                                <div className="font-medium">{r.lenderName}</div>
                                <div className="text-xs text-muted-foreground">
                                  {r.tier ? <Badge variant="outline" className="mr-1">{r.tier}</Badge> : null}
                                  {(r.loanTypes ?? []).slice(0, 2).join(', ')}
                                </div>
                              </TableCell>
                              <TableCell className={`text-right ${scoreColor(t?.structured.score ?? 0)}`}>{t?.structured.score ?? '—'}</TableCell>
                              <TableCell className={`text-right ${scoreColor(t?.unstructured.score ?? 0)}`}>{t?.unstructured.score ?? '—'}</TableCell>
                              <TableCell className="text-right text-xs">{r.explanation?.driverBreakdown.history ?? 0}</TableCell>
                              <TableCell className="text-right text-rose-600">{penTotal ? penTotal : '·'}</TableCell>
                              <TableCell className="text-right text-emerald-600">{boostTotal ? `+${boostTotal}` : '·'}</TableCell>
                              <TableCell className={`text-right ${aiAdj > 0 ? 'text-emerald-600' : aiAdj < 0 ? 'text-rose-600' : 'text-muted-foreground'}`}>{aiAdj ? (aiAdj > 0 ? `+${aiAdj}` : aiAdj) : '·'}</TableCell>
                              <TableCell className={`text-right font-semibold ${scoreColor(r.matchScore)}`}>{r.matchScore}</TableCell>
                              <TableCell><Badge variant="secondary" className="text-xs">{r.explanation?.dominantDriver ?? '—'}</Badge></TableCell>
                              <TableCell className="text-xs text-muted-foreground">{r.rationale || <span className="text-amber-600">missing</span>}</TableCell>
                              <TableCell>
                                <Button variant="ghost" size="sm" onClick={() => { if (!compareA) setCompareA(r.lenderName); else if (!compareB && compareA !== r.lenderName) setCompareB(r.lenderName); else { setCompareA(r.lenderName); setCompareB(null); } }}>
                                  <GitCompare className="h-3 w-3" />
                                </Button>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </ScrollArea>
                </CardContent>
              </Card>
            </TabsContent>

            {/* ─── Hard-filtered ───────────────────────────────────────── */}
            <TabsContent value="filtered">
              <Card>
                <CardContent className="p-0">
                  <ScrollArea className="h-[60vh]">
                    <Table>
                      <TableHeader className="sticky top-0 bg-background">
                        <TableRow>
                          <TableHead>Lender</TableHead>
                          <TableHead>Failed check</TableHead>
                          <TableHead>Reason</TableHead>
                          <TableHead>All checks</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {display.hardFiltered.map((h, i) => (
                          <TableRow key={(h.lenderId ?? h.lenderName) + i}>
                            <TableCell className="font-medium">
                              {h.lenderName}
                              <div className="text-xs text-muted-foreground">{(h.loanTypes ?? []).slice(0, 2).join(', ')}</div>
                            </TableCell>
                            <TableCell><Badge variant="destructive" className="text-xs">{h.failedCheck}</Badge></TableCell>
                            <TableCell className="text-xs">{h.failedReason}</TableCell>
                            <TableCell className="text-xs">
                              <div className="flex flex-wrap gap-1">
                                {h.hardFilterChecks.map((c, j) => (
                                  <Badge key={j} variant={c.passed ? 'outline' : 'destructive'} className="text-[10px]">
                                    {c.passed ? <CheckCircle2 className="h-2.5 w-2.5 mr-1" /> : <XCircle className="h-2.5 w-2.5 mr-1" />}
                                    {c.name}
                                  </Badge>
                                ))}
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </ScrollArea>
                </CardContent>
              </Card>
            </TabsContent>

            {/* ─── Side-by-side compare ────────────────────────────────── */}
            <TabsContent value="compare">
              <div className="grid md:grid-cols-2 gap-4">
                {[compareA, compareB].map((name, i) => {
                  const r: any = display.recommendations.find(x => x.lenderName === name)
                    || display.hardFiltered.find(x => x.lenderName === name);
                  return (
                    <Card key={i}>
                      <CardHeader>
                        <CardTitle className="text-base flex items-center justify-between">
                          <span>{name || `Lender ${i + 1}`}</span>
                          {r && 'matchScore' in r ? <span className={`text-xl font-bold ${scoreColor(r.matchScore)}`}>{r.matchScore}</span> : null}
                        </CardTitle>
                        <CardDescription>
                          {!r && 'Pick a lender from the Candidates tab (compare icon)'}
                          {r && r.hardFiltered && <Badge variant="destructive">Hard-filtered: {r.failedCheck}</Badge>}
                        </CardDescription>
                      </CardHeader>
                      {r && (
                        <CardContent className="space-y-3 text-sm">
                          {r.pipelineTrace && (
                            <>
                              <div className="grid grid-cols-2 gap-2">
                                <Stat label="Structured" value={r.pipelineTrace.structured.score} />
                                <Stat label="Unstructured" value={r.pipelineTrace.unstructured.score} />
                                <Stat label="Penalties" value={r.pipelineTrace.final.penaltyTotal} negative />
                                <Stat label="Boosts" value={r.pipelineTrace.final.boostTotal} positive />
                                <Stat label="AI adj" value={r.pipelineTrace.final.aiAdjustment} />
                                <Stat label="Confidence" value={r.pipelineTrace.final.confidence} />
                              </div>
                              <div>
                                <div className="text-xs text-muted-foreground mb-1">Components</div>
                                <div className="grid grid-cols-4 gap-1 text-xs">
                                  {Object.entries(r.components || {}).map(([k, v]: [string, any]) => (
                                    <div key={k} className="border rounded px-1.5 py-1">
                                      <div className="text-[10px] text-muted-foreground">{k}</div>
                                      <div className={scoreColor(v)}>{v}</div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                              <div className="space-y-1">
                                <div className="text-xs text-muted-foreground">Penalties</div>
                                {r.pipelineTrace.penalties.length === 0 && <div className="text-xs">—</div>}
                                {r.pipelineTrace.penalties.map((p: any, j: number) => <div key={j} className="text-xs text-rose-600">{p.delta} · {p.name}: {p.reason}</div>)}
                              </div>
                              <div className="space-y-1">
                                <div className="text-xs text-muted-foreground">Boosts</div>
                                {r.pipelineTrace.boosts.length === 0 && <div className="text-xs">—</div>}
                                {r.pipelineTrace.boosts.map((p: any, j: number) => <div key={j} className="text-xs text-emerald-600">+{p.delta} · {p.name}: {p.reason}</div>)}
                              </div>
                              <Separator />
                              <div className="text-xs"><span className="text-muted-foreground">Rationale:</span> {r.rationale}</div>
                            </>
                          )}
                          {!r.pipelineTrace && r.hardFilterChecks && (
                            <div className="space-y-1">
                              {r.hardFilterChecks.map((c: any, j: number) => (
                                <div key={j} className={`text-xs flex gap-2 ${c.passed ? 'text-muted-foreground' : 'text-destructive'}`}>
                                  {c.passed ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                                  {c.name} {c.reason ? `— ${c.reason}` : ''}
                                </div>
                              ))}
                            </div>
                          )}
                        </CardContent>
                      )}
                    </Card>
                  );
                })}
              </div>
            </TabsContent>

            {/* ─── Simulate ────────────────────────────────────────────── */}
            <TabsContent value="simulate">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Simulate changes</CardTitle>
                  <CardDescription>Modify deal attributes or append narrative/notes and re-rank. Original deal data is not changed.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid md:grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs">Capital ask (USD)</Label>
                      <Input type="number" value={override.dealValue ?? ''} onChange={e => setOverride(o => ({ ...o, dealValue: e.target.value ? Number(e.target.value) : undefined }))} placeholder="e.g. 5000000" />
                    </div>
                    <div>
                      <Label className="text-xs">Deal types (comma)</Label>
                      <Input value={(override.dealTypes ?? []).join(', ')} onChange={e => setOverride(o => ({ ...o, dealTypes: e.target.value.split(',').map(s => s.trim()).filter(Boolean) }))} placeholder="e.g. ABL, term loan" />
                    </div>
                    <div>
                      <Label className="text-xs">Industry</Label>
                      <Input value={override.industry ?? ''} onChange={e => setOverride(o => ({ ...o, industry: e.target.value }))} />
                    </div>
                    <div>
                      <Label className="text-xs">Geography</Label>
                      <Input value={override.geo ?? ''} onChange={e => setOverride(o => ({ ...o, geo: e.target.value }))} />
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs">Append to deal narrative</Label>
                    <Textarea rows={3} value={override.narrativeAppend ?? ''} onChange={e => setOverride(o => ({ ...o, narrativeAppend: e.target.value }))} placeholder="e.g. 'turnaround situation with heavy AR concentration'" />
                  </div>
                  <div>
                    <Label className="text-xs">Append to deal notes</Label>
                    <Textarea rows={3} value={override.notesAppend ?? ''} onChange={e => setOverride(o => ({ ...o, notesAppend: e.target.value }))} placeholder="e.g. 'founder-led, seasonal inventory pressure'" />
                  </div>
                  <div className="flex gap-2">
                    <Button onClick={() => runQa({ overrideToUse: override, isSimulated: true })} disabled={running}>
                      {running ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Play className="h-4 w-4 mr-2" />}
                      Re-rank with simulation
                    </Button>
                    {simulated && <Button variant="ghost" onClick={() => setSimulated(null)}>Show baseline</Button>}
                  </div>
                  {simulated && baseline && (
                    <Card className="bg-muted/50">
                      <CardHeader><CardTitle className="text-sm">Ranking diff vs baseline (top 15)</CardTitle></CardHeader>
                      <CardContent>
                        <DiffTable a={baseline} b={simulated} />
                      </CardContent>
                    </Card>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* ─── Regression ──────────────────────────────────────────── */}
            <TabsContent value="regression">
              <div className="space-y-4">
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between">
                    <div>
                      <CardTitle className="text-base">Regression tests for this deal</CardTitle>
                      <CardDescription>Pin known-good outcomes; fail flags drift.</CardDescription>
                    </div>
                    <Button onClick={runRegression} disabled={regRunning || !tests.length}>
                      {regRunning ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Play className="h-4 w-4 mr-2" />}
                      Run all
                    </Button>
                  </CardHeader>
                  <CardContent>
                    {tests.length === 0 && <div className="text-sm text-muted-foreground">No tests yet.</div>}
                    {tests.map(t => {
                      const res = regResults[t.id];
                      return (
                        <div key={t.id} className="border rounded p-3 mb-2">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              {res ? (res.ok ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <XCircle className="h-4 w-4 text-destructive" />) : <span className="h-2 w-2 rounded-full bg-muted-foreground/40" />}
                              <span className="font-medium">{t.name}</span>
                              <Badge variant="outline" className="text-xs">top {t.top_n}</Badge>
                            </div>
                            <Button variant="ghost" size="sm" onClick={() => deleteTest(t.id)}><Trash2 className="h-3 w-3" /></Button>
                          </div>
                          {t.description && <div className="text-xs text-muted-foreground mt-1">{t.description}</div>}
                          <div className="grid md:grid-cols-2 gap-2 mt-2 text-xs">
                            <div>
                              <div className="text-muted-foreground">Must include</div>
                              <div className="flex flex-wrap gap-1 mt-1">
                                {t.must_include_lenders.map(n => (
                                  <Badge key={n} variant={res?.misses.includes(n) ? 'destructive' : 'secondary'} className="text-[10px]">{n}</Badge>
                                ))}
                              </div>
                            </div>
                            <div>
                              <div className="text-muted-foreground">Must exclude</div>
                              <div className="flex flex-wrap gap-1 mt-1">
                                {t.must_exclude_lenders.map(n => (
                                  <Badge key={n} variant={res?.leaks.includes(n) ? 'destructive' : 'secondary'} className="text-[10px]">{n}</Badge>
                                ))}
                              </div>
                            </div>
                          </div>
                          {res && !res.ok && (
                            <div className="text-xs text-destructive mt-2">
                              {res.misses.length > 0 && <div>Missing from top {t.top_n}: {res.misses.join(', ')}</div>}
                              {res.leaks.length > 0 && <div>Should have been excluded but leaked: {res.leaks.join(', ')}</div>}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader><CardTitle className="text-base">New regression test</CardTitle></CardHeader>
                  <CardContent className="space-y-3">
                    <div className="grid md:grid-cols-2 gap-3">
                      <div>
                        <Label className="text-xs">Name</Label>
                        <Input value={newTest.name ?? ''} onChange={e => setNewTest(n => ({ ...n, name: e.target.value }))} placeholder="e.g. 'Acme — must show ABL lenders'" />
                      </div>
                      <div>
                        <Label className="text-xs">Top N</Label>
                        <Input type="number" value={newTest.top_n ?? 10} onChange={e => setNewTest(n => ({ ...n, top_n: Number(e.target.value) || 10 }))} />
                      </div>
                    </div>
                    <div>
                      <Label className="text-xs">Description</Label>
                      <Textarea rows={2} value={newTest.description ?? ''} onChange={e => setNewTest(n => ({ ...n, description: e.target.value }))} />
                    </div>
                    <div>
                      <Label className="text-xs">Must include lender names (comma-separated)</Label>
                      <Input value={(newTest.must_include_lenders ?? []).join(', ')} onChange={e => setNewTest(n => ({ ...n, must_include_lenders: e.target.value.split(',').map(s => s.trim()).filter(Boolean) }))} />
                    </div>
                    <div>
                      <Label className="text-xs">Must exclude lender names (comma-separated)</Label>
                      <Input value={(newTest.must_exclude_lenders ?? []).join(', ')} onChange={e => setNewTest(n => ({ ...n, must_exclude_lenders: e.target.value.split(',').map(s => s.trim()).filter(Boolean) }))} />
                    </div>
                    <Button onClick={saveTest} disabled={!newTest.name?.trim()}><Save className="h-4 w-4 mr-2" />Save test</Button>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
}

function Stat({ label, value, positive, negative }: { label: string; value: number; positive?: boolean; negative?: boolean }) {
  const cls = positive && value > 0 ? 'text-emerald-600' : negative && value < 0 ? 'text-rose-600' : '';
  return (
    <div className="border rounded p-2">
      <div className="text-[10px] text-muted-foreground uppercase">{label}</div>
      <div className={`text-base font-semibold ${cls}`}>{value > 0 && (positive || negative) ? `+${value}` : value}</div>
    </div>
  );
}

function DiffTable({ a, b }: { a: QaRun; b: QaRun }) {
  const aRank = new Map(a.recommendations.map((r, i) => [r.lenderName, { rank: i + 1, score: r.matchScore }]));
  const bRank = new Map(b.recommendations.map((r, i) => [r.lenderName, { rank: i + 1, score: r.matchScore }]));
  const union = Array.from(new Set([
    ...b.recommendations.slice(0, 15).map(r => r.lenderName),
    ...a.recommendations.slice(0, 15).map(r => r.lenderName),
  ]));
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Lender</TableHead>
          <TableHead className="text-right">Baseline rank</TableHead>
          <TableHead className="text-right">Sim rank</TableHead>
          <TableHead className="text-right">Δ rank</TableHead>
          <TableHead className="text-right">Δ score</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {union.map(name => {
          const x = aRank.get(name); const y = bRank.get(name);
          const drank = x && y ? x.rank - y.rank : null;
          const dscore = x && y ? y.score - x.score : null;
          return (
            <TableRow key={name}>
              <TableCell>{name}</TableCell>
              <TableCell className="text-right">{x?.rank ?? '—'}</TableCell>
              <TableCell className="text-right">{y?.rank ?? '—'}</TableCell>
              <TableCell className={`text-right ${drank == null ? '' : drank > 0 ? 'text-emerald-600' : drank < 0 ? 'text-rose-600' : ''}`}>{drank == null ? '—' : (drank > 0 ? `+${drank}` : drank)}</TableCell>
              <TableCell className={`text-right ${dscore == null ? '' : dscore > 0 ? 'text-emerald-600' : dscore < 0 ? 'text-rose-600' : ''}`}>{dscore == null ? '—' : (dscore > 0 ? `+${dscore}` : dscore)}</TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}