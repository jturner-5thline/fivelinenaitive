import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useContactTypes } from '@/hooks/useContactTypes';

interface Props {
  value: string | null | undefined;
  onChange: (value: string | null) => void;
  placeholder?: string;
  className?: string;
  includeNoneOption?: boolean;
  triggerClassName?: string;
}

const NONE_VALUE = '__none__';

export function ContactTypeSelect({
  value,
  onChange,
  placeholder = 'Select type',
  includeNoneOption = true,
  triggerClassName,
}: Props) {
  const { data: types = [], isLoading } = useContactTypes();

  // Make sure legacy/custom values still appear in the dropdown.
  const hasMatch = !value || types.some(t => t.name === value);
  const extra = !hasMatch && value ? [{ id: `_legacy_${value}`, name: value }] : [];

  return (
    <Select
      value={value || NONE_VALUE}
      onValueChange={(v) => onChange(v === NONE_VALUE ? null : v)}
      disabled={isLoading}
    >
      <SelectTrigger className={triggerClassName}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {includeNoneOption && <SelectItem value={NONE_VALUE}>None</SelectItem>}
        {types.map(t => (
          <SelectItem key={t.id} value={t.name}>{t.name}</SelectItem>
        ))}
        {extra.map(t => (
          <SelectItem key={t.id} value={t.name}>{t.name} (legacy)</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}