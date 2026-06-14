import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Search, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

/**
 * Admin → Agent Access.
 *
 * Company × Agent entitlement matrix. Master gate that sits ABOVE
 * any per-user agent activation flag. Rows = companies. Columns = agents.
 * Cells = enabled toggle + access mode select. Persists to
 * `company_agent_access` (RLS restricts writes to platform admins).
 *
 * Extend SUPPORTED_AGENTS as new agents come online; nothing else has
 * to change here.
 */
const SUPPORTED_AGENTS: Array<{ key: string; label: string; description: string }> = [
  {
    key: "admin_agent",
    label: "Admin Agent",
    description:
      "Verifies deal information, captures follow-ups, and runs the Friday proactive sweep.",
  },
];

const ACCESS_MODES = ["disabled", "enabled", "pilot", "internal"] as const;
type AccessMode = (typeof ACCESS_MODES)[number];

type CompanyRow = { id: string; name: string };
type AccessRow = {
  id: string;
  company_id: string;
  agent_key: string;
  is_enabled: boolean;
  access_mode: AccessMode | null;
};

export function AgentAccessPanel() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [search, setSearch] = useState("");

  const companiesQ = useQuery<CompanyRow[]>({
    queryKey: ["agent-access-companies"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("companies")
        .select("id, name")
        .order("name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as CompanyRow[];
    },
  });

  const accessQ = useQuery<AccessRow[]>({
    queryKey: ["agent-access-rows"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("company_agent_access")
        .select("id, company_id, agent_key, is_enabled, access_mode");
      if (error) throw error;
      return (data ?? []) as AccessRow[];
    },
  });

  const byCompanyAgent = useMemo(() => {
    const m = new Map<string, AccessRow>();
    for (const r of accessQ.data ?? []) {
      m.set(`${r.company_id}::${r.agent_key}`, r);
    }
    return m;
  }, [accessQ.data]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = companiesQ.data ?? [];
    if (!q) return list;
    return list.filter((c) => c.name.toLowerCase().includes(q));
  }, [companiesQ.data, search]);

  async function upsertAccess(
    companyId: string,
    agentKey: string,
    patch: { is_enabled?: boolean; access_mode?: AccessMode | null },
  ) {
    const existing = byCompanyAgent.get(`${companyId}::${agentKey}`);
    const row = {
      company_id: companyId,
      agent_key: agentKey,
      is_enabled: patch.is_enabled ?? existing?.is_enabled ?? false,
      access_mode:
        patch.access_mode !== undefined
          ? patch.access_mode
          : existing?.access_mode ?? null,
      enabled_by: user?.id ?? null,
    };
    const { error } = await supabase
      .from("company_agent_access")
      .upsert(row, { onConflict: "company_id,agent_key" });
    if (error) {
      toast.error(error.message);
      return;
    }
    await qc.invalidateQueries({ queryKey: ["agent-access-rows"] });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5" />
          Agent Access
        </CardTitle>
        <CardDescription>
          Master company-by-company entitlement for each AI agent. This gate sits above
          per-user activation — both must be on for an agent to run.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="relative max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search companies…"
            className="pl-8"
          />
        </div>

        {companiesQ.isLoading || accessQ.isLoading ? (
          <Skeleton className="h-64 w-full" />
        ) : (
          <div className="overflow-x-auto rounded-md border border-border/60">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="text-left px-3 py-2">Company</th>
                  {SUPPORTED_AGENTS.map((a) => (
                    <th key={a.key} className="text-left px-3 py-2" title={a.description}>
                      {a.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) => (
                  <tr key={c.id} className="border-t border-border/60">
                    <td className="px-3 py-2 font-medium">{c.name}</td>
                    {SUPPORTED_AGENTS.map((a) => {
                      const row = byCompanyAgent.get(`${c.id}::${a.key}`);
                      const enabled = !!row?.is_enabled;
                      const mode = (row?.access_mode ?? (enabled ? "enabled" : "disabled")) as AccessMode;
                      return (
                        <td key={a.key} className="px-3 py-2">
                          <div className="flex items-center gap-3">
                            <Switch
                              checked={enabled}
                              onCheckedChange={(v) =>
                                upsertAccess(c.id, a.key, {
                                  is_enabled: v,
                                  access_mode: v ? (mode === "disabled" ? "enabled" : mode) : "disabled",
                                })
                              }
                            />
                            <Select
                              value={mode}
                              onValueChange={(v) =>
                                upsertAccess(c.id, a.key, {
                                  access_mode: v as AccessMode,
                                  is_enabled: v !== "disabled",
                                })
                              }
                            >
                              <SelectTrigger className="h-7 w-[110px] text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {ACCESS_MODES.map((m) => (
                                  <SelectItem key={m} value={m} className="text-xs capitalize">
                                    {m}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            {enabled ? (
                              <Badge variant="secondary" className="text-[10px] capitalize">
                                {mode}
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-[10px] text-muted-foreground">
                                Off
                              </Badge>
                            )}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td
                      colSpan={1 + SUPPORTED_AGENTS.length}
                      className="px-3 py-6 text-center text-muted-foreground"
                    >
                      No companies match "{search}".
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
