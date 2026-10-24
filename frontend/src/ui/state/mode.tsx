import React from "react";
import type { Mode } from "@eha/shared";

type ModeState = {
  mode: Mode;
  setMode: (mode: Mode) => void;
};

const Ctx = React.createContext<ModeState | null>(null);

export function ModeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = React.useState<Mode>("elder");
  return <Ctx.Provider value={{ mode, setMode }}>{children}</Ctx.Provider>;
}

export function useMode() {
  const ctx = React.useContext(Ctx);
  if (!ctx) throw new Error("ModeProvider missing");
  return ctx;
}

