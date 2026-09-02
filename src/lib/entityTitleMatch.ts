/**
 * Shared helpers for matching company/deal/funding-source names inside
 * free-text calendar event titles. Used by the Sales & BD referral metrics and
 * the lender call counts so both apply the same exclusion rules.
 */

export function normalizeEntityName(value: string) {
  return value
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function isNearToken(left: string, right: string) {
  if (left === right) return true;
  if (left.length < 5 || right.length < 5 || Math.abs(left.length - right.length) > 1) return false;

  let edits = 0;
  let leftIndex = 0;
  let rightIndex = 0;
  while (leftIndex < left.length && rightIndex < right.length) {
    if (left[leftIndex] === right[rightIndex]) {
      leftIndex += 1;
      rightIndex += 1;
      continue;
    }
    edits += 1;
    if (edits > 1) return false;
    if (left.length > right.length) leftIndex += 1;
    else if (right.length > left.length) rightIndex += 1;
    else {
      leftIndex += 1;
      rightIndex += 1;
    }
  }
  return edits + Number(leftIndex < left.length || rightIndex < right.length) <= 1;
}

/** True when a normalized title mentions the normalized entity name. */
export function titleMatchesEntity(title: string, entityName: string) {
  if (!title || !entityName) return false;
  if (title.includes(entityName)) return true;

  const titleTokens = title.split(' ').filter(Boolean);
  const entityTokens = entityName.split(' ').filter(Boolean);
  if (entityTokens.length === 0) return false;

  // Match independently of word order and tolerate a one-character typo in
  // meaningful words (for example, "Bar Back Project" vs "Back Bar Project").
  return entityTokens.every((entityToken) =>
    titleTokens.some((titleToken) => isNearToken(entityToken, titleToken)),
  );
}

/**
 * Deal/company names are often stored as "Client-Project" or "Client / Project".
 * Calendar invites usually mention only the client part ("Hero Fund-5th Line Sync"),
 * so match on the full name AND the leading segment before the first delimiter.
 */
export function entityNameVariants(rawName: string): string[] {
  const raw = String(rawName || '').trim();
  if (!raw) return [];
  const variants = new Set<string>();
  const full = normalizeEntityName(raw);
  if (full.replace(/\s/g, '').length >= 4) variants.add(full);
  const lead = normalizeEntityName(raw.split(/[-–—/|:,]/)[0] || '');
  if (lead && lead !== full && lead.replace(/\s/g, '').length >= 6) variants.add(lead);
  return Array.from(variants);
}
