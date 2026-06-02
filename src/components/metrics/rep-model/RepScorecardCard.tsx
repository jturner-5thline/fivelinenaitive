import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { AlertTriangle, Info } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useAdminRole } from "@/hooks/useAdminRole";
import {
  useRepScorecard,
  defaultRepScorecardFilter,
  type RepScorecardPeriod,
} from "@/hooks/useRepScorecard";
import { currentFiscalYear } from "@/lib/fiscalQuarter";
import { formatUSD } from "@/lib/formatters/currency";

const PERIODS: { id: RepScorecardPeriod; label: string }[] = [
  { id: 1, label: "Q1" },
  { id: 2, label: "Q2" },
  { id: 3, label: "Q3" },
  { id: 4, label: "Q4" },
  { id: "year", label: "Year" },
];

const PRODUCTION_ROW_KEYS = new Set(["deals_on_board", "dollars_on_board"]);

export function RepScorecardCard() {
  const { user } = useAuth();
  const { isAdmin } = useAdminRole();
  const [filter, setFilter] = useState(() => defaultRepScorecardFilter(user?.id ?? null));

  // Keep filter.userId in sync with auth on first load.
  useEffect(() => {
    if (!filter.userId && user?.id) {
      setFilter(f => ({ ...f, userId: user.id }));
    }
  }, [user?.id, filter.userId]);

  const { data, isLoading } = useRepScorecard(filter);

  const repOptions = useMemo(() => data?.reps ?? [], [data]);
  const years = useMemo(() => {
    const cy = currentFiscalYear();
    return [cy - 1, cy, cy + 1];
  }, []);

  const selectedRep = repOptions.find(r => r.user_id === filter.userId);

  return (
    <Card className="border-border/40 bg-card/40 backdrop-blur">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle className="text-base">Rep Scorecard <Badge variant="outline" className="ml-2 text-[10px]">Live</Badge></CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              Owner-scoped pipeline + milestones, derived from live deal anchors.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={filter.userId ?? undefined}
              onValueChange={v => setFilter(f => ({ ...f, userId: v }))}
              disabled={!isAdmin && repOptions.length <= 1}
            >
              <SelectTrigger className="h-8 w-[200px] text-xs">
                <SelectValue placeholder="Select rep" />
              </SelectTrigger>
              <SelectContent>
                {repOptions.map(r => (
                  <SelectItem key={r.user_id} value={r.user_id} className="text-xs">
                    {r.display_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={String(filter.fiscalYear)}
              onValueChange={v => setFilter(f => ({ ...f, fiscalYear: Number(v) }))}
            >
              <SelectTrigger className="h-8 w-[88px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {years.map(y => (
                  <SelectItem key={y} value={String(y)} className="text-xs">FY {y}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex items-center rounded-md border border-border/50 bg-background/40 p-0.5">
              {PERIODS.map(p => (
                <Button
                  key={String(p.id)}
                  variant={filter.period === p.id ? "secondary" : "ghost"}
                  size="sm"
                  className="h-7 px-2.5 text-xs"
                  onClick={() => setFilter(f => ({ ...f, period: p.id }))}
                >
                  {p.label}
                </Button>
              ))}
            </div>
            <div className="flex items-center gap-2 rounded-md border border-border/50 bg-background/40 px-2 h-8">
              <Switch
                id="active-only"
                checked={filter.activeOnly}
                onCheckedChange={v => setFilter(f => ({ ...f, activeOnly: v }))}
              />
              <Label htmlFor="active-only" className="text-xs cursor-pointer">Active only</Label>
            </div>
          </div>
        </div>

        {isAdmin && (data?.orphanDealCount ?? 0) > 0 && (
          <div className="mt-3 flex items-center gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
            <AlertTriangle className="h-3.5 w-3.5" />
            <span>
              <strong>{data?.orphanDealCount}</strong> milestone-anchored deals are not attributed to any rep. Use the Performance Audit page to resolve.
            </span>
          </div>
        )}
      </CardHeader>

      <CardContent className="pt-0">
        <TooltipProvider>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wider text-muted-foreground border-b border-border/40">
                  <th className="py-2 px-3 font-medium">Metric</th>
                  <th className="py-2 px-3 font-medium text-right">Count</th>
                  <th className="py-2 px-3 font-medium text-right">Dollars</th>
                </tr>
              </thead>
              <tbody>
                {isLoading || !data ? (
                  <tr><td colSpan={3} className="py-6 px-3 text-center text-muted-foreground text-xs">Loading…</td></tr>
                ) : !filter.userId ? (
                  <tr><td colSpan={3} className="py-6 px-3 text-center text-muted-foreground text-xs">Select a rep to view their scorecard.</td></tr>
                ) : (
                  data.rows.map(row => {
                    const isProductionRow = PRODUCTION_ROW_KEYS.has(row.key);
                    const isDollarsRow = row.key === "dollars_on_board";
                    return (
                      <tr key={row.key} className="border-b border-border/20 last:border-0 hover:bg-muted/10">
                        <td className="py-2 px-3">
                          <div className="flex items-center gap-1.5">
                            <span className={row.key === "lost_deals" ? "text-destructive" : ""}>{row.label}</span>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Info className="h-3 w-3 text-muted-foreground/60" />
                              </TooltipTrigger>
                              <TooltipContent className="text-xs max-w-[260px]">
                                Bucketed by <code className="font-mono">{row.anchor}</code>.
                                {isProductionRow && (
                                  <> Pipeline Production row{filter.activeOnly ? " — Active only" : " — includes lost/withdrawn"}.</>
                                )}
                              </TooltipContent>
                            </Tooltip>
                          </div>
                        </td>
                        <td className="py-2 px-3 text-right tabular-nums">{isDollarsRow ? "—" : row.count}</td>
                        <td className="py-2 px-3 text-right tabular-nums">{formatUSD(row.dollars)}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </TooltipProvider>

        {selectedRep && !isLoading && data && (
          <p className="mt-3 text-[11px] text-muted-foreground">
            Showing {data.totalDeals.toLocaleString()} owner-resolved deals for <strong>{selectedRep.display_name}</strong>. Owner matched by explicit FK + legacy name fallback until backfill completes.
          </p>
        )}
      </CardContent>
    </Card>
  );
}