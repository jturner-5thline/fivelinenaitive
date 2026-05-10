import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Slider } from "@/components/ui/slider";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { Brain, Pencil, FlaskConical, Save, BarChart3, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { format, subDays } from "date-fns";

interface Prompt {
  id: string;
  name: string;
  feature_area: string;
  prompt_text: string;
  description: string | null;
  token_avg: number;
  success_rate: number;
  updated_at: string;
}

interface AIConfig {
  id?: string;
  default_model: string;
  default_temperature: number;
  max_tokens: number;
  company_id?: string;
}

const MODEL_OPTIONS = [
  "claude-sonnet-4-20250514",
  "google/gemini-2.5-pro",
  "google/gemini-3-flash-preview",
  "openai/gpt-5",
  "openai/gpt-5-mini",
];

export function AITrainingPanel() {
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [config, setConfig] = useState<AIConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Prompt | null>(null);
  const [editText, setEditText] = useState("");
  const [editName, setEditName] = useState("");
  const [editArea, setEditArea] = useState("");
  const [testing, setTesting] = useState<Prompt | null>(null);
  const [testInput, setTestInput] = useState("");
  const [testOutput, setTestOutput] = useState<string>("");
  const [testing_, setTestingFlag] = useState(false);
  const [aiPerf, setAiPerf] = useState<{ date: string; rate: number }[]>([]);
  const [aiUsage, setAiUsage] = useState<{ feature: string; count: number; avgMs: number }[]>([]);

  const load = async () => {
    setLoading(true);
    const [{ data: ps }, { data: ac }, { data: events }] = await Promise.all([
      supabase.from("ai_prompts").select("*").order("feature_area"),
      supabase.from("ai_configuration").select("*").limit(1).maybeSingle(),
      supabase
        .from("usage_events")
        .select("feature_type, duration_ms, timestamp, metadata")
        .gte("timestamp", subDays(new Date(), 30).toISOString())
        .limit(5000),
    ]);
    setPrompts((ps ?? []) as Prompt[]);
    if (ac) setConfig(ac as AIConfig);

    // AI performance over time: approval rate from crm_suggestions or fallback synthetic per-day rate
    const { data: suggestions } = await supabase
      .from("crm_suggestions")
      .select("status, created_at")
      .gte("created_at", subDays(new Date(), 30).toISOString())
      .limit(2000);
    const perDay: Record<string, { approved: number; total: number }> = {};
    (suggestions ?? []).forEach((s: any) => {
      const d = (s.created_at as string).slice(0, 10);
      if (!perDay[d]) perDay[d] = { approved: 0, total: 0 };
      perDay[d].total += 1;
      if (s.status === "approved" || s.status === "applied") perDay[d].approved += 1;
    });
    setAiPerf(
      Object.entries(perDay)
        .map(([date, v]) => ({ date, rate: v.total ? (v.approved / v.total) * 100 : 0 }))
        .sort((a, b) => a.date.localeCompare(b.date)),
    );

    // AI feature usage and avg latency
    const aiEvents = (events ?? []).filter((e: any) =>
      ["AI_CHAT", "EMAIL_DRAFT", "LENDER_SUBMISSION", "AI_SUGGESTION", "DEAL_RESEARCH"].includes(e.feature_type),
    );
    const grouped: Record<string, { count: number; total: number; samples: number }> = {};
    aiEvents.forEach((e: any) => {
      if (!grouped[e.feature_type]) grouped[e.feature_type] = { count: 0, total: 0, samples: 0 };
      grouped[e.feature_type].count += 1;
      if (e.duration_ms) {
        grouped[e.feature_type].total += e.duration_ms;
        grouped[e.feature_type].samples += 1;
      }
    });
    setAiUsage(
      Object.entries(grouped)
        .map(([feature, v]) => ({ feature, count: v.count, avgMs: v.samples ? v.total / v.samples : 0 }))
        .sort((a, b) => b.count - a.count),
    );

    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const openEdit = (p: Prompt) => {
    setEditing(p);
    setEditText(p.prompt_text);
    setEditName(p.name);
    setEditArea(p.feature_area);
  };

  const savePrompt = async () => {
    if (!editing) return;
    const { error } = await supabase
      .from("ai_prompts")
      .update({ prompt_text: editText, name: editName, feature_area: editArea })
      .eq("id", editing.id);
    if (error) return toast.error("Save failed: " + error.message);
    toast.success("Prompt saved");
    setEditing(null);
    load();
  };

  const runTest = async () => {
    if (!testing) return;
    setTestingFlag(true);
    setTestOutput("");
    try {
      const { data, error } = await supabase.functions.invoke("refine-text", {
        body: { systemPrompt: testing.prompt_text, userInput: testInput },
      });
      if (error) throw error;
      setTestOutput(typeof data === "string" ? data : data?.text ?? data?.output ?? JSON.stringify(data, null, 2));
    } catch (e: any) {
      setTestOutput("Error: " + (e?.message ?? "test failed"));
    } finally {
      setTestingFlag(false);
    }
  };

  const saveConfig = async () => {
    if (!config?.id) return toast.error("No AI configuration found for this workspace");
    const { error } = await supabase
      .from("ai_configuration")
      .update({
        default_temperature: config.default_temperature,
        max_tokens: config.max_tokens,
      })
      .eq("id", config.id);
    if (error) return toast.error("Save failed: " + error.message);
    toast.success("Configuration saved");
  };

  const topUsage = aiUsage.slice(0, 10);
  const leastUsage = [...aiUsage].sort((a, b) => a.count - b.count).slice(0, 10);

  if (loading) {
    return <div className="space-y-4">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-40 w-full" />)}</div>;
  }

  return (
    <div className="space-y-6">
      {/* Section A: Prompt Library */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><Sparkles className="h-4 w-4" />Prompt Library</CardTitle>
          <CardDescription>Edit and test the AI prompts powering each feature area</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Prompt Name</TableHead>
                <TableHead>Feature Area</TableHead>
                <TableHead>Last Updated</TableHead>
                <TableHead className="text-right">Token Avg</TableHead>
                <TableHead className="text-right">Success Rate</TableHead>
                <TableHead className="w-[180px] text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {prompts.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-6">No prompts yet</TableCell></TableRow>
              ) : prompts.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">{p.name}</TableCell>
                  <TableCell><Badge variant="secondary">{p.feature_area}</Badge></TableCell>
                  <TableCell className="text-muted-foreground text-sm">{format(new Date(p.updated_at), "MMM d, yyyy")}</TableCell>
                  <TableCell className="text-right">{p.token_avg || "—"}</TableCell>
                  <TableCell className="text-right">{p.success_rate ? `${p.success_rate.toFixed(0)}%` : "—"}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button size="sm" variant="outline" onClick={() => openEdit(p)}><Pencil className="h-3 w-3 mr-1" />Edit</Button>
                      <Button size="sm" variant="outline" onClick={() => { setTesting(p); setTestInput(""); setTestOutput(""); }}><FlaskConical className="h-3 w-3 mr-1" />Test</Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Section B: AI Performance */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><BarChart3 className="h-4 w-4" />AI Performance</CardTitle>
          <CardDescription>Approval rate of AI suggestions over time</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {aiPerf.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No AI suggestion data yet.</p>
          ) : (
            <div className="h-56">
              <ResponsiveContainer>
                <LineChart data={aiPerf}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border/40" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} unit="%" />
                  <Tooltip />
                  <Line type="monotone" dataKey="rate" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <h4 className="text-sm font-semibold mb-2">Most-used AI features</h4>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Feature</TableHead>
                    <TableHead className="text-right">Uses</TableHead>
                    <TableHead className="text-right">Avg ms</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {topUsage.length === 0 ? <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground text-sm py-4">No data</TableCell></TableRow> :
                    topUsage.map((u) => (
                      <TableRow key={u.feature}>
                        <TableCell>{u.feature}</TableCell>
                        <TableCell className="text-right">{u.count}</TableCell>
                        <TableCell className="text-right">{u.avgMs ? u.avgMs.toFixed(0) : "—"}</TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            </div>
            <div>
              <h4 className="text-sm font-semibold mb-2">Least-used AI features</h4>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Feature</TableHead>
                    <TableHead className="text-right">Uses</TableHead>
                    <TableHead className="text-right">Avg ms</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {leastUsage.length === 0 ? <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground text-sm py-4">No data</TableCell></TableRow> :
                    leastUsage.map((u) => (
                      <TableRow key={u.feature}>
                        <TableCell>{u.feature}</TableCell>
                        <TableCell className="text-right">{u.count}</TableCell>
                        <TableCell className="text-right">{u.avgMs ? u.avgMs.toFixed(0) : "—"}</TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Section C: Model Configuration */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><Brain className="h-4 w-4" />Model Configuration</CardTitle>
          <CardDescription>Tune model, temperature, and max tokens for AI responses</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {!config ? (
            <p className="text-sm text-muted-foreground">No AI configuration available.</p>
          ) : (
            <>
              <div className="space-y-2">
                <Label>Current AI Model</Label>
                <Select value={config.default_model} onValueChange={(v) => setConfig({ ...config, default_model: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {MODEL_OPTIONS.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Temperature</Label>
                  <span className="text-sm text-muted-foreground">{config.default_temperature.toFixed(2)}</span>
                </div>
                <Slider
                  value={[Number(config.default_temperature)]}
                  min={0}
                  max={1}
                  step={0.05}
                  onValueChange={(v) => setConfig({ ...config, default_temperature: v[0] })}
                />
              </div>
              <div className="space-y-2 max-w-xs">
                <Label>Max Tokens per Request</Label>
                <Input
                  type="number"
                  min={256}
                  max={32000}
                  value={config.max_tokens}
                  onChange={(e) => setConfig({ ...config, max_tokens: parseInt(e.target.value) || 4096 })}
                />
              </div>
              <Button onClick={saveConfig}><Save className="h-4 w-4 mr-2" />Save Configuration</Button>
            </>
          )}
        </CardContent>
      </Card>

      {/* Edit dialog */}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Edit Prompt</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Name</Label>
                <Input value={editName} onChange={(e) => setEditName(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Feature Area</Label>
                <Input value={editArea} onChange={(e) => setEditArea(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Prompt Text</Label>
              <Textarea value={editText} onChange={(e) => setEditText(e.target.value)} rows={10} className="font-mono text-sm" />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
              <Button onClick={savePrompt}><Save className="h-4 w-4 mr-2" />Save</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Test dialog */}
      <Dialog open={!!testing} onOpenChange={(o) => !o && setTesting(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Test Prompt — {testing?.name}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Sample Input</Label>
              <Textarea value={testInput} onChange={(e) => setTestInput(e.target.value)} rows={4} placeholder="Enter sample input the AI should respond to..." />
            </div>
            <Button onClick={runTest} disabled={testing_ || !testInput.trim()}>
              <FlaskConical className="h-4 w-4 mr-2" />{testing_ ? "Running..." : "Run Test"}
            </Button>
            {testOutput && (
              <div className="space-y-1.5">
                <Label>AI Output</Label>
                <pre className="text-xs whitespace-pre-wrap bg-muted rounded p-3 max-h-64 overflow-y-auto">{testOutput}</pre>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}