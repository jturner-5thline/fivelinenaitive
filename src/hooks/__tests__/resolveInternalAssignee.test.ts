import { describe, it, expect } from 'vitest';
import {
  resolveInternalAssignee,
  resolveAssigneeWithDealManagerFallback,
  type InternalMember,
} from '@/hooks/useMeetingTaskSuggestions';

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

describe('resolveAssigneeWithDealManagerFallback', () => {
  const chris: InternalMember = {
    user_id: 'u9', email: 'chris@5thline.co',
    first_name: 'Chris', last_name: 'T', display_name: 'Chris T',
  };

  it('assigns the deal manager when no internal mention matches', () => {
    const out = resolveAssigneeWithDealManagerFallback('Jerry Mikolajczyk', members, chris);
    expect(out.member?.user_id).toBe('u9');
    expect(out.source).toBe('deal-manager');
  });

  it('prefers the internal mention over the deal manager', () => {
    const out = resolveAssigneeWithDealManagerFallback('Flora Tan', members, chris);
    expect(out.member?.user_id).toBe('u2');
    expect(out.source).toBe('mention');
  });

  it('returns null when neither mention nor deal manager resolve', () => {
    const out = resolveAssigneeWithDealManagerFallback('Kevin Grapes', members, null);
    expect(out.member).toBeNull();
    expect(out.source).toBeNull();
  });

  it('returns null when there is no linked deal manager and no mention', () => {
    const out = resolveAssigneeWithDealManagerFallback(null, members, null);
    expect(out.member).toBeNull();
    expect(out.source).toBeNull();
  });
});