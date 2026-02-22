import { useFeatureAccess } from '@/hooks/useFeatureFlags';

export function useDealSpaceFeatures() {
  const pulse = useFeatureAccess('deal_pulse_dashboard');
  const alerts = useFeatureAccess('deal_proactive_alerts');
  const commandPalette = useFeatureAccess('deal_command_palette');
  const contextualPrompts = useFeatureAccess('deal_contextual_prompts');
  const timeline = useFeatureAccess('deal_unified_timeline');
  const benchmarks = useFeatureAccess('deal_benchmarks');
  const aiAssistant = useFeatureAccess('deal_ai_assistant');
  const activitySummary = useFeatureAccess('deal_activity_summary');
  const smartSuggestions = useFeatureAccess('deal_smart_suggestions');

  return {
    showPulseDashboard: pulse.hasAccess !== false,
    showProactiveAlerts: alerts.hasAccess !== false,
    showCommandPalette: commandPalette.hasAccess !== false,
    showContextualPrompts: contextualPrompts.hasAccess !== false,
    showUnifiedTimeline: timeline.hasAccess !== false,
    showBenchmarks: benchmarks.hasAccess !== false,
    showAIAssistant: aiAssistant.hasAccess !== false,
    showActivitySummary: activitySummary.hasAccess !== false,
    showSmartSuggestions: smartSuggestions.hasAccess !== false,
    isLoading: pulse.isLoading,
  };
}
