import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Cookie, X } from 'lucide-react';
import { Link } from 'react-router-dom';

interface CookiePreferences {
  necessary: boolean;
  analytics: boolean;
  marketing: boolean;
  functional: boolean;
}

const COOKIE_CONSENT_KEY = 'cookie-consent';
const COOKIE_PREFERENCES_KEY = 'cookie-preferences';

const DEFAULT_PREFERENCES: CookiePreferences = {
  necessary: true, // Always required
  analytics: false,
  marketing: false,
  functional: false,
};

export function CookieConsent() {
  const [isVisible, setIsVisible] = useState(false);
  const [showCustomize, setShowCustomize] = useState(false);
  const [preferences, setPreferences] = useState<CookiePreferences>(DEFAULT_PREFERENCES);
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const consent = localStorage.getItem(COOKIE_CONSENT_KEY);
    if (!consent) {
      // Small delay to avoid flash on page load
      const timer = setTimeout(() => setIsVisible(true), 500);
      return () => clearTimeout(timer);
    }
  }, []);

  const saveConsent = (prefs: CookiePreferences) => {
    localStorage.setItem(COOKIE_CONSENT_KEY, 'true');
    localStorage.setItem(COOKIE_PREFERENCES_KEY, JSON.stringify(prefs));
    setIsVisible(false);
  };

  const handleAcceptAll = () => {
    const allAccepted: CookiePreferences = {
      necessary: true,
      analytics: true,
      marketing: true,
      functional: true,
    };
    saveConsent(allAccepted);
  };

  const handleAcceptNecessary = () => {
    saveConsent(DEFAULT_PREFERENCES);
  };

  // Dismissing the banner (X / Escape / backdrop click) is treated as
  // "necessary only" so the banner does not reappear on the next page load.
  const handleDismiss = () => {
    saveConsent(DEFAULT_PREFERENCES);
  };

  // Escape-to-close
  useEffect(() => {
    if (!isVisible) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        handleDismiss();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isVisible]);

  // Outside-click dismissal without a blocking backdrop: listen on the
  // document so the rest of the app stays fully interactive.
  useEffect(() => {
    if (!isVisible) return;
    const onPointerDown = (e: PointerEvent) => {
      const card = cardRef.current;
      if (card && !card.contains(e.target as Node)) handleDismiss();
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => document.removeEventListener('pointerdown', onPointerDown, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isVisible]);

  const handleSavePreferences = () => {
    saveConsent(preferences);
  };

  const updatePreference = (key: keyof CookiePreferences, value: boolean) => {
    if (key === 'necessary') return; // Can't disable necessary cookies
    setPreferences(prev => ({ ...prev, [key]: value }));
  };

  if (!isVisible) return null;

  return (
    <>
      <div
        className="fixed inset-x-0 bottom-0 z-50 p-4 sm:p-6 pointer-events-none"
        role="dialog"
        aria-modal="false"
        aria-label="Cookie consent"
      >
        <div
          ref={cardRef}
          className="pointer-events-auto relative mx-auto max-w-3xl overflow-hidden rounded-2xl border border-white/10 bg-[rgba(13,18,32,0.72)] p-5 sm:p-6 shadow-[0_20px_60px_-20px_rgba(0,0,0,0.6),0_0_0_1px_rgba(126,184,247,0.08)] backdrop-blur-2xl backdrop-saturate-150"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Brand accent: cyan → blue → violet sheen */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#7EB8F7] to-transparent opacity-70"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -top-24 -right-16 h-56 w-56 rounded-full bg-[radial-gradient(circle_at_center,rgba(167,139,250,0.22),transparent_70%)] blur-2xl"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -bottom-24 -left-16 h-56 w-56 rounded-full bg-[radial-gradient(circle_at_center,rgba(34,211,238,0.18),transparent_70%)] blur-2xl"
          />
          {/* Always-visible close button */}
          <Button
            variant="ghost"
            size="icon"
            aria-label="Dismiss cookie banner"
            className="absolute right-3 top-3 h-7 w-7 text-muted-foreground hover:text-foreground"
            onClick={handleDismiss}
          >
            <X className="h-4 w-4" />
          </Button>
          <div className="relative flex items-start gap-4 pr-8">
          <div className="hidden sm:flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-[linear-gradient(135deg,rgba(34,211,238,0.18),rgba(126,184,247,0.18)_45%,rgba(167,139,250,0.22))] shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]">
            <Cookie className="h-5 w-5 text-[#A8D0FF]" />
          </div>
          
          <div className="flex-1 space-y-5">
            {!showCustomize ? (
              <>
                <div>
                  <h3 className="text-[15px] sm:text-base font-semibold tracking-tight text-foreground">We value your privacy</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                    We use cookies to enhance your browsing experience, serve personalized content, and analyze our traffic. 
                    By clicking "Accept All", you consent to our use of cookies. Read our{' '}
                    <Link to="/privacy" className="text-[#A8D0FF] underline-offset-4 hover:underline">Privacy Policy</Link> for more information.
                  </p>
                </div>
                
                <div className="flex flex-wrap items-center gap-2">
                  <Button variant="hero" onClick={handleAcceptAll}>
                    Accept All
                  </Button>
                  <Button variant="outline" onClick={handleAcceptNecessary}>
                    Necessary Only
                  </Button>
                  <Button variant="ghost" onClick={() => setShowCustomize(true)}>
                    Customize
                  </Button>
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <h3 className="text-[15px] sm:text-base font-semibold tracking-tight text-foreground">Cookie Preferences</h3>
                  <Button variant="ghost" size="icon" onClick={() => setShowCustomize(false)}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
                
                <div className="space-y-1 rounded-xl border border-white/10 bg-white/[0.02] p-1">
                  <div className="flex items-center justify-between gap-4 rounded-lg px-3 py-2.5 border-b border-white/5">
                    <div className="space-y-0.5">
                      <Label className="font-medium">Necessary Cookies</Label>
                      <p className="text-xs text-muted-foreground">
                        Required for the website to function. Cannot be disabled.
                      </p>
                    </div>
                    <Switch checked={true} disabled />
                  </div>
                  
                  <div className="flex items-center justify-between gap-4 rounded-lg px-3 py-2.5 border-b border-white/5">
                    <div className="space-y-0.5">
                      <Label className="font-medium">Analytics Cookies</Label>
                      <p className="text-xs text-muted-foreground">
                        Help us understand how visitors interact with our website.
                      </p>
                    </div>
                    <Switch 
                      checked={preferences.analytics} 
                      onCheckedChange={(checked) => updatePreference('analytics', checked)}
                    />
                  </div>
                  
                  <div className="flex items-center justify-between gap-4 rounded-lg px-3 py-2.5 border-b border-white/5">
                    <div className="space-y-0.5">
                      <Label className="font-medium">Marketing Cookies</Label>
                      <p className="text-xs text-muted-foreground">
                        Used to deliver personalized advertisements.
                      </p>
                    </div>
                    <Switch 
                      checked={preferences.marketing} 
                      onCheckedChange={(checked) => updatePreference('marketing', checked)}
                    />
                  </div>
                  
                  <div className="flex items-center justify-between gap-4 rounded-lg px-3 py-2.5">
                    <div className="space-y-0.5">
                      <Label className="font-medium">Functional Cookies</Label>
                      <p className="text-xs text-muted-foreground">
                        Enable enhanced functionality and personalization.
                      </p>
                    </div>
                    <Switch 
                      checked={preferences.functional} 
                      onCheckedChange={(checked) => updatePreference('functional', checked)}
                    />
                  </div>
                </div>
                
                <div className="flex flex-wrap gap-2 pt-1">
                  <Button variant="hero" onClick={handleSavePreferences}>
                    Save Preferences
                  </Button>
                  <Button variant="outline" onClick={handleAcceptAll}>
                    Accept All
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
        </div>
      </div>
    </>
  );
}
