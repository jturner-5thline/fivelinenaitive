/**
 * Demo-only lender salutation rewrite.
 *
 * In the demo workspace (demo@5thline.co), every lender submission /
 * workflow email draft must address a human contact, never a bracketed
 * placeholder or the lender company name. We deterministically derive
 * a fake "First Last" pair from the lender's name (same seed used by
 * `demoFakeContactName`) and rewrite the salutation line so it always
 * reads exactly:
 *
 *     Dear {Fake First} {Fake Last}
 *
 * Production tenants are unaffected — the helper is a no-op unless
 * `companyId` matches the demo company.
 */
import { isDemoCompanyId } from './demoAccount';
import { demoFakeContactName } from './demoLenderContact';

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Rewrite any "Dear …" greeting in `text` so it uses a deterministic
 * fake contact name derived from `lenderName`. Handles bracketed,
 * mustached, ALL-CAPS and bare lender-company-name forms.
 */
export function applyDemoLenderSalutation(
  text: string | null | undefined,
  lenderName: string | null | undefined,
  companyId: string | null | undefined,
): string {
  const src = text ?? '';
  if (!src) return src;
  if (!isDemoCompanyId(companyId)) return src;

  const seed = (lenderName || '').trim() || 'lender';
  const greeting = `Dear ${demoFakeContactName(seed).full}`;

  let out = src;

  // 1. Bracketed placeholder, e.g. Dear [Lender Name], Dear [LENDER NAME]
  out = out.replace(/Dear\s*\[\s*[^\]]*?\s*\]/gi, greeting);

  // 2. Mustache placeholder, e.g. Dear {{lender_name}} / Dear {{recipient_name}}
  out = out.replace(/Dear\s*\{\{[^}]*\}\}/gi, greeting);

  // 3. Bare token placeholder leaked from merge: "Dear LENDER NAME" / "Dear LENDER"
  out = out.replace(/Dear\s+LENDER(?:\s+NAME)?\b/g, greeting);

  // 4. Lender company name used as the greeting target — replace with the
  //    fake contact so we never address a firm by its company name.
  const trimmed = (lenderName || '').trim();
  if (trimmed) {
    const esc = escapeRegExp(trimmed);
    out = out.replace(new RegExp(`Dear\\s+${esc}\\b[^,<\\n]*`, 'gi'), greeting);
  }

  return out;
}
