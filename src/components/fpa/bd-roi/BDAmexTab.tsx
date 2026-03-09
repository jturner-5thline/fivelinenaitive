import { useBDRoiStore } from './useBDRoiStore';
import { formatBDCurrency } from './bdRoiFormatters';

export function BDAmexTab() {
  const { amex, updateAmex } = useBDRoiStore();
  const total = amex.reduce((s, t) => s + t.amount, 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-[#212529]">AMEX CC Transactions</h2>
        <span className="text-[12px] text-[#6C757D]">Total: <strong className="text-[#212529]">{formatBDCurrency(total)}</strong></span>
      </div>

      <div className="border border-[#CED4DA] rounded-lg overflow-hidden">
        <div className="overflow-auto">
          <table className="w-full border-collapse text-[11px]" style={{ fontFamily: 'Inter, system-ui, sans-serif', fontVariantNumeric: 'tabular-nums' }}>
            <thead>
              <tr className="bg-[#F1F3F5]">
                <th className="text-left px-3 py-1.5 border-b border-[#CED4DA] font-semibold">Date</th>
                <th className="text-left px-3 py-1.5 border-b border-[#CED4DA] font-semibold">Description</th>
                <th className="text-right px-3 py-1.5 border-b border-[#CED4DA] font-semibold">Amount</th>
                <th className="text-left px-3 py-1.5 border-b border-[#CED4DA] font-semibold">Category</th>
              </tr>
            </thead>
            <tbody>
              {amex.map((txn, i) => (
                <tr key={i} className="border-b border-[#DEE2E6] hover:bg-[#F8F9FA]">
                  <td className="px-3 py-1.5">
                    <input
                      type="text" value={txn.date}
                      onChange={e => updateAmex(i, 'date', e.target.value)}
                      className="bg-transparent border-0 outline-none text-[11px] text-[#0070C0] hover:bg-[#E8F2FC] focus:bg-[#E8F2FC] rounded px-1"
                    />
                  </td>
                  <td className="px-3 py-1.5">
                    <input
                      type="text" value={txn.description}
                      onChange={e => updateAmex(i, 'description', e.target.value)}
                      className="w-full bg-transparent border-0 outline-none text-[11px] text-[#0070C0] hover:bg-[#E8F2FC] focus:bg-[#E8F2FC] rounded px-1"
                    />
                  </td>
                  <td className="px-3 py-1.5 text-right">
                    <input
                      type="number" value={txn.amount}
                      onChange={e => updateAmex(i, 'amount', parseFloat(e.target.value) || 0)}
                      className="w-20 text-right bg-transparent border-0 outline-none text-[11px] text-[#0070C0] hover:bg-[#E8F2FC] focus:bg-[#E8F2FC] rounded px-1"
                    />
                  </td>
                  <td className="px-3 py-1.5">
                    <input
                      type="text" value={txn.category}
                      onChange={e => updateAmex(i, 'category', e.target.value)}
                      className="bg-transparent border-0 outline-none text-[11px] text-[#0070C0] hover:bg-[#E8F2FC] focus:bg-[#E8F2FC] rounded px-1"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
