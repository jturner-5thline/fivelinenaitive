import { createContext, useContext, useEffect, useState, ReactNode, useRef } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  isLoading: boolean;
  justSignedIn: boolean;
  clearJustSignedIn: () => void;
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
  const [justSignedIn, setJustSignedIn] = useState(false);
  const processedUsersRef = useRef<Set<string>>(new Set());

  const clearJustSignedIn = () => setJustSignedIn(false);

  useEffect(() => {
    // Handle session-only logins (Remember Me unchecked)
    // If the user closed the browser and reopened, clear the session
    const isSessionOnly = sessionStorage.getItem('naitive_session_only') === 'true';
    const rememberMe = localStorage.getItem('naitive_remember_me') === 'true';
    
    // If we don't have a session marker and remember me is not set,
    // this might be a new browser session - we should clear auth
    const handleBeforeUnload = () => {
      // This runs when tab/window is closing
      // We can't reliably sign out here, but we set a flag
      if (!rememberMe && sessionStorage.getItem('naitive_session_only') === 'true') {
        // The session will be cleared on next load since sessionStorage is gone
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    // Set up auth state listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        setIsLoading(false);

        // For OAuth logins (Google, etc.), always treat as "remember me"
        // since there's no checkbox shown during OAuth flow
        if (event === 'SIGNED_IN' && session?.user) {
          // Trigger welcome screen
          setJustSignedIn(true);
          
          const provider = session.user.app_metadata?.provider;
          if (provider && provider !== 'email') {
            // OAuth login - always remember
            localStorage.setItem('naitive_remember_me', 'true');
            sessionStorage.setItem('naitive_session_active', 'true');
          }
        }

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
          localStorage.removeItem('naitive_remember_me');
          sessionStorage.removeItem('naitive_session_only');
          sessionStorage.removeItem('naitive_session_active');
        }
      }
    );

    // THEN check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      // Check if this is a session-only login that should be cleared
      // (browser was closed and reopened without Remember Me)
      // Only apply this logic if the user explicitly chose NOT to remember (session-only flag was set)
      const wasExplicitlySessionOnly = sessionStorage.getItem('naitive_session_only') === 'true' || 
        (!localStorage.getItem('naitive_remember_me') && !sessionStorage.getItem('naitive_session_active'));
      const hasSessionMarker = sessionStorage.getItem('naitive_session_active') === 'true';
      
      // Only sign out if:
      // 1. User has a session
      // 2. User explicitly unchecked "Remember Me" (has session-only flag in previous session)
      // 3. This is a new browser session (no active session marker)
      // 4. User logged in via email (not OAuth - OAuth always remembers)
      const isOAuthUser = session?.user?.app_metadata?.provider && session.user.app_metadata.provider !== 'email';
      
      if (session && wasExplicitlySessionOnly && !hasSessionMarker && !isOAuthUser) {
        // User had a session but didn't check "Remember Me" and this is a new browser session
        // Sign them out
        supabase.auth.signOut().then(() => {
          setSession(null);
          setUser(null);
          setIsLoading(false);
        });
        return;
      }
      
      // Mark this browser session as active
      if (session) {
        sessionStorage.setItem('naitive_session_active', 'true');
        // If it's an OAuth user, ensure remember me is set
        if (isOAuthUser) {
          localStorage.setItem('naitive_remember_me', 'true');
        }
      }
      
      setSession(session);
      setUser(session?.user ?? null);
      setIsLoading(false);
      
      // Also check for pending invitations on initial load
      if (session?.user?.email && !processedUsersRef.current.has(session.user.id)) {
        processedUsersRef.current.add(session.user.id);
        processPendingInvitations(session.user.id, session.user.email);
      }
    });

    return () => {
      subscription.unsubscribe();
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ user, session, isLoading, justSignedIn, clearJustSignedIn, signOut }}>
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
