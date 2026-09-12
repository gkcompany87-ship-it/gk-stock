"use client";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { apiFetch, ApiError } from "../lib/api";
import type { SessionUser } from "../lib/types";
type AuthState = { user: SessionUser | null; loading: boolean; error: string | null; reload: () => Promise<void>; login: (email: string, password: string) => Promise<void>; logout: () => Promise<void>; can: (permission: string) => boolean };
const Context = createContext<AuthState | null>(null);
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null); const [loading, setLoading] = useState(true); const [error, setError] = useState<string | null>(null);
  const cache = useQueryClient();
  const reload = useCallback(async () => {
    setLoading(true); setError(null);
    try { setUser((await apiFetch<{ user: SessionUser }>("/auth/me")).user); }
    catch (e) { setUser(null); if (!(e instanceof ApiError && e.status === 401)) setError(e instanceof Error ? e.message : "Connexion impossible."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void reload(); const expire = () => { setUser(null); cache.clear(); }; window.addEventListener("as-tino-session-expired", expire); return () => window.removeEventListener("as-tino-session-expired", expire); }, [reload, cache]);
  async function login(email: string, password: string) { const result = await apiFetch<{ user: SessionUser }>("/auth/login", { method: "POST", json: { email, password }, noRefresh: true }); cache.clear(); setUser(result.user); setError(null); }
  async function logout() { await apiFetch("/auth/logout", { method: "POST" }); cache.clear(); setUser(null); }
  return <Context.Provider value={{ user, loading, error, reload, login, logout, can: permission => !!user?.permissions.includes(permission) }}>{children}</Context.Provider>;
}
export function useAuth() { const context = useContext(Context); if (!context) throw new Error("AuthProvider manquant"); return context; }
