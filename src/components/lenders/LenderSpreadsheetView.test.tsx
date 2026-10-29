import { useState } from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MasterLender } from '@/hooks/useMasterLenders';
import { LenderSpreadsheetView } from './LenderSpreadsheetView';
import type { ComponentType, ReactNode } from 'react';

type MockTableProps = {
  data: MasterLender[];
  components: { TableRow: ComponentType<{ item: MasterLender; children: ReactNode }> };
  fixedHeaderContent: () => ReactNode;
  itemContent: (index: number, item: MasterLender) => ReactNode;
  endReached: () => void;
};

vi.mock('react-virtuoso', () => ({
  TableVirtuoso: ({ data, components, fixedHeaderContent, itemContent, endReached }: MockTableProps) => {
    const Row = components.TableRow;
    return <><table><thead>{fixedHeaderContent()}</thead><tbody>{data.map((item: MasterLender, index: number) =>
      <Row key={item.id} item={item}>{itemContent(index, item)}</Row>
    )}</tbody></table><button onClick={endReached}>Reach end</button></>;
  },
}));

const lenders = [
  { id: 'b', name: 'Beta', min_deal: 30_000_000, email: 'beta@example.com' },
  { id: 'a', name: 'Alpha', min_deal: 10_000_000 },
] as MasterLender[];
afterEach(cleanup);

describe('Funding Sources spreadsheet interactions', () => {
  it('cycles sorting without changing the input records', () => {
    render(<LenderSpreadsheetView lenders={lenders} activeDealCounts={{}} loadingMore={false} hasMore={false} totalCount={2} onLoadMore={vi.fn()} />);
    const names = () => screen.getAllByRole('button', { name: /^Open / }).map(row => row.getAttribute('aria-label'));
    const sort = screen.getByRole('button', { name: 'Sort by Name' });
    expect(names()).toEqual(['Open Beta', 'Open Alpha']);
    fireEvent.click(sort);
    expect(names()).toEqual(['Open Alpha', 'Open Beta']);
    fireEvent.click(sort);
    expect(names()).toEqual(['Open Beta', 'Open Alpha']);
    fireEvent.click(sort);
    expect(names()).toEqual(['Open Beta', 'Open Alpha']);
    expect(lenders.map(lender => lender.id)).toEqual(['b', 'a']);
  });

  it('selects rows without opening details, while row keyboard navigation opens details', () => {
    const open = vi.fn();
    function Harness() {
      const [selectedIds, setSelectedIds] = useState(new Set<string>());
      return <LenderSpreadsheetView lenders={lenders} activeDealCounts={{}} loadingMore={false} hasMore={false} totalCount={2} onLoadMore={vi.fn()} onRowClick={open}
        selectedIds={selectedIds} onToggleSelect={id => setSelectedIds(new Set([id]))} onSelectAll={() => setSelectedIds(new Set(['a', 'b']))} onClearSelection={() => setSelectedIds(new Set())} />;
    }
    render(<Harness />);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Beta' }));
    expect(open).not.toHaveBeenCalled();
    expect(screen.getByRole('checkbox', { name: 'Select all funding sources' })).toHaveAttribute('aria-checked', 'mixed');
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select all funding sources' }));
    expect(screen.getByRole('checkbox', { name: 'Select Alpha' })).toHaveAttribute('aria-checked', 'true');
    fireEvent.keyDown(screen.getByRole('button', { name: 'Open Alpha' }), { key: 'Enter' });
    expect(open).toHaveBeenCalledWith(lenders[1]);
    fireEvent.click(screen.getByRole('link', { name: 'beta@example.com' }));
    expect(open).toHaveBeenCalledTimes(1);
  });

  it.each([{ hasMore: true, loadingMore: false, calls: 1 }, { hasMore: false, loadingMore: false, calls: 0 }, { hasMore: true, loadingMore: true, calls: 0 }])('loads at the end only when available and idle: %j', ({ hasMore, loadingMore, calls }) => {
    const load = vi.fn();
    render(<LenderSpreadsheetView lenders={lenders} activeDealCounts={{}} loadingMore={loadingMore} hasMore={hasMore} totalCount={2} onLoadMore={load} />);
    fireEvent.click(screen.getByRole('button', { name: 'Reach end' }));
    expect(load).toHaveBeenCalledTimes(calls);
  });
});