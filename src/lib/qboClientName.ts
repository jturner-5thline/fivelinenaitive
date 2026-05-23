/**
 * Resolves a QuickBooks customer record to its display label for "by client"
 * charts. 5th Line tracks loans / engagements by COMPANY, but QBO frequently
 * stores the customer as a person (guarantor / signer). Whenever a
 * `company_name` is populated on the QBO customer it wins — only when no
 * company is set do we fall back to the personal display name.
 *
 * Priority:
 *   1. qbo_customer.company_name
 *   2. qbo_customer.display_name (= invoices.customer_name)
 *   3. "Unknown"
 *
 * Rows that fall through to step 2 with a person name are surfaced in the
 * data-quality report at /mnt/documents/qbo-client-name-quality-report.csv
 * so the team can backfill `company_name` in QBO.
 */
export interface QboCustomerNameRow {
  qb_id: string | null;
  realm_id: string | null;
  display_name: string | null;
  company_name: string | null;
}

export function resolveQboClientLabel(
  customerName: string | null | undefined,
  customer: { company_name?: string | null; display_name?: string | null } | undefined | null,
): string {
  const company = customer?.company_name?.trim();
  if (company) return company;
  const display = customer?.display_name?.trim() || customerName?.trim();
  return display || 'Unknown';
}

export function buildQboCustomerNameMap(rows: QboCustomerNameRow[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const row of rows) {
    if (!row.qb_id || !row.realm_id) continue;
    map.set(
      `${row.realm_id}:${row.qb_id}`,
      resolveQboClientLabel(row.display_name, row),
    );
  }
  return map;
}