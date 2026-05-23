/**
 * Live smoke harness for the meeting-holds lifecycle against a secondary
 * Nylas calendar. Opt-in only:
 *
 *   GCAL_SMOKETEST_CALENDAR_ID  — secondary calendar id (required, else skipped)
 *   SMOKETEST_USER_JWT          — valid Supabase JWT for the test user
 *
 * If either env var is missing the test exits early with a console note —
 * this keeps CI green when no smoke calendar is wired up.
 *
 * Cleanup: every event created is tagged via metadata.naitive_hold_group =
 * <group> and rows are deleted from meeting_holds at the end.
 */
import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL")!;
const ANON = Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY")!;
const CAL = Deno.env.get("GCAL_SMOKETEST_CALENDAR_ID");
const USER_JWT = Deno.env.get("SMOKETEST_USER_JWT");

const SKIP = !CAL || !USER_JWT;

async function call(path: string, body: unknown) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: ANON,
      Authorization: `Bearer ${USER_JWT}`,
    },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

Deno.test({
  name: "meeting-holds lifecycle on secondary calendar",
  ignore: SKIP,
  async fn() {
    if (SKIP) return;
    const t = Math.floor(Date.now() / 1000);
    const slot = (offsetMin: number) => ({
      start: new Date((t + offsetMin * 60) * 1000).toISOString(),
      end: new Date((t + offsetMin * 60 + 1800) * 1000).toISOString(),
    });

    // create
    const created = await call("meeting-holds", {
      action: "create",
      title: "[Naitive smoke-test — delete OK]",
      slots: [slot(60), slot(120), slot(180)],
      attendees: [],
      calendar_id: CAL,
    });
    assertEquals(created.status, 200);
    const group = created.json.hold_group_id as string;
    const holds = created.json.holds as Array<{ id: string }>;
    assertEquals(holds.length, 3);

    // accept-promote first hold
    const confirmed = await call("meeting-holds", {
      action: "confirm",
      hold_id: holds[0].id,
      final_title: "[Naitive smoke-test — confirmed]",
    });
    assertEquals(confirmed.status, 200);
    assertEquals(confirmed.json.released_siblings, 2);

    // sweep (idempotent — no held rows left)
    const swept = await call("meeting-holds", { action: "sweep" });
    assertEquals(swept.status, 200);

    // release residual confirmed (via direct release call)
    await call("meeting-holds", { action: "release", hold_group_id: group });

    console.log(`[smoketest] group ${group} complete — calendar ${CAL}`);
  },
});