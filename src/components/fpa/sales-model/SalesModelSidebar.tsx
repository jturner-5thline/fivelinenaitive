import { useSalesModelStore } from './useSalesModelStore';
import type { SalesModelAssumptions } from './salesModelTypes';
import { ScrollArea } from '@/components/ui/scroll-area';

const SECTIONS = [
  'Plan', 'Pipeline Snapshot', 'Revenue', 'MSQL', 'Rep Cost', 'Net Rep Profit',
  'All-Time Metrics', 'TTM Metrics', 'Projected Metrics', 'Actuals Input',
  'Actuals/Forecast', 'Pipeline (Actuals)', 'Variance $', 'Variance %',
  'Total Costs', 'Sales Team ROI', 'Performance to Plan', 'Pipeline Performance',
];

function AssumptionBlock({ title, items }: { title: string; items: { label: string; value: string }[] }) {
  return (
    <div className="mb-3">
      <div className="text-[10px] uppercase tracking-wider font-semibold mb-1.5" style={{ color: '#5eead4' }}>{title}</div>
      <div className="space-y-1">
        {items.map(it => (
          <div key={it.label} className="flex justify-between text-[11px]">
            <span style={{ color: '#94a3b8' }}>{it.label}</span>
            <span className="font-mono" style={{ color: '#e2e8f0' }}>{it.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function SalesModelSidebar() {
  const { activeTab, sidebarOpen, teamData, repsData } = useSalesModelStore();

  if (!sidebarOpen) return null;

  const assumptions: SalesModelAssumptions = activeTab === 'TEAM'
    ? teamData.sidebar
    : repsData[activeTab]?.sidebar ?? teamData.sidebar;

  const scrollToSection = (section: string) => {
    const id = `section-${section.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="h-full flex flex-col border-r" style={{
      width: 260, background: '#13151c', borderColor: 'rgba(255,255,255,0.06)',
    }}>
      {/* Brand */}
      <div className="p-4 border-b" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
        <div className="flex items-center gap-2.5 mb-2">
          <div className="w-8 h-8 rounded-md flex items-center justify-center text-xs font-bold" style={{ background: '#0d9488', color: '#fff' }}>5L</div>
          <div>
            <div className="text-sm font-semibold" style={{ color: '#e2e8f0' }}>5th Line Capital</div>
            <div className="text-[10px]" style={{ color: '#64748b' }}>Sales Model</div>
          </div>
        </div>
        <div className="text-[11px] mt-2 px-2 py-1 rounded" style={{ background: 'rgba(94,234,212,0.06)', color: '#5eead4' }}>
          {activeTab} • Actuals through Jan 2026
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-4">
          {/* Assumptions */}
          <AssumptionBlock
            title="Time (Whole Months)"
            items={[
              { label: 'Email → Call', value: `${assumptions.time_months.email_to_call}` },
              { label: 'On Board → Proposal', value: `${assumptions.time_months.on_board_to_proposal}` },
              { label: 'Proposal → Engage', value: `${assumptions.time_months.proposal_to_engage}` },
              { label: 'Terms → Funded', value: `${assumptions.time_months.terms_to_funded}` },
              { label: 'Engage → Terms Signed', value: `${assumptions.time_months.engage_to_terms_signed}` },
              { label: 'Engage → Terms Received', value: `${assumptions.time_months.engage_to_terms_received}` },
            ]}
          />
          <AssumptionBlock
            title="Probability"
            items={[
              { label: 'On Board → Proposal', value: `${(assumptions.probability.on_board_to_proposal * 100).toFixed(0)}%` },
              { label: 'Proposal → Engage', value: `${(assumptions.probability.proposal_to_engage * 100).toFixed(0)}%` },
              { label: 'Clients Rec. Terms', value: `${(assumptions.probability.clients_receiving_terms * 100).toFixed(0)}%` },
              { label: 'Engaged → Terms Signed', value: `${(assumptions.probability.engaged_to_terms_signed * 100).toFixed(0)}%` },
              { label: 'Terms → Funded', value: `${(assumptions.probability.terms_to_funded * 100).toFixed(0)}%` },
            ]}
          />
          <AssumptionBlock
            title="Revenue & Cost"
            items={[
              { label: 'Retainer', value: `$${assumptions.revenue_cost.retainer.toLocaleString()}` },
              { label: 'Milestone', value: `$${assumptions.revenue_cost.milestone_payments.toLocaleString()}` },
              { label: 'Closing Fee', value: `${(assumptions.revenue_cost.closing_fee * 100).toFixed(2)}%` },
              { label: 'Commission', value: `${(assumptions.revenue_cost.commission * 100).toFixed(0)}%` },
            ]}
          />

          {/* Section Nav */}
          <div>
            <div className="text-[10px] uppercase tracking-wider font-semibold mb-2" style={{ color: '#5eead4' }}>Sections</div>
            <div className="space-y-0.5">
              {SECTIONS.map(s => (
                <button
                  key={s}
                  onClick={() => scrollToSection(s)}
                  className="w-full text-left text-[11px] px-2 py-1 rounded transition-colors hover:bg-white/5"
                  style={{ color: '#94a3b8' }}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}
