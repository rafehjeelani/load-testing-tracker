import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { supabase } from "../../lib/supabase";
import { getCurrentProfile, StaffApiError } from "../../lib/staffApi";
import type { Profile } from "../../types";

interface Ctx {
  profile: Profile | null;
  loading: boolean;
  /** Set when the last refresh() found a session but failed to load a matching profile. */
  authError: string | null;
  refresh: () => Promise<Profile | null>;
}

const AuthCtx = createContext<Ctx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  async function refresh(): Promise<Profile | null> {
    try {
      const p = await getCurrentProfile();
      setProfile(p);
      setAuthError(null);
      return p;
    } catch (err) {
      setProfile(null);
      setAuthError(err instanceof StaffApiError ? err.message : "Couldn't load your account. Please try again.");
      return null;
    }
  }

  useEffect(() => {
    refresh().finally(() => setLoading(false));
    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      refresh();
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  return <AuthCtx.Provider value={{ profile, loading, authError, refresh }}>{children}</AuthCtx.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
