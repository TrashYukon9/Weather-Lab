import type { Language } from "../settings/settings";
import { en } from "./en";
import { es } from "./es";
import { pt } from "./pt";

// As chaves vêm do português (pt.ts). Se faltar uma chave em en.ts ou es.ts, o TypeScript avisa.
export type TranslationKey = keyof typeof pt;

export const DICTIONARIES: Record<Language, Record<TranslationKey, string>> = { "pt-BR": pt, "en-US": en, es };
