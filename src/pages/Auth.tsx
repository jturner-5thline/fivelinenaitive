import { useState, useEffect, useRef } from "react";
import { lovable } from "@/integrations/lovable/index";
import naitiveLogoFull from "@/assets/naitive-logo-dark.png";
import { useNavigate, useSearchParams, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

import { Helmet } from "react-helmet-async";
import { Loader2, Eye, EyeOff, ShieldCheck } from "lucide-react";
import { z } from "zod";
import { isBlockedEmailDomain, BLOCKED_DOMAIN_ERROR } from "@/lib/blocked-email-domains";

const authSchema = z.object({
  email: z.string().trim().email({ message: "Invalid email address" }),
  password: z.string().min(6, { message: "Password must be at least 6 characters" }),
});

const emailSchema = z.object({
  email: z.string().trim().email({ message: "Invalid email address" }),
});

type AuthMode = "login" | "signup" | "forgot" | "reset" | "mfa";

interface MFAChallenge {
  factorId: string;
  challengeId: string;
}

const Auth = () => {
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const locationState = location.state as { waitlistEmail?: string; waitlistName?: string; waitlistCompany?: string } | null;
  const [mode, setMode] = useState<AuthMode>(searchParams.get("demo") === "1" ? "login" : "login");
  const [email, setEmail] = useState(locationState?.waitlistEmail || searchParams.get("email") || "");
  const [password, setPassword] = useState(searchParams.get("password") || (searchParams.get("demo") === "1" ? "User1234" : ""));
  const [newPassword, setNewPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [mfaChallenge, setMfaChallenge] = useState<MFAChallenge | null>(null);
  const [mfaCode, setMfaCode] = useState("");
  const navigate = useNavigate();
  
  // Store waitlist info for onboarding pre-fill
  useEffect(() => {
    if (locationState?.waitlistName) {
      sessionStorage.setItem('waitlist_name', locationState.waitlistName);
    }
    if (locationState?.waitlistCompany) {
      sessionStorage.setItem('waitlist_company', locationState.waitlistCompany);
    }
  }, [locationState]);
  
  // Get redirect URL from query params (for invite links, etc.)
  const redirectUrl = searchParams.get('redirect') || '/deals';
  const isDemoAccess = searchParams.get('demo') === '1';

  useEffect(() => {
    const queryEmail = searchParams.get("email");
    const queryPassword = searchParams.get("password");
    if (queryEmail) setEmail(queryEmail);
    if (queryPassword) setPassword(queryPassword);
    else if (isDemoAccess) setPassword("User1234");
    if (isDemoAccess) setMode("login");
  }, [searchParams, isDemoAccess]);

  // Check if user was redirected due to blocked domain (e.g. Google SSO with personal email)
  useEffect(() => {
    const blockedError = sessionStorage.getItem('naitive_blocked_domain_error');
    if (blockedError) {
      sessionStorage.removeItem('naitive_blocked_domain_error');
      toast.error(BLOCKED_DOMAIN_ERROR);
    }
  }, []);

  // Use a ref for mode so the onAuthStateChange listener always sees current value
  // without needing to re-subscribe (which causes missed events)
  const modeRef = useRef<AuthMode>(mode);
  useEffect(() => { modeRef.current = mode; }, [mode]);

  useEffect(() => {
    // Check if user already has a session (e.g. returning from OAuth redirect)
    const checkExistingSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        const currentMode = modeRef.current;
        if (currentMode !== "reset" && currentMode !== "mfa") {
          window.location.href = redirectUrl;
        }
      }
    };
    checkExistingSession();

    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (event === "PASSWORD_RECOVERY") {
          setMode("reset");
        } else if ((event === "SIGNED_IN" || event === "INITIAL_SESSION") && session?.user) {
          const currentMode = modeRef.current;
          // Don't redirect if user is in the middle of password reset or MFA
          if (currentMode !== "reset" && currentMode !== "mfa") {
            // Use window.location for a hard redirect to avoid race conditions
            // with the AuthContext listener and React Router state
            window.location.href = redirectUrl;
          }
        }
      }
    );

    // Check URL for recovery token only
    const hashParams = new URLSearchParams(window.location.hash.substring(1));
    if (hashParams.get("type") === "recovery") {
      setMode("reset");
    }

    return () => subscription.unsubscribe();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [redirectUrl]);

  const handleMFAVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mfaChallenge || mfaCode.length !== 6) return;

    setLoading(true);
    try {
      const { error } = await supabase.auth.mfa.verify({
        factorId: mfaChallenge.factorId,
        challengeId: mfaChallenge.challengeId,
        code: mfaCode,
      });

      if (error) throw error;
      toast.success("Welcome back!");
      navigate(redirectUrl);
    } catch (error: any) {
      toast.error(error.message || "Invalid verification code.");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (mode === "forgot") {
        const validation = emailSchema.safeParse({ email });
        if (!validation.success) {
          toast.error(validation.error.errors[0].message);
          setLoading(false);
          return;
        }

        if (!isDemoAccess && isBlockedEmailDomain(email)) {
          toast.error(BLOCKED_DOMAIN_ERROR);
          setLoading(false);
          return;
        }

        const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: `${window.location.origin}/login`,
        });
        if (error) throw error;
        toast.success("Check your email for the password reset link!");
        setMode("login");
      } else if (mode === "reset") {
        if (newPassword.length < 6) {
          toast.error("Password must be at least 6 characters");
          setLoading(false);
          return;
        }

        const { error } = await supabase.auth.updateUser({ password: newPassword });
        if (error) throw error;
        toast.success("Password updated successfully!");
        navigate("/deals", { replace: true });
      } else {
        const validation = authSchema.safeParse({ email, password });
        if (!validation.success) {
          toast.error(validation.error.errors[0].message);
          setLoading(false);
          return;
        }

        if (!isDemoAccess && isBlockedEmailDomain(email)) {
          toast.error(BLOCKED_DOMAIN_ERROR);
          setLoading(false);
          return;
        }

        if (mode === "login") {
          const { data, error } = await supabase.auth.signInWithPassword({
            email: email.trim(),
            password,
          });
          
          if (error) throw error;

          // Store remember me preference for session handling
          if (rememberMe) {
            localStorage.setItem('naitive_remember_me', 'true');
          } else {
            localStorage.removeItem('naitive_remember_me');
            // Mark this as a session-only login
            sessionStorage.setItem('naitive_session_only', 'true');
          }

          // Check if MFA is required
          const { data: factorsData } = await supabase.auth.mfa.listFactors();
          const verifiedFactors = factorsData?.totp?.filter(f => f.status === 'verified') || [];
          
          if (verifiedFactors.length > 0) {
            // User has MFA enabled, need to verify
            const { data: challengeData, error: challengeError } = await supabase.auth.mfa.challenge({
              factorId: verifiedFactors[0].id,
            });
            
            if (challengeError) throw challengeError;
            
            setMfaChallenge({
              factorId: verifiedFactors[0].id,
              challengeId: challengeData.id,
            });
            setMode("mfa");
            setLoading(false);
            return;
          }
          
          toast.success("Welcome back!");
        } else {
          const { error } = await supabase.auth.signUp({
            email: email.trim(),
            password,
            options: {
              emailRedirectTo: `${window.location.origin}${redirectUrl}`,
            },
          });
          if (error) throw error;
          toast.success("Account created successfully!");
        }
      }
    } catch (error: any) {
      if (error.message.includes("User already registered")) {
        toast.error("This email is already registered. Please login instead.");
      } else if (error.message.includes("Invalid login credentials")) {
        toast.error("Invalid email or password.");
      } else {
        toast.error(error.message);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setGoogleLoading(true);
    try {
      // Preserve the post-login redirect target through the OAuth round-trip
      // so users coming from email CTAs (e.g. /insights) land on the right page.
      const redirectQuery = redirectUrl && redirectUrl !== '/deals'
        ? `?redirect=${encodeURIComponent(redirectUrl)}`
        : '';
      const redirectUri = `${window.location.origin}/auth${redirectQuery}`;
      console.log("[GoogleSSO] Starting sign-in, redirect_uri:", redirectUri);
      const result = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: redirectUri,
        extraParams: {
          prompt: "select_account",
        },
      });

      console.log("[GoogleSSO] Result received:", JSON.stringify({
        redirected: result.redirected,
        hasError: !!result.error,
        errorMessage: result.error?.message,
        errorDetails: result.error,
        hasTokens: !!(result as any).tokens,
      }));

      if (result.redirected) {
        return;
      }

      if (result.error) {
        setGoogleLoading(false);
        const err = result.error as any;
        const errorMsg = err instanceof Error 
          ? err.message 
          : typeof err === 'string' 
            ? err 
            : JSON.stringify(err);
        console.error("[GoogleSSO] OAuth error:", errorMsg, err);
        toast.error(`Google sign-in failed: ${errorMsg}`);
        return;
      }

      // Session set successfully — the onAuthStateChange listener will handle redirect
      console.log("[GoogleSSO] Session set successfully, onAuthStateChange will redirect");
    } catch (error: any) {
      console.error("[GoogleSSO] Caught exception:", error);
      setGoogleLoading(false);
      const errorDetail = error?.message || error?.toString() || "Unknown error";
      toast.error(`Google sign-in error: ${errorDetail}`);
    }
  };

  // Login CTA now opens the standard login form directly (no pre-login gate).
  const handleLoginClick = () => {
    setMode("login");
  };

  const getTitle = () => {
    switch (mode) {
      case "forgot": return "Reset Password";
      case "reset": return "Set New Password";
      case "signup": return "Sign Up";
      case "mfa": return "Two-Factor Authentication";
      default: return "Login";
    }
  };

  const getSubtitle = () => {
    switch (mode) {
      case "forgot": return "Enter your email to receive a reset link";
      case "reset": return "Enter your new password";
      case "signup": return "Create your account";
      case "mfa": return "Enter the code from your authenticator app";
      default: return isDemoAccess ? "Naitive demo access" : "Welcome back";
    }
  };

  return (
    <>
      <Helmet>
        <title>{getTitle()} | naitive</title>
      </Helmet>
      
      <div className="min-h-screen bg-gradient-to-br from-[hsl(220,30%,10%)] to-[hsl(260,15%,5%)] relative overflow-hidden">

        <div className="relative z-10 min-h-screen flex flex-col items-center justify-end pb-4 md:pb-6 px-4">
          <div className="w-full flex justify-center mt-[10vh] mb-auto pointer-events-none select-none">
            <img 
              src={naitiveLogoFull} 
              alt="naitive" 
              className="w-[70vw] max-w-[844px] h-auto shrink-0 object-contain animate-fade-in opacity-60"
              style={{ aspectRatio: 'auto' }}
            />
          </div>
          
          <div className="w-full max-w-md">
            <form onSubmit={mode === "mfa" ? handleMFAVerify : handleSubmit} className="space-y-6">
              {isDemoAccess && mode === "login" && (
                <div className="rounded-md border border-white/15 bg-white/5 px-4 py-3 text-sm text-white/80">
                  This is your Naitive demo access page. Your demo credentials are prefilled below — click Login to open your seeded workspace.
                </div>
              )}
              {mode === "mfa" ? (
                <div className="space-y-4">
                  <div className="flex justify-center mb-4">
                    <div className="flex h-16 w-16 items-center justify-center rounded-full bg-white/10">
                      <ShieldCheck className="h-8 w-8 text-white/80" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="mfaCode" className="text-white/80 font-light">
                      Verification Code
                    </Label>
                    <Input
                      id="mfaCode"
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      maxLength={6}
                      placeholder="000000"
                      value={mfaCode}
                      onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, ''))}
                      className="bg-white/5 border-white/20 text-white placeholder:text-white/40 focus:border-white/40 text-center text-xl tracking-widest"
                      autoFocus
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setMode("login");
                      setMfaChallenge(null);
                      setMfaCode("");
                    }}
                    className="text-sm text-white/50 hover:text-white/80 underline underline-offset-4"
                  >
                    Use a different account
                  </button>
                </div>
              ) : mode === "reset" ? (
                <div className="space-y-2">
                  <Label htmlFor="newPassword" className="text-white/80 font-light">
                    New Password
                  </Label>
                  <div className="relative">
                    <Input
                      id="newPassword"
                      type={showNewPassword ? "text" : "password"}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="••••••••"
                      required
                      className="bg-white/5 border-white/20 text-white placeholder:text-white/40 focus:border-white/40 pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewPassword(!showNewPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-white/50 hover:text-white/80"
                    >
                      {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="email" className="text-white/80 font-light">
                      Email
                    </Label>
                    <Input
                      id="email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@company.com"
                      required
                      className={`bg-white/5 border-white/20 text-white placeholder:text-white/40 focus:border-white/40 ${email && isBlockedEmailDomain(email) ? 'border-red-500/60 focus:border-red-500/80' : ''}`}
                    />
                    {email && !isDemoAccess && isBlockedEmailDomain(email) && (
                      <p className="text-sm text-red-400 mt-1">
                        Personal email addresses are not allowed. Please use your professional work email (e.g. you@company.com).
                      </p>
                    )}
                  </div>
                  
                  {mode !== "forgot" && (
                    <div className="space-y-2">
                      <Label htmlFor="password" className="text-white/80 font-light">
                        Password
                      </Label>
                      <div className="relative">
                        <Input
                          id="password"
                          type={isDemoAccess || showPassword ? "text" : "password"}
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          placeholder="••••••••"
                          required
                          className="bg-white/5 border-white/20 text-white placeholder:text-white/40 focus:border-white/40 pr-10"
                        />
                        {!isDemoAccess && (
                          <button
                            type="button"
                            onClick={() => setShowPassword(!showPassword)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-white/50 hover:text-white/80"
                          >
                            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </button>
                        )}
                      </div>
                       {mode === "login" && !isDemoAccess && (
                        <button
                          type="button"
                          onClick={() => setMode("forgot")}
                          className="text-sm text-white/50 hover:text-white/80 underline underline-offset-4"
                        >
                          Forgot password?
                        </button>
                      )}
                       {mode === "login" && !isDemoAccess && (
                        <div className="flex items-center space-x-2 mt-3">
                          <Checkbox
                            id="rememberMe"
                            checked={rememberMe}
                            onCheckedChange={(checked) => setRememberMe(checked === true)}
                            className="border-white/30 data-[state=checked]:bg-white/20 data-[state=checked]:border-white/40"
                          />
                          <Label
                            htmlFor="rememberMe"
                            className="text-sm text-white/60 font-light cursor-pointer"
                          >
                            Remember me
                          </Label>
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
              
              <Button
                  type="submit"
                  disabled={loading || (mode === "mfa" && mfaCode.length !== 6)}
                  variant="liquid-glass"
                  className="w-full py-6 font-light tracking-wide text-white"
                >
                  {loading ? "Please wait..." : 
                    mode === "forgot" ? "Send Reset Link" :
                    mode === "reset" ? "Update Password" :
                    mode === "mfa" ? "Verify" :
                    mode === "login" ? "Login" : "Sign Up"}
              </Button>

              {!isDemoAccess && (mode === "login" || mode === "signup") && (
                <>
                  <div className="relative">
                    <div className="absolute inset-0 flex items-center">
                      <span className="w-full border-t border-white/20" />
                    </div>
                    <div className="relative flex justify-center text-xs uppercase">
                      <span className="bg-[#010114] px-2 text-white/40">Or continue with</span>
                    </div>
                  </div>

                  <Button
                    type="button"
                    variant="liquid-glass"
                    onClick={handleGoogleSignIn}
                    disabled={googleLoading}
                    className="w-full py-6 font-light tracking-wide text-white"
                  >
                    {googleLoading ? (
                      <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                    ) : (
                      <svg className="mr-2 h-5 w-5" viewBox="0 0 24 24">
                        <path
                          fill="currentColor"
                          d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                        />
                        <path
                          fill="currentColor"
                          d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                        />
                        <path
                          fill="currentColor"
                          d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                        />
                        <path
                          fill="currentColor"
                          d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                        />
                      </svg>
                    )}
                    {googleLoading ? "Connecting..." : "Continue with Google"}
                  </Button>
                </>
              )}
              
              {!isDemoAccess && mode === "login" && (
                <Button
                  type="button"
                  variant="ghost"
                  disabled={loading}
                  onClick={async () => {
                    setLoading(true);
                    try {
                      // Try to sign in first
                      const { error: signInError } = await supabase.auth.signInWithPassword({
                        email: "demo@example.com",
                        password: "demo123456",
                      });
                      
                      if (signInError) {
                        // If login fails, create the demo account
                        const { error: signUpError } = await supabase.auth.signUp({
                          email: "demo@example.com",
                          password: "demo123456",
                          options: {
                            emailRedirectTo: `${window.location.origin}/pipeline`,
                          },
                        });
                        if (signUpError) throw signUpError;
                        toast.success("Demo account created! Welcome!");
                      } else {
                        toast.success("Welcome to the demo!");
                      }
                      
                      // Seed demo data if needed
                      const { data: { session } } = await supabase.auth.getSession();
                      if (session) {
                        try {
                          await supabase.functions.invoke("seed-demo-data");
                        } catch (seedError) {
                          console.error("Failed to seed demo data:", seedError);
                        }
                      }
                      
                      navigate("/deals");
                    } catch (error: any) {
                      toast.error(error.message || "Demo login failed. Please try again.");
                    } finally {
                      setLoading(false);
                    }
                  }}
                  className="w-full text-white/60 hover:text-white hover:bg-[hsl(270,50%,40%,0.15)] py-6 font-light tracking-wide"
                >
                  Try Demo
                </Button>
              )}
            </form>
            
            {!isDemoAccess && mode !== "reset" && mode !== "mfa" && (
              <p className="text-center text-white/50 mt-6 font-light">
                {mode === "forgot" ? (
                  <button
                    type="button"
                    onClick={() => setMode("signup")}
                    className="text-white/80 hover:text-white underline underline-offset-4"
                  >
                    Back to sign up
                  </button>
                ) : (
                  <>
                    {mode === "login" ? "Don't have an account?" : "Already have an account?"}{" "}
                    <button
                      type="button"
                      onClick={() => mode === "login" ? setMode("signup") : handleLoginClick()}
                      className="text-white/80 hover:text-white underline underline-offset-4"
                    >
                      {mode === "login" ? "Sign up" : "Login"}
                    </button>
                  </>
                )}
              </p>
            )}
          </div>
        </div>
      </div>
    </>
  );
};

export default Auth;
