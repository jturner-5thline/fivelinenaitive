import { useAuth } from '@/contexts/AuthContext';

const INSIGHTS_ALLOWED_EMAILS = new Set([
  'jturner@5thline.co',
  'jmoffitt@5thline.co',
  'swilliams@5thline.co',
  'mclark@5thline.co',
]);

export function useCanAccessInsights(): boolean {
  const { user } = useAuth();
  const email = user?.email?.toLowerCase();
  if (!email) return false;
  return INSIGHTS_ALLOWED_EMAILS.has(email);
}
