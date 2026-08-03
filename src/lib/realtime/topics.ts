/**
 * Realtime topic naming convention.
 *
 * RLS on `realtime.messages` only authorizes topics of the form:
 *   company:<company_id>:<entity>[:<id>]
 *   user:<auth_uid>:<entity>[:<id>]
 *
 * Any other topic name is rejected for private channels. Public channels are
 * unaffected today, but every NEW channel should be named through these
 * helpers so it can be flipped to `{ config: { private: true } }` safely.
 */

export function companyTopic(
  companyId: string,
  entity: string,
  id?: string | null,
): string {
  return ["company", companyId, entity, id].filter(Boolean).join(":");
}

export function userTopic(
  userId: string,
  entity: string,
  id?: string | null,
): string {
  return ["user", userId, entity, id].filter(Boolean).join(":");
}

/** Mirrors the server-side check in public.realtime_topic_allowed(). */
export function isScopedTopic(topic: string): boolean {
  return /^(company|user):[0-9a-f-]{36}:.+/i.test(topic);
}
