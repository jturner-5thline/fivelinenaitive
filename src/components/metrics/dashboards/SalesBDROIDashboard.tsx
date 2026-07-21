import { BDRoiModule } from '@/components/fpa/bd-roi/BDRoiModule';

/**
 * Sales & BD ROI Insights dashboard.
 * Moved from the Finance page — renders the full BD ROI module (dashboard,
 * partner/bank/CM comp/events/AMEX tabs) with its original data + design.
 */
export function SalesBDROIDashboard() {
  return (
    <div className="p-4">
      <BDRoiModule />
    </div>
  );
}
