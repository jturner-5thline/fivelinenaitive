import { useEffect, useMemo, useState } from "react";
import { Helmet } from "react-helmet-async";
import { supabase } from "@/integrations/supabase/client";
import { useAdminRole } from "@/hooks/useAdminRole";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Download, Play } from "lucide-react";
import { toast } from "sonner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const NIKI_USER_ID = "a757f375-7e93-4fc5-a49e-e371abb42fac";
const NIKI_NAME = "Niki Heikali";

interface AuditRow {
  deal_id: string;
  deal_name: string;
  current_owner: string | null;
  current_owner_user_id: string | null;
  proposed_owner: string | null;
  proposed_owner_user_id: string | null;
  current_status: string | null;
  proposed_status: string | null;
  current_stage: string | null;
  current_closed_at: string | null;
  current_lost_at: string | null;
  proposed_lost_at: string | null;
  current_terms_issued_at: string | null;
  proposed_terms_issued_at: string | null;
  current_terms_signed_at: string | null;
  current_fiscal_bucket: string | null;
  proposed_fiscal_bucket: string | null;
  match_confidence: number;
  change_type: "set_owner" | "mark_lost" | "stamp_terms_issued" | "review";
  notes: string | null;
}

interface AuditSummary {
  rep_user_id: string;
  rep_name: string;
  rep_email: string;
  will_attribute: number;
  will_mark_lost: number;
  will_stamp_terms_issued: number;
  will_requarter: number;
  total_rows: number;
  generated_at: string;
}

interface AuditResult {
  run_id: string;
  summary: AuditSummary;
  rows: AuditRow[];
  bbp_candidates?: Array<{
    deal_id: string;
    deal_name: string;
    deal_owner: string | null;
    manager: string | null;
    stage: string | null;
    status: string | null;
    score: number;
  }>;
}

const changeBg: Record<AuditRow["change_type"], string> = {
  set_owner: "bg-green-500/10",
  stamp_terms_issued: "bg-green-500/10",
  mark_lost: "bg-red-500/10",
  review: "bg-yellow-500/10",
};

function fmt(ts: string | null): string {
  if (!ts) return "—";
  try {
    return new Date(ts).toISOString().slice(0, 10);
  } catch {
    return ts;
  }
}

function toCsv(rows: AuditRow[]): string {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]) as (keyof AuditRow)[];
  const esc = (v: unknown) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [
    headers.join(","),
    ...rows.map((r) => headers.map((h) => esc(r[h])).join(",")),
  ].join("\n");
}

export default function PerformanceAudit() {
  const { isAdmin, isLoading: isAdminLoading } = useAdminRole();
  const [repUserId] = useState<string>(NIKI_USER_ID);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<AuditResult | null>(null);
  const [autoRan, setAutoRan] = useState(false);

  const runDryRun = async () => {
    setRunning(true);
    try {
      const { data, error } = await (supabase as any).rpc("rep_audit_dry_run", {
        rep_user_id: repUserId,
      });
      if (error) throw error;
      setResult(data as AuditResult);
      toast.success("Dry-run complete");
    } catch (err: any) {
      console.error(err);
      toast.error(`Dry-run failed: ${err?.message ?? err}`);
    } finally {
      setRunning(false);
    }
  };

  // Auto-run on first admin load
  useEffect(() => {
    if (isAdmin && !autoRan) {
      setAutoRan(true);
      void runDryRun();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin, autoRan]);

  const groupedRows = useMemo(() => {
    if (!result) return [] as AuditRow[];
    const order: AuditRow["change_type"][] = [
      "mark_lost",
      "stamp_terms_issued",
      "set_owner",
      "review",
    ];
    return [...result.rows].sort(
      (a, b) =>
        order.indexOf(a.change_type) - order.indexOf(b.change_type) ||
        a.deal_name.localeCompare(b.deal_name),
    );
  }, [result]);

  const downloadCsv = () => {
    if (!result) return;
    const blob = new Blob([toCsv(groupedRows)], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `rep-audit-${result.summary.rep_name.replace(/\s+/g, "_")}-${new Date()
      .toISOString()
      .slice(0, 19)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (isAdminLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="container mx-auto px-6 py-12">
        <h1 className="text-xl font-semibold text-foreground">Forbidden</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Admin access is required to view the Performance Audit.
        </p>
      </div>
    );
  }

  const recentEnough =
    result &&
    Date.now() - new Date(result.summary.generated_at).getTime() < 10 * 60 * 1000;

  return (
    <div className="container mx-auto px-6 py-8">
      <Helmet>
        <title>Performance Audit — Owner & Anchor Backfill</title>
      </Helmet>

      <header className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">
            Performance Audit — Owner & Anchor Backfill
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Rep: <span className="font-medium">{NIKI_NAME}</span> · Period: FY 2026
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={runDryRun} disabled={running} variant="outline">
            {running ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Play className="h-4 w-4" />
            )}
            Dry-run
          </Button>
          <Button
            disabled={!recentEnough}
            title={
              recentEnough
                ? "Apply changes"
                : "Run a dry-run within the last 10 minutes to enable"
            }
          >
            Apply changes
          </Button>
          <Button variant="ghost" onClick={downloadCsv} disabled={!result}>
            <Download className="h-4 w-4" />
            CSV
          </Button>
        </div>
      </header>

      {result && (
        <Card className="mb-6 p-5">
          <div className="text-sm text-muted-foreground">Summary</div>
          <div className="mt-1 text-base text-foreground">
            <span className="font-semibold">{result.summary.will_attribute}</span>{" "}
            deals will be owner-attributed to {result.summary.rep_name},{" "}
            <span className="font-semibold">{result.summary.will_mark_lost}</span>{" "}
            will be marked lost,{" "}
            <span className="font-semibold">
              {result.summary.will_stamp_terms_issued}
            </span>{" "}
            terms_issued anchor(s) stamped,{" "}
            <span className="font-semibold">{result.summary.will_requarter}</span>{" "}
            re-quartered. Total candidates:{" "}
            <span className="font-semibold">{result.summary.total_rows}</span>.
          </div>
          <div className="mt-2 text-xs text-muted-foreground">
            run_id: <code>{result.run_id}</code> · generated{" "}
            {fmt(result.summary.generated_at)}
          </div>
        </Card>
      )}

      {running && !result && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Running dry-run…
        </div>
      )}

      {result && (
        <Card className="overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Deal</TableHead>
                <TableHead>Change</TableHead>
                <TableHead>Current owner</TableHead>
                <TableHead>Proposed owner</TableHead>
                <TableHead>Current status</TableHead>
                <TableHead>Proposed status</TableHead>
                <TableHead>closed_at</TableHead>
                <TableHead>lost_at (cur → prop)</TableHead>
                <TableHead>terms_issued (cur → prop)</TableHead>
                <TableHead>Bucket (cur → prop)</TableHead>
                <TableHead>Conf.</TableHead>
                <TableHead>Notes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {groupedRows.map((r) => (
                <TableRow key={r.deal_id} className={changeBg[r.change_type]}>
                  <TableCell className="font-medium">{r.deal_name}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{r.change_type}</Badge>
                  </TableCell>
                  <TableCell className="text-xs">
                    {r.current_owner ?? "—"}
                  </TableCell>
                  <TableCell className="text-xs">
                    {r.proposed_owner ?? "—"}
                  </TableCell>
                  <TableCell className="text-xs">{r.current_status ?? "—"}</TableCell>
                  <TableCell className="text-xs">
                    {r.proposed_status ?? "—"}
                  </TableCell>
                  <TableCell className="text-xs">{fmt(r.current_closed_at)}</TableCell>
                  <TableCell className="text-xs">
                    {fmt(r.current_lost_at)} → {fmt(r.proposed_lost_at)}
                  </TableCell>
                  <TableCell className="text-xs">
                    {fmt(r.current_terms_issued_at)} →{" "}
                    {fmt(r.proposed_terms_issued_at)}
                  </TableCell>
                  <TableCell className="text-xs">
                    {r.current_fiscal_bucket ?? "—"} →{" "}
                    {r.proposed_fiscal_bucket ?? "—"}
                  </TableCell>
                  <TableCell className="text-xs">
                    {(r.match_confidence * 100).toFixed(0)}%
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground max-w-xs">
                    {r.notes}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}