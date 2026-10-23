import { beforeEach, describe, expect, it, vi } from 'vitest';
import { syncLenderContactToCrm } from './syncLenderContactToCrm';
const db = vi.hoisted(() => ({ responses: [] as unknown[], calls: [] as { table: string; method: string; args: unknown[] }[] }));
vi.mock('@/components/contacts/ContactTypeMultiSelect', () => ({ splitContactTypes: (v: string | null) => v ? v.split(' ; ') : [], joinContactTypes: (v: string[]) => v.join(' ; ') || null }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: (table: string) => {
  const response = db.responses.shift();
  const q: Record<string, unknown> = { then: (resolve: (v: unknown) => unknown) => Promise.resolve(response).then(resolve) };
  for (const method of ['select', 'eq', 'ilike', 'limit', 'insert', 'update', 'single', 'maybeSingle']) {
    q[method] = (...args: unknown[]) => { db.calls.push({ table, method, args }); return q; };
  }
  return q;
} } }));
const opts = { userId: 'user', orgCompanyId: 'org' };
const lender = { id: 'lender', name: 'Capital', crm_company_id: 'company' };
const contact = { name: 'Jane Smith', email: 'JANE@example.com' };
beforeEach(() => { db.responses = []; db.calls = []; });
describe('company-scoped CRM contact resolution', () => {
  it('creates a missing contact with the correct organization and company', async () => {
    db.responses = [{ data: lender }, { data: { id: 'company' } }, { data: [] }, { data: { id: 'new' } }];
    expect(await syncLenderContactToCrm('lender', contact, opts)).toEqual({ contactId: 'new', crmCompanyId: 'company' });
    expect(db.calls).toContainEqual({ table: 'contacts', method: 'insert', args: [expect.objectContaining({ first_name: 'Jane', last_name: 'Smith', email: 'jane@example.com', org_company_id: 'org', crm_company_id: 'company' })] });
  });
  it('reuses an email match instead of inserting a duplicate', async () => {
    db.responses = [{ data: lender }, { data: { id: 'company' } }, { data: [{ id: 'existing', crm_company_id: 'company' }] }, {}];
    expect((await syncLenderContactToCrm('lender', contact, opts))?.contactId).toBe('existing');
    expect(db.calls.filter(c => c.table === 'contacts' && c.method === 'insert')).toHaveLength(0);
    expect(db.calls).toContainEqual({ table: 'contacts', method: 'eq', args: ['org_company_id', 'org'] });
  });
  it('reuses a unique name match when no email exists', async () => {
    db.responses = [{ data: lender }, { data: { id: 'company' } }, { data: [{ id: 'existing' }] }, {}];
    expect((await syncLenderContactToCrm('lender', { name: 'Jane Smith' }, opts))?.contactId).toBe('existing');
    expect(db.calls).toContainEqual({ table: 'contacts', method: 'ilike', args: ['full_name', 'Jane Smith'] });
  });
  it('refuses to sync without user and company context', async () => {
    expect(await syncLenderContactToCrm('lender', contact)).toBeNull();
    expect(db.calls).toHaveLength(0);
  });
  it('rejects a selected contact from outside the current company', async () => {
    db.responses = [{ data: lender }, { data: { id: 'company' } }, { data: null }];
    expect(await syncLenderContactToCrm('lender', contact, { ...opts, existingContactId: 'foreign' })).toBeNull();
    expect(db.calls.filter(c => c.table === 'contacts' && ['insert', 'update'].includes(c.method))).toHaveLength(0);
    expect(db.calls).toContainEqual({ table: 'contacts', method: 'eq', args: ['org_company_id', 'org'] });
  });
  it('does not create duplicates when the matching query fails', async () => {
    db.responses = [{ data: lender }, { data: { id: 'company' } }, { error: new Error('read failed') }];
    expect(await syncLenderContactToCrm('lender', contact, opts)).toBeNull();
    expect(db.calls.filter(c => c.method === 'insert')).toHaveLength(0);
  });
});