import { useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { Loader2, CheckCircle2, Lock, Mail, User, Building2 } from 'lucide-react';
import { z } from 'zod';

const waitlistSchema = z.object({
  email: z.string().trim().email({ message: "Please enter a valid email address" }),
  name: z.string().trim().optional(),
  company: z.string().trim().optional(),
});

const ACCESS_PASSWORD = "5thlinenaitive";

const Waitlist = () => {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [company, setCompany] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [password, setPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');

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

  const handlePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (password === ACCESS_PASSWORD) {
      sessionStorage.setItem('landing-access', 'granted');
      window.location.href = '/home';
    } else {
      setPasswordError('Incorrect password');
    }
  };

  return (
    <>
      <Helmet>
        <title>nAItive | Join the Waitlist</title>
        <meta 
          name="description" 
          content="Join the waitlist for nAItive - the AI-powered deal intelligence platform for growth investors." 
        />
      </Helmet>
      
      <div className="min-h-screen bg-[#010114] relative overflow-hidden">
        {/* YouTube Video Background */}
        <div className="absolute inset-0 w-full h-full overflow-hidden">
          <iframe
            src="https://www.youtube.com/embed/cR1FyHv_rJE?autoplay=1&mute=1&loop=1&playlist=cR1FyHv_rJE&controls=0&showinfo=0&rel=0&modestbranding=1&playsinline=1"
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[177.78vh] min-w-full h-[56.25vw] min-h-full pointer-events-none"
            allow="autoplay; encrypted-media"
            allowFullScreen
            title="Background video"
          />
        </div>
        
        <div className="absolute inset-0 bg-gradient-to-b from-[#010128]/70 via-[#010128]/60 to-[#010114]/80" />
        
        <div className="relative z-10 min-h-screen flex flex-col items-center justify-center px-4">
          <h1 className="text-5xl md:text-7xl lg:text-8xl font-bold text-white mb-2 tracking-tight">
            nAItive
          </h1>
          
          <p className="text-white/60 text-lg md:text-xl font-light mb-8 tracking-wide">
            AI-Powered Deal Intelligence
          </p>

          {isSubmitted ? (
            <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-8 w-full max-w-md text-center">
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
                onClick={() => setShowPasswordModal(true)}
              >
                <Lock className="h-4 w-4 mr-2" />
                Already have access?
              </Button>
            </div>
          ) : (
            <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-8 w-full max-w-md">
              <h2 className="text-xl font-semibold text-white mb-2 text-center">Join the Waitlist</h2>
              <p className="text-white/50 text-sm text-center mb-6">
                Be the first to experience the future of deal intelligence
              </p>
              
              <form onSubmit={handleSubmit} className="space-y-4">
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
              
              <div className="mt-6 pt-6 border-t border-white/10 text-center">
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-white/40 hover:text-white/60 hover:bg-white/5"
                  onClick={() => setShowPasswordModal(true)}
                >
                  <Lock className="h-3 w-3 mr-2" />
                  Already have access?
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Password Modal */}
      {showPasswordModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-[#0a0a1f] border border-white/10 rounded-2xl p-8 w-full max-w-sm mx-4">
            <h3 className="text-xl font-semibold text-white mb-4 text-center">Enter Access Code</h3>
            <form onSubmit={handlePasswordSubmit} className="space-y-4">
              <div className="space-y-2">
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setPasswordError('');
                  }}
                  placeholder="Access password"
                  className="bg-white/5 border-white/10 text-white placeholder:text-white/30 focus:border-white/30"
                  autoFocus
                />
                {passwordError && (
                  <p className="text-red-400 text-sm">{passwordError}</p>
                )}
              </div>
              <div className="flex gap-3">
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1 bg-transparent border-white/20 text-white hover:bg-white/5"
                  onClick={() => {
                    setShowPasswordModal(false);
                    setPassword('');
                    setPasswordError('');
                  }}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  className="flex-1 bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 text-white border-0"
                >
                  Enter
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
};

export default Waitlist;