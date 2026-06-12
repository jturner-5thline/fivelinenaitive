import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { RefreshCcw, ShieldCheck, ShieldAlert, Wrench } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface TenantRow {
  companyId: string;
  name: string;
  seededAt: string | null;
  seedVersion: string | null;
  expectedSeedVersion: string;
  ok: boolean;
  counts: Record<string, number>;
  targets: Record<string, number>;
  missing: Record<string, number>;
  pipelineId: string | null;
}

const FIELDS: Array<{ key: keyof TenantRow["counts"]; label: string }> = [
  { key: "deals", label: "Deals" },
  { key: "contacts", label: "Contacts" },
  { key: "crmCompanies", label: "Companies" },
  { key: "tasks", label: "Tasks" },
  { key: "fundingSources", label: "Funding sources" },
];

export function DemoSeedHealthPanel() {
  const [rows, setRows] = useState<TenantRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [repairing, setRepairing] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("demo-metrics", { body: {} });
      if (error) throw error;
      setRows((data as { tenants: TenantRow[] })?.tenants ?? []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load demo metrics");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const repair = async (companyId: string) => {
    setRepairing(companyId);
    try {
      const { data, error } = await supabase.functions.invoke("repair-demo-tenant", {
        body: { companyId },
      });
      if (error) throw error;
      const ok = (data as { seeded?: { ok?: boolean } })?.seeded?.ok;
      toast.success(ok ? "Demo tenant repaired" : "Repair ran — see metrics");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Repair failed");
    } finally {
      setRepairing(null);
    }
  };

  const healthy = rows?.filter((r) => r.ok).length ?? 0;
  const unhealthy = rows ? rows.length - healthy : 0;

  return (
    <Card className="mb-4">
      <CardHeader className="flex flex-row items-start justify-between gap-2">
        <div>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5" />
            Demo Seed Health
          </CardTitle>
          <CardDescription>
            Canonical provisioning template — expected vs actual counts per demo tenant.
            Repair runs the same shared provisioning service (idempotent, no duplicates).
          </CardDescription>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCcw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </CardHeader>
      <CardContent>
        <div className="flex gap-3 mb-3 text-sm">
          <Badge variant="outline" className="border-emerald-500/30 text-emerald-300">
            {healthy} healthy
          </Badge>
          <Badge variant="outline" className={unhealthy ? "border-amber-500/30 text-amber-300" : ""}>
            {unhealthy} need repair
          </Badge>
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tenant</TableHead>
                {FIELDS.map((f) => <TableHead key={f.key} className="text-right">{f.label}</TableHead>)}
                <TableHead>Pipeline</TableHead>
                <TableHead>Seed v</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(rows ?? []).map((r) => (
                <TableRow key={r.companyId}>
                  <TableCell className="font-medium">{r.name}</TableCell>
                  {FIELDS.map((f) => {
                    const cur = r.counts[f.key] ?? 0;
                    const tgt = r.targets[f.key] ?? 0;
                    const short = cur < tgt;
                    return (
                      <TableCell key={f.key} className={`text-right tabular-nums ${short ? "text-amber-300" : ""}`}>
                        {cur}/{tgt}
                      </TableCell>
                    );
                  })}
                  <TableCell>
                    {r.pipelineId ? <Badge variant="outline">ok</Badge> : <Badge variant="destructive">missing</Badge>}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {r.seedVersion ?? "—"}{r.seedVersion && r.seedVersion !== r.expectedSeedVersion ? ` (exp ${r.expectedSeedVersion})` : ""}
                  </TableCell>
                  <TableCell>
                    {r.ok ? (
                      <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/30">healthy</Badge>
                    ) : (
                      <Badge className="bg-amber-500/20 text-amber-300 border-amber-500/30 flex items-center gap-1 w-fit">
                        <ShieldAlert className="h-3 w-3" /> incomplete
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="outline" size="sm"
                      onClick={() => repair(r.companyId)}
                      disabled={repairing === r.companyId}
                    >
                      <Wrench className="h-3.5 w-3.5 mr-1" />
                      {repairing === r.companyId ? "Repairing…" : r.ok ? "Reverify" : "Repair"}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {!loading && rows && rows.length === 0 && (
                <TableRow><TableCell colSpan={FIELDS.length + 5} className="text-center text-muted-foreground py-6">No demo tenants found.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}