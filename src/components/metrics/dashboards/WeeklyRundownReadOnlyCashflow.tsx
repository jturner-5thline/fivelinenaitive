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
        /* Disable all inputs, buttons, selects, textareas inside the wrapper */
        .weekly-rundown-readonly-cashflow input,
        .weekly-rundown-readonly-cashflow textarea,
        .weekly-rundown-readonly-cashflow select,
        .weekly-rundown-readonly-cashflow button:not(.ro-allow),
        .weekly-rundown-readonly-cashflow [contenteditable="true"] {
          pointer-events: none !important;
          user-select: text !important;
          opacity: 0.95;
        }
        /* Visually neutralize edit affordances (hover states, dashed borders, etc.) */
        .weekly-rundown-readonly-cashflow [data-editable="true"] {
          cursor: default !important;
        }
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
