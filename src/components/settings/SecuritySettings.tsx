import { useState, useEffect } from 'react';
import { z } from 'zod';
import { Shield, Eye, EyeOff, Loader2, Monitor, LogOut, Smartphone, History, Globe, MapPin } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { TwoFactorSettings } from './TwoFactorSettings';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';

const passwordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z.string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number'),
  confirmPassword: z.string().min(1, 'Please confirm your password'),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: "Passwords don't match",
  path: ['confirmPassword'],
});

interface SessionInfo {
  lastSignIn: string;
  userAgent: string;
  isCurrent: boolean;
}

interface LoginHistoryEntry {
  id: string;
  browser: string | null;
  os: string | null;
  device_type: string | null;
  city: string | null;
  country: string | null;
  created_at: string;
}

export function SecuritySettings() {
  const { user } = useAuth();
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [currentSession, setCurrentSession] = useState<SessionInfo | null>(null);
  const [loginHistory, setLoginHistory] = useState<LoginHistoryEntry[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  
  const [formData, setFormData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });

  useEffect(() => {
    const fetchSessionAndHistory = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        setCurrentSession({
          lastSignIn: user?.last_sign_in_at || new Date().toISOString(),
          userAgent: navigator.userAgent,
          isCurrent: true,
        });

        // Fetch login history
        setIsLoadingHistory(true);
        const { data: history, error } = await supabase
          .from('login_history')
          .select('id, browser, os, device_type, city, country, created_at')
          .eq('user_id', session.user.id)
          .order('created_at', { ascending: false })
          .limit(10);
        
        if (!error && history) {
          setLoginHistory(history);
        }
        setIsLoadingHistory(false);
      }
    };
    fetchSessionAndHistory();
  }, [user]);

  // Log current login on mount (only once per session)
  useEffect(() => {
    const logLogin = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      // Check if we already logged this session
      const sessionKey = `login_logged_${session.access_token.slice(-10)}`;
      if (sessionStorage.getItem(sessionKey)) return;

      const userAgent = navigator.userAgent;
      const deviceInfo = getDeviceInfo(userAgent);

      // Fetch IP geolocation
      let city: string | null = null;
      let country: string | null = null;
      let ipAddress: string | null = null;

      try {
        const geoResponse = await fetch('https://ipapi.co/json/');
        if (geoResponse.ok) {
          const geoData = await geoResponse.json();
          city = geoData.city || null;
          country = geoData.country_name || null;
          ipAddress = geoData.ip || null;
        }
      } catch (error) {
        // Geolocation fetch failed, continue without it
        console.log('Geolocation fetch failed:', error);
      }

      await supabase.from('login_history').insert({
        user_id: session.user.id,
        user_agent: userAgent,
        browser: deviceInfo.browser,
        os: deviceInfo.os,
        device_type: deviceInfo.isMobile ? 'mobile' : 'desktop',
        city,
        country,
        ip_address: ipAddress,
      });

      sessionStorage.setItem(sessionKey, 'true');
    };
    logLogin();
  }, []);

  const getDeviceInfo = (userAgent: string) => {
    const isMobile = /Mobile|Android|iPhone|iPad/i.test(userAgent);
    const browser = userAgent.includes('Chrome') ? 'Chrome' :
                    userAgent.includes('Firefox') ? 'Firefox' :
                    userAgent.includes('Safari') ? 'Safari' :
                    userAgent.includes('Edge') ? 'Edge' : 'Browser';
    const os = userAgent.includes('Windows') ? 'Windows' :
               userAgent.includes('Mac') ? 'macOS' :
               userAgent.includes('Linux') ? 'Linux' :
               userAgent.includes('Android') ? 'Android' :
               userAgent.includes('iPhone') || userAgent.includes('iPad') ? 'iOS' : 'Unknown';
    return { isMobile, browser, os };
  };

  const handleInputChange = (field: keyof typeof formData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }));
    }
  };

  const handleChangePassword = async () => {
    setErrors({});
    
    const result = passwordSchema.safeParse(formData);
    if (!result.success) {
      const fieldErrors: Record<string, string> = {};
      result.error.errors.forEach((err) => {
        if (err.path[0]) {
          fieldErrors[err.path[0] as string] = err.message;
        }
      });
      setErrors(fieldErrors);
      return;
    }

    setIsSaving(true);
    try {
      const { error } = await supabase.auth.updateUser({
        password: formData.newPassword,
      });

      if (error) throw error;

      toast({
        title: 'Password updated',
        description: 'Your password has been changed successfully.',
      });

      setFormData({ currentPassword: '', newPassword: '', confirmPassword: '' });
      setIsChangingPassword(false);
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to update password. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleSignOutOtherDevices = async () => {
    setIsSigningOut(true);
    try {
      const { error } = await supabase.auth.signOut({ scope: 'others' });
      if (error) throw error;
      
      toast({
        title: 'Signed out',
        description: 'All other devices have been signed out.',
      });
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to sign out other devices.',
        variant: 'destructive',
      });
    } finally {
      setIsSigningOut(false);
    }
  };

  const handleSignOutEverywhere = async () => {
    setIsSigningOut(true);
    try {
      const { error } = await supabase.auth.signOut({ scope: 'global' });
      if (error) throw error;
      
      toast({
        title: 'Signed out everywhere',
        description: 'You have been signed out from all devices.',
      });
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to sign out.',
        variant: 'destructive',
      });
    } finally {
      setIsSigningOut(false);
    }
  };

  const handleCancel = () => {
    setFormData({ currentPassword: '', newPassword: '', confirmPassword: '' });
    setErrors({});
    setIsChangingPassword(false);
  };

  const deviceInfo = currentSession ? getDeviceInfo(currentSession.userAgent) : null;

  return (
    <Card className="overflow-hidden border-2">
      <div className="bg-gradient-to-r from-primary/10 via-primary/5 to-transparent p-6 border-b">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 ring-2 ring-primary/20">
            <Shield className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h2 className="text-xl font-semibold">Security</h2>
            <p className="text-sm text-muted-foreground">
              Manage your password, sessions, and login activity
            </p>
          </div>
        </div>
      </div>
      <CardContent className="space-y-6 pt-6">
        {/* Password Section */}
        {!isChangingPassword ? (
          <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
            <div>
              <p className="font-medium">Password</p>
              <p className="text-sm text-muted-foreground">
                Change your account password
              </p>
            </div>
            <Button variant="outline" onClick={() => setIsChangingPassword(true)}>
              Change Password
            </Button>
          </div>
        ) : (
          <div className="space-y-4 p-4 border rounded-lg">
            <div className="space-y-2">
              <Label htmlFor="currentPassword">Current Password</Label>
              <div className="relative">
                <Input
                  id="currentPassword"
                  type={showCurrentPassword ? 'text' : 'password'}
                  value={formData.currentPassword}
                  onChange={(e) => handleInputChange('currentPassword', e.target.value)}
                  className={errors.currentPassword ? 'border-destructive' : ''}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                  onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                >
                  {showCurrentPassword ? (
                    <EyeOff className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <Eye className="h-4 w-4 text-muted-foreground" />
                  )}
                </Button>
              </div>
              {errors.currentPassword && (
                <p className="text-sm text-destructive">{errors.currentPassword}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="newPassword">New Password</Label>
              <div className="relative">
                <Input
                  id="newPassword"
                  type={showNewPassword ? 'text' : 'password'}
                  value={formData.newPassword}
                  onChange={(e) => handleInputChange('newPassword', e.target.value)}
                  className={errors.newPassword ? 'border-destructive' : ''}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                  onClick={() => setShowNewPassword(!showNewPassword)}
                >
                  {showNewPassword ? (
                    <EyeOff className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <Eye className="h-4 w-4 text-muted-foreground" />
                  )}
                </Button>
              </div>
              {errors.newPassword && (
                <p className="text-sm text-destructive">{errors.newPassword}</p>
              )}
              <p className="text-xs text-muted-foreground">
                Must be at least 8 characters with uppercase, lowercase, and a number
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm New Password</Label>
              <div className="relative">
                <Input
                  id="confirmPassword"
                  type={showConfirmPassword ? 'text' : 'password'}
                  value={formData.confirmPassword}
                  onChange={(e) => handleInputChange('confirmPassword', e.target.value)}
                  className={errors.confirmPassword ? 'border-destructive' : ''}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                >
                  {showConfirmPassword ? (
                    <EyeOff className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <Eye className="h-4 w-4 text-muted-foreground" />
                  )}
                </Button>
              </div>
              {errors.confirmPassword && (
                <p className="text-sm text-destructive">{errors.confirmPassword}</p>
              )}
            </div>

            <div className="flex gap-2 pt-2">
              <Button onClick={handleChangePassword} disabled={isSaving}>
                {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Update Password
              </Button>
              <Button variant="outline" onClick={handleCancel} disabled={isSaving}>
                Cancel
              </Button>
            </div>
          </div>
        )}

        <Separator />

        {/* Two-Factor Authentication Section */}
        <TwoFactorSettings />

        <Separator />

        {/* Active Sessions Section */}
        <div className="space-y-4">
          <div>
            <h3 className="font-medium">Active Sessions</h3>
            <p className="text-sm text-muted-foreground">
              Manage your active sessions across devices
            </p>
          </div>

          {/* Current Session */}
          {currentSession && deviceInfo && (
            <div className="flex items-start justify-between p-3 bg-muted/50 rounded-lg">
              <div className="flex items-start gap-3">
                {deviceInfo.isMobile ? (
                  <Smartphone className="h-5 w-5 mt-0.5 text-muted-foreground" />
                ) : (
                  <Monitor className="h-5 w-5 mt-0.5 text-muted-foreground" />
                )}
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-medium">{deviceInfo.browser} on {deviceInfo.os}</p>
                    <Badge variant="secondary" className="text-xs">Current</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Last active: {new Date(currentSession.lastSignIn).toLocaleDateString(undefined, {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Session Actions */}
          <div className="flex flex-col sm:flex-row gap-2">
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="sm" className="gap-2" disabled={isSigningOut}>
                  <LogOut className="h-4 w-4" />
                  Sign out other devices
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Sign out other devices?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will sign you out from all other devices except this one. You'll stay signed in here.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleSignOutOtherDevices}>
                    Sign Out Others
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>

            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="sm" className="gap-2 text-destructive hover:text-destructive" disabled={isSigningOut}>
                  <LogOut className="h-4 w-4" />
                  Sign out everywhere
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Sign out everywhere?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will sign you out from all devices, including this one. You'll need to sign in again.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleSignOutEverywhere} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                    Sign Out Everywhere
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>

        <Separator />

        {/* Login History Section */}
        <div className="space-y-4">
          <div>
            <h3 className="font-medium flex items-center gap-2">
              <History className="h-4 w-4" />
              Login History
            </h3>
            <p className="text-sm text-muted-foreground">
              Recent sign-in activity on your account
            </p>
          </div>

          {isLoadingHistory ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : loginHistory.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <History className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>No login history available</p>
            </div>
          ) : (
            <ScrollArea className="h-[300px] pr-4">
              <div className="space-y-3">
                {loginHistory.map((entry, index) => (
                  <div
                    key={entry.id}
                    className="flex items-start gap-3 p-3 bg-muted/50 rounded-lg"
                  >
                    {entry.device_type === 'mobile' ? (
                      <Smartphone className="h-5 w-5 mt-0.5 text-muted-foreground" />
                    ) : (
                      <Monitor className="h-5 w-5 mt-0.5 text-muted-foreground" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-medium">
                          {entry.browser || 'Unknown Browser'} on {entry.os || 'Unknown OS'}
                        </p>
                        {index === 0 && (
                          <Badge variant="secondary" className="text-xs">Latest</Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-4 text-sm text-muted-foreground mt-1">
                        <span>
                          {new Date(entry.created_at).toLocaleDateString(undefined, {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                        {(entry.city || entry.country) && (
                          <span className="flex items-center gap-1">
                            <MapPin className="h-3 w-3" />
                            {[entry.city, entry.country].filter(Boolean).join(', ')}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
