import React from "react";
import type { PrivacySettings } from "@eha/shared";
import { DefaultPrivacySettings } from "@eha/shared";
import { useApi } from "./api.js";

type PrivacyState = {
  settings: PrivacySettings;
  loaded: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  save: (next: PrivacySettings) => Promise<PrivacySettings>;
};

const Ctx = React.createContext<PrivacyState | null>(null);

export function PrivacyProvider({ children }: { children: React.ReactNode }) {
  const api = useApi();
  const [settings, setSettings] = React.useState<PrivacySettings>(DefaultPrivacySettings);
  const [loaded, setLoaded] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const refresh = React.useCallback(async () => {
    try {
      setError(null);
      const s = await api.getPrivacy();
      setSettings({ ...DefaultPrivacySettings, ...s });
    } catch {
      setError("读取隐私设置失败");
    } finally {
      setLoaded(true);
    }
  }, [api]);

  const save = React.useCallback(
    async (next: PrivacySettings) => {
      const saved = await api.setPrivacy(next);
      setSettings(saved);
      setError(null);
      setLoaded(true);
      return saved;
    },
    [api]
  );

  React.useEffect(() => {
    refresh();
  }, [refresh]);

  return <Ctx.Provider value={{ settings, loaded, error, refresh, save }}>{children}</Ctx.Provider>;
}

export function usePrivacy() {
  const ctx = React.useContext(Ctx);
  if (!ctx) throw new Error("PrivacyProvider missing");
  return ctx;
}

