import { cn } from '@/lib/utils';

interface CircularProgressProps {
  value: number;
  size?: number;
  strokeWidth?: number;
}

export function CircularProgress({ value, size = 40, strokeWidth = 3.5 }: CircularProgressProps) {
  const r = (size - strokeWidth) / 2;
  const c = r * 2 * Math.PI;
  const offset = c - (value / 100) * c;
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeWidth={strokeWidth} className="text-secondary" />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeWidth={strokeWidth}
          strokeDasharray={c} strokeDashoffset={offset} strokeLinecap="round"
          className={cn("transition-all duration-300", value === 100 ? "text-green-500" : "text-primary")} />
      </svg>
      <span className="absolute text-[10px] font-bold">{value}%</span>
    </div>
  );
}
