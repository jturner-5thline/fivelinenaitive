import { createContext, useContext, useEffect, useState, ReactNode, useRef } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  isLoading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Process pending invitations for a user
async function processPendingInvitations(userId: string, userEmail: string) {
  try {
    // Find pending invitations for this email
    const { data: invitations, error: fetchError } = await supabase
      .from('company_invitations')
      .select('id, company_id, role, token')
      .eq('email', userEmail.toLowerCase())
      .is('accepted_at', null)
      .gt('expires_at', new Date().toISOString());

    if (fetchError || !invitations || invitations.length === 0) {
      return;
    }

    for (const invitation of invitations) {
      // Check if user is already a member of this company
      const { data: existingMember } = await supabase
        .from('company_members')
        .select('id')
        .eq('company_id', invitation.company_id)
        .eq('user_id', userId)
        .maybeSingle();

      if (existingMember) {
        // Already a member, just mark invitation as accepted
        await supabase
          .from('company_invitations')
          .update({ accepted_at: new Date().toISOString() })
          .eq('id', invitation.id);
        continue;
      }

      // Add user to company
      const { error: memberError } = await supabase
        .from('company_members')
        .insert({
          company_id: invitation.company_id,
          user_id: userId,
          role: invitation.role,
        });

      if (!memberError) {
        // Mark invitation as accepted
        await supabase
          .from('company_invitations')
          .update({ accepted_at: new Date().toISOString() })
          .eq('id', invitation.id);
        
        console.log(`Auto-accepted invitation for company ${invitation.company_id}`);
      }
    }
  } catch (error) {
    console.error('Error processing pending invitations:', error);
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const processedUsersRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    // Set up auth state listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        setIsLoading(false);

        // Process pending invitations on sign in (deferred to avoid deadlock)
        if ((event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') && session?.user) {
          const userId = session.user.id;
          const userEmail = session.user.email;
          
          // Only process once per user per session
          if (userEmail && !processedUsersRef.current.has(userId)) {
            processedUsersRef.current.add(userId);
            setTimeout(() => {
              processPendingInvitations(userId, userEmail);
            }, 0);
          }
        }
        
        // Clear processed users on sign out
        if (event === 'SIGNED_OUT') {
          processedUsersRef.current.clear();
        }
      }
    );

    // THEN check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setIsLoading(false);
      
      // Also check for pending invitations on initial load
      if (session?.user?.email && !processedUsersRef.current.has(session.user.id)) {
        processedUsersRef.current.add(session.user.id);
        processPendingInvitations(session.user.id, session.user.email);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ user, session, isLoading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
