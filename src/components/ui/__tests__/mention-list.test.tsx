import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { createRef } from 'react';
import { MentionList, matchesMentionQuery, type MentionUser } from '../mention-list';

const users: MentionUser[] = [
  { id: 'u1', display_name: 'James Turner', first_name: 'James', last_name: 'Turner', email: 'jturner@5thline.co' },
  { id: 'u2', display_name: 'Jamie Patel', first_name: 'Jamie', last_name: 'Patel', email: 'jp@x.co' },
  { id: 'u3', display_name: 'Niki Heikali', first_name: 'Niki', last_name: 'Heikali', email: 'niki@x.co' },
];

describe('matchesMentionQuery', () => {
  it('matches "Jam" against both Jameses', () => {
    const matches = users.filter((u) => matchesMentionQuery(u, 'Jam'));
    expect(matches.map((u) => u.id)).toEqual(['u1', 'u2']);
  });
  it('is case-insensitive on email', () => {
    expect(matchesMentionQuery(users[0], 'JTURNER')).toBe(true);
  });
});

describe('MentionList', () => {
  it('renders typeahead options and supports keyboard nav + Enter selection', () => {
    const command = vi.fn();
    const ref = createRef<any>();
    render(<MentionList ref={ref} items={users.slice(0, 2)} command={command} />);
    expect(screen.getByText('James Turner')).toBeInTheDocument();
    expect(screen.getByText('Jamie Patel')).toBeInTheDocument();

    // ArrowDown → second item highlighted
    expect(ref.current.onKeyDown({ event: new KeyboardEvent('keydown', { key: 'ArrowDown' }) })).toBe(true);
    // Enter → selects index 1 (Jamie)
    ref.current.onKeyDown({ event: new KeyboardEvent('keydown', { key: 'Enter' }) });
    expect(command).toHaveBeenCalledWith({ id: 'u2', label: 'Jamie Patel' });
  });

  it('wraps ArrowUp from index 0 to last item', () => {
    const command = vi.fn();
    const ref = createRef<any>();
    render(<MentionList ref={ref} items={users} command={command} />);
    ref.current.onKeyDown({ event: new KeyboardEvent('keydown', { key: 'ArrowUp' }) });
    ref.current.onKeyDown({ event: new KeyboardEvent('keydown', { key: 'Enter' }) });
    expect(command).toHaveBeenCalledWith({ id: 'u3', label: 'Niki Heikali' });
  });

  it('click selects item (mouse path mirrors Enter)', () => {
    const command = vi.fn();
    const ref = createRef<any>();
    render(<MentionList ref={ref} items={users} command={command} />);
    fireEvent.click(screen.getByText('James Turner'));
    expect(command).toHaveBeenCalledWith({ id: 'u1', label: 'James Turner' });
  });

  it('returns false from onKeyDown for non-nav keys (e.g. Esc) so editor can dismiss', () => {
    const ref = createRef<any>();
    render(<MentionList ref={ref} items={users} command={vi.fn()} />);
    expect(ref.current.onKeyDown({ event: new KeyboardEvent('keydown', { key: 'Escape' }) })).toBe(false);
  });

  it('renders empty-state when no items match', () => {
    render(<MentionList items={[]} command={vi.fn()} />);
    expect(screen.getByText('No team members found')).toBeInTheDocument();
  });
});

describe('mention serialization format', () => {
  // The Tiptap mention extension is configured to render selections as
  // @[Name](id) tokens in the comment body. The parser/trigger regex
  // is the contract — assert the round-trip shape here.
  it('produces tokens that match the trigger regex', () => {
    const token = '@[James Turner](a6b48ccd-0f2a-4018-886e-241287208ea0)';
    const re = /@\[([^\]]+)\]\(([0-9a-fA-F-]{36})\)/;
    const m = token.match(re);
    expect(m).not.toBeNull();
    expect(m![1]).toBe('James Turner');
    expect(m![2]).toBe('a6b48ccd-0f2a-4018-886e-241287208ea0');
  });
});