// SSRF guard for server-side fetches to caller- or user-configured URLs.
// Allows only https URLs on standard ports whose hostname (and every resolved
// address) is public — blocks loopback, private, link-local, CGNAT, metadata
// and other reserved ranges.

export function isPrivateIPv4(ip: string): boolean {
  const p = ip.split(".").map((n) => Number(n));
  if (p.length !== 4 || p.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  const [a, b] = p;
  return (
    a === 0 || a === 10 || a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

export function isPrivateIPv6(ip: string): boolean {
  const v = ip.toLowerCase().replace(/^\[|\]$/g, "");
  if (v === "::" || v === "::1") return true;
  const mapped = v.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPrivateIPv4(mapped[1]);
  return /^(fc|fd|fe8|fe9|fea|feb|ff)/.test(v) || v.startsWith("64:ff9b:") || v.startsWith("2001:db8:");
}

function isIpLiteral(host: string): "v4" | "v6" | null {
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) return "v4";
  if (host.includes(":")) return "v6";
  return null;
}

/** Synchronous checks on the URL string. */
export function checkUrlSyntax(raw: string): { ok: true; url: URL } | { ok: false; error: string } {
  let url: URL;
  try { url = new URL(raw); } catch { return { ok: false, error: "Invalid URL" }; }
  if (url.protocol !== "https:") return { ok: false, error: "Only https URLs are allowed" };
  if (url.username || url.password) return { ok: false, error: "Credentials in URL are not allowed" };
  if (url.port && url.port !== "443") return { ok: false, error: "Non-standard ports are not allowed" };
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (!host || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal") || host === "metadata.google.internal") {
    return { ok: false, error: "Internal hostnames are not allowed" };
  }
  const kind = isIpLiteral(host);
  if (kind === "v4" && isPrivateIPv4(host)) return { ok: false, error: "Private addresses are not allowed" };
  if (kind === "v6" && isPrivateIPv6(host)) return { ok: false, error: "Private addresses are not allowed" };
  return { ok: true, url };
}

/** Full check including DNS resolution of the hostname. */
export async function assertSafeUrl(raw: string): Promise<URL> {
  const res = checkUrlSyntax(raw);
  if (!res.ok) throw new Error(res.error);
  const host = res.url.hostname.replace(/^\[|\]$/g, "");
  if (!isIpLiteral(host)) {
    const addrs: string[] = [];
    for (const type of ["A", "AAAA"] as const) {
      try { addrs.push(...(await Deno.resolveDns(host, type))); } catch { /* no records of this type */ }
    }
    if (addrs.length === 0) throw new Error("Host could not be resolved");
    for (const a of addrs) {
      if ((a.includes(":") ? isPrivateIPv6(a) : isPrivateIPv4(a))) throw new Error("Host resolves to a private address");
    }
  }
  return res.url;
}

/** fetch() that validates the URL and refuses redirects. */
export async function safeFetch(raw: string, init: RequestInit = {}): Promise<Response> {
  const url = await assertSafeUrl(raw);
  return fetch(url, { ...init, redirect: "manual" });
}
