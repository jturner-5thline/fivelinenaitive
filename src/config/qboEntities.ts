/**
 * Mapping of internal entity labels to QuickBooks Online realm IDs.
 *
 * Lives as a leaf module (no React imports, no cross-module side effects)
 * so it can be safely consumed during top-level evaluation of any chunk
 * without risking a TDZ cycle.
 *
 * Update the realm_id values here when QBO companies are reconnected.
 */
export interface QBOEntity {
  /** Internal slug used in code & query keys. */
  key: 'debt' | 'finserv' | 'tech' | 'capital';
  /** Short display label used in legends / chips. */
  label: string;
  /** Long-form display name (matches QBO company_name). */
  fullName: string;
  /** QBO realm ID. */
  realmId: string;
  /** Optional QBO Class name fallback if realm-level isolation isn't possible. */
  className?: string;
}

export const QBO_ENTITIES: QBOEntity[] = [
  {
    key: 'debt',
    label: 'Debt',
    fullName: '5th Line Capital Advisors LLC',
    realmId: '193514877331929',
    // Class fallback stub — populate if/when single-realm class tracking is adopted.
    className: undefined,
  },
  {
    key: 'finserv',
    label: 'FinServ',
    fullName: '5th Line Financial Services, LLC',
    realmId: '9341451968897660',
    className: undefined,
  },
  {
    key: 'tech',
    label: 'Tech',
    fullName: '5th Line Technologies LLC',
    realmId: '9130350272677286',
    className: undefined,
  },
  {
    key: 'capital',
    label: 'Capital',
    fullName: '5th Line Capital, LLC',
    realmId: '123146077561874',
    className: undefined,
  },
];

export const QBO_ENTITY_BY_KEY: Record<QBOEntity['key'], QBOEntity> =
  QBO_ENTITIES.reduce((acc, e) => {
    acc[e.key] = e;
    return acc;
  }, {} as Record<QBOEntity['key'], QBOEntity>);

/** Convenience: realm ID for 5th Line Capital Advisors (a.k.a. "Debt"). */
export const QBO_REALM_DEBT = QBO_ENTITY_BY_KEY.debt.realmId;
