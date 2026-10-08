import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useDealEngagementOptions } from '@/hooks/useDealEngagementOptions';

/** Engagement dropdown driven by the workspace's configured options. */
export function EngagementSelect({ value, onChange, className }: { value?: string | null; onChange: (v: string) => void; className?: string }) {
  const { options, labelFor } = useDealEngagementOptions();
  const hasCurrent = !value || options.some(o => o.id === value);
  return (
    <Select value={value || undefined} onValueChange={onChange}>
      <SelectTrigger className={className ?? 'w-full h-8 text-sm'}><SelectValue placeholder="Select..." /></SelectTrigger>
      <SelectContent>
        {options.map(o => <SelectItem key={o.id} value={o.id}>{o.label}</SelectItem>)}
        {!hasCurrent && value && <SelectItem value={value}>{labelFor(value)}</SelectItem>}
      </SelectContent>
    </Select>
  );
}
