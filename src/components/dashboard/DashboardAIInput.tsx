import { useRef, useState } from 'react';
import { useCopilotStore } from '@/stores/copilotStore';
import { AskNaitiveBar } from '@/components/copilot/AskNaitiveBar';

/**
 * Dashboard "Ask naitive AI" tile.
 *
 * The legacy dashboard composer (a full ChatInputBar with proactive alerts,
 * recent prompts, quick-action chips, history sidebar, and a dedicated
 * `claude-dashboard-chat` Edge Function) has been retired in favour of the
 * single shared Ask naitive AI bar that powers the floating ⌘J launcher
 * (see `CopilotToggleButton` → `AskNaitiveBar`). Behaviour, styling,
 * placeholder, keyboard handling, and submission all flow through the same
 * shared component and `useCopilotStore`, so dashboard context is preserved
 * by the same downstream copilot panel/agent that handles every other page.
 */
interface DashboardAIInputProps {
  isDrawerMode?: boolean;
}

export function DashboardAIInput(_props: DashboardAIInputProps = {}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState('');
  const openPanelWithPrompt = useCopilotStore((s) => s.openPanelWithPrompt);
  const togglePanel = useCopilotStore((s) => s.togglePanel);
  const expandPanel = useCopilotStore((s) => s.expandPanel);
  const isOpen = useCopilotStore((s) => s.isOpen);
  const isMinimized = useCopilotStore((s) => s.isMinimized);

  const submit = () => {
    const q = value.trim();
    if (!q) return;
    openPanelWithPrompt(q);
    setValue('');
  };

  return (
    <div className="w-full h-full flex items-center justify-center p-1">
      <AskNaitiveBar
        inputRef={inputRef}
        value={value}
        onChange={setValue}
        onSubmit={submit}
        forceFocused={isOpen && !isMinimized}
        showShortcutHint={false}
        onLogoClick={() => {
          if (isMinimized) expandPanel();
          else togglePanel();
        }}
        className="w-full max-w-[640px]"
      />
    </div>
  );
}