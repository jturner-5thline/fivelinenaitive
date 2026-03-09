import { useBDRoiStore } from './useBDRoiStore';
import { INITIAL_EVENT_BUDGET } from './bdRoiData';
import { formatBDCurrency } from './bdRoiFormatters';

const BUDGET_QUARTERS = ['Q1-26', 'Q2-26', 'Q3-26', 'Q4-26'];

export function BDEventsTab() {
  const { events, updateEvent } = useBDRoiStore();

  const cols: { key: keyof typeof events[0]; label: string; type: 'text' | 'number' }[] = [
    { key: 'quarter', label: 'Quarter', type: 'text' },
    { key: 'txnDate', label: 'Txn Date', type: 'text' },
    { key: 'eventDate', label: 'Event Date', type: 'text' },
    { key: 'category', label: 'Category', type: 'text' },
    { key: 'name', label: 'Event/Description', type: 'text' },
    { key: 'entity', label: 'Entity', type: 'text' },
    { key: 'person', label: 'Person(s)', type: 'text' },
    { key: 'totalCost', label: 'Total Cost', type: 'number' },
    { key: 'travel', label: 'Travel', type: 'number' },
    { key: 'dinner', label: 'Dinner', type: 'number' },
    { key: 'amtPaid', label: 'Amt Paid', type: 'number' },
    { key: 'amtOutstanding', label: 'Amt Outstanding', type: 'number' },
  ];

  const b = INITIAL_EVENT_BUDGET;

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-bold text-[#212529]">BD Events & T+E</h2>

      {/* Events Table */}
      <div className="border border-[#CED4DA] rounded-lg overflow-hidden">
        <div className="overflow-auto max-h-[500px]">
          <table className="w-full border-collapse text-[11px]" style={{ fontFamily: 'Inter, system-ui, sans-serif', fontVariantNumeric: 'tabular-nums' }}>
            <thead className="sticky top-0 z-10">
              <tr className="bg-[#F1F3F5]">
                {cols.map(col => (
                  <th key={col.key} className="px-2 py-1.5 text-left border-b border-[#CED4DA] font-semibold text-[#212529] whitespace-nowrap">
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {events.map((event, ei) => (
                <tr key={ei} className="border-b border-[#DEE2E6] hover:bg-[#F8F9FA]">
                  {cols.map(col => (
                    <td key={col.key} className="px-2 py-1">
                      <input
                        type={col.type === 'number' ? 'number' : 'text'}
                        value={event[col.key]}
                        onChange={e => updateEvent(ei, col.key, col.type === 'number' ? parseFloat(e.target.value) || 0 : e.target.value)}
                        className="w-full bg-transparent border-0 outline-none text-[11px] text-[#0070C0] hover:bg-[#E8F2FC] focus:bg-[#E8F2FC] rounded px-1 py-0.5"
                        style={{ minWidth: col.type === 'number' ? '70px' : '100px' }}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Budget Summary */}
      <div className="border border-[#CED4DA] rounded-lg overflow-hidden">
        <div className="bg-[#CAEDFB] px-3 py-2">
          <h3 className="text-[12px] font-bold text-[#212529]">Event Budget Summary (FY2026)</h3>
        </div>
        <div className="overflow-auto">
          <table className="w-full border-collapse text-[11px]" style={{ fontVariantNumeric: 'tabular-nums' }}>
            <thead>
              <tr className="bg-[#F1F3F5]">
                <th className="text-left px-3 py-1.5 border-b border-[#CED4DA] font-semibold min-w-[160px]">&nbsp;</th>
                {BUDGET_QUARTERS.map(q => (
                  <th key={q} className="text-right px-2 py-1.5 border-b border-[#CED4DA] font-semibold">{q}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr className="font-bold border-b border-[#CED4DA]">
                <td className="px-3 py-1.5">Proposed Budget</td>
                {b.proposed.map((v, i) => <td key={i} className="text-right px-2 py-1.5">{formatBDCurrency(v)}</td>)}
              </tr>
              <tr className="border-b border-[#DEE2E6]">
                <td className="px-3 py-1.5">Events Budget</td>
                {b.eventsBudget.map((v, i) => <td key={i} className="text-right px-2 py-1.5">{formatBDCurrency(v)}</td>)}
              </tr>
              <tr className="border-b border-[#DEE2E6]">
                <td className="px-3 py-1.5">Events Target</td>
                {b.eventsTarget.map((v, i) => <td key={i} className="text-right px-2 py-1.5">{formatBDCurrency(v)}</td>)}
              </tr>
              <tr className="border-b border-[#DEE2E6]">
                <td className="px-3 py-1.5 font-semibold">Events Over/Under</td>
                {b.eventsBudget.map((v, i) => {
                  const diff = v - b.eventsTarget[i];
                  return <td key={i} className="text-right px-2 py-1.5" style={{ color: diff > 0 ? '#DC3545' : '#198754' }}>{formatBDCurrency(diff)}</td>;
                })}
              </tr>
              <tr className="border-b border-[#DEE2E6]">
                <td className="px-3 py-1.5">Travel Budget</td>
                {b.travelBudget.map((v, i) => <td key={i} className="text-right px-2 py-1.5">{formatBDCurrency(v)}</td>)}
              </tr>
              <tr className="border-b border-[#DEE2E6]">
                <td className="px-3 py-1.5">Travel Target</td>
                {b.travelTarget.map((v, i) => <td key={i} className="text-right px-2 py-1.5">{formatBDCurrency(v)}</td>)}
              </tr>
              <tr>
                <td className="px-3 py-1.5 font-semibold">Travel Over/Under</td>
                {b.travelBudget.map((v, i) => {
                  const diff = v - b.travelTarget[i];
                  return <td key={i} className="text-right px-2 py-1.5" style={{ color: diff > 0 ? '#DC3545' : '#198754' }}>{formatBDCurrency(diff)}</td>;
                })}
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
