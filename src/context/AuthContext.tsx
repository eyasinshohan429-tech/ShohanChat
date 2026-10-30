import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import type { Profile } from '@/types';

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (email: string, password: string, displayName: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  deleteAccount: () => Promise<{ error: string | null }>;
  sendOtp: (email: string) => Promise<{ error: string | null }>;
  verifyOtp: (email: string, code: string) => Promise<{ error: string | null }>;
  resetPasswordWithOtp: (email: string, newPassword: string) => Promise<{ error: string | null }>;
  deleteUserAsAdmin: (targetUserId: string) => Promise<{ error: string | null }>;
  isAdmin: boolean;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchProfile = useCallback(async (uid: string) => {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', uid)
      .maybeSingle();

    if (error) {
      console.error('Error fetching profile:', error);
      return;
    }

    if (data) {
      setProfile(data as Profile);
      // Mark online
      await supabase
        .from('profiles')
        .update({ online: true, last_seen: new Date().toISOString() })
        .eq('id', uid);
    } else {
      // Profile doesn't exist yet — create it with upsert to avoid race conditions
      // with onAuthStateChange also firing after signUp
      const { data: newProfile, error: upsertError } = await supabase
        .from('profiles')
        .upsert(
          {
            id: uid,
            display_name: '',
            online: true,
            last_seen: new Date().toISOString(),
          },
          { onConflict: 'id' }
        )
        .select()
        .single();

      if (!upsertError && newProfile) {
        setProfile(newProfile as Profile);
      } else if (upsertError) {
        console.error('Error creating profile:', upsertError);
        // Try reading again in case another concurrent insert succeeded
        const { data: retryData } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', uid)
          .maybeSingle();
        if (retryData) setProfile(retryData as Profile);
      }
    }
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchProfile(session.user.id).finally(() => setLoading(false));
      } else {
        setLoading(false);
      }
    });

    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (event === 'SIGNED_OUT') {
        setProfile(null);
        setLoading(false);
      } else if (session?.user) {
        fetchProfile(session.user.id).finally(() => setLoading(false));
      }
    });

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, [fetchProfile]);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error?.message ?? null };
  };

  const signUp = async (email: string, password: string, displayName: string) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { display_name: displayName } },
    });
    if (error) return { error: error.message };
    if (data.user) {
      // Create profile with upsert to handle the race condition where
      // onAuthStateChange also triggers fetchProfile which also inserts
      const { error: profileError } = await supabase
        .from('profiles')
        .upsert(
          {
            id: data.user.id,
            display_name: displayName,
            online: true,
            last_seen: new Date().toISOString(),
          },
          { onConflict: 'id' }
        );
      if (profileError) {
        console.error('Profile creation error:', profileError);
      }
    }
    return { error: null };
  };

  const signOut = async () => {
    if (user) {
      await supabase.from('profiles').update({ online: false, last_seen: new Date().toISOString() }).eq('id', user.id);
    }
    await supabase.auth.signOut();
  };

  const refreshProfile = async () => {
    if (user) await fetchProfile(user.id);
  };

  const deleteAccount = async () => {
    try {
      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/delete-account`;
      const { data: { session: currentSession } } = await supabase.auth.getSession();
      if (!currentSession) return { error: 'Not authenticated' };

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${currentSession.access_token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        return { error: body.error ?? 'Failed to delete account' };
      }

      setProfile(null);
      setUser(null);
      setSession(null);
      await supabase.auth.signOut();
      return { error: null };
    } catch {
      return { error: 'Failed to delete account' };
    }
  };

  const callOtpEndpoint = async (payload: Record<string, unknown>) => {
    const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/password-reset-otp`;
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    return response;
  };

  const sendOtp = async (email: string) => {
    try {
      const response = await callOtpEndpoint({ action: 'send', email });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        return { error: body.error ?? 'Failed to send verification code' };
      }
      return { error: null };
    } catch {
      return { error: 'Failed to send verification code' };
    }
  };

  const verifyOtp = async (email: string, code: string) => {
    try {
      const response = await callOtpEndpoint({ action: 'verify', email, code });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        return { error: body.error ?? 'Invalid or expired code' };
      }
      return { error: null };
    } catch {
      return { error: 'Failed to verify code' };
    }
  };

  const resetPasswordWithOtp = async (email: string, newPassword: string) => {
    try {
      const response = await callOtpEndpoint({ action: 'reset', email, newPassword });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        return { error: body.error ?? 'Failed to reset password' };
      }
      return { error: null };
    } catch {
      return { error: 'Failed to reset password' };
    }
  };

  const deleteUserAsAdmin = async (targetUserId: string) => {
    try {
      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/delete-account`;
      const { data: { session: currentSession } } = await supabase.auth.getSession();
      if (!currentSession) return { error: 'Not authenticated' };

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${currentSession.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ targetUserId }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        return { error: body.error ?? 'Failed to delete user' };
      }

      return { error: null };
    } catch {
      return { error: 'Failed to delete user' };
    }
  };

  const isAdmin = profile?.is_admin === true;

  return (
    <AuthContext.Provider value={{ session, user, profile, loading, isAdmin, signIn, signUp, signOut, refreshProfile, deleteAccount, sendOtp, verifyOtp, resetPasswordWithOtp, deleteUserAsAdmin }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
