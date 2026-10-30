import React from "react";
import { Navigate } from "react-router-dom";
import { api } from "../../lib/api.js";
import type { MeResponse, Role } from "../../lib/types.js";

type AuthState = {
  me: MeResponse | null;
  loading: boolean;
  login: (role: Role) => Promise<MeResponse>;
  familyLogin: (phone: string, code: string, displayName?: string) => Promise<MeResponse>;
  bindElder: (code: string) => Promise<MeResponse>;
  switchElder: (elderId: string) => Promise<MeResponse>;
  logout: () => Promise<void>;
  refresh: () => Promise<MeResponse | null>;
};

const Ctx = React.createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [me, setMe] = React.useState<MeResponse | null>(null);
  const [loading, setLoading] = React.useState(true);

  const refresh = React.useCallback(async () => {
    try {
      const next = await api.auth.me();
      setMe(next);
      return next;
    } catch {
      setMe(null);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  const login = React.useCallback(async (role: Role) => {
    const next = await api.auth.demoLogin(role);
    setMe(next);
    return next;
  }, []);

  const familyLogin = React.useCallback(
    async (phone: string, code: string, displayName?: string) => {
      const next = await api.auth.familyLogin(phone, code, displayName);
      setMe(next);
      return next;
    },
    []
  );

  const bindElder = React.useCallback(async (code: string) => {
    const next = await api.auth.bindElder(code);
    setMe(next);
    return next;
  }, []);

  const switchElder = React.useCallback(async (elderId: string) => {
    const next = await api.auth.switchElder(elderId);
    setMe(next);
    return next;
  }, []);

  const logout = React.useCallback(async () => {
    try {
      await api.auth.logout();
    } finally {
      setMe(null);
    }
  }, []);

  const value = React.useMemo(
    () => ({ me, loading, login, familyLogin, bindElder, switchElder, logout, refresh }),
    [me, loading, login, familyLogin, bindElder, switchElder, logout, refresh]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const ctx = React.useContext(Ctx);
  if (!ctx) throw new Error("AuthProvider missing");
  return ctx;
}

export function homeForRole(role: Role) {
  if (role === "elder") return "/elder";
  return "/family";
}

export function RequireRole({ role, children }: { role: Role; children: React.ReactNode }) {
  const { me, loading } = useAuth();
  if (loading) return <div className="yl-loading">正在准备…</div>;
  if (!me) return <Navigate to="/" replace />;
  if (me.user.role !== role) return <Navigate to={homeForRole(me.user.role)} replace />;
  return <>{children}</>;
}
