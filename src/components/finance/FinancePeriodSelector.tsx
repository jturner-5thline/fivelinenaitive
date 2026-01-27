import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { FinancePeriodType } from "@/pages/Finance";

interface FinancePeriodSelectorProps {
  periodType: FinancePeriodType;
  setPeriodType: (type: FinancePeriodType) => void;
  selectedYear: number;
  setSelectedYear: (year: number) => void;
  selectedMonth?: number;
  setSelectedMonth: (month: number | undefined) => void;
  selectedQuarter?: number;
  setSelectedQuarter: (quarter: number | undefined) => void;
}

const months = [
  { value: 1, label: "January" },
  { value: 2, label: "February" },
  { value: 3, label: "March" },
  { value: 4, label: "April" },
  { value: 5, label: "May" },
  { value: 6, label: "June" },
  { value: 7, label: "July" },
  { value: 8, label: "August" },
  { value: 9, label: "September" },
  { value: 10, label: "October" },
  { value: 11, label: "November" },
  { value: 12, label: "December" },
];

const quarters = [
  { value: 1, label: "Q1 (Jan-Mar)" },
  { value: 2, label: "Q2 (Apr-Jun)" },
  { value: 3, label: "Q3 (Jul-Sep)" },
  { value: 4, label: "Q4 (Oct-Dec)" },
];

export function FinancePeriodSelector({
  periodType,
  setPeriodType,
  selectedYear,
  setSelectedYear,
  selectedMonth,
  setSelectedMonth,
  selectedQuarter,
  setSelectedQuarter,
}: FinancePeriodSelectorProps) {
  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 10 }, (_, i) => currentYear - 5 + i);

  const handlePeriodTypeChange = (value: string) => {
    if (value) {
      setPeriodType(value as FinancePeriodType);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-3">
      <ToggleGroup
        type="single"
        value={periodType}
        onValueChange={handlePeriodTypeChange}
        className="bg-muted/50 rounded-lg p-1"
      >
        <ToggleGroupItem value="monthly" className="px-3 py-1.5 text-sm">
          Monthly
        </ToggleGroupItem>
        <ToggleGroupItem value="quarterly" className="px-3 py-1.5 text-sm">
          Quarterly
        </ToggleGroupItem>
        <ToggleGroupItem value="annual" className="px-3 py-1.5 text-sm">
          Annual
        </ToggleGroupItem>
      </ToggleGroup>

      <Select
        value={selectedYear.toString()}
        onValueChange={(v) => setSelectedYear(parseInt(v))}
      >
        <SelectTrigger className="w-[100px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {years.map((year) => (
            <SelectItem key={year} value={year.toString()}>
              {year}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {periodType === "monthly" && (
        <Select
          value={selectedMonth?.toString() || ""}
          onValueChange={(v) => setSelectedMonth(parseInt(v))}
        >
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Select month" />
          </SelectTrigger>
          <SelectContent>
            {months.map((month) => (
              <SelectItem key={month.value} value={month.value.toString()}>
                {month.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {periodType === "quarterly" && (
        <Select
          value={selectedQuarter?.toString() || ""}
          onValueChange={(v) => setSelectedQuarter(parseInt(v))}
        >
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Select quarter" />
          </SelectTrigger>
          <SelectContent>
            {quarters.map((quarter) => (
              <SelectItem key={quarter.value} value={quarter.value.toString()}>
                {quarter.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  );
}
