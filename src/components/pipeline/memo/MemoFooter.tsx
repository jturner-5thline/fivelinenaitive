interface MemoFooterProps {
  /** Disable the pulse animation for off-screen / bulk-rendered cards to save GPU. */
  showLiveDot?: boolean;
}

export function MemoFooter({ showLiveDot = true }: MemoFooterProps) {
  return (
    <div className="px-6 py-3 border-t border-white/40 flex items-center justify-between gap-4 text-[10px]">
      <div className="font-semibold uppercase tracking-[0.18em] text-[#1e8b8b]">
        5th Line Capital Advisors
      </div>
      <div className="italic font-light text-[#7a9aaa] hidden sm:block flex-1 text-center">
        Confidential · for internal review only
      </div>
      <div className="flex items-center gap-1.5">
        <span className={`h-1.5 w-1.5 rounded-full bg-[#1a7a52] ${showLiveDot ? 'pipeline-memo-live-dot' : ''}`} />
        <span className="text-[#1a7a52] font-semibold uppercase tracking-wider">Live Deal</span>
      </div>
    </div>
  );
}