import { SETTINGS_KEY, readStorage, removeStorage, writeStorage } from "./storage";

/* ------------------------------------------------------------------------ */
/* Tipos                                                                    */
/* ------------------------------------------------------------------------ */

export const LANGUAGES = ["pt-BR", "en-US", "es"] as const;
export type Language = (typeof LANGUAGES)[number];

// Abas que podem ser a primeira tela ao abrir o app.
export const START_PAGES = ["inicio", "favoritos", "previsao", "mapas", "qualidade-ar"] as const;
export type StartPage = (typeof START_PAGES)[number];

export const INDICATORS = [
  "wind", "humidity", "max", "min", "feels", "gusts", "uv", "pressure", "sunrise", "sunset", "rain",
] as const;
export type IndicatorKey = (typeof INDICATORS)[number];

export const MIN_INDICATORS = 2;

export interface StoredCity {
  name: string;
  country: string;
  admin1?: string;
  latitude: number;
  longitude: number;
}

export interface Units {
  temperature: "c" | "f";
  wind: "kmh" | "ms" | "mph";
  pressure: "hpa" | "inhg";
  precipitation: "mm" | "in";
}

export interface Settings {
  version: 1;
  language: Language;
  units: Units;
  startup: {
    cityMode: "last" | "default" | "location";
    defaultCity: StoredCity | null;
    page: StartPage;
  };
  home: { mode: "compact" | "detailed"; indicators: IndicatorKey[] };
  appearance: {
    theme: "dark" | "light" | "auto";
    glass: "full" | "reduced";
    motion: "system" | "reduced";
  };
  data: { autoRefreshMinutes: 0 | 15 | 30 | 60 };
  alerts: { rain: boolean; rainThreshold: 50 | 70 | 90; storm: boolean; browser: boolean };
}

export const DEFAULT_SETTINGS: Settings = {
  version: 1,
  language: "pt-BR",
  units: { temperature: "c", wind: "kmh", pressure: "hpa", precipitation: "mm" },
  startup: { cityMode: "last", defaultCity: null, page: "inicio" },
  home: { mode: "detailed", indicators: ["wind", "humidity", "max", "min"] },
  appearance: { theme: "dark", glass: "full", motion: "system" },
  data: { autoRefreshMinutes: 0 },
  alerts: { rain: false, rainThreshold: 70, storm: false, browser: false },
};

/* ------------------------------------------------------------------------ */
/* Validação: qualquer valor estranho vira o padrão                         */
/* ------------------------------------------------------------------------ */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function pick<T extends string | number>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

function pickBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

export function sanitizeCity(value: unknown): StoredCity | null {
  if (!isRecord(value)) return null;
  const { name, country, admin1, latitude, longitude } = value;
  if (
    typeof name !== "string" || typeof country !== "string" ||
    typeof latitude !== "number" || typeof longitude !== "number" ||
    Math.abs(latitude) > 90 || Math.abs(longitude) > 180
  ) {
    return null;
  }
  return { name, country, admin1: typeof admin1 === "string" ? admin1 : undefined, latitude, longitude };
}

function sanitizeIndicators(value: unknown): IndicatorKey[] {
  if (!Array.isArray(value)) return DEFAULT_SETTINGS.home.indicators;
  const valid = INDICATORS.filter((key) => value.includes(key));
  return valid.length >= MIN_INDICATORS ? valid : DEFAULT_SETTINGS.home.indicators;
}

export function sanitizeSettings(raw: unknown): Settings {
  const d = DEFAULT_SETTINGS;
  const r = isRecord(raw) ? raw : {};
  const units = isRecord(r.units) ? r.units : {};
  const startup = isRecord(r.startup) ? r.startup : {};
  const home = isRecord(r.home) ? r.home : {};
  const appearance = isRecord(r.appearance) ? r.appearance : {};
  const data = isRecord(r.data) ? r.data : {};
  const alerts = isRecord(r.alerts) ? r.alerts : {};
  const defaultCity = sanitizeCity(startup.defaultCity);
  const cityMode = pick(startup.cityMode, ["last", "default", "location"] as const, d.startup.cityMode);

  return {
    version: 1,
    language: pick(r.language, LANGUAGES, d.language),
    units: {
      temperature: pick(units.temperature, ["c", "f"] as const, d.units.temperature),
      wind: pick(units.wind, ["kmh", "ms", "mph"] as const, d.units.wind),
      pressure: pick(units.pressure, ["hpa", "inhg"] as const, d.units.pressure),
      precipitation: pick(units.precipitation, ["mm", "in"] as const, d.units.precipitation),
    },
    startup: {
      // "cidade padrão" sem cidade escolhida não faz sentido: volta para "última".
      cityMode: cityMode === "default" && !defaultCity ? "last" : cityMode,
      defaultCity,
      page: pick(startup.page, START_PAGES, d.startup.page),
    },
    home: {
      mode: pick(home.mode, ["compact", "detailed"] as const, d.home.mode),
      indicators: sanitizeIndicators(home.indicators),
    },
    appearance: {
      theme: pick(appearance.theme, ["dark", "light", "auto"] as const, d.appearance.theme),
      glass: pick(appearance.glass, ["full", "reduced"] as const, d.appearance.glass),
      motion: pick(appearance.motion, ["system", "reduced"] as const, d.appearance.motion),
    },
    data: { autoRefreshMinutes: pick(data.autoRefreshMinutes, [0, 15, 30, 60] as const, 0) },
    alerts: {
      rain: pickBoolean(alerts.rain, d.alerts.rain),
      rainThreshold: pick(alerts.rainThreshold, [50, 70, 90] as const, d.alerts.rainThreshold),
      storm: pickBoolean(alerts.storm, d.alerts.storm),
      browser: pickBoolean(alerts.browser, d.alerts.browser),
    },
  };
}

export function loadSettings(): Settings {
  return sanitizeSettings(readStorage(SETTINGS_KEY));
}

// Configurações iguais às padrão não precisam ficar guardadas (assim "limpar dados" deixa o navegador limpo).
export function saveSettings(settings: Settings) {
  if (JSON.stringify(settings) === JSON.stringify(DEFAULT_SETTINGS)) removeStorage(SETTINGS_KEY);
  else writeStorage(SETTINGS_KEY, settings);
}
