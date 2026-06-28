import { useState, useRef, useEffect, useMemo, useCallback, KeyboardEvent } from "react";
import { Settings2, X, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type RowFormat = "dollar" | "count";

interface RowDef {
  key: string;
  label: string;
  format: RowFormat;
}

const MONTHS = [
  "Jan 2026", "Feb 2026", "Mar 2026", "Apr 2026", "May 2026",
  "Jun 2026", "Jul 2026", "Aug 2026", "Sep 2026",
];

const ROWS: RowDef[] = [
  { key: "deals_on_board", label: "Deals on Board", format: "count" },
  { key: "dollars_on_board", label: "Dollars on Board", format: "dollar" },
  { key: "proposals_issued", label: "Proposals Issued #", format: "count" },
  { key: "dollars_proposed", label: "Dollars Proposed", format: "dollar" },
  { key: "clients_signed", label: "Clients Signed", format: "count" },
  { key: "dollars_signed", label: "Dollars Signed", format: "dollar" },
  { key: "clients_receiving_terms", label: "Clients Receiving Terms", format: "count" },
  { key: "terms_signed", label: "Terms Signed", format: "count" },
  { key: "volume_terms_signed", label: "Volume of Terms Signed", format: "dollar" },
  { key: "deals_closed", label: "Deals Closed", format: "count" },
  { key: "dollars_funded", label: "Dollars Funded", format: "dollar" },
];

const SEED: Record<string, number[]> = {
  deals_on_board:           [11, 11, 11, 11, 11, 11, 11, 11, 11],
  dollars_on_board:         [30.3, 30.3, 30.3, 30.3, 30.3, 30.3, 30.3, 30.3, 30.3],
  proposals_issued:         [7, 7, 7, 7, 7, 7, 7, 7, 7],
  dollars_proposed:         [20.0, 20.0, 20.0, 20.0, 20.0, 20.0, 20.0, 20.0, 20.0],
  clients_signed:           [1, 2, 2, 2, 2, 2, 2, 2, 2],
  dollars_signed:           [4.8, 8.0, 8.0, 8.0, 8.0, 8.0, 8.0, 12.0, 12.0],
  clients_receiving_terms:  [2, 2, 2, 1, 2, 2, 2, 2, 2],
  terms_signed:             [2, 2, 2, 2, 1, 2, 2, 2, 2],
  volume_terms_signed:      [6.4, 6.4, 6.4, 6.4, 3.5, 7.2, 8.0, 8.0, 8.0],
  deals_closed:             [2, 2, 2, 2, 2, 2, 2, 1, 2],
  dollars_funded:           [6.4, 6.4, 6.4, 6.4, 6.7, 7.2, 8.0, 4.8, 8.0],
};

type GridData = Record<string, number[]>;

function cloneData(d: GridData): GridData {
  const out: GridData = {};
  for (const k of Object.keys(d)) out[k] = [...d[k]];
  return out;
}

function formatCell(value: number, format: RowFormat): string {
  if (!Number.isFinite(value)) return "—";
  if (format === "dollar") return `$${value.toFixed(1)}MM`;
  return `${Math.round(value)}`;
}

interface Props {
  onSave?: (data: GridData) => void;
}

export function SalesModelForecastWidget({ onSave }: Props) {
  const [data, setData] = useState<GridData>(() => cloneData(SEED));
  const [open, setOpen] = useState(false);

  const handleSave = useCallback((next: GridData) => {
    setData(cloneData(next));
    onSave?.(next);
    setOpen(false);
  }, [onSave]);

  return (
    <div
      className="rounded-md border border-white/[0.06] bg-gradient-to-br from-white/[0.04] to-white/[0.01] backdrop-blur-xl shadow-[0_10px_30px_-15px_rgba(0,0,0,0.6)] overflow-hidden"
      style={{ fontFamily: "Inter, system-ui, sans-serif" }}
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
        <div>
          <h3
            className="text-sm font-semibold text-white tracking-tight"
            style={{ fontFamily: "Syne, Inter, sans-serif" }}
          >
            Sales Model — Monthly Forecast
          </h3>
          <p className="text-[11px] text-white/40 mt-0.5">Jan 2026 – Sep 2026 projection</p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setOpen(true)}
          className="h-8 gap-1.5 text-xs text-white/70 hover:text-white hover:bg-white/[0.06]"
        >
          <Settings2 className="h-3.5 w-3.5" />
          Edit Actuals
        </Button>
      </div>
      <ReadOnlyTable data={data} />
      {open && (
        <SalesModelEditModal
          initial={data}
          onClose={() => setOpen(false)}
          onSave={handleSave}
        />
      )}
    </div>
  );
}

function ReadOnlyTable({ data }: { data: GridData }) {
  return (
    <div className="overflow-x-auto">
      <table
        className="w-full text-xs border-separate border-spacing-0"
        style={{ fontFamily: "'JetBrains Mono', ui-monospace, monospace" }}
      >
        <thead>
          <tr>
            <th
              className="sticky left-0 z-10 bg-white/[0.04] backdrop-blur-md text-left font-medium text-white/60 px-3 py-2 border-b border-white/[0.06] min-w-[200px]"
              style={{ fontFamily: "Inter, sans-serif" }}
            >
              Metric
            </th>
            {MONTHS.map((m) => (
              <th
                key={m}
                className="text-right font-medium text-white/60 px-3 py-2 border-b border-white/[0.06] whitespace-nowrap"
              >
                {m}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ROWS.map((row, ri) => (
            <tr key={row.key} className={ri % 2 === 0 ? "bg-transparent" : "bg-white/[0.015]"}>
              <td
                className="sticky left-0 z-10 bg-[hsl(var(--background))]/80 backdrop-blur-md text-white/80 px-3 py-1.5 border-b border-white/[0.04] whitespace-nowrap"
                style={{ fontFamily: "Inter, sans-serif" }}
              >
                {row.label}
              </td>
              {(data[row.key] || []).map((v, ci) => (
                <td
                  key={ci}
                  className="text-right text-white/85 px-3 py-1.5 border-b border-white/[0.04] tabular-nums"
                >
                  {formatCell(v, row.format)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

interface ModalProps {
  initial: GridData;
  onClose: () => void;
  onSave: (data: GridData) => void;
}

function SalesModelEditModal({ initial, onClose, onSave }: ModalProps) {
  const [draft, setDraft] = useState<GridData>(() => cloneData(initial));
  const [active, setActive] = useState<{ r: number; c: number }>({ r: 0, c: 0 });
  const inputsRef = useRef<(HTMLInputElement | null)[][]>([]);

  // initialize ref grid
  useEffect(() => {
    inputsRef.current = ROWS.map(() => MONTHS.map(() => null));
  }, []);

  useEffect(() => {
    const el = inputsRef.current[active.r]?.[active.c];
    if (el) el.focus();
  }, [active]);

  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const move = (r: number, c: number) => {
    const nr = Math.max(0, Math.min(ROWS.length - 1, r));
    const nc = Math.max(0, Math.min(MONTHS.length - 1, c));
    setActive({ r: nr, c: nc });
  };

  const handleKey = (e: KeyboardEvent<HTMLInputElement>, r: number, c: number) => {
    if (e.key === "ArrowUp") { e.preventDefault(); move(r - 1, c); }
    else if (e.key === "ArrowDown" || e.key === "Enter") { e.preventDefault(); move(r + 1, c); }
    else if (e.key === "ArrowLeft") {
      const input = e.currentTarget;
      if (input.selectionStart === 0 && input.selectionEnd === 0) { e.preventDefault(); move(r, c - 1); }
    }
    else if (e.key === "ArrowRight") {
      const input = e.currentTarget;
      if (input.selectionStart === input.value.length && input.selectionEnd === input.value.length) { e.preventDefault(); move(r, c + 1); }
    }
    else if (e.key === "Tab") {
      e.preventDefault();
      move(r, c + (e.shiftKey ? -1 : 1));
    }
  };

  const commit = (r: number, c: number, raw: string) => {
    const num = parseFloat(raw);
    if (Number.isNaN(num)) return;
    setDraft((prev) => {
      const next = cloneData(prev);
      next[ROWS[r].key][c] = num;
      return next;
    });
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/70 backdrop-blur-md">
      <div
        className="relative w-full max-w-[1200px] max-h-[88vh] flex flex-col rounded-lg border border-white/10 bg-gradient-to-br from-[hsl(240_15%_8%)] to-[hsl(240_20%_5%)] shadow-[0_30px_80px_-20px_rgba(0,0,0,0.8)]"
        style={{ fontFamily: "Inter, system-ui, sans-serif" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
          <h2
            className="text-base font-semibold text-white tracking-tight"
            style={{ fontFamily: "Syne, Inter, sans-serif" }}
          >
            Sales Model — Monthly Forecast
          </h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded p-1.5 text-white/60 hover:text-white hover:bg-white/[0.08]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Grid body */}
        <div className="flex-1 overflow-auto p-4">
          <table
            className="border-separate border-spacing-0 text-xs"
            style={{ fontFamily: "'JetBrains Mono', ui-monospace, monospace" }}
          >
            <thead>
              <tr>
                <th
                  className="sticky left-0 top-0 z-30 bg-[hsl(240_18%_10%)] text-left font-medium text-white/70 px-3 py-2 border-b border-r border-white/10 min-w-[210px]"
                  style={{ fontFamily: "Inter, sans-serif" }}
                >
                  Metric
                </th>
                {MONTHS.map((m, i) => (
                  <th
                    key={m}
                    className={cn(
                      "sticky top-0 z-20 bg-[hsl(240_18%_10%)] text-right font-medium px-3 py-2 border-b border-white/10 whitespace-nowrap min-w-[110px] transition-colors",
                      active.c === i ? "text-cyan-300" : "text-white/70"
                    )}
                  >
                    {m}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ROWS.map((row, r) => (
                <tr key={row.key}>
                  <td
                    className={cn(
                      "sticky left-0 z-10 bg-[hsl(240_18%_10%)] px-3 py-1.5 border-b border-r border-white/10 whitespace-nowrap transition-colors",
                      active.r === r ? "text-indigo-300" : "text-white/75"
                    )}
                    style={{ fontFamily: "Inter, sans-serif" }}
                  >
                    {row.label}
                  </td>
                  {MONTHS.map((_, c) => {
                    const isActive = active.r === r && active.c === c;
                    return (
                      <td
                        key={c}
                        className={cn(
                          "border-b border-white/[0.05] p-0 transition-colors",
                          isActive && "bg-indigo-500/[0.08]"
                        )}
                      >
                        <input
                          ref={(el) => {
                            if (!inputsRef.current[r]) inputsRef.current[r] = [];
                            inputsRef.current[r][c] = el;
                          }}
                          type="text"
                          inputMode="decimal"
                          defaultValue={String(draft[row.key][c])}
                          key={`${r}-${c}-${draft[row.key][c]}`}
                          onFocus={() => setActive({ r, c })}
                          onKeyDown={(e) => handleKey(e, r, c)}
                          onBlur={(e) => commit(r, c, e.target.value)}
                          className={cn(
                            "w-full bg-transparent text-right tabular-nums px-3 py-1.5 outline-none text-white/90",
                            "focus:ring-2 focus:ring-inset focus:ring-cyan-400/60 focus:bg-cyan-400/[0.04]"
                          )}
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-3 text-[11px] text-white/40">
            Tip: Arrow keys / Tab to navigate · Enter to move down · dollar rows are stored as raw numbers and displayed as $X.XMM.
          </p>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-6 py-3 border-t border-white/10 bg-white/[0.02]">
          <Button variant="ghost" size="sm" onClick={onClose} className="text-white/70 hover:text-white">
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={() => onSave(draft)}
            className="gap-1.5 bg-gradient-to-r from-indigo-500 to-cyan-500 hover:from-indigo-400 hover:to-cyan-400 text-white border-0 shadow-[0_0_20px_-4px_rgba(99,102,241,0.5)]"
          >
            <Save className="h-3.5 w-3.5" />
            Save
          </Button>
        </div>
      </div>
    </div>
  );
}

export default SalesModelForecastWidget;