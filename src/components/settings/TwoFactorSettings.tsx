import { useState, useEffect } from 'react';
import { ShieldCheck, Loader2, QrCode, Copy, Check, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

interface MFAFactor {
  id: string;
  friendly_name?: string;
  factor_type: string;
  status: 'verified' | 'unverified';
  created_at: string;
}

export function TwoFactorSettings() {
  const [factors, setFactors] = useState<MFAFactor[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isEnrolling, setIsEnrolling] = useState(false);
  const [enrollmentData, setEnrollmentData] = useState<{
    id: string;
    qrCode: string;
    secret: string;
  } | null>(null);
  const [verifyCode, setVerifyCode] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);
  const [copied, setCopied] = useState(false);

  const fetchFactors = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.auth.mfa.listFactors();
      if (error) throw error;
      setFactors(data?.totp || []);
    } catch (error: any) {
      console.error('Failed to fetch MFA factors:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchFactors();
  }, []);

  const handleStartEnrollment = async () => {
    setIsEnrolling(true);
    try {
      const { data, error } = await supabase.auth.mfa.enroll({
        factorType: 'totp',
        friendlyName: 'Authenticator App',
      });
      if (error) throw error;

      setEnrollmentData({
        id: data.id,
        qrCode: data.totp.qr_code,
        secret: data.totp.secret,
      });
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to start 2FA enrollment.',
        variant: 'destructive',
      });
      setIsEnrolling(false);
    }
  };

  const handleVerifyEnrollment = async () => {
    if (!enrollmentData || verifyCode.length !== 6) return;

    setIsVerifying(true);
    try {
      const { data, error } = await supabase.auth.mfa.challengeAndVerify({
        factorId: enrollmentData.id,
        code: verifyCode,
      });
      if (error) throw error;

      toast({
        title: '2FA Enabled',
        description: 'Two-factor authentication has been successfully enabled.',
      });

      setEnrollmentData(null);
      setVerifyCode('');
      setIsEnrolling(false);
      fetchFactors();
    } catch (error: any) {
      toast({
        title: 'Verification Failed',
        description: error.message || 'Invalid code. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsVerifying(false);
    }
  };

  const handleCancelEnrollment = async () => {
    if (enrollmentData) {
      try {
        await supabase.auth.mfa.unenroll({ factorId: enrollmentData.id });
      } catch (e) {
        // Ignore errors when canceling unverified enrollment
      }
    }
    setEnrollmentData(null);
    setVerifyCode('');
    setIsEnrolling(false);
  };

  const handleRemoveFactor = async (factorId: string) => {
    setIsRemoving(true);
    try {
      const { error } = await supabase.auth.mfa.unenroll({ factorId });
      if (error) throw error;

      toast({
        title: '2FA Disabled',
        description: 'Two-factor authentication has been removed.',
      });
      fetchFactors();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to remove 2FA.',
        variant: 'destructive',
      });
    } finally {
      setIsRemoving(false);
    }
  };

  const copySecret = () => {
    if (enrollmentData?.secret) {
      navigator.clipboard.writeText(enrollmentData.secret);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const verifiedFactors = factors.filter((f) => f.status === 'verified');
  const hasVerified2FA = verifiedFactors.length > 0;

  if (isLoading) {
    return (
      <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
        <div className="flex items-center gap-3">
          <ShieldCheck className="h-5 w-5 text-muted-foreground" />
          <div>
            <p className="font-medium">Two-Factor Authentication</p>
            <p className="text-sm text-muted-foreground">Loading...</p>
          </div>
        </div>
        <Loader2 className="h-4 w-4 animate-spin" />
      </div>
    );
  }

  return (
    <>
      <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
        <div className="flex items-center gap-3">
          <ShieldCheck className="h-5 w-5 text-muted-foreground" />
          <div>
            <div className="flex items-center gap-2">
              <p className="font-medium">Two-Factor Authentication</p>
              {hasVerified2FA ? (
                <Badge variant="default" className="text-xs bg-green-600">Enabled</Badge>
              ) : (
                <Badge variant="secondary" className="text-xs">Disabled</Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              {hasVerified2FA
                ? 'Your account is protected with an authenticator app'
                : 'Add an extra layer of security to your account'}
            </p>
          </div>
        </div>
        {hasVerified2FA ? (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2 text-destructive hover:text-destructive">
                <Trash2 className="h-4 w-4" />
                Remove
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Disable Two-Factor Authentication?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will remove the extra security layer from your account. You can always re-enable it later.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => handleRemoveFactor(verifiedFactors[0].id)}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  disabled={isRemoving}
                >
                  {isRemoving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Disable 2FA
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        ) : (
          <Button variant="outline" onClick={handleStartEnrollment} disabled={isEnrolling}>
            {isEnrolling && !enrollmentData && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Enable 2FA
          </Button>
        )}
      </div>

      {/* Enrollment Dialog */}
      <Dialog open={!!enrollmentData} onOpenChange={(open) => !open && handleCancelEnrollment()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Set Up Two-Factor Authentication</DialogTitle>
            <DialogDescription>
              Scan the QR code with your authenticator app (like Google Authenticator or Authy), then enter the 6-digit code.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {enrollmentData && (
              <>
                <div className="flex justify-center">
                  <div className="bg-white p-3 rounded-lg">
                    <img
                      src={enrollmentData.qrCode}
                      alt="2FA QR Code"
                      className="w-48 h-48"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-sm text-muted-foreground">
                    Can't scan? Enter this code manually:
                  </Label>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 bg-muted px-3 py-2 rounded text-sm font-mono break-all">
                      {enrollmentData.secret}
                    </code>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={copySecret}
                      className="shrink-0"
                    >
                      {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="verifyCode">Enter 6-digit code</Label>
                  <Input
                    id="verifyCode"
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={6}
                    placeholder="000000"
                    value={verifyCode}
                    onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, ''))}
                    className="text-center text-lg tracking-widest"
                  />
                </div>

                <div className="flex gap-2 pt-2">
                  <Button
                    onClick={handleVerifyEnrollment}
                    disabled={verifyCode.length !== 6 || isVerifying}
                    className="flex-1"
                  >
                    {isVerifying && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Verify & Enable
                  </Button>
                  <Button variant="outline" onClick={handleCancelEnrollment}>
                    Cancel
                  </Button>
                </div>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
