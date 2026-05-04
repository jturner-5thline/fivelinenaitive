import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type UsageDateRangeKey = "this-week" | "this-month" | "last-30" | "custom";

export interface UsageDateRange {
  key: UsageDateRangeKey;
  start: Date;
  end: Date;
}

export interface CompanyUsageRow {
  company_id: string;
  company_name: string;
  active_users: number;
  ai_chat_calls: number;
  email_drafts: number;
  lender_submissions: number;
  deal_space_lookups: number;
  write_ups: number;
  agents_run: number;
  data_room_actions: number;
  total_ai_calls: number;
  token_usage: number;
}

const AI_FEATURE_TYPES = new Set([
  "AI_CHAT",
  "DEAL_SPACE_AI_LOOKUP",
  "WRITE_UP_GENERATED",
  "AGENT_RUN",
]);

function startOfDay(d: Date): Date {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  return out;
}

function startOfWeek(d: Date): Date {
  const out = startOfDay(d);
  const day = out.getDay(); // 0 = Sun
  out.setDate(out.getDate() - day);
  return out;
}

function startOfMonth(d: Date): Date {
  const out = startOfDay(d);
  out.setDate(1);
  return out;
}

export function buildDateRange(key: UsageDateRangeKey, customStart?: Date, customEnd?: Date): UsageDateRange {
  const now = new Date();
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);

  switch (key) {
    case "this-week":
      return { key, start: startOfWeek(now), end };
    case "this-month":
      return { key, start: startOfMonth(now), end };
    case "last-30": {
      const start = startOfDay(now);
      start.setDate(start.getDate() - 29);
      return { key, start, end };
    }
    case "custom": {
      const start = customStart ? startOfDay(customStart) : startOfDay(now);
      const e = customEnd ? new Date(customEnd) : end;
      e.setHours(23, 59, 59, 999);
      return { key, start, end: e };
    }
  }
}

interface UsageEventRow {
  user_id: string;
  company_id: string | null;
  feature_type: string;
  feature_subtype: string | null;
  token_count: number | null;
}

export function useCompanyUsageOverview(range: UsageDateRange) {
  const [rows, setRows] = useState<CompanyUsageRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setIsLoading(true);
      setError(null);
      try {
        // Page through usage_events to bypass the 1k row default limit.
        const PAGE_SIZE = 1000;
        const events: UsageEventRow[] = [];
        let from = 0;
        // Cap at 50k events per range to keep the dashboard responsive.
        const HARD_CAP = 50000;
        // eslint-disable-next-line no-constant-condition
        while (true) {
          const { data, error: qErr } = await supabase
            .from("usage_events")
            .select("user_id, company_id, feature_type, feature_subtype, token_count")
            .gte("timestamp", range.start.toISOString())
            .lte("timestamp", range.end.toISOString())
            .range(from, from + PAGE_SIZE - 1);
          if (qErr) throw qErr;
          const batch = (data ?? []) as UsageEventRow[];
          events.push(...batch);
          if (batch.length < PAGE_SIZE || events.length >= HARD_CAP) break;
          from += PAGE_SIZE;
        }

        // Get company names for any company_id we saw.
        const companyIds = Array.from(
          new Set(events.map((e) => e.company_id).filter((v): v is string => !!v)),
        );
        let nameMap = new Map<string, string>();
        if (companyIds.length > 0) {
          const { data: companies, error: cErr } = await supabase
            .from("companies")
            .select("id, name")
            .in("id", companyIds);
          if (cErr) throw cErr;
          nameMap = new Map((companies ?? []).map((c) => [c.id, c.name]));
        }

        // Aggregate per company.
        const byCompany = new Map<string, CompanyUsageRow & { _users: Set<string> }>();
        for (const ev of events) {
          const cid = ev.company_id || "__no_company__";
          let row = byCompany.get(cid);
          if (!row) {
            row = {
              company_id: cid,
              company_name:
                cid === "__no_company__"
                  ? "(No workspace)"
                  : nameMap.get(cid) || "Unknown Company",
              active_users: 0,
              ai_chat_calls: 0,
              email_drafts: 0,
              lender_submissions: 0,
              deal_space_lookups: 0,
              write_ups: 0,
              agents_run: 0,
              data_room_actions: 0,
              total_ai_calls: 0,
              token_usage: 0,
              _users: new Set<string>(),
            };
            byCompany.set(cid, row);
          }
          if (ev.user_id) row._users.add(ev.user_id);

          switch (ev.feature_type) {
            case "AI_CHAT": row.ai_chat_calls += 1; break;
            case "EMAIL_DRAFT": row.email_drafts += 1; break;
            case "LENDER_SUBMISSION": row.lender_submissions += 1; break;
            case "DEAL_SPACE_AI_LOOKUP": row.deal_space_lookups += 1; break;
            case "WRITE_UP_GENERATED": row.write_ups += 1; break;
            case "AGENT_RUN": row.agents_run += 1; break;
            case "DATA_ROOM_UPLOAD":
            case "DATA_ROOM_DOWNLOAD":
              row.data_room_actions += 1;
              break;
          }
          if (AI_FEATURE_TYPES.has(ev.feature_type)) {
            row.total_ai_calls += 1;
            row.token_usage += ev.token_count ?? 0;
          }
        }

        const finalized: CompanyUsageRow[] = Array.from(byCompany.values()).map((r) => ({
          ...r,
          active_users: r._users.size,
        }));

        if (!cancelled) setRows(finalized);
      } catch (err) {
        if (!cancelled) {
          console.error("[useCompanyUsageOverview]", err);
          setError(err instanceof Error ? err.message : "Failed to load usage");
          setRows([]);
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [range.start.getTime(), range.end.getTime()]);

  return useMemo(() => ({ rows, isLoading, error }), [rows, isLoading, error]);
}