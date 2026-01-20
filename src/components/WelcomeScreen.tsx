import { useEffect, useState } from 'react';

interface WelcomeScreenProps {
  onComplete: () => void;
}

export function WelcomeScreen({ onComplete }: WelcomeScreenProps) {
  const [isVisible, setIsVisible] = useState(true);
  const [isFadingOut, setIsFadingOut] = useState(false);

  useEffect(() => {
    // Start fading out at 3 seconds
    const fadeOutTimer = setTimeout(() => {
      setIsFadingOut(true);
    }, 3000);

    // Complete at 4 seconds
    const completeTimer = setTimeout(() => {
      setIsVisible(false);
      onComplete();
    }, 4000);

    return () => {
      clearTimeout(fadeOutTimer);
      clearTimeout(completeTimer);
    };
  }, [onComplete]);

  if (!isVisible) return null;

  return (
    <div
      className={`fixed inset-0 z-[9999] flex items-center justify-center bg-black transition-opacity duration-1000 ${
        isFadingOut ? 'opacity-0' : 'opacity-100'
      }`}
    >
      <h1
        className={`text-4xl md:text-6xl font-bold text-white transition-all duration-1000 ${
          isFadingOut ? 'opacity-0 scale-95' : 'opacity-100 scale-100'
        }`}
        style={{
          animation: 'welcomeFadeIn 1.5s ease-out forwards',
        }}
      >
        Welcome to nAitive
      </h1>
      <style>{`
        @keyframes welcomeFadeIn {
          0% {
            opacity: 0;
            transform: translateY(20px);
          }
          100% {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );
}
