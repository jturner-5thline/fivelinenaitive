import { describe, it, expect } from 'vitest';
import { rowToRecord, RECORD_ID_KEY } from './entityCsv';
import { CONTACT_CSV } from './csvSchemas';
import { contactImportConfig } from '@/lib/entityImportConfigs';

const idx = (k: string) => CONTACT_CSV.fields.findIndex(f => f.key === k);

describe('contact CSV Record ID matching', () => {
  it('keeps exported Record ID for matching but never as a writable id', () => {
    const row: string[] = []; row[idx('id')] = 'ABC-123'; row[idx('email')] = 'a@b.com';
    const rec = rowToRecord(CONTACT_CSV, row, { [idx('id')]: 'id', [idx('email')]: 'email' });
    expect(rec.id).toBeUndefined();
    expect(rec[RECORD_ID_KEY]).toBe('ABC-123');
  });
  it('matches by Record ID first, then email', () => {
    const keys = contactImportConfig({ orgCompanyId: 'x' }).identityKeys({ [RECORD_ID_KEY]: 'ABC-123', email: 'A@b.com' });
    expect(keys[0]).toBe('id:abc-123');
    expect(keys).toContain('e:a@b.com');
  });
});
