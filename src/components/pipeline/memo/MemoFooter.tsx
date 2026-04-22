interface MemoFooterProps {
  /** Kept for backward compatibility with PipelineMemoCard; no longer used. */
  showLiveDot?: boolean;
}

export function MemoFooter({ showLiveDot: _showLiveDot }: MemoFooterProps = {}) {
  return (
    <div className="px-5 py-2.5 border-t border-border flex items-center justify-between gap-4 text-[10px]">
      <div className="font-semibold uppercase tracking-[0.14em] text-primary">
        5th Line Capital Advisors
      </div>
      <div className="italic text-muted-foreground hidden sm:block flex-1 text-center">
        Confidential · for internal review only
      </div>
      <div className="flex items-center gap-1.5">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
        <span className="text-emerald-500 font-semibold uppercase tracking-wider">Live Deal</span>
      </div>
    </div>
  );
}