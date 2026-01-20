import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
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

  const handleSavePreferences = () => {
    saveConsent(preferences);
  };

  const updatePreference = (key: keyof CookiePreferences, value: boolean) => {
    if (key === 'necessary') return; // Can't disable necessary cookies
    setPreferences(prev => ({ ...prev, [key]: value }));
  };

  if (!isVisible) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 p-4 bg-background/80 backdrop-blur-sm border-t">
      <Card className="max-w-4xl mx-auto p-6">
        <div className="flex items-start gap-4">
          <div className="hidden sm:flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10">
            <Cookie className="h-5 w-5 text-primary" />
          </div>
          
          <div className="flex-1 space-y-4">
            {!showCustomize ? (
              <>
                <div>
                  <h3 className="font-semibold text-lg">We value your privacy</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    We use cookies to enhance your browsing experience, serve personalized content, and analyze our traffic. 
                    By clicking "Accept All", you consent to our use of cookies. Read our{' '}
                    <Link to="/privacy" className="text-primary hover:underline">Privacy Policy</Link> for more information.
                  </p>
                </div>
                
                <div className="flex flex-wrap gap-2">
                  <Button 
                    onClick={handleAcceptAll}
                    className="bg-gradient-to-r from-[hsl(var(--primary))] to-[hsl(292,46%,72%)] hover:opacity-90 transition-opacity"
                  >
                    Accept All
                  </Button>
                  <Button variant="secondary" onClick={handleAcceptNecessary}>
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
                  <h3 className="font-semibold text-lg">Cookie Preferences</h3>
                  <Button variant="ghost" size="icon" onClick={() => setShowCustomize(false)}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
                
                <div className="space-y-4">
                  <div className="flex items-center justify-between py-2 border-b">
                    <div className="space-y-0.5">
                      <Label className="font-medium">Necessary Cookies</Label>
                      <p className="text-xs text-muted-foreground">
                        Required for the website to function. Cannot be disabled.
                      </p>
                    </div>
                    <Switch checked={true} disabled />
                  </div>
                  
                  <div className="flex items-center justify-between py-2 border-b">
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
                  
                  <div className="flex items-center justify-between py-2 border-b">
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
                  
                  <div className="flex items-center justify-between py-2">
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
                
                <div className="flex gap-2 pt-2">
                  <Button 
                    onClick={handleSavePreferences}
                    className="bg-gradient-to-r from-[hsl(var(--primary))] to-[hsl(292,46%,72%)] hover:opacity-90 transition-opacity"
                  >
                    Save Preferences
                  </Button>
                  <Button variant="secondary" onClick={handleAcceptAll}>
                    Accept All
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}
