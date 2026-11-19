// Pure helpers deciding whether an email sender can produce a lender pass.
// Used by smart-email-ai's detect_lender_pass action.

export const INTERNAL_DOMAINS = ["5thline.co"];
const FREE_MAIL = new Set(["gmail.com", "googlemail.com", "yahoo.com", "outlook.com", "hotmail.com", "icloud.com", "aol.com", "live.com", "me.com", "msn.com", "proton.me", "protonmail.com"]);
const AUTOMATED_LOCAL = /^(no-?reply|do-?not-?reply|donotreply|notifications?|notify|mailer-daemon|postmaster|bounces?|calendar(-notification)?|alerts?|updates?|news(letter)?|digest|automated|system)([+._-]|$)/i;
const AUTOMATED_DOMAINS = ["asana.com", "calendly.com", "zoom.us", "docusign.net", "hubspot.com", "mailchimp.com", "slack.com", "notion.so", "linkedin.com", "google.com", "sendgrid.net", "intercom.io"];

export const domainOf = (email: string) => (email.toLowerCase().split("@")[1] || "").trim();

export function isAutomatedSender(email: string): boolean {
  const e = email.toLowerCase().trim();
  const [local, domain = ""] = e.split("@");
  if (!local || !domain) return true;
  if (AUTOMATED_LOCAL.test(local)) return true;
  return AUTOMATED_DOMAINS.some((d) => domain === d || domain.endsWith(`.${d}`));
}

export const isInternalSender = (email: string) => INTERNAL_DOMAINS.includes(domainOf(email));
export const isFreeMailDomain = (domain: string) => FREE_MAIL.has(domain.toLowerCase());

export type SenderKind = "automated" | "internal" | "external";
export function senderKind(email: string): SenderKind {
  if (isAutomatedSender(email)) return "automated";
  if (isInternalSender(email)) return "internal";
  return "external";
}

/** Unique lowercased addresses found in free text (e.g. "From: Jo <jo@x.com>" lines of a forward). */
export function extractEmails(text: string): string[] {
  const found = text.toLowerCase().match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/g) ?? [];
  return [...new Set(found)];
}

/** External, non-automated addresses quoted inside an internal forward — candidates for the original lender sender. */
export function forwardedLenderCandidates(text: string): string[] {
  return extractEmails(text).filter((e) => senderKind(e) === "external");
}

export function websiteHost(url: string | null | undefined): string {
  if (!url) return "";
  return url.toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").split(/[/?#]/)[0];
}
