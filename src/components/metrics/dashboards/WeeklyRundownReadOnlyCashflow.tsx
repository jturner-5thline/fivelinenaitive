import { CashFlowManager } from '@/components/cashflow/CashFlowManager';

/**
 * Read-only wrapper for the Financials > Cashflow tab (CashFlowManager)
 * for use as Page 2 of the Weekly Rundown carousel.
 *
 * Renders the same component used in Finance > FPA Dashboard > Cash Flow tab,
 * but disables all interactive affordances so it functions as display-only.
 *
 * Strategy: wrap in a container that disables pointer events on inputs/buttons
 * via CSS (so layout / scroll / read-only views all still work) and adds a
 * subtle read-only banner.
 */
export function WeeklyRundownReadOnlyCashflow() {
  return (
    <div className="weekly-rundown-readonly-cashflow">
      <style>{`
        .weekly-rundown-readonly-cashflow {
          position: relative;
        }
        /* ───────── HARD-REMOVE all editing affordances inside the cashflow grid ─────────
           The grid must be VIEW-ONLY in the Weekly Rundown carousel — values come
           solely from QuickBooks. Hide (not just disable) every control that lets
           the user add, edit, or delete data. */

        /* "+ Add Row" footer (Cash Receipts / Disbursements) */
        .weekly-rundown-readonly-cashflow tr.cf-add-row-footer { display: none !important; }

        /* Save Plan button + "Search line items…" input (live in cf-range-controls) */
        .weekly-rundown-readonly-cashflow .cf-range-controls input[type="search"],
        .weekly-rundown-readonly-cashflow .cf-range-controls input[aria-label="Search line items"],
        .weekly-rundown-readonly-cashflow .cf-range-controls button[aria-label="Clear search"] {
          display: none !important;
        }
        .weekly-rundown-readonly-cashflow .cf-range-controls .cf-btn-secondary { display: none !important; }

        /* Inline cell "+ Add" popover triggers and "Clear manual override" buttons */
        .weekly-rundown-readonly-cashflow [aria-label="Add one-time entry for this week"],
        .weekly-rundown-readonly-cashflow [aria-label="Clear manual override"] {
          display: none !important;
        }

        /* Block all inline editing — make every input/textarea/contenteditable inert.
           Keep buttons enabled so safe affordances (collapse toggles, Export PDF,
           drilldown opens) still work. */
        .weekly-rundown-readonly-cashflow input:not([type="search"]),
        .weekly-rundown-readonly-cashflow textarea,
        .weekly-rundown-readonly-cashflow [contenteditable="true"] {
          pointer-events: none !important;
          user-select: text !important;
        }
        .weekly-rundown-readonly-cashflow [contenteditable="true"] { caret-color: transparent !important; }
        .weekly-rundown-readonly-cashflow [data-editable="true"] { cursor: default !important; }
      `}</style>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '8px 14px',
          margin: '8px 0 12px',
          borderRadius: 8,
          background: 'rgba(80,160,230,0.08)',
          border: '1px solid rgba(80,160,230,0.2)',
          color: 'rgba(180,210,235,0.85)',
          fontSize: 12,
          fontWeight: 600,
          letterSpacing: '.3px',
        }}
      >
        <span
          style={{
            display: 'inline-block',
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: 'rgba(120,200,255,0.85)',
          }}
        />
        Read-only view — synced with Finance · Cashflow
      </div>
      <CashFlowManager />
    </div>
  );
}
