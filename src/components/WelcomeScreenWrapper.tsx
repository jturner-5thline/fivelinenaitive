import { useAuth } from '@/contexts/AuthContext';
import { WelcomeScreen } from './WelcomeScreen';

export function WelcomeScreenWrapper() {
  const { justSignedIn, clearJustSignedIn } = useAuth();

  if (!justSignedIn) return null;

  return <WelcomeScreen onComplete={clearJustSignedIn} />;
}
