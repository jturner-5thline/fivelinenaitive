import { describe, expect, it, vi } from 'vitest';
import { contactImportConfig } from './entityImportConfigs';
import { CONTACT_CSV, CONTACT_FULL_NAME } from '@/utils/csvSchemas';
import { autoMapHeaders, RECORD_ID_KEY, rowToRecord } from '@/utils/entityCsv';

vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: vi.fn(() => { throw new Error('Unexpected database call'); }) } }));

describe('contact import generated Full Name regression', () => {
  const config = contactImportConfig({ userId: 'user', orgCompanyId: 'workspace' });

  it.each(['insert', 'update'] as const)('%s never writes generated Full Name or identity metadata', async mode => {
    const [payload] = await config.prepare([{ full_name: 'Jane Smith', [RECORD_ID_KEY]: 'existing', email: 'jane@example.com' }], mode);
    expect(payload).not.toHaveProperty('full_name');
    expect(payload).not.toHaveProperty(RECORD_ID_KEY);
    expect(payload).toMatchObject({ first_name: 'Jane', last_name: 'Smith', email_domain_normalized: 'example.com' });
  });

  it('preserves explicitly supplied first and last names over exported Full Name', async () => {
    const headers = ['Record ID', 'First Name', 'Last Name', 'Full Name', 'Email'];
    const rec = rowToRecord(CONTACT_CSV, ['ABC-123', 'Janet', 'Jones', 'Jane Smith', 'jane@example.com'], autoMapHeaders(CONTACT_CSV, headers));
    expect(config.identityKeys(rec)[0]).toBe('id:abc-123');
    const [payload] = await config.prepare([rec], 'update');
    expect(payload).toMatchObject({ first_name: 'Janet', last_name: 'Jones' });
    expect(payload).not.toHaveProperty('full_name');
    expect(payload).not.toHaveProperty(CONTACT_FULL_NAME);
  });

  it('retains full-name-only input for matching and splits multi-part surnames', async () => {
    const rec = rowToRecord(CONTACT_CSV, ['  Jane   van Smith  '], autoMapHeaders(CONTACT_CSV, ['Contact Name']));
    expect(config.isImportable(rec)).toBe(true);
    expect(config.identityKeys(rec)).toContain('n:jane   van smith');
    const [payload] = await config.prepare([rec], 'insert');
    expect(payload).toMatchObject({ first_name: 'Jane', last_name: 'van Smith' });
    expect(payload).not.toHaveProperty(CONTACT_FULL_NAME);
  });

  it('accepts single-word names and does not infer a missing part over an explicit name', async () => {
    const payloads = await config.prepare([
      { [CONTACT_FULL_NAME]: 'Prince' },
      { [CONTACT_FULL_NAME]: 'Jane Smith', last_name: 'Jones' },
      { email: 'only@example.com' },
    ], 'update');
    expect(payloads[0]).toMatchObject({ first_name: 'Prince', last_name: '' });
    expect(payloads[1]).not.toHaveProperty('first_name');
    expect(payloads[1].last_name).toBe('Jones');
    expect(payloads[2]).not.toHaveProperty('first_name');
  });

  it('refuses preparation without a workspace', async () => {
    await expect(contactImportConfig({}).prepare([{ full_name: 'Jane Smith' }], 'update')).rejects.toThrow('No workspace selected');
  });
});