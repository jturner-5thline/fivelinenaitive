import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { RefreshCcw, ShieldCheck, ShieldAlert, Wrench, UserCog, ExternalLink } from "lucide-react";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAdminRole } from "@/hooks/useAdminRole";
import { ImpersonateDemoDialog, type ImpersonateTarget } from "./ImpersonateDemoDialog";

interface TenantMember {
  userId: string;
  email: string | null;
  fullName: string | null;
  role: string;
  addedAt: string | null;
  lastSignInAt: string | null;
}

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
  members?: TenantMember[];
}

const FIELDS: Array<{ key: keyof TenantRow["counts"]; label: string }> = [
  { key: "deals", label: "Deals" },
  { key: "contacts", label: "Contacts" },
  { key: "crmCompanies", label: "Companies" },
  { key: "tasks", label: "Tasks" },
  { key: "fundingSources", label: "Funding sources" },
  { key: "calendarEvents", label: "Calendar" },
  { key: "inboxEmails", label: "Inbox" },
  { key: "dealActivities", label: "Activity" },
];

export function DemoSeedHealthPanel() {
  const [rows, setRows] = useState<TenantRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [repairing, setRepairing] = useState<string | null>(null);
  const { isAdmin } = useAdminRole();
  const [impersonateTarget, setImpersonateTarget] = useState<ImpersonateTarget | null>(null);

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

  const buildTarget = (r: TenantRow, m: TenantMember): ImpersonateTarget => ({
    userId: m.userId,
    email: m.email ?? "",
    fullName: m.fullName,
    companyId: r.companyId,
    companyName: r.name,
    seededOk: r.ok,
    seededAt: r.seededAt,
  });

  const openTenantWorkspace = (r: TenantRow) => {
    const eligible = (r.members ?? []).filter((m) => !!m.email);
    if (eligible.length === 1) {
      setImpersonateTarget(buildTarget(r, eligible[0]));
    } else if (eligible.length === 0) {
      toast.error("No demo user is linked to this tenant yet. Run Repair to provision.");
    }
    // multiple → handled by dropdown menu trigger directly
  };

  const allMembers = useMemo(() => {
    return (rows ?? []).flatMap((r) =>
      (r.members ?? []).map((m) => ({ tenant: r, member: m })),
    );
  }, [rows]);

  const eligibleMembers = allMembers.filter(({ member }) => !!member.email);

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
        <div className="flex items-center gap-2">
          {isAdmin && eligibleMembers.length > 0 && (
            eligibleMembers.length === 1 ? (
              <Button
                size="sm"
                onClick={() => setImpersonateTarget(buildTarget(eligibleMembers[0].tenant, eligibleMembers[0].member))}
              >
                <UserCog className="h-4 w-4 mr-2" />
                Open demo workspace
              </Button>
            ) : (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm">
                    <UserCog className="h-4 w-4 mr-2" />
                    Open demo workspace
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-72">
                  <DropdownMenuLabel>Pick a demo user</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {eligibleMembers.map(({ tenant, member }) => (
                    <DropdownMenuItem
                      key={`${tenant.companyId}-${member.userId}`}
                      onSelect={() => setImpersonateTarget(buildTarget(tenant, member))}
                    >
                      <div className="flex flex-col">
                        <span className="font-medium">{member.email}</span>
                        <span className="text-xs text-muted-foreground">{tenant.name}</span>
                      </div>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )
          )}
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCcw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
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
                    <div className="flex items-center justify-end gap-2">
                      {(() => {
                        const eligible = (r.members ?? []).filter((m) => !!m.email);
                        if (eligible.length > 1) {
                          return (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="outline" size="sm">
                                  <UserCog className="h-3.5 w-3.5 mr-1" /> Open
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-64">
                                <DropdownMenuLabel>Pick a demo user</DropdownMenuLabel>
                                <DropdownMenuSeparator />
                                {eligible.map((m) => (
                                  <DropdownMenuItem key={m.userId} onSelect={() => setImpersonateTarget(buildTarget(r, m))}>
                                    {m.email}
                                  </DropdownMenuItem>
                                ))}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          );
                        }
                        if (eligible.length === 1) {
                          return (
                            <Button variant="outline" size="sm" onClick={() => openTenantWorkspace(r)}>
                              <UserCog className="h-3.5 w-3.5 mr-1" /> Open
                            </Button>
                          );
                        }
                        return null;
                      })()}
                      <Button
                        variant="outline" size="sm"
                        onClick={() => repair(r.companyId)}
                        disabled={repairing === r.companyId}
                      >
                        <Wrench className="h-3.5 w-3.5 mr-1" />
                        {repairing === r.companyId ? "Repairing…" : r.ok ? "Reverify" : "Repair"}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {!loading && rows && rows.length === 0 && (
                <TableRow><TableCell colSpan={FIELDS.length + 5} className="text-center text-muted-foreground py-6">No demo tenants found.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        {isAdmin && rows && rows.length > 0 && (
          <div className="mt-6">
            <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
              <UserCog className="h-4 w-4" /> Demo users
            </h3>
            <p className="text-xs text-muted-foreground mb-3">
              Open any demo workspace as that user. The admin session is preserved
              when you choose &ldquo;open in new tab&rdquo;.
            </p>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Demo user</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Demo account</TableHead>
                    <TableHead>Seed</TableHead>
                    <TableHead>Last sign-in</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.flatMap((r) =>
                    (r.members ?? []).map((m) => (
                      <TableRow key={`${r.companyId}-${m.userId}`}>
                        <TableCell className="font-medium">{m.fullName || "—"}</TableCell>
                        <TableCell className="text-muted-foreground">{m.email || "—"}</TableCell>
                        <TableCell>{r.name}</TableCell>
                        <TableCell>
                          {r.ok
                            ? <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/30">healthy</Badge>
                            : <Badge className="bg-amber-500/20 text-amber-300 border-amber-500/30">incomplete</Badge>}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {m.lastSignInAt ? new Date(m.lastSignInAt).toLocaleString() : "—"}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              size="sm"
                              disabled={!m.email}
                              onClick={() => m.email && setImpersonateTarget(buildTarget(r, m))}
                            >
                              <UserCog className="h-3.5 w-3.5 mr-1" />
                              Open demo workspace
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    )),
                  )}
                  {rows.every((r) => !(r.members?.length)) && (
                    <TableRow>
                      <TableCell colSpan={6} className="py-6">
                        <div className="flex flex-col items-center gap-2 text-center">
                          <div className="text-sm text-muted-foreground">
                            No provisioned demo users found for current demo tenants.
                          </div>
                          <div className="text-xs text-muted-foreground">
                            Demo tenants exist but no demo auth user is linked. Repair will
                            provision the canonical demo user and seed data.
                          </div>
                          <div className="flex gap-2 mt-1">
                            <Button size="sm" variant="outline" onClick={load} disabled={loading}>
                              <RefreshCcw className={`h-3.5 w-3.5 mr-1 ${loading ? "animate-spin" : ""}`} /> Refresh
                            </Button>
                            {rows.map((r) => (
                              <Button
                                key={r.companyId}
                                size="sm"
                                variant="outline"
                                onClick={() => repair(r.companyId)}
                                disabled={repairing === r.companyId}
                              >
                                <Wrench className="h-3.5 w-3.5 mr-1" /> Repair {r.name}
                              </Button>
                            ))}
                          </div>
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        )}

        <ImpersonateDemoDialog
          open={!!impersonateTarget}
          onOpenChange={(v) => { if (!v) setImpersonateTarget(null); }}
          target={impersonateTarget}
          onAfterRepair={load}
        />
      </CardContent>
    </Card>
  );
}