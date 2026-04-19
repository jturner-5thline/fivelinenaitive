import { describe, it, expect } from 'vitest';
import { resolveFlaggedDealRecipients, type CompanyAdmin } from '../dealFlaggedRecipients';

const COMPANY_ID = 'company-5thline';
const OTHER_COMPANY_ID = 'company-other';

const admins: CompanyAdmin[] = [
  { user_id: 'admin-1', company_id: COMPANY_ID },
  { user_id: 'admin-2', company_id: COMPANY_ID },
  { user_id: 'admin-3', company_id: COMPANY_ID },
  // cross-company admin must NEVER leak into the recipient set
  { user_id: 'admin-other-co', company_id: OTHER_COMPANY_ID },
];

describe('resolveFlaggedDealRecipients', () => {
  it('flagger is admin AND deal owner → flagger excluded; other admins + manager still notified', () => {
    // admin-1 is the flagger, also the owner
    const deal = {
      owner_user_id: 'admin-1',
      manager_user_id: 'manager-1',
      company_id: COMPANY_ID,
    };
    const recipients = resolveFlaggedDealRecipients(deal, 'admin-1', admins);

    expect(recipients).not.toContain('admin-1');
    expect(recipients).toEqual(expect.arrayContaining(['manager-1', 'admin-2', 'admin-3']));
    expect(recipients).not.toContain('admin-other-co');
    expect(recipients).toHaveLength(3);
  });

  it('flagger is non-admin user → owner, manager, and all admins (except flagger) notified', () => {
    const deal = {
      owner_user_id: 'owner-1',
      manager_user_id: 'manager-1',
      company_id: COMPANY_ID,
    };
    const recipients = resolveFlaggedDealRecipients(deal, 'random-user', admins);

    expect(recipients).toEqual(
      expect.arrayContaining(['owner-1', 'manager-1', 'admin-1', 'admin-2', 'admin-3']),
    );
    expect(recipients).not.toContain('random-user');
    expect(recipients).not.toContain('admin-other-co');
    expect(recipients).toHaveLength(5);
  });

  it('deal with no manager assigned → owner + admins (minus flagger) still notified', () => {
    const deal = {
      owner_user_id: 'owner-1',
      manager_user_id: null,
      company_id: COMPANY_ID,
    };
    const recipients = resolveFlaggedDealRecipients(deal, 'admin-1', admins);

    expect(recipients).toEqual(expect.arrayContaining(['owner-1', 'admin-2', 'admin-3']));
    expect(recipients).not.toContain('admin-1');
    expect(recipients).toHaveLength(3);
  });

  it('recipients are de-duplicated (owner who is also admin appears once)', () => {
    // admin-2 is BOTH the owner AND an admin of the same company
    const deal = {
      owner_user_id: 'admin-2',
      manager_user_id: 'manager-1',
      company_id: COMPANY_ID,
    };
    const recipients = resolveFlaggedDealRecipients(deal, 'random-user', admins);

    const occurrences = recipients.filter((r) => r === 'admin-2').length;
    expect(occurrences).toBe(1);
    expect(recipients).toEqual(
      expect.arrayContaining(['admin-2', 'manager-1', 'admin-1', 'admin-3']),
    );
    expect(recipients).toHaveLength(4);
  });
});
