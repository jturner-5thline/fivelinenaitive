import { useState } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MasterLender } from '@/hooks/useMasterLenders';
import { FundingSourceTypeQuickFilters } from './FundingSourceTypeQuickFilters';
import { applyLenderFilters, emptyFilters, type LenderFilters } from './LenderFilters';

const lenders = [
  { id: 'bank', name: 'Bank One', lender_type: 'bank' },
  { id: 'credit', name: 'Credit One', lender_type: 'Private Credit, Bank' },
  { id: 'equity', name: 'Equity One', lender_type: 'Equity' },
  { id: 'unknown', name: 'Unknown', lender_type: null },
] as MasterLender[];

afterEach(cleanup);

function Harness({ initial = emptyFilters }: { initial?: LenderFilters }) {
  const [filters, setFilters] = useState(initial);
  return <>
    <FundingSourceTypeQuickFilters selectedTypes={filters.lenderTypes ?? []} onChange={lenderTypes => setFilters(current => ({ ...current, lenderTypes }))} />
    <output aria-label="Matching IDs">{applyLenderFilters(lenders, filters).map(l => l.id).join(',')}</output>
  </>;
}

describe('funding source type quick filters', () => {
  it('selects only one type, matching case-insensitively and including multi-tag sources', () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'Bank' }));
    expect(screen.getByLabelText('Matching IDs')).toHaveTextContent(/^bank,credit$/);
    fireEvent.click(screen.getByRole('button', { name: 'Equity' }));
    expect(screen.getByLabelText('Matching IDs')).toHaveTextContent(/^equity$/);
    expect(screen.getByRole('button', { name: 'Bank' })).toHaveAttribute('aria-pressed', 'false');
  });

  it.each(['All', 'Bank'])('clears only the type filter using %s', reset => {
    render(<Harness initial={{ ...emptyFilters, searchQuery: 'One', lenderTypes: ['Bank'] }} />);
    fireEvent.click(screen.getByRole('button', { name: reset }));
    expect(screen.getByLabelText('Matching IDs')).toHaveTextContent(/^bank,credit,equity$/);
  });

  it('preserves advanced mode while filtering by type', () => {
    render(<Harness initial={{ ...emptyFilters, filterMode: 'advanced' }} />);
    fireEvent.click(screen.getByRole('button', { name: 'Private Credit' }));
    expect(screen.getByLabelText('Matching IDs')).toHaveTextContent(/^credit$/);
  });

  it('follows external filter changes and replaces multi-select with a single type', () => {
    const change = vi.fn();
    const { rerender } = render(<FundingSourceTypeQuickFilters selectedTypes={['Bank', 'Equity']} onChange={change} />);
    fireEvent.click(screen.getByRole('button', { name: 'Bank' }));
    expect(change).toHaveBeenCalledWith(['Bank']);
    rerender(<FundingSourceTypeQuickFilters selectedTypes={['Bank']} onChange={change} />);
    fireEvent.click(screen.getByRole('button', { name: 'Bank' }));
    expect(change).toHaveBeenLastCalledWith([]);
  });

  it('returns no matches for an absent type without changing source records', () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'SBA' }));
    expect(screen.getByLabelText('Matching IDs').textContent).toBe('');
    expect(lenders[0].lender_type).toBe('bank');
    fireEvent.click(screen.getByRole('button', { name: 'All' }));
    expect(screen.getByLabelText('Matching IDs')).toHaveTextContent(/^bank,credit,equity,unknown$/);
  });
});