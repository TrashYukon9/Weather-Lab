import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { DEFAULT_SETTINGS, loadSettings, sanitizeSettings, saveSettings, type Settings } from "./settings";
import { SettingsContext } from "./settingsContext";
import { SETTINGS_KEY } from "./storage";

function matches(query: string): boolean {
  return typeof window.matchMedia === "function" && window.matchMedia(query).matches;
}

// Fonte única de verdade das preferências: lê do navegador, grava a cada mudança
// e aplica tema, vidro e movimento no <html> para o CSS reagir.
export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(() => loadSettings());
  const [systemDark, setSystemDark] = useState(() => !matches("(prefers-color-scheme: light)"));
  const [systemReducedMotion, setSystemReducedMotion] = useState(() => matches("(prefers-reduced-motion: reduce)"));

  useEffect(() => { saveSettings(settings); }, [settings]);

  // Se o usuário muda o tema/movimento do sistema operacional, acompanhamos.
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const light = window.matchMedia("(prefers-color-scheme: light)");
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onLight = () => setSystemDark(!light.matches);
    const onMotion = () => setSystemReducedMotion(motion.matches);
    light.addEventListener("change", onLight);
    motion.addEventListener("change", onMotion);
    return () => {
      light.removeEventListener("change", onLight);
      motion.removeEventListener("change", onMotion);
    };
  }, []);

  // Outra aba do Weather Lab mudou as configurações: sincroniza.
  useEffect(() => {
    function onStorage(event: StorageEvent) {
      if (event.key === SETTINGS_KEY) setSettings(loadSettings());
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const resolvedTheme: "dark" | "light" =
    settings.appearance.theme === "auto" ? (systemDark ? "dark" : "light") : settings.appearance.theme;
  const reducedMotion = settings.appearance.motion === "reduced" || systemReducedMotion;

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = resolvedTheme;
    root.dataset.glass = settings.appearance.glass;
    root.dataset.motion = reducedMotion ? "reduced" : "full";
    root.style.colorScheme = resolvedTheme;
    root.lang = settings.language;
  }, [resolvedTheme, reducedMotion, settings.appearance.glass, settings.language]);

  const update = useCallback((change: (current: Settings) => Settings) => {
    setSettings((current) => sanitizeSettings(change(current)));
  }, []);

  const resetSettings = useCallback(() => setSettings(DEFAULT_SETTINGS), []);

  const value = useMemo(
    () => ({ settings, setSettings: update, resetSettings, resolvedTheme, reducedMotion }),
    [settings, update, resetSettings, resolvedTheme, reducedMotion],
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}
