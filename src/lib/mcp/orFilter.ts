/**
 * Build a PostgREST `.or()`-safe quoted ilike pattern from user text.
 * Quoting prevents commas/parentheses in the input from adding filters,
 * and LIKE wildcards in the input are escaped so they match literally.
 */
export function orIlike(value: unknown): string {
  const raw = String(value ?? "").slice(0, 200);
  const likeEscaped = raw.replace(/[\\%_]/g, (c) => `\\${c}`);
  const quoted = `%${likeEscaped}%`.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  return `"${quoted}"`;
}
