import { useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RateLimitGuard } from '@/components/RateLimitGuard';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { Loader2, CheckCircle2, LogIn, Mail, User, Building2 } from 'lucide-react';
import { z } from 'zod';
import { useNavigate } from 'react-router-dom';
import { SpinningGlobe } from '@/components/SpinningGlobe';

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
        
        <div className="relative z-10 min-h-screen flex flex-col items-center justify-end pb-16 md:pb-24 px-4 animate-fade-in">
          <h1 className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-[20vw] font-bold text-white/[0.07] tracking-tighter whitespace-nowrap pointer-events-none select-none">
            nAItive
          </h1>

          {isSubmitted ? (
            <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-6 w-full max-w-sm text-center">
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
              <h2 className="text-lg font-semibold text-white mb-1 text-center">Join the Waitlist</h2>
              <p className="text-white/50 text-xs text-center mb-4">
                Be the first to experience the future of deal intelligence
              </p>
              
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
              
              <div className="mt-4 pt-4 border-t border-white/10 text-center">
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-white/40 hover:text-white/60 hover:bg-white/5"
                  onClick={() => navigate('/auth')}
                >
                  <LogIn className="h-3 w-3 mr-2" />
                  Already have an account? Sign in
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
      </>
    </RateLimitGuard>
  );
};

export default Waitlist;