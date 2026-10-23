import { beforeEach, describe, expect, it, vi } from 'vitest';
import { syncImportedLenderContacts } from './syncImportedLenderContacts';
import { syncLenderContactToCrm } from './syncLenderContactToCrm';

const db = vi.hoisted(() => ({ responses: [] as unknown[], calls: [] as { table: string; method: string; args: unknown[] }[] }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: (table: string) => {
  const response = db.responses.shift();
  const q: Record<string, unknown> = { then: (resolve: (v: unknown) => unknown) => Promise.resolve(response).then(resolve) };
  for (const method of ['select', 'eq', 'insert', 'update', 'single', 'maybeSingle']) {
    q[method] = (...args: unknown[]) => { db.calls.push({ table, method, args }); return q; };
  }
  return q;
} } }));
vi.mock('./syncLenderContactToCrm', () => ({ syncLenderContactToCrm: vi.fn() }));
const opts = { userId: 'user', orgCompanyId: 'org' };
const lender = { id: 'lender', contact_name: 'Jane Smith', email: 'Jane@example.com', contact_title: 'Director' };
const child = { id: 'child', lender_id: 'lender', name: 'Jane Smith', email: 'jane@example.com', contact_id: null, is_primary: true };
beforeEach(() => { db.responses = []; db.calls = []; vi.clearAllMocks(); vi.mocked(syncLenderContactToCrm).mockResolvedValue({ contactId: 'crm', crmCompanyId: 'company' }); });
describe('funding-source import contacts', () => {
  it('creates and links a CSV primary contact into Contacts', async () => {
    db.responses = [{ data: lender }, { data: [] }, { data: child }, { error: null }];
    await syncImportedLenderContacts('lender', opts);
    expect(syncLenderContactToCrm).toHaveBeenCalledWith('lender', child, { ...opts, existingContactId: null });
    expect(db.calls).toContainEqual({ table: 'lender_contacts', method: 'update', args: [{ contact_id: 'crm' }] });
  });
  it('reuses the imported child instead of duplicating the same email with different casing', async () => {
    db.responses = [{ data: lender }, { data: [child] }, { error: null }];
    await syncImportedLenderContacts('lender', opts);
    expect(db.calls.filter(c => c.method === 'insert')).toHaveLength(0);
  });
  it('passes existing CRM links and reconciles every associated contact', async () => {
    db.responses = [{ data: lender }, { data: [{ ...child, contact_id: 'existing' }, { ...child, id: 'second', email: 'other@example.com' }] }, {}, {}];
    await syncImportedLenderContacts('lender', opts);
    expect(syncLenderContactToCrm).toHaveBeenCalledTimes(2);
    expect(syncLenderContactToCrm).toHaveBeenNthCalledWith(1, 'lender', expect.anything(), { ...opts, existingContactId: 'existing' });
  });
  it('supports a contact without an email and skips empty contact fields', async () => {
    db.responses = [{ data: { ...lender, email: null } }, { data: [{ ...child, email: null }] }, {}];
    await syncImportedLenderContacts('lender', opts);
    expect(syncLenderContactToCrm).toHaveBeenCalledTimes(1);
    vi.clearAllMocks();
    db.responses = [{ data: { id: 'lender', contact_name: null, email: null } }, { data: [] }];
    await syncImportedLenderContacts('lender', opts);
    expect(syncLenderContactToCrm).not.toHaveBeenCalled();
  });
  it('reports CRM sync failures rather than silently declaring success', async () => {
    db.responses = [{ data: lender }, { data: [child] }];
    vi.mocked(syncLenderContactToCrm).mockResolvedValue(null);
    await expect(syncImportedLenderContacts('lender', opts)).rejects.toThrow('could not be linked');
    expect(db.calls.filter(c => c.method === 'update')).toHaveLength(0);
  });
  it('stops on read or link errors', async () => {
    db.responses = [{ error: new Error('not allowed') }];
    await expect(syncImportedLenderContacts('lender', opts)).rejects.toThrow('not allowed');
    db.responses = [{ data: lender }, { data: [child] }, { error: new Error('link denied') }];
    await expect(syncImportedLenderContacts('lender', opts)).rejects.toThrow('link denied');
  });
});