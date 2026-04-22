import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ArrowLeft, RefreshCcw, AlertTriangle, CheckCircle2, XCircle, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";

type SyncLog = {
  id: string;
  created_at: string;
  direction: string;
  action: string;
  status: string;
  deal_id: string | null;
  hubspot_deal_id: string | null;
  error_message: string | null;
  request_payload: any;
  response_payload: any;
};

type StageMap = {
  id: string;
  naitive_pipeline_id: string;
  naitive_stage_name: string;
  hubspot_pipeline_id: string;
  hubspot_dealstage_id: string;
  updated_at: string;
};

type Pipeline = { id: string; name: string };

type Health = {
  ok: boolean;
  checked_at: string;
  latency_ms?: number;
  http_status?: number;
  error?: string | null;
};

const PAGE_SIZE = 50;

export default function HubspotSyncHealth() {
  const { user } = useAuth();
  const is5thLine = user?.email?.endsWith("@5thline.co") ?? false;

  const [health, setHealth] = useState<Health | null>(null);
  const [healthLoading, setHealthLoading] = useState(false);
  const [logs, setLogs] = useState<SyncLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [mappings, setMappings] = useState<StageMap[]>([]);
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);

  const failingCount = useMemo(
    () => logs.filter((l) => l.status === "error").length,
    [logs],
  );

  const runHealthCheck = async () => {
    setHealthLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("hubspot-health-check");
      if (error) throw error;
      setHealth(data as Health);
      if ((data as Health).ok) toast.success("HubSpot auth healthy");
      else toast.error((data as Health).error || "HubSpot auth failed");
    } catch (err: any) {
      const fail: Health = { ok: false, checked_at: new Date().toISOString(), error: err?.message || "Health check failed" };
      setHealth(fail);
      toast.error(fail.error!);
    } finally {
      setHealthLoading(false);
    }
  };

  const loadLogs = async () => {
    setLogsLoading(true);
    try {
      const { data, error } = await supabase
        .from("hubspot_sync_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(PAGE_SIZE);
      if (error) throw error;
      setLogs((data as SyncLog[]) || []);
    } catch (err: any) {
      toast.error(`Failed to load logs: ${err?.message || err}`);
    } finally {
      setLogsLoading(false);
    }
  };

  const loadMappings = async () => {
    const [{ data: maps }, { data: pls }] = await Promise.all([
      supabase
        .from("hubspot_pipeline_stage_map")
        .select("*")
        .order("naitive_stage_name"),
      supabase.from("deal_pipelines").select("id, name"),
    ]);
    setMappings((maps as StageMap[]) || []);
    setPipelines((pls as Pipeline[]) || []);
  };

  useEffect(() => {
    runHealthCheck();
    loadLogs();
    loadMappings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!is5thLine) {
    return (
      <div className="p-8">
        <p className="text-muted-foreground">This page is restricted to internal admins.</p>
      </div>
    );
  }

  const pipelineName = (id: string) => pipelines.find((p) => p.id === id)?.name || id;

  const statusBadge = (status: string) => {
    const variant: Record<string, string> = {
      success: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
      error: "bg-destructive/15 text-destructive",
      skipped: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
    };
    return (
      <Badge variant="outline" className={variant[status] || ""}>
        {status}
      </Badge>
    );
  };

  return (
    <div className="container mx-auto p-6 space-y-6 max-w-7xl">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" asChild>
            <Link to="/integrations">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-semibold">HubSpot Sync Health</h1>
            <p className="text-sm text-muted-foreground">
              Auth status, recent sync activity, failures, and stage mappings.
            </p>
          </div>
        </div>
        <Button onClick={() => { runHealthCheck(); loadLogs(); loadMappings(); }} disabled={healthLoading || logsLoading} size="sm">
          <RefreshCcw className={`h-4 w-4 mr-2 ${healthLoading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* Top status row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Auth status</CardDescription>
            <CardTitle className="flex items-center gap-2 text-lg">
              {health?.ok ? (
                <><CheckCircle2 className="h-5 w-5 text-emerald-500" /> Connected</>
              ) : (
                <><XCircle className="h-5 w-5 text-destructive" /> {health?.error ? "Failing" : "Unknown"}</>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground space-y-1">
            {health?.checked_at && (
              <div>Checked {formatDistanceToNow(new Date(health.checked_at), { addSuffix: true })}</div>
            )}
            {typeof health?.http_status === "number" && <div>HTTP {health.http_status} · {health.latency_ms}ms</div>}
            {health?.error && <div className="text-destructive break-words">{health.error}</div>}
            <Button size="sm" variant="outline" className="mt-2" onClick={runHealthCheck} disabled={healthLoading}>
              Run health check
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Recent failures (last {PAGE_SIZE} events)</CardDescription>
            <CardTitle className="flex items-center gap-2 text-lg">
              {failingCount > 0 ? (
                <><AlertTriangle className="h-5 w-5 text-destructive" /> {failingCount} failing</>
              ) : (
                <><CheckCircle2 className="h-5 w-5 text-emerald-500" /> All clear</>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            {failingCount > 0
              ? "Review the Failures tab below for details and remediation."
              : "No errors logged in the most recent activity window."}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Stage mappings configured</CardDescription>
            <CardTitle className="text-lg">{mappings.length}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            Mappings drive Naitive → HubSpot stage pushes. Missing or mismatched names will cause skipped syncs.
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="recent" className="space-y-4">
        <TabsList>
          <TabsTrigger value="recent">Recent activity ({logs.length})</TabsTrigger>
          <TabsTrigger value="failures">Failures ({failingCount})</TabsTrigger>
          <TabsTrigger value="mappings">Stage mappings ({mappings.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="recent">
          <LogTable logs={logs} loading={logsLoading} statusBadge={statusBadge} />
        </TabsContent>

        <TabsContent value="failures">
          <LogTable
            logs={logs.filter((l) => l.status === "error")}
            loading={logsLoading}
            statusBadge={statusBadge}
            emptyMessage="No errors in the recent activity window."
          />
        </TabsContent>

        <TabsContent value="mappings">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Naitive → HubSpot stage map</CardTitle>
              <CardDescription>
                The stage-push function looks up these rows. Names are matched exact, case-insensitive, then normalized.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="max-h-[60vh]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Naitive pipeline</TableHead>
                      <TableHead>Naitive stage</TableHead>
                      <TableHead>HubSpot pipeline ID</TableHead>
                      <TableHead>HubSpot dealstage ID</TableHead>
                      <TableHead className="text-right">Updated</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {mappings.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                          No mappings configured.
                        </TableCell>
                      </TableRow>
                    ) : (
                      mappings.map((m) => (
                        <TableRow key={m.id}>
                          <TableCell className="font-medium">{pipelineName(m.naitive_pipeline_id)}</TableCell>
                          <TableCell>{m.naitive_stage_name}</TableCell>
                          <TableCell className="font-mono text-xs">{m.hubspot_pipeline_id}</TableCell>
                          <TableCell className="font-mono text-xs">{m.hubspot_dealstage_id}</TableCell>
                          <TableCell className="text-right text-xs text-muted-foreground">
                            {formatDistanceToNow(new Date(m.updated_at), { addSuffix: true })}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function LogTable({
  logs,
  loading,
  statusBadge,
  emptyMessage = "No sync events yet.",
}: {
  logs: SyncLog[];
  loading: boolean;
  statusBadge: (s: string) => JSX.Element;
  emptyMessage?: string;
}) {
  return (
    <Card>
      <CardContent className="p-0">
        <ScrollArea className="max-h-[60vh]">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[160px]">When</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Direction</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Deal</TableHead>
                <TableHead>HubSpot deal</TableHead>
                <TableHead>Detail</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Loading…</TableCell></TableRow>
              ) : logs.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">{emptyMessage}</TableCell></TableRow>
              ) : (
                logs.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(l.created_at), { addSuffix: true })}
                    </TableCell>
                    <TableCell className="text-xs">{l.action}</TableCell>
                    <TableCell className="text-xs">{l.direction}</TableCell>
                    <TableCell>{statusBadge(l.status)}</TableCell>
                    <TableCell className="text-xs">
                      {l.deal_id ? (
                        <Link to={`/deals/${l.deal_id}`} className="inline-flex items-center gap-1 hover:underline">
                          {l.deal_id.slice(0, 8)}… <ExternalLink className="h-3 w-3" />
                        </Link>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {l.hubspot_deal_id ? (
                        <a
                          href={`https://app.hubspot.com/contacts/0/deal/${l.hubspot_deal_id}`}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 hover:underline"
                        >
                          {l.hubspot_deal_id} <ExternalLink className="h-3 w-3" />
                        </a>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-xs max-w-[420px]">
                      {l.error_message ? (
                        <span className="text-destructive break-words">{l.error_message}</span>
                      ) : l.response_payload ? (
                        <span className="text-muted-foreground break-words">
                          {JSON.stringify(l.response_payload).slice(0, 160)}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
