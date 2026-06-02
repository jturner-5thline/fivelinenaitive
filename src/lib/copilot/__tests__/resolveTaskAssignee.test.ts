import { describe, it, expect } from 'vitest';
import { resolveTaskAssignee, type AssigneeMember } from '../resolveTaskAssignee';

const CALLER = 'caller-uuid';
const niki: AssigneeMember = { user_id: 'u-niki', first_name: 'Niki', last_name: 'Heikali', display_name: 'Niki Heikali', email: 'niki@5thline.co' };
const james: AssigneeMember = { user_id: 'u-james', first_name: 'James', last_name: 'Turner', display_name: 'James Turner', email: 'jturner@5thline.co' };
const jamesKim: AssigneeMember = { user_id: 'u-james-kim', first_name: 'James', last_name: 'Kim', display_name: 'James Kim', email: 'james.kim@5thline.co' };
const scott: AssigneeMember = { user_id: 'u-scott', first_name: 'Scott', last_name: 'Wu', display_name: 'Scott Wu', email: 'scott@5thline.co' };

const roster = [niki, james, jamesKim, scott];

describe('resolveTaskAssignee (bug #1215344941044854)', () => {
  it('"for James Turner" → James Turner (unique full-name)', () => {
    const r = resolveTaskAssignee({ name: 'James Turner', members: roster, callerUserId: CALLER });
    expect(r.strategy).toBe('fuzzy_unique');
    expect(r.resolvedUserId).toBe('u-james');
  });

  it('"James Turner" with caller=Niki must NOT silently fall back to caller', () => {
    const r = resolveTaskAssignee({ name: 'James Turner', members: roster, callerUserId: niki.user_id });
    expect(r.resolvedUserId).toBe('u-james');
    expect(r.resolvedUserId).not.toBe(niki.user_id);
  });

  it('"jturner@5thline.co" → James by email', () => {
    const r = resolveTaskAssignee({ name: 'jturner@5thline.co', members: roster, callerUserId: CALLER });
    expect(r.strategy).toBe('fuzzy_unique');
    expect(r.resolvedUserId).toBe('u-james');
  });

  it('"Scott" → unique first-name match', () => {
    const r = resolveTaskAssignee({ name: 'Scott', members: roster, callerUserId: CALLER });
    expect(r.strategy).toBe('fuzzy_unique');
    expect(r.resolvedUserId).toBe('u-scott');
  });

  it('"James" (bare first name) with two Jameses → ambiguous, no auto-pick', () => {
    const r = resolveTaskAssignee({ name: 'James', members: roster, callerUserId: CALLER });
    expect(r.strategy).toBe('ambiguous');
    expect(r.resolvedUserId).toBeNull();
    expect(r.candidates.map(c => c.user_id).sort()).toEqual(['u-james', 'u-james-kim']);
  });

  it('unknown name → no_match (handler must ask for clarification, never default to caller)', () => {
    const r = resolveTaskAssignee({ name: 'Bartholomew Q. Ziegler', members: roster, callerUserId: CALLER });
    expect(r.strategy).toBe('no_match');
    expect(r.resolvedUserId).toBeNull();
  });

  it('no assignee specified → caller default preserved', () => {
    const r = resolveTaskAssignee({ members: roster, callerUserId: CALLER });
    expect(r.strategy).toBe('omitted');
    expect(r.resolvedUserId).toBe(CALLER);
  });

  it('explicit UUID wins over name', () => {
    const r = resolveTaskAssignee({ uuid: james.user_id, name: 'Scott', members: roster, callerUserId: CALLER });
    expect(r.strategy).toBe('uuid');
    expect(r.resolvedUserId).toBe(james.user_id);
  });
});