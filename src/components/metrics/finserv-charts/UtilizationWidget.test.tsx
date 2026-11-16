import { render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { UtilizationWidget } from './UtilizationWidget';

vi.mock('@/hooks/useCompany', () => ({ useCompany: () => ({ company: { id: 'workspace' } }) }));
vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({ data: {}, isLoading: false }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));
vi.mock('@/hooks/useHarvest', () => ({
  useHarvestData: () => ({ isLoading: false, months: {
    '2026-10': { people: {
      'Scott Williams': { hours: 10, billableHours: 8 },
      'Kris Smith': { hours: 10, billableHours: 6 },
      'Siddhi Shah': { hours: 10, billableHours: 0 },
    } },
  } }),
}));
vi.mock('recharts', () => ({
  ResponsiveContainer: () => null,
  LineChart: () => null, Line: () => null, YAxis: () => null, Tooltip: () => null,
}));

it('calculates blended utilization from Scott and Kris only, leaving Harvest entries untouched', () => {
  render(<UtilizationWidget monthKeys={['2026-10']} monthLabels={['Oct']} badge="Monthly" harvestSource />);
  expect(screen.getByText('80.0%')).toBeInTheDocument();
  expect(screen.getByText('60.0%')).toBeInTheDocument();
  expect(screen.getByText('70.0%')).toBeInTheDocument();
});