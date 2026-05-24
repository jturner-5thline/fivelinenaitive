import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { classifyByAlias, REGISTRY_BY_KEY } from "./registry.ts";
import { matchDeny } from "./denyList.ts";

Deno.test("classifies rename company", () => {
  const r = classifyByAlias("rename my company to 5th Line Financial LLC");
  assert(r, "expected hit");
  assertEquals(r!.tool.key, "settings.update_company_name");
  assertEquals(r!.rawValue, "5th Line Financial LLC");
});

Deno.test("classifies timezone", () => {
  const r = classifyByAlias("set timezone to America/New_York");
  assert(r);
  assertEquals(r!.tool.key, "settings.update_company_timezone");
  assertEquals(r!.rawValue, "America/New_York");
});

Deno.test("classifies slack digest off", () => {
  const r = classifyByAlias("turn off slack digest");
  assert(r);
  assertEquals(r!.tool.key, "settings.toggle_slack_digest");
  assertEquals(r!.rawValue, false);
});

Deno.test("classifies theme dark", () => {
  const r = classifyByAlias("switch theme to dark");
  assert(r);
  assertEquals(r!.tool.key, "settings.update_user_theme");
  assertEquals(r!.rawValue, "dark");
});

Deno.test("classifies notification email", () => {
  const r = classifyByAlias("update notification email to ops@5thline.co");
  assert(r);
  assertEquals(r!.tool.key, "settings.update_notification_email");
  assertEquals(r!.rawValue, "ops@5thline.co");
});

Deno.test("denies password change", () => {
  assert(matchDeny("change my password to hunter2").denied);
});

Deno.test("denies api key rotation", () => {
  assert(matchDeny("rotate the openai api key").denied);
});

Deno.test("denies role elevation", () => {
  assert(matchDeny("make jturner an admin").denied);
});

Deno.test("validator: IANA timezone", () => {
  const t = REGISTRY_BY_KEY["settings.update_company_timezone"];
  assert(t.validator("America/New_York").ok);
  assert(!t.validator("EST").ok);
  assert(!t.validator("Foo/Bar").ok);
});

Deno.test("validator: email", () => {
  const t = REGISTRY_BY_KEY["settings.update_notification_email"];
  assert(t.validator("a@b.co").ok);
  assert(!t.validator("notanemail").ok);
});

Deno.test("validator: boolean coercion", () => {
  const t = REGISTRY_BY_KEY["settings.toggle_slack_digest"];
  assertEquals(t.validator("off").value, false);
  assertEquals(t.validator("on").value, true);
  assertEquals(t.validator(true).value, true);
  assert(!t.validator("maybe").ok);
});

Deno.test("validator: gcal id", () => {
  const t = REGISTRY_BY_KEY["settings.update_gcal_default_calendar_id"];
  assert(t.validator("primary@group.calendar.google.com").ok);
  assert(!t.validator("not a calendar id!").ok);
});