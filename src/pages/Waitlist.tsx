import { useState } from 'react';
import naitiveLogoFull from "@/assets/naitive-logo-dark-mode-no-circle.png";
import { Helmet } from 'react-helmet-async';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RateLimitGuard } from '@/components/RateLimitGuard';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { Loader2, CheckCircle2, LogIn, Mail, User, Building2, Eye, EyeOff, ArrowRight } from 'lucide-react';
import { z } from 'zod';
import { useNavigate } from 'react-router-dom';
import { SpinningGlobe } from '@/components/SpinningGlobe';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

const waitlistSchema = z.object({
  email: z.string().trim().email({ message: "Please enter a valid email address" }),
  name: z.string().trim().optional(),
  company: z.string().trim().optional(),
});

const Waitlist = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [company, setCompany] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [showGateDialog, setShowGateDialog] = useState(false);
  const [gatePassword, setGatePassword] = useState('');
  const [showGatePassword, setShowGatePassword] = useState(false);

  const handleGateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      const { data, error } = await supabase.functions.invoke('validate-gate', {
        body: { password: gatePassword }
      });
      
      if (error) throw error;
      
      if (data?.valid) {
        setShowGateDialog(false);
        setGatePassword('');
        // Store token for auth page
        sessionStorage.setItem('naitive_gate_verified', 'true');
        sessionStorage.setItem('naitive_gate_token', data.token);
        // Pass waitlist email to auth page if available
        navigate('/auth', { state: { waitlistEmail: email || undefined, waitlistName: name || undefined, waitlistCompany: company || undefined } });
      } else {
        toast({
          title: 'Incorrect password',
          description: 'Please try again.',
          variant: 'destructive',
        });
      }
    } catch (error: any) {
      console.error('Gate validation error:', error);
      toast({
        title: 'Validation failed',
        description: 'Please try again.',
        variant: 'destructive',
      });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const validation = waitlistSchema.safeParse({ email, name, company });
    if (!validation.success) {
      toast({
        title: 'Invalid input',
        description: validation.error.errors[0].message,
        variant: 'destructive',
      });
      return;
    }
    
    setIsSubmitting(true);
    
    try {
      const { error } = await supabase
        .from('waitlist')
        .insert({
          email: validation.data.email,
          name: validation.data.name || null,
          company: validation.data.company || null,
        });
      
      if (error) {
        if (error.code === '23505') {
          toast({
            title: 'Already on the list!',
            description: "You're already signed up. We'll be in touch soon!",
          });
          setIsSubmitted(true);
        } else {
          throw error;
        }
      } else {
        setIsSubmitted(true);
        toast({
          title: 'Welcome to the waitlist!',
          description: "We'll notify you when nAItive launches.",
        });
        
        // Send welcome email (fire and forget)
        supabase.functions.invoke('send-waitlist-welcome', {
          body: { name: validation.data.name || 'there', email: validation.data.email }
        }).catch(err => console.error('Failed to send welcome email:', err));
      }
    } catch (error: any) {
      console.error('Error joining waitlist:', error);
      toast({
        title: 'Something went wrong',
        description: 'Please try again later.',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <RateLimitGuard path="/">
      <>
      <Helmet>
        <title>nAItive | Join the Waitlist</title>
        <meta 
          name="description" 
          content="Join the waitlist for nAItive - the AI-powered deal intelligence platform for growth investors." 
        />
      </Helmet>
      
      <div className="min-h-screen bg-[#010114] relative overflow-hidden">
        <div className="absolute inset-0 blur-[2px]"><SpinningGlobe /></div>
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-[#010114]/80" />
        
        <div className="relative z-10 min-h-screen flex flex-col items-center justify-end pb-4 md:pb-6 px-4">
          <div className="absolute top-[18%] left-1/2 -translate-x-1/2 pointer-events-none select-none flex flex-col items-center">
            <img 
              src={naitiveLogoFull} 
              alt="naitive" 
              className="w-[70vw] max-w-[844px] h-auto shrink-0 object-contain animate-fade-in opacity-80"
              style={{ aspectRatio: 'auto' }}
            />
          </div>

          {isSubmitted ? (
            <div className="relative overflow-hidden border border-[hsl(270,70%,55%,0.3)] bg-[hsl(270,50%,40%,0.12)] backdrop-blur-xl shadow-[inset_0_1px_1px_hsl(270,80%,80%,0.15),0_4px_24px_hsl(270,70%,35%,0.2)] rounded-2xl p-6 w-full max-w-md text-center before:pointer-events-none before:absolute before:inset-0 before:rounded-[inherit] before:bg-[linear-gradient(135deg,hsl(270,80%,80%,0.1)_0%,transparent_50%,hsl(270,70%,55%,0.05)_100%)]">
              <div className="flex justify-center mb-4">
                <div className="p-3 rounded-full bg-green-500/20">
                  <CheckCircle2 className="h-8 w-8 text-green-400" />
                </div>
              </div>
              <h2 className="text-2xl font-semibold text-white mb-2">You're on the list!</h2>
              <p className="text-white/60 mb-6">
                We'll reach out when nAItive is ready for you.
              </p>
              <Button
                variant="liquid-glass"
                className="text-white"
                onClick={() => navigate('/auth')}
              >
                <LogIn className="h-4 w-4 mr-2" />
                Already have an account? Sign in
              </Button>
            </div>
          ) : (
            <div className="relative overflow-hidden border border-[hsl(270,70%,55%,0.3)] bg-[hsl(270,50%,40%,0.12)] backdrop-blur-xl shadow-[inset_0_1px_1px_hsl(270,80%,80%,0.15),0_4px_24px_hsl(270,70%,35%,0.2)] rounded-2xl p-6 w-full max-w-sm before:pointer-events-none before:absolute before:inset-0 before:rounded-[inherit] before:bg-[linear-gradient(135deg,hsl(270,80%,80%,0.1)_0%,transparent_50%,hsl(270,70%,55%,0.05)_100%)]">
              <h2 className="text-lg font-semibold text-white mb-4 text-center">Join the Waitlist</h2>
              
              <form onSubmit={handleSubmit} className="space-y-3">
                <div className="space-y-2">
                  <Label htmlFor="email" className="text-white/80 flex items-center gap-2">
                    <Mail className="h-4 w-4" />
                    Email *
                  </Label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@company.com"
                    required
                    className="bg-white/5 border-white/10 text-white placeholder:text-white/30 focus:border-white/30"
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="name" className="text-white/80 flex items-center gap-2">
                    <User className="h-4 w-4" />
                    Name
                  </Label>
                  <Input
                    id="name"
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="John Doe"
                    className="bg-white/5 border-white/10 text-white placeholder:text-white/30 focus:border-white/30"
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="company" className="text-white/80 flex items-center gap-2">
                    <Building2 className="h-4 w-4" />
                    Company
                  </Label>
                  <Input
                    id="company"
                    type="text"
                    value={company}
                    onChange={(e) => setCompany(e.target.value)}
                    placeholder="Acme Capital"
                    className="bg-white/5 border-white/10 text-white placeholder:text-white/30 focus:border-white/30"
                  />
                </div>
                
                <Button 
                  type="submit" 
                  disabled={isSubmitting}
                  className="w-full relative overflow-hidden border border-[hsl(199,80%,50%,0.5)] bg-[linear-gradient(145deg,hsl(199,70%,35%,0.7)_0%,hsl(210,60%,28%,0.75)_50%,hsl(220,50%,22%,0.8)_100%)] !text-white font-medium backdrop-blur-xl shadow-[inset_0_1px_1px_hsl(199,80%,70%,0.25),0_4px_20px_hsl(199,70%,30%,0.25)] hover:border-[hsl(199,80%,55%,0.7)] hover:bg-[linear-gradient(145deg,hsl(199,75%,40%,0.8)_0%,hsl(210,65%,32%,0.85)_50%,hsl(220,55%,26%,0.9)_100%)] hover:shadow-[inset_0_1px_1px_hsl(199,80%,75%,0.3),0_6px_28px_hsl(199,70%,35%,0.35)] before:pointer-events-none before:absolute before:inset-0 before:rounded-[inherit] before:bg-[linear-gradient(135deg,hsl(199,80%,75%,0.15)_0%,transparent_50%,hsl(199,60%,40%,0.05)_100%)] h-11"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Joining...
                    </>
                  ) : (
                    <>
                      Join Waitlist
                      <ArrowRight className="h-4 w-4 ml-2" />
                    </>
                  )}
                </Button>
              </form>
            </div>
          )}
          
          <Button
            variant="ghost"
            size="sm"
            className="absolute bottom-4 right-4 text-white/40 hover:text-white/60 hover:bg-white/5"
            onClick={() => setShowGateDialog(true)}
          >
            <LogIn className="h-3 w-3 mr-2" />
            Already have an account? Sign in
          </Button>

          <Button
            variant="ghost"
            size="sm"
            className="fixed bottom-6 left-6 z-[60] text-white/40 hover:text-white/60 hover:bg-white/5"
            onClick={() => navigate('/homepage')}
          >
            Learn More
          </Button>

          <Dialog open={showGateDialog} onOpenChange={setShowGateDialog}>
            <DialogContent className="bg-[hsl(270,30%,8%)] border-[hsl(270,70%,55%,0.3)] text-white max-w-sm">
              <DialogHeader>
                <DialogTitle className="text-white">Access Required</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleGateSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="gatePassword" className="text-white/80">
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
                <Button
                  type="submit"
                  variant="liquid-glass"
                  className="w-full text-white"
                >
                  Continue
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>
      </>
    </RateLimitGuard>
  );
};

export default Waitlist;