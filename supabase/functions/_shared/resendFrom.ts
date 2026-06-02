// Shared Resend FROM helper. All transactional edge functions should
// derive sender info from these env vars instead of hardcoded strings:
//   - RESEND_FROM_ADDRESS  full email (e.g. noreply@updates.naitive.co)
//   - RESEND_FROM_DOMAIN   sender domain (e.g. updates.naitive.co)
// Falls back to noreply@updates.naitive.co when neither is set.

const DEFAULT_ADDRESS = "noreply@updates.naitive.co";
const DEFAULT_DOMAIN = "updates.naitive.co";

export function getFromAddress(): string {
  const explicit = Deno.env.get("RESEND_FROM_ADDRESS");
  if (explicit && explicit.includes("@")) return explicit;
  const domain = Deno.env.get("RESEND_FROM_DOMAIN") || DEFAULT_DOMAIN;
  return `noreply@${domain}`;
}

export function getFromDomain(): string {
  return Deno.env.get("RESEND_FROM_DOMAIN") || DEFAULT_DOMAIN;
}

/**
 * Returns a fully formatted Resend `from` header, e.g.
 *   "Naitive <noreply@updates.naitive.co>"
 */
export function buildFrom(displayName = "naitive", localPart?: string): string {
  if (localPart) {
    const domain = getFromDomain();
    return `${displayName} <${localPart}@${domain}>`;
  }
  return `${displayName} <${getFromAddress()}>`;
}

export function logColdStartFrom(fnName: string) {
  const addr = getFromAddress();
  const src = Deno.env.get("RESEND_FROM_ADDRESS")
    ? "RESEND_FROM_ADDRESS"
    : Deno.env.get("RESEND_FROM_DOMAIN")
    ? "RESEND_FROM_DOMAIN"
    : "default fallback";
  console.log(`[${fnName}] cold-start FROM=${addr} (source: ${src})`);
}

export const DEFAULT_FROM_ADDRESS = DEFAULT_ADDRESS;
export const DEFAULT_FROM_DOMAIN = DEFAULT_DOMAIN;