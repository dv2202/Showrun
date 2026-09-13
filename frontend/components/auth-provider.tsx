"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { Creator } from "@/services/auth";
import {
  getCreatorSession,
  loginWithEmail,
  logoutCreator,
  registerWithEmail,
} from "@/services/auth";

interface AuthContextValue {
  user: Creator | null;
  loading: boolean;
  login(input: { email: string; password: string }): Promise<void>;
  register(input: { name: string; email: string; password: string }): Promise<void>;
  logout(): Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<Creator | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    getCreatorSession()
      .then((session) => {
        if (active) setUser(session.user);
      })
      .catch(() => {
        if (active) setUser(null);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      async login(input) {
        const session = await loginWithEmail(input);
        setUser(session.user);
      },
      async register(input) {
        const session = await registerWithEmail(input);
        setUser(session.user);
      },
      async logout() {
        await logoutCreator();
        setUser(null);
      },
    }),
    [loading, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider");
  return value;
}
