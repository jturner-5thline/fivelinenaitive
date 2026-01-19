import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { SpinningGlobe } from "@/components/SpinningGlobe";
import { Helmet } from "react-helmet-async";
import { Loader2, Eye, EyeOff, ShieldCheck } from "lucide-react";
import { z } from "zod";

const authSchema = z.object({
  email: z.string().trim().email({ message: "Invalid email address" }),
  password: z.string().min(6, { message: "Password must be at least 6 characters" }),
});

const emailSchema = z.object({
  email: z.string().trim().email({ message: "Invalid email address" }),
});

type AuthMode = "login" | "signup" | "forgot" | "reset" | "mfa" | "gate";

interface MFAChallenge {
  factorId: string;
  challengeId: string;
}

// Gate password hash for quick client-side check
const GATE_PASSWORD = "nAItive2024!";
const GATE_SESSION_KEY = "naitive_gate_verified";

const Auth = () => {
  // Check if user has already passed the gate this session
  const hasPassedGate = sessionStorage.getItem(GATE_SESSION_KEY) === "true";
  const [mode, setMode] = useState<AuthMode>("signup");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [gatePassword, setGatePassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showGatePassword, setShowGatePassword] = useState(false);
  const [mfaChallenge, setMfaChallenge] = useState<MFAChallenge | null>(null);
  const [mfaCode, setMfaCode] = useState("");
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  
  // Get redirect URL from query params (for invite links, etc.)
  const redirectUrl = searchParams.get('redirect') || '/deals';

  useEffect(() => {
    // Check for password recovery event
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (event === "PASSWORD_RECOVERY") {
          setMode("reset");
        } else if (event === "SIGNED_IN" && session?.user && mode !== "reset" && mode !== "mfa") {
          // Redirect to the specified URL or default to /deals
          navigate(redirectUrl);
        }
      }
    );

    // Check URL for recovery token only
    const hashParams = new URLSearchParams(window.location.hash.substring(1));
    if (hashParams.get("type") === "recovery") {
      setMode("reset");
    }

    return () => subscription.unsubscribe();
  }, [navigate, mode, redirectUrl]);

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
      navigate("/deals");
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
        navigate("/deals");
      } else {
        const validation = authSchema.safeParse({ email, password });
        if (!validation.success) {
          toast.error(validation.error.errors[0].message);
          setLoading(false);
          return;
        }

        if (mode === "login") {
          const { data, error } = await supabase.auth.signInWithPassword({
            email: email.trim(),
            password,
          });
          
          if (error) throw error;

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
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth`,
        },
      });
      if (error) {
        setGoogleLoading(false);
        throw error;
      }
    } catch (error: any) {
      setGoogleLoading(false);
      toast.error(error.message || "Failed to sign in with Google");
    }
  };

  const handleGateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (gatePassword === GATE_PASSWORD) {
      sessionStorage.setItem(GATE_SESSION_KEY, "true");
      setMode("login");
      setGatePassword("");
    } else {
      toast.error("Incorrect password");
    }
  };

  // Handle "Already have an account?" click - skip gate if already verified
  const handleLoginClick = () => {
    if (hasPassedGate) {
      setMode("login");
    } else {
      setMode("gate");
    }
  };

  const getTitle = () => {
    switch (mode) {
      case "forgot": return "Reset Password";
      case "reset": return "Set New Password";
      case "signup": return "Sign Up";
      case "mfa": return "Two-Factor Authentication";
      case "gate": return "Access Required";
      default: return "Login";
    }
  };

  const getSubtitle = () => {
    switch (mode) {
      case "forgot": return "Enter your email to receive a reset link";
      case "reset": return "Enter your new password";
      case "signup": return "Create your account";
      case "mfa": return "Enter the code from your authenticator app";
      case "gate": return "Enter the password to access login";
      default: return "Welcome back";
    }
  };

  return (
    <>
      <Helmet>
        <title>{getTitle()} | nAItive</title>
      </Helmet>
      
      <div className="min-h-screen bg-[#010114] relative overflow-hidden">
        <SpinningGlobe />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-[#010114]/80" />
        
        <div className="relative z-10 min-h-screen flex flex-col items-center justify-end pb-4 md:pb-6 px-4">
          <h1 className="absolute top-[-7.5%] left-1/2 -translate-x-1/2 text-[22.5vw] font-sans font-bold tracking-tighter whitespace-nowrap pointer-events-none select-none">
            <span className="text-white/[0.07]">n</span>
            <span 
              className="bg-clip-text text-transparent"
              style={{ 
                backgroundImage: 'linear-gradient(45deg, rgba(100,116,139,0.3) 0%, rgba(139,92,246,0.45) 50%, rgba(148,163,184,0.3) 100%)',
                backgroundSize: '300% 300%',
                animation: 'shimmer 8s ease-in-out infinite',
              }}
            >AI</span>
            <span className="text-white/[0.07]">tive</span>
          </h1>
          <style>{`
            @keyframes shimmer {
              0%, 100% { background-position: 100% 100%; }
              50% { background-position: 0% 0%; }
            }
          `}</style>
          
          <div className="w-full max-w-md">
            <form onSubmit={mode === "mfa" ? handleMFAVerify : mode === "gate" ? handleGateSubmit : handleSubmit} className="space-y-6">
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
              ) : mode === "gate" ? (
                <div className="space-y-4">
                  <div className="flex justify-center mb-4">
                    <div className="flex h-16 w-16 items-center justify-center rounded-full bg-white/10">
                      <ShieldCheck className="h-8 w-8 text-white/80" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="gatePassword" className="text-white/80 font-light">
                      Password
                    </Label>
                    <div className="relative">
                      <Input
                        id="gatePassword"
                        type={showGatePassword ? "text" : "password"}
                        value={gatePassword}
                        onChange={(e) => setGatePassword(e.target.value)}
                        placeholder="••••••••"
                        required
                        className="bg-white/5 border-white/20 text-white placeholder:text-white/40 focus:border-white/40 pr-10"
                        autoFocus
                      />
                      <button
                        type="button"
                        onClick={() => setShowGatePassword(!showGatePassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-white/50 hover:text-white/80"
                      >
                        {showGatePassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setMode("signup")}
                    className="text-sm text-white/50 hover:text-white/80 underline underline-offset-4"
                  >
                    Back to sign up
                  </button>
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
                      placeholder="you@example.com"
                      required
                      className="bg-white/5 border-white/20 text-white placeholder:text-white/40 focus:border-white/40"
                    />
                  </div>
                  
                  {mode !== "forgot" && (
                    <div className="space-y-2">
                      <Label htmlFor="password" className="text-white/80 font-light">
                        Password
                      </Label>
                      <div className="relative">
                        <Input
                          id="password"
                          type={showPassword ? "text" : "password"}
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          placeholder="••••••••"
                          required
                          className="bg-white/5 border-white/20 text-white placeholder:text-white/40 focus:border-white/40 pr-10"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-white/50 hover:text-white/80"
                        >
                          {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                      {mode === "login" && (
                        <button
                          type="button"
                          onClick={() => setMode("forgot")}
                          className="text-sm text-white/50 hover:text-white/80 underline underline-offset-4"
                        >
                          Forgot password?
                        </button>
                      )}
                      {mode === "login" && (
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
              
              {mode !== "gate" && (
                <Button
                  type="submit"
                  disabled={loading || (mode === "mfa" && mfaCode.length !== 6)}
                  className="w-full bg-transparent border border-white/20 text-white hover:bg-white/5 hover:border-white/40 py-6 font-light tracking-wide"
                >
                  {loading ? "Please wait..." : 
                    mode === "forgot" ? "Send Reset Link" :
                    mode === "reset" ? "Update Password" :
                    mode === "mfa" ? "Verify" :
                    mode === "login" ? "Login" : "Sign Up"}
                </Button>
              )}

              {mode === "gate" && (
                <Button
                  type="submit"
                  className="w-full bg-transparent border border-white/20 text-white hover:bg-white/5 hover:border-white/40 py-6 font-light tracking-wide"
                >
                  Continue to Login
                </Button>
              )}

              {(mode === "login" || mode === "signup") && (
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
                    variant="outline"
                    onClick={handleGoogleSignIn}
                    disabled={googleLoading}
                    className="w-full bg-white/5 border-white/20 text-white hover:bg-white/10 hover:border-white/40 py-6 font-light tracking-wide"
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
              
              {mode === "login" && (
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
                            emailRedirectTo: `${window.location.origin}/deals`,
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
                  className="w-full text-white/60 hover:text-white hover:bg-white/5 py-6 font-light tracking-wide"
                >
                  Try Demo
                </Button>
              )}
            </form>
            
            {mode !== "reset" && mode !== "mfa" && mode !== "gate" && (
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
