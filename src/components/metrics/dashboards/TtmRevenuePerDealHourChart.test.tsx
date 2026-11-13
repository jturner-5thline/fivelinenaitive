import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TtmRevenuePerDealHourChart } from './TtmRevenuePerDealHourChart';

const { useMetric } = vi.hoisted(() => ({ useMetric: vi.fn() }));
vi.mock('@/hooks/useTtmRevenuePerDealHour', () => ({ useTtmRevenuePerDealHour: useMetric }));
vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  BarChart: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Bar: ({ onClick }: { onClick: (row: object, index: number) => void }) => <button onClick={() => onClick({}, 0)}>First chart bar</button>,
  CartesianGrid: () => null, XAxis: () => null, YAxis: () => null, Tooltip: () => null,
}));
vi.mock('@/components/metrics/insights/InsightsDrilldownDrawer', () => ({
  InsightsDrilldownDrawer: ({ open, context, rows, summary, onClose }: { open: boolean; context: { selection: string } | null; rows: { name: string }[]; summary: React.ReactNode; onClose: () => void }) => open ? <div role="dialog">{context?.selection}{summary}{rows.map(row => <p key={row.name}>{row.name}</p>)}<button onClick={onClose}>Close detail</button></div> : null,
}));

describe('TTM chart interactions', () => {
  beforeEach(() => {
    useMetric.mockReturnValue({ hasAccess: true, data: [
      { start: '2024-10-01', end: '2025-09-30', label: 'Q3 25', revenue: 1000, hours: 10, rate: 100, deals: [{ id: 'one', name: 'Older deal', hours: 10, pipeline: 'Active Pipeline' }], delta: null },
      { start: '2025-10-01', end: '2026-09-30', label: 'Q3 26', revenue: 3000, hours: 20, rate: 150, deals: [{ id: 'two', name: 'Latest deal', hours: 20, pipeline: 'In Development' }], delta: 50, priorLabel: 'Q3 25', deltaPct: 50 },
    ] });
  });
  it('opens the clicked bar with that bar’s exact contributing deals and amounts', () => {
    render(<TtmRevenuePerDealHourChart />);
    fireEvent.click(screen.getByText('First chart bar'));
    expect(screen.getByRole('dialog')).toHaveTextContent('Older deal');
    expect(screen.getByRole('dialog')).toHaveTextContent('$1,000.00');
    expect(screen.getByRole('dialog')).not.toHaveTextContent('Latest deal');
    fireEvent.click(screen.getByText('Close detail'));
    fireEvent.click(screen.getByRole('button', { name: 'View selected period deal hours' }));
    expect(screen.getByRole('dialog')).toHaveTextContent('Latest deal');
    expect(screen.getByRole('dialog')).toHaveTextContent('$3,000.00');
  });
  it('expands into a larger chart requesting 3x the periods', () => {
    render(<TtmRevenuePerDealHourChart />);
    expect(useMetric).toHaveBeenCalledWith(3, false);
    fireEvent.click(screen.getByRole('button', { name: 'Expand chart' }));
    expect(useMetric).toHaveBeenLastCalledWith(3, true);
    expect(screen.getByRole('dialog')).toHaveTextContent('2 rolling periods');
  });
  it('offers retry rather than displaying a zero when data loading fails', () => {
    const refetch = vi.fn();
    useMetric.mockReturnValue({ hasAccess: true, isError: true, refetch });
    render(<TtmRevenuePerDealHourChart />);
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(refetch).toHaveBeenCalledOnce();
    expect(screen.queryByRole('button', { name: 'View selected period deal hours' })).not.toBeInTheDocument();
  });
  it('does not expose the metric in another workspace', () => {
    useMetric.mockReturnValue({ hasAccess: false });
    render(<TtmRevenuePerDealHourChart />);
    expect(screen.queryByTestId('ttm-revenue-per-deal-hour')).not.toBeInTheDocument();
  });
});