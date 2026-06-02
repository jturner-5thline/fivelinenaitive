import { describe, it, expect } from 'vitest';
import { resolveInternalAssignee, type InternalMember } from '@/hooks/useMeetingTaskSuggestions';

const members: InternalMember[] = [
  { user_id: 'u1', email: 'jturner@5thline.co', first_name: 'James', last_name: 'Turner', display_name: 'James Turner' },
  { user_id: 'u2', email: 'flora@5thline.co', first_name: 'Flora', last_name: 'Tan', display_name: 'Flora Tan' },
  { user_id: 'u3', email: 'james.kim@5thline.co', first_name: 'James', last_name: 'Kim', display_name: 'James Kim' },
];

describe('resolveInternalAssignee', () => {
  it('matches a unique internal user by full name', () => {
    expect(resolveInternalAssignee('Flora Tan', members)?.user_id).toBe('u2');
  });

  it('returns null for an external contact name', () => {
    expect(resolveInternalAssignee('Jerry Mikolajczyk', members)).toBeNull();
    expect(resolveInternalAssignee('Kevin Grapes', members)).toBeNull();
  });

  it('returns null when the first-name match is ambiguous', () => {
    expect(resolveInternalAssignee('James', members)).toBeNull();
  });

  it('matches by exact email', () => {
    expect(resolveInternalAssignee('jturner@5thline.co', members)?.user_id).toBe('u1');
  });

  it('returns null for empty / null input', () => {
    expect(resolveInternalAssignee(null, members)).toBeNull();
    expect(resolveInternalAssignee('', members)).toBeNull();
    expect(resolveInternalAssignee('   ', members)).toBeNull();
  });
});