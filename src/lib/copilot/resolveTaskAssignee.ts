/**
 * Pure fuzzy resolver mirroring the server-side logic in
 * `supabase/functions/copilot-chat/index.ts` (case "create_task" builder).
 *
 * Extracted so it can be unit-tested without spinning up the edge function.
 * Bug ref: Asana #1215344941044854 — Copilot was silently defaulting the
 * assignee to the caller whenever the LLM failed to resolve a named teammate.
 */
export interface AssigneeMember {
  user_id: string;
  display_name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
}

export type AssigneeStrategy = "omitted" | "uuid" | "fuzzy_unique" | "ambiguous" | "no_match";

export interface ResolveOptions {
  /** Raw assignee_name from the LLM tool call (verbatim from the user). */
  name?: string | null;
  /** Pre-resolved UUID from the LLM (if it called search_team_members itself). */
  uuid?: string | null;
  /** Roster scoped to the caller's company. */
  members: AssigneeMember[];
  /** UUID of the caller — returned only when both name and uuid are omitted. */
  callerUserId: string;
}

export interface ResolveResult {
  resolvedUserId: string | null;
  strategy: AssigneeStrategy;
  candidates: AssigneeMember[];
  displayName: string | null;
}

const norm = (s: string | null | undefined): string =>
  (s || "").toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9@.\s]/g, "").trim();

export function resolveTaskAssignee(opts: ResolveOptions): ResolveResult {
  const { name, uuid, members, callerUserId } = opts;

  // 1. Explicit UUID wins.
  if (uuid && uuid.trim()) {
    const hit = members.find(m => m.user_id === uuid);
    return {
      resolvedUserId: uuid,
      strategy: "uuid",
      candidates: hit ? [hit] : [],
      displayName: hit?.display_name || hit?.email || null,
    };
  }

  // 2. Name provided → fuzzy match across the roster.
  if (name && name.trim()) {
    const q = norm(name);
    const scored = members.map(p => {
      const first = norm(p.first_name);
      const last = norm(p.last_name);
      const display = norm(p.display_name);
      const email = norm(p.email);
      const emailPrefix = email.split("@")[0] || "";
      const full = `${first} ${last}`.trim();
      let score = 0;
      if (email && email === q) score = 100;
      else if (display && display === q) score = 100;
      else if (full && full === q) score = 100;
      else if (emailPrefix && emailPrefix === q) score = 95;
      else if (q.includes(" ")) {
        const tokens = q.split(/\s+/).filter(Boolean);
        const hay = `${first} ${last} ${display} ${email}`;
        if (tokens.every(t => hay.includes(t))) score = 90;
      } else {
        if (first === q || last === q) score = 85;
        else if (display.startsWith(q) || first.startsWith(q) || last.startsWith(q)) score = 70;
        else if (display.includes(q) || full.includes(q)) score = 55;
        else if (emailPrefix.includes(q)) score = 50;
      }
      return { member: p, score };
    }).filter(x => x.score > 0).sort((a, b) => b.score - a.score);

    if (scored.length === 0) {
      return { resolvedUserId: null, strategy: "no_match", candidates: [], displayName: null };
    }
    const top = scored[0].score;
    const tier = scored.filter(s => s.score >= top - 10);
    if (tier.length === 1) {
      const m = tier[0].member;
      return {
        resolvedUserId: m.user_id,
        strategy: "fuzzy_unique",
        candidates: [m],
        displayName: m.display_name || m.email || name,
      };
    }
    return {
      resolvedUserId: null,
      strategy: "ambiguous",
      candidates: tier.map(t => t.member),
      displayName: null,
    };
  }

  // 3. Nothing specified → caller default.
  return {
    resolvedUserId: callerUserId,
    strategy: "omitted",
    candidates: [],
    displayName: null,
  };
}