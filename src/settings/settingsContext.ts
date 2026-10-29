import { createContext, useContext } from "react";
import type { Settings } from "./settings";

export interface SettingsContextValue {
  settings: Settings;
  // Altera as configurações: recebe as atuais e devolve as novas.
  setSettings: (update: (current: Settings) => Settings) => void;
  resetSettings: () => void;
  resolvedTheme: "dark" | "light"; // "auto" já resolvido pelo sistema
  reducedMotion: boolean; // configuração do app OU preferência do sistema
}

export const SettingsContext = createContext<SettingsContextValue | null>(null);

export function useSettings(): SettingsContextValue {
  const value = useContext(SettingsContext);
  if (!value) throw new Error("useSettings precisa estar dentro de <SettingsProvider>.");
  return value;
}
