import { useIntegrations } from '@/hooks/useIntegrations';

export function useClaapIntegration() {
  const { integrations, isLoading } = useIntegrations();
  
  const claapIntegration = integrations.find(i => i.type === 'claap');
  const isEnabled = claapIntegration?.status === 'connected';

  return {
    isEnabled,
    isLoading,
    integration: claapIntegration,
  };
}
