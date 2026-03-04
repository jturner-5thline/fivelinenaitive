import { useState } from 'react';
import { Copy, Check } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface CopyableTextProps {
  text: string;
  /** Optional href for the link (e.g. mailto: or tel:) */
  href?: string;
  className?: string;
  iconSize?: string;
}

export function CopyableText({ text, href, className, iconSize = 'h-3 w-3' }: CopyableTextProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast.success('Copied to clipboard');
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error('Failed to copy');
    }
  };

  const Icon = copied ? Check : Copy;

  return (
    <span className="inline-flex items-center gap-1.5 min-w-0 group/copy">
      {href ? (
        <a href={href} className={cn('truncate', className)}>
          {text}
        </a>
      ) : (
        <span className={cn('truncate', className)}>{text}</span>
      )}
      <button
        type="button"
        onClick={handleCopy}
        className={cn(
          'shrink-0 text-muted-foreground hover:text-foreground transition-colors opacity-0 group-hover/copy:opacity-100 focus:opacity-100',
          copied && 'text-green-500 opacity-100'
        )}
        title="Copy to clipboard"
      >
        <Icon className={iconSize} />
      </button>
    </span>
  );
}
