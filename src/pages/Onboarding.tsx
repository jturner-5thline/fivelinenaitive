import { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Helmet } from 'react-helmet-async';
import { Building2, Mail, Phone, User, Globe, Users, Briefcase, Loader2, Check } from 'lucide-react';
import confetti from 'canvas-confetti';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useProfile } from '@/hooks/useProfile';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { extractDomain, useFindCompaniesByDomain } from '@/hooks/useCompanyJoinRequests';
import { CompanyJoinRequestModal } from '@/components/onboarding/CompanyJoinRequestModal';
import { seedSampleDeal } from '@/utils/seedSampleDeal';


const fireConfetti = () => {
  const duration = 3000;
  const end = Date.now() + duration;

  const colors = ['#a855f7', '#ec4899', '#3b82f6', '#22c55e', '#f59e0b'];

  (function frame() {
    confetti({
      particleCount: 3,
      angle: 60,
      spread: 55,
      origin: { x: 0 },
      colors: colors,
    });
    confetti({
      particleCount: 3,
      angle: 120,
      spread: 55,
      origin: { x: 1 },
      colors: colors,
    });

    if (Date.now() < end) {
      requestAnimationFrame(frame);
    }
  })();
};

const onboardingSchema = z.object({
  display_name: z.string().min(2, 'Name must be at least 2 characters').max(100, 'Name must be less than 100 characters'),
  phone: z.string()
    .refine(val => !val || /^[\d\s\-+()]*$/.test(val), { message: 'Invalid phone number format' })
    .refine(val => !val || val.length <= 20, { message: 'Phone number is too long' }),
  company_name: z.string().min(1, 'Company name is required').max(100, 'Company name must be less than 100 characters'),
  backup_email: z.string()
    .refine(val => !val || z.string().email().safeParse(val).success, { message: 'Invalid email format' }),
  company_url: z.string()
    .refine(val => !val || /^https?:\/\/.+\..+/.test(val), { message: 'Invalid URL format (must start with http:// or https://)' }),
  company_size: z.string().min(1, 'Please select company size'),
  company_role: z.string().min(1, 'Please select your role'),
});

type OnboardingForm = z.infer<typeof onboardingSchema>;

const companySizes = [
  { value: '1-10', label: '1-10 employees' },
  { value: '11-50', label: '11-50 employees' },
  { value: '51-200', label: '51-200 employees' },
  { value: '201-500', label: '201-500 employees' },
  { value: '501-1000', label: '501-1000 employees' },
  { value: '1000+', label: '1000+ employees' },
];

const companyRoles = [
  { value: 'ceo', label: 'CEO / Founder' },
  { value: 'cfo', label: 'CFO / Finance Director' },
  { value: 'coo', label: 'COO / Operations Director' },
  { value: 'investment_banker', label: 'Investment Banker' },
  { value: 'financial_analyst', label: 'Financial Analyst' },
  { value: 'deal_manager', label: 'Deal Manager' },
  { value: 'associate', label: 'Associate' },
  { value: 'analyst', label: 'Analyst' },
  { value: 'other', label: 'Other' },
];

// Required fields for progress calculation
const requiredFields = ['display_name', 'company_name', 'company_size', 'company_role'] as const;
const optionalFields = ['phone', 'backup_email', 'company_url'] as const;

export default function Onboarding() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { refreshProfile } = useProfile();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showJoinRequest, setShowJoinRequest] = useState(false);

  // Domain matching
  const userDomain = user?.email ? extractDomain(user.email) : null;
  const { data: matchingCompanies, isLoading: companiesLoading } = useFindCompaniesByDomain(userDomain);

  // Check if user already has a company membership
  const [hasCompany, setHasCompany] = useState<boolean | null>(null);
  useEffect(() => {
    if (!user) return;
    supabase
      .from('company_members')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle()
      .then(({ data }) => setHasCompany(!!data));
  }, [user]);

  // If matching companies exist and user has no company, show join request
  useEffect(() => {
    if (hasCompany === false && matchingCompanies && matchingCompanies.length > 0 && !companiesLoading) {
      setShowJoinRequest(true);
    }
  }, [matchingCompanies, hasCompany, companiesLoading]);

  // Approval gate removed — after a join request, send user into the app.
  const handleJoinRequestSent = () => {
    navigate('/pipeline', { replace: true });
  };

  const form = useForm<OnboardingForm>({
    resolver: zodResolver(onboardingSchema),
    defaultValues: {
      display_name: '',
      phone: '',
      company_name: '',
      backup_email: '',
      company_url: '',
      company_size: '',
      company_role: '',
    },
    mode: 'onChange',
  });

  // Pre-fill from waitlist data (sessionStorage or database lookup)
  useEffect(() => {
    const prefillFromWaitlist = async () => {
      const waitlistName = sessionStorage.getItem('waitlist_name');
      const waitlistCompany = sessionStorage.getItem('waitlist_company');

      if (waitlistName) {
        if (!form.getValues('display_name')) {
          form.setValue('display_name', waitlistName, { shouldValidate: true });
        }
        sessionStorage.removeItem('waitlist_name');
        sessionStorage.removeItem('waitlist_company');
        return;
      }

      if (!user?.email) return;
      try {
        const { data } = await supabase
          .from('waitlist')
          .select('name, company')
          .eq('email', user.email)
          .maybeSingle();
        if (data?.name && !form.getValues('display_name')) {
          form.setValue('display_name', data.name, { shouldValidate: true });
        }
      } catch (err) {
        console.error('Error fetching waitlist data for pre-fill:', err);
      }
    };
    prefillFromWaitlist();
  }, [user?.email, form]);

  // Also pre-fill display_name from auth metadata (Google SSO, etc.)
  useEffect(() => {
    if (user && !form.getValues('display_name')) {
      const meta = user.user_metadata;
      const name = meta?.full_name || meta?.name || meta?.display_name;
      if (name) {
        form.setValue('display_name', name, { shouldValidate: true });
      }
    }
  }, [user, form]);

  const watchedValues = form.watch();

  const { completedCount, totalCount, progress, fieldStatus } = useMemo(() => {
    const allFields = [...requiredFields, ...optionalFields];
    const status: Record<string, boolean> = {};
    
    let completed = 0;
    allFields.forEach(field => {
      const value = watchedValues[field];
      const isCompleted = Boolean(value && value.trim().length > 0);
      status[field] = isCompleted;
      if (isCompleted) completed++;
    });

    return {
      completedCount: completed,
      totalCount: allFields.length,
      progress: Math.round((completed / allFields.length) * 100),
      fieldStatus: status,
    };
  }, [watchedValues]);

  // Show join request UI if needed (after all hooks)
  if (showJoinRequest && matchingCompanies && matchingCompanies.length > 0 && userDomain) {
    return (
      <CompanyJoinRequestModal
        companies={matchingCompanies}
        userDomain={userDomain}
        onRequestSent={handleJoinRequestSent}
        onCancel={() => setShowJoinRequest(false)}
      />
    );
  }

  const onSubmit = async (data: OnboardingForm) => {
    if (!user) return;

    setIsSubmitting(true);
    try {
      let resolvedCompanyId: string | null = null;

      const { data: membership, error: membershipError } = await supabase
        .from('company_members')
        .select('company_id')
        .eq('user_id', user.id)
        .maybeSingle();

      if (membershipError) {
        throw membershipError;
      }

      resolvedCompanyId = membership?.company_id ?? null;

      if (!resolvedCompanyId) {
        const { data: ensuredCompanyId, error: ensureWorkspaceError } = await supabase.rpc(
          'ensure_user_workspace',
          {
            _company_name: data.company_name,
            _company_url: data.company_url || null,
            _company_size: data.company_size,
          }
        );

        if (ensureWorkspaceError || !ensuredCompanyId) {
          console.error('Error ensuring user workspace:', ensureWorkspaceError);
          throw ensureWorkspaceError ?? new Error('Failed to create workspace');
        }

        resolvedCompanyId = ensuredCompanyId;
      }

      const { error } = await supabase
        .from('profiles')
        .update({
          display_name: data.display_name,
          phone: data.phone || null,
          company_name: data.company_name,
          backup_email: data.backup_email || null,
          company_url: data.company_url || null,
          company_size: data.company_size,
          company_role: data.company_role,
          onboarding_completed: true,
        })
        .eq('user_id', user.id);

      if (error) throw error;

      const seeded = await seedSampleDeal(user.id, resolvedCompanyId);

      // Refresh profile and notify all instances (including ProtectedRoute)
      await refreshProfile();
      window.dispatchEvent(new Event('profile-updated'));
      
      // Set flag so platform tour shows on deals page
      sessionStorage.setItem('just-completed-onboarding', 'true');
      
      // Fire confetti celebration
      fireConfetti();
      
      toast({
        title: 'Welcome!',
        description: seeded
          ? 'Your account is ready with a sample deal and starter dashboard.'
          : 'Your account has been set up successfully.',
      });
      
      // Navigate to deals page where the platform tour will automatically start
      setTimeout(() => {
        navigate('/deals', { replace: true });
      }, 1500);
    } catch (err) {
      console.error('Error completing onboarding:', err);
      toast({
        title: 'Error',
        description: 'Failed to save your information. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <Helmet>
        <title>Complete Your Profile | Deal Tracker</title>
      </Helmet>
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-2xl">
          <CardHeader className="text-center space-y-4">
            <CardTitle className="text-2xl">Welcome! Let's set up your account</CardTitle>
            <CardDescription>
              Tell us a bit about yourself and your company to get started.
            </CardDescription>
            <div className="space-y-2 pt-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Profile completion</span>
                <span className="font-medium">{completedCount} of {totalCount} fields</span>
              </div>
              <Progress value={progress} className="h-2" />
              <div className="flex flex-wrap gap-2 justify-center pt-2">
                {[
                  { key: 'display_name', label: 'Name', required: true },
                  { key: 'company_name', label: 'Company', required: true },
                  { key: 'company_size', label: 'Size', required: true },
                  { key: 'company_role', label: 'Role', required: true },
                  { key: 'phone', label: 'Phone', required: false },
                  { key: 'backup_email', label: 'Email', required: false },
                  { key: 'company_url', label: 'Website', required: false },
                ].map(({ key, label, required }) => (
                  <div
                    key={key}
                    className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs transition-colors ${
                      fieldStatus[key]
                        ? 'bg-primary/10 text-primary'
                        : required
                        ? 'bg-muted text-muted-foreground'
                        : 'bg-muted/50 text-muted-foreground/70'
                    }`}
                  >
                    {fieldStatus[key] && <Check className="h-3 w-3" />}
                    {label}
                    {required && !fieldStatus[key] && <span className="text-destructive">*</span>}
                  </div>
                ))}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="display_name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Full Name *</FormLabel>
                        <FormControl>
                          <div className="relative">
                            <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input placeholder="John Doe" className="pl-10" {...field} />
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="phone"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Phone Number</FormLabel>
                        <FormControl>
                          <div className="relative">
                            <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input placeholder="+1 (555) 000-0000" className="pl-10" {...field} />
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="company_name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Company Name *</FormLabel>
                        <FormControl>
                          <div className="relative">
                            <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input placeholder="Acme Inc." className="pl-10" {...field} />
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="backup_email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Backup Email</FormLabel>
                        <FormControl>
                          <div className="relative">
                            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input placeholder="backup@email.com" className="pl-10" {...field} />
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="company_url"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Company Website</FormLabel>
                        <FormControl>
                          <div className="relative">
                            <Globe className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input placeholder="https://example.com" className="pl-10" {...field} />
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="company_size"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Company Size *</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <div className="flex items-center gap-2">
                                <Users className="h-4 w-4 text-muted-foreground" />
                                <SelectValue placeholder="Select company size" />
                              </div>
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {companySizes.map((size) => (
                              <SelectItem key={size.value} value={size.value}>
                                {size.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="company_role"
                    render={({ field }) => (
                      <FormItem className="md:col-span-2">
                        <FormLabel>Your Role *</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <div className="flex items-center gap-2">
                                <Briefcase className="h-4 w-4 text-muted-foreground" />
                                <SelectValue placeholder="Select your role" />
                              </div>
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {companyRoles.map((role) => (
                              <SelectItem key={role.value} value={role.value}>
                                {role.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <Button type="submit" className="w-full" disabled={isSubmitting}>
                  {isSubmitting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Setting up your account...
                    </>
                  ) : (
                    'Complete Setup'
                  )}
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>
      </div>
    </>
  );
}