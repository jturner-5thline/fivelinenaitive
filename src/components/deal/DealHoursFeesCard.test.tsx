import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: () => ({ select: () => ({ eq: () => ({ order: async () => ({ data: [] }) }) }) }) } }));
vi.mock('@/hooks/useCompanyFeesVisibility', () => ({ useCompanyFeesVisibility: () => ({ retainerEnabled: true, milestoneEnabled: true }) }));
vi.mock('@/components/deal/DealHoursEntriesEditor', () => ({ AddHoursButton: () => null }));
import { DealHoursFeesCard } from './DealHoursFeesCard';
import { TooltipProvider } from '@/components/ui/tooltip';
describe('minimum success fee editing', () => {
  it('commits the minimum once on blur, not on every keystroke', () => {
    const updateDeal = vi.fn();
    render(<TooltipProvider><DealHoursFeesCard compact deal={{ id: 'deal', value: 1000000, totalFee: 15000, successFeePercent: 1.5, successFeeMinimum: null }} updateDeal={updateDeal} /></TooltipProvider>);
    fireEvent.click(screen.getByRole('button', { name: 'Hours and fees' }));
    const input = screen.getByLabelText('Minimum success fee');
    fireEvent.focus(input); fireEvent.change(input, { target: { value: '25000' } });
    expect(updateDeal).not.toHaveBeenCalled();
    fireEvent.blur(input);
    expect(updateDeal).toHaveBeenCalledTimes(1);
    expect(updateDeal).toHaveBeenCalledWith('successFeeMinimum', 25000);
  });
  it('clears the minimum to null when the entry is emptied', () => {
    const updateDeal = vi.fn();
    render(<TooltipProvider><DealHoursFeesCard compact deal={{ id: 'deal', value: 1000000, totalFee: 25000, successFeePercent: 1.5, successFeeMinimum: 25000 }} updateDeal={updateDeal} /></TooltipProvider>);
    fireEvent.click(screen.getByRole('button', { name: 'Hours and fees' }));
    const input = screen.getByLabelText('Minimum success fee');
    fireEvent.focus(input); fireEvent.change(input, { target: { value: '' } }); fireEvent.blur(input);
    expect(updateDeal).toHaveBeenCalledTimes(1);
    expect(updateDeal).toHaveBeenCalledWith('successFeeMinimum', null);
  });
});