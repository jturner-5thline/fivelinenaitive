import { useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RateLimitGuard } from '@/components/RateLimitGuard';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { Loader2, CheckCircle2, LogIn, Mail, User, Building2, Eye, EyeOff } from 'lucide-react';
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

  const GATE_PASSWORD = '5thlinecapital';

  const handleGateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (gatePassword === GATE_PASSWORD) {
      setShowGateDialog(false);
      setGatePassword('');
      navigate('/auth');
    } else {
      toast({
        title: 'Incorrect password',
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
        <SpinningGlobe />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-[#010114]/80" />
        
        <div className="relative z-10 min-h-screen flex flex-col items-center justify-end pb-8 md:pb-12 px-4 animate-fade-in">
          <h1 
            className="absolute top-[-7.5%] left-1/2 -translate-x-1/2 text-[22.5vw] font-sans font-bold tracking-tighter whitespace-nowrap pointer-events-none select-none"
            style={{
              animation: 'fadeInFromBack 1.5s ease-out forwards',
            }}
          >
            <span className="text-white/[0.10]">n</span>
            <span 
              className="bg-clip-text text-transparent"
              style={{ 
                backgroundImage: 'linear-gradient(45deg, rgba(100,116,139,0.3) 0%, rgba(139,92,246,0.45) 50%, rgba(148,163,184,0.3) 100%)',
                backgroundSize: '300% 300%',
                animation: 'shimmer 8s ease-in-out infinite',
              }}
            >AI</span>
            <span className="text-white/[0.10]">tive</span>
          </h1>
          <style>{`
            @keyframes shimmer {
              0%, 100% { background-position: 100% 100%; }
              50% { background-position: 0% 0%; }
            }
            @keyframes fadeInFromBack {
              0% {
                opacity: 0;
                transform: translateX(-50%) scale(0.8);
              }
              100% {
                opacity: 1;
                transform: translateX(-50%) scale(1);
              }
            }
          `}</style>

          {isSubmitted ? (
            <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-6 w-full max-w-md text-center">
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
                variant="outline"
                className="bg-transparent border-white/20 text-white hover:bg-white/5 hover:border-white/40"
                onClick={() => navigate('/auth')}
              >
                <LogIn className="h-4 w-4 mr-2" />
                Already have an account? Sign in
              </Button>
            </div>
          ) : (
            <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-6 w-full max-w-sm">
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
                  className="w-full bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 text-white border-0"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Joining...
                    </>
                  ) : (
                    'Join Waitlist'
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

          <Dialog open={showGateDialog} onOpenChange={setShowGateDialog}>
            <DialogContent className="bg-[#0a0a1a] border-white/10 text-white max-w-sm">
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
                  className="w-full bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 text-white border-0"
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