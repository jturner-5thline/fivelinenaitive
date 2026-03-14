import { FormulaConfig } from '../widgetTypes';
import { Textarea } from '@/components/ui/textarea';

interface Props {
  config?: FormulaConfig;
  onChange: (c: FormulaConfig | undefined) => void;
}

export function FormulaSection({ config, onChange }: Props) {
  return (
    <Textarea
      className="text-xs font-mono min-h-[80px]"
      placeholder='SUM(Amount, Account="Debt Revenue")'
      value={config?.expression ?? ''}
      onChange={(e) => {
        const val = e.target.value;
        onChange(val.trim() ? { expression: val } : undefined);
      }}
    />
  );
}
