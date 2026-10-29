import { useMemo } from "react";
import { useSettings } from "../settings/settingsContext";
import { DICTIONARIES, type TranslationKey } from "./translations";

type Params = Record<string, string | number>;

// Traduções do idioma escolhido. Uso: const { t } = useI18n(); t("nav.home") ou t("home.feels", { value: "21°" }).
export function useI18n() {
  const { settings } = useSettings();
  const language = settings.language;

  return useMemo(() => {
    const dictionary = DICTIONARIES[language];
    const t = (key: TranslationKey, params?: Params): string =>
      dictionary[key].replace(/\{(\w+)\}/g, (_, name: string) => String(params?.[name] ?? ""));
    return { t, language, locale: language };
  }, [language]);
}
