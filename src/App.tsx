import {
  createElement,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FocusEvent,
  type FormEvent,
  type KeyboardEvent,
} from "react";

import type { WeatherPage } from "./components/Sidebar";

import AirQualityPage from "./components/AirQualityPage";
import ForecastPage from "./components/ForecastPage";
import MapPage from "./components/MapPage";
import SettingsPage from "./components/SettingsPage";

import type { TranslationKey } from "./i18n/translations";
import { useI18n } from "./i18n/useI18n";
import { getCurrentCoordinates, getLocationPermission } from "./settings/geolocation";
import type { IndicatorKey, Language, Settings as WeatherSettings, StoredCity } from "./settings/settings";
import { SettingsProvider } from "./settings/SettingsProvider";
import { useSettings } from "./settings/settingsContext";
import {
  ALERTS_SENT_KEY,
  ALL_LOCAL_KEYS,
  FAVORITES_KEY,
  LAST_CITY_KEY,
  OLD_FAVORITES_KEY,
  RECENT_KEY,
  readStorage,
  removeStorage,
  writeStorage,
} from "./settings/storage";
import { useUnits, type UnitFormatter } from "./settings/units";

import {
  ArrowDown,
  ArrowUp,
  Bookmark,
    Clock,
  Cloud,
  CloudLightning,
  Gauge,
  RefreshCw,
  Sunrise,
  Sunset,
  ThermometerSun,

  CloudRain,
  CloudSun,
  Droplets,
  Heart,
  Home,
  MapPin,
  Search,
  Sun,
  Wind,
  CalendarDays,
  Map,
  Settings,
  Menu,
  X,
  type LucideIcon,
} from "lucide-react";

import "./App.css";

// Layout da página inicial e da aba "Cidades salvas" (vem depois do App.css).
import "./HomeLayout.css";

// Tema claro, vidro reduzido e movimento reduzido (vem por último para valer sobre os demais).
import "./theme.css";

interface ForecastDay {
  day: string;

  max: number;

  min: number;

  rain: number;

  Icon: LucideIcon;
}

// Um item da "Previsão por hora".
interface HourlyItem {
  label: string;

  temperature: number;

  rain: number;

  Icon: LucideIcon;
}

interface SavedCity {
  name: string;

  country: string;

  admin1?: string;

  temperature: number;

  max: number;

  min: number;

  Icon: LucideIcon;

  weatherCode?: number;

  latitude?: number;

  longitude?: number;
}

type CityWeatherSummary = Pick<
  SavedCity,
  "temperature" | "max" | "min" | "Icon" | "weatherCode"
>;

interface GeocodingResult {
  name: string;

  country: string;

  admin1?: string;

  latitude: number;

  longitude: number;
}

interface WeatherResponse {
  current: {
    time: string;

    temperature_2m: number;

    relative_humidity_2m: number;

    apparent_temperature: number;

        wind_speed_10m: number;

    pressure_msl: number;

    wind_gusts_10m: number;

    weather_code: number;
  };

  hourly: {
    time: string[];

        precipitation_probability: number[];

    temperature_2m: number[];

    weather_code: number[];
  };

  daily: {
    time: string[];

    temperature_2m_max: number[];

    temperature_2m_min: number[];

        precipitation_probability_max: number[];

    sunrise: string[];

    sunset: string[];

    uv_index_max: number[];

    precipitation_sum: number[];

    weather_code: number[];
  };
}


const MAX_RECENT_CITIES = 5;

const MAX_SUGGESTIONS = 5;

const MIN_QUERY_LENGTH = 3; // a API só faz busca aproximada a partir de 3 letras

const SUGGESTION_DELAY = 300;

const REMOVE_ANIMATION_MS = 280;

// Previsão por hora: 8 itens, de 3 em 3 horas (cobre as próximas 24 horas).
const HOURLY_ITEMS = 8;

const HOURLY_STEP_HOURS = 3;

// Cidade exibida na primeira vez que o app abre.

const DEFAULT_CITY: GeocodingResult = {
  name: "São Paulo",

  country: "Brasil",

  admin1: "São Paulo",

  latitude: -23.5475,

  longitude: -46.6361,
};

/* ------------------------------------------------------------------------ */

/* Utilidades                                                               */

/* ------------------------------------------------------------------------ */

function getWeatherIcon(code: number): LucideIcon {
  if (code === 0) return Sun;

  if (code === 1 || code === 2) return CloudSun;

  if (code === 3 || code === 45 || code === 48) return Cloud;

  // Códigos WMO: garoa/chuva, neve e tempestades têm ícones distintos.

  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82))
    return CloudRain;

  if ((code >= 71 && code <= 77) || (code >= 85 && code <= 86)) return Cloud;

  if (code >= 95 && code <= 99) return CloudRain;

  return CloudSun;
}


// Identifica a cidade pelas coordenadas (distingue cidades homônimas).

// Favoritos antigos, sem coordenadas, usam nome + país.

function cityKey(city: {
  name: string;

  country: string;

  latitude?: number;

  longitude?: number;
}): string {
  if (city.latitude !== undefined && city.longitude !== undefined) {
    return `${city.latitude.toFixed(2)},${city.longitude.toFixed(2)}`;
  }

  return `${city.name}|${city.country}`.toLowerCase();
}

// Ex.: "Minas Gerais, Brasil" (omite o estado quando é igual ao nome).

function formatPlace(city: {
  name: string;

  country: string;

  admin1?: string;
}): string {
  return [
    city.admin1 && city.admin1 !== city.name ? city.admin1 : "",

    city.country,
  ]

    .filter(Boolean)

    .join(", ");
}


function isValidCity(value: unknown): value is GeocodingResult {
  if (typeof value !== "object" || value === null) return false;

  const city = value as Partial<GeocodingResult>;

  return (
    typeof city.name === "string" &&
    typeof city.country === "string" &&
    typeof city.latitude === "number" &&
    typeof city.longitude === "number"
  );
}

function loadRecentCities(): GeocodingResult[] {
  const data = readStorage(RECENT_KEY);

  return Array.isArray(data)
    ? data.filter(isValidCity).slice(0, MAX_RECENT_CITIES)
    : [];
}

function loadLastCity(): GeocodingResult | null {
  const data = readStorage(LAST_CITY_KEY);

  return isValidCity(data) ? data : null;
}

function loadSavedCities(): SavedCity[] {
  try {
    const saved =
      localStorage.getItem(FAVORITES_KEY) ??
      localStorage.getItem(OLD_FAVORITES_KEY);

    if (!saved) return [];

    const cities: Omit<SavedCity, "Icon">[] = JSON.parse(saved);

    if (!Array.isArray(cities)) return [];

    return cities.map((city) => ({
      ...city,

      Icon: getWeatherIcon(city.weatherCode ?? 2),
    }));
  } catch (error) {
    console.error("Erro ao carregar favoritos:", error);

    return [];
  }
}

// Resumo do clima usado nos cartões de cidades salvas.

function getCitySummary(data: WeatherResponse): CityWeatherSummary {
  return {
    temperature: round1(data.current.temperature_2m),

    max: round1(data.daily.temperature_2m_max[0] ?? 0),

    min: round1(data.daily.temperature_2m_min[0] ?? 0),

    Icon: getWeatherIcon(data.current.weather_code),

    weatherCode: data.current.weather_code,
  };
}

function getForecastDays(data: WeatherResponse, locale: string, todayLabel: string): ForecastDay[] {
  return data.daily.time.map((date, index) => {
    const weekday = new Date(`${date}T12:00:00Z`)

      .toLocaleDateString(locale, {
        weekday: "short",

        timeZone: "UTC",
      })

      .replace(".", "");

    return {
      day:
        index === 0
          ? todayLabel
          : weekday.charAt(0).toUpperCase() + weekday.slice(1),

      max: data.daily.temperature_2m_max[index],

      min: data.daily.temperature_2m_min[index],

      rain: data.daily.precipitation_probability_max[index] ?? 0,

      Icon: getWeatherIcon(data.daily.weather_code[index]),
    };
  });
}

// Previsão por hora: começa na hora atual e avança de 3 em 3 horas.

function getHourlyForecast(data: WeatherResponse, nowLabel: string): HourlyItem[] {
  const currentHour = data.current.time.slice(0, 13);

  const start = Math.max(
    data.hourly.time.findIndex((time) => time.slice(0, 13) === currentHour),

    0,
  );

  return Array.from(
    { length: HOURLY_ITEMS },

    (_, position) => start + position * HOURLY_STEP_HOURS,
  )

    .filter((index) => index < data.hourly.time.length)

    .map((index, position) => ({
      label: position === 0 ? nowLabel : `${data.hourly.time[index].slice(11, 13)}h`,

      temperature: data.hourly.temperature_2m[index],

      rain: data.hourly.precipitation_probability[index] ?? 0,

      Icon: getWeatherIcon(data.hourly.weather_code[index]),
    }));
}

/* ------------------------------------------------------------------------ */

/* API (Open-Meteo)                                                         */

/* ------------------------------------------------------------------------ */

const LANGUAGE_CODES: Record<Language, string> = { "pt-BR": "pt", "en-US": "en", es: "es" };

const round1 = (value: number) => Math.round(value * 10) / 10;

// Cidade com que o app abre, segundo as preferências.
function getStartupCity(startup: WeatherSettings["startup"]): GeocodingResult {
  if (startup.cityMode === "default" && startup.defaultCity) return startup.defaultCity;
  return loadLastCity() ?? startup.defaultCity ?? DEFAULT_CITY;
}

function makeLocationCity(latitude: number, longitude: number, name: string): GeocodingResult {
  return { name, country: "", latitude: Number(latitude.toFixed(3)), longitude: Number(longitude.toFixed(3)) };
}

function getWeatherDescriptionKey(code: number): TranslationKey {
  if (code === 0) return "weather.clear";
  if (code === 1) return "weather.mostlyClear";
  if (code === 2) return "weather.partlyCloudy";
  if (code === 3) return "weather.cloudy";
  if (code === 45 || code === 48) return "weather.fog";
  if (code >= 51 && code <= 57) return "weather.drizzle";
  if (code >= 61 && code <= 67) return "weather.rain";
  if (code >= 71 && code <= 77) return "weather.snow";
  if (code >= 80 && code <= 82) return "weather.showers";
  if (code >= 85 && code <= 86) return "weather.snowShowers";
  if (code >= 95) return "weather.storm";
  return "weather.variable";
}

function getCurrentHourIndex(data: WeatherResponse): number {
  const currentHour = data.current.time.slice(0, 13);
  return Math.max(data.hourly.time.findIndex((time) => time.slice(0, 13) === currentHour), 0);
}

const ALERT_WINDOW_HOURS = 12;

// Avisos do próprio app: calculados pela previsão (não são alertas oficiais).
function findRainAlert(data: WeatherResponse, threshold: number) {
  const start = getCurrentHourIndex(data);
  for (let index = start; index < Math.min(start + ALERT_WINDOW_HOURS, data.hourly.time.length); index++) {
    const probability = data.hourly.precipitation_probability[index] ?? 0;
    if (probability >= threshold) {
      const time = data.hourly.time[index];
      return { time, hour: `${time.slice(11, 13)}h`, probability };
    }
  }
  return null;
}

function findStormAlert(data: WeatherResponse) {
  const start = getCurrentHourIndex(data);
  for (let index = start; index < Math.min(start + ALERT_WINDOW_HOURS, data.hourly.time.length); index++) {
    if ((data.hourly.weather_code[index] ?? 0) >= 95) {
      const time = data.hourly.time[index];
      return { time, hour: `${time.slice(11, 13)}h` };
    }
  }
  return null;
}

function readSentAlerts(): string[] {
  try {
    const data: unknown = JSON.parse(sessionStorage.getItem(ALERTS_SENT_KEY) ?? "[]");
    return Array.isArray(data) ? data.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function writeSentAlerts(ids: string[]) {
  try {
    sessionStorage.setItem(ALERTS_SENT_KEY, JSON.stringify(ids.slice(-30)));
  } catch {
    /* sem armazenamento: o aviso só pode se repetir */
  }
}

// Os indicadores da Início que a pessoa pode escolher em Configurações.
const INDICATOR_META: Record<IndicatorKey, { Icon: LucideIcon; labelKey: TranslationKey }> = {
  wind: { Icon: Wind, labelKey: "ind.wind" },
  humidity: { Icon: Droplets, labelKey: "ind.humidity" },
  max: { Icon: ArrowUp, labelKey: "ind.max" },
  min: { Icon: ArrowDown, labelKey: "ind.min" },
  feels: { Icon: ThermometerSun, labelKey: "ind.feels" },
  gusts: { Icon: Wind, labelKey: "ind.gusts" },
  uv: { Icon: Sun, labelKey: "ind.uv" },
  pressure: { Icon: Gauge, labelKey: "ind.pressure" },
  sunrise: { Icon: Sunrise, labelKey: "ind.sunrise" },
  sunset: { Icon: Sunset, labelKey: "ind.sunset" },
  rain: { Icon: CloudRain, labelKey: "ind.rain" },
};

interface IndicatorView {
  key: IndicatorKey;
  Icon: LucideIcon;
  labelKey: TranslationKey;
  value: string;
  unit: string;
}

function buildIndicator(key: IndicatorKey, weather: WeatherResponse | null, units: UnitFormatter): IndicatorView {
  const base = { key, ...INDICATOR_META[key] };
  if (!weather) return { ...base, value: "—", unit: "" };
  const { current, daily } = weather;
  const plain = (value: string) => ({ ...base, value, unit: "" });
  const parts = ({ value, unit }: { value: string; unit: string }) => ({ ...base, value, unit });

  switch (key) {
    case "wind": return parts(units.windParts(current.wind_speed_10m));
    case "gusts": return parts(units.windParts(current.wind_gusts_10m));
    case "pressure": return parts(units.pressureParts(current.pressure_msl));
    case "rain": return parts(units.precipitationParts(daily.precipitation_sum[0] ?? 0));
    case "humidity": return { ...base, value: String(Math.round(current.relative_humidity_2m)), unit: "%" };
    case "max": return plain(units.temperature(daily.temperature_2m_max[0]));
    case "min": return plain(units.temperature(daily.temperature_2m_min[0]));
    case "feels": return plain(units.temperature(current.apparent_temperature));
    case "uv": return plain(String(Math.round(daily.uv_index_max[0] ?? 0)));
    case "sunrise": return plain(daily.sunrise[0]?.slice(11, 16) ?? "—");
    case "sunset": return plain(daily.sunset[0]?.slice(11, 16) ?? "—");
  }
}

async function searchCities(
  query: string,

  count = MAX_SUGGESTIONS,

    signal?: AbortSignal,

  language: Language = "pt-BR",
): Promise<GeocodingResult[]> {
  const response = await fetch(
    `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(
      query,
    )}&count=${count}&language=${LANGUAGE_CODES[language]}&format=json`,

    { signal },
  );

  if (!response.ok) {
    throw new Error("Não foi possível buscar a cidade.");
  }

  const data = await response.json();

  const results: GeocodingResult[] = (data.results ?? []).map(
    (result: GeocodingResult) => ({
      name: result.name,

      country: result.country ?? "",

      admin1: result.admin1,

      latitude: result.latitude,

      longitude: result.longitude,
    }),
  );

  // Remove duplicatas (mesma localização).

  return results.filter(
    (city, index) =>
      results.findIndex((other) => cityKey(other) === cityKey(city)) === index,
  );
}

async function getWeather(
  latitude: number,

  longitude: number,
): Promise<WeatherResponse> {
  const response = await fetch(
    `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,relative_humidity_2m,apparent_temperature,wind_speed_10m,pressure_msl,wind_gusts_10m,weather_code&hourly=precipitation_probability,temperature_2m,weather_code&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code,sunrise,sunset,uv_index_max,precipitation_sum&forecast_days=7&timezone=auto`,
  );

  if (!response.ok) {
    throw new Error("Não foi possível buscar o clima.");
  }

  return response.json();
}

/* ------------------------------------------------------------------------ */

/* Componente                                                               */

/* ------------------------------------------------------------------------ */

function App() {
  const { settings, resetSettings, reducedMotion } = useSettings();

  const { t, locale } = useI18n();

  const units = useUnits();

  // Busca e sugestões

  const [search, setSearch] = useState("");

  const [suggestions, setSuggestions] = useState<GeocodingResult[]>([]);

  const [suggestionsFor, setSuggestionsFor] = useState("");

  const [suggestionsLoading, setSuggestionsLoading] = useState(false);

  const [isSearchOpen, setIsSearchOpen] = useState(false);

  const [activeIndex, setActiveIndex] = useState(-1);

  const [recentCities, setRecentCities] = useState<GeocodingResult[]>(() =>
    loadRecentCities(),
  );

  const [activePage, setActivePage] = useState<WeatherPage>(settings.startup.page);

  const [dockMenuOpen, setDockMenuOpen] = useState(false);

  // Clima e favoritos

  const [selectedCity, setSelectedCity] = useState<GeocodingResult>(
    () => getStartupCity(settings.startup),
  );

  const [weather, setWeather] = useState<WeatherResponse | null>(null);

  const [savedCities, setSavedCities] = useState<SavedCity[]>(() =>
    loadSavedCities(),
  );

  const [removingKeys, setRemovingKeys] = useState<string[]>([]);

  const [loading, setLoading] = useState(true);

  const [errorMessage, setErrorMessage] = useState("");

  // Quando os dados foram buscados pela última vez, e um contador que as outras abas observam.
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);

  const [refreshKey, setRefreshKey] = useState(0);

  const [dismissedAlerts, setDismissedAlerts] = useState<string[]>([]);

  const inputRef = useRef<HTMLInputElement>(null);

  const suggestionCache = useRef(
    new globalThis.Map<string, GeocodingResult[]>(),
  );

  const requestIdRef = useRef(0);

  const initialCityRef = useRef(selectedCity);

  /* ---- Valores derivados ---- */

  const trimmedSearch = search.trim();

  const hasQuery = trimmedSearch.length >= MIN_QUERY_LENGTH;

  // Só exibe sugestões que correspondem exatamente à busca atual.

  const currentSuggestions =
    suggestionsFor === trimmedSearch ? suggestions : [];

  const dropdownItems = hasQuery ? currentSuggestions : recentCities;

  const showEmpty =
    hasQuery &&
    !suggestionsLoading &&
    suggestionsFor === trimmedSearch &&
    currentSuggestions.length === 0;

  const showDropdown =
    isSearchOpen &&
    (dropdownItems.length > 0 ||
      (hasQuery && (suggestionsLoading || showEmpty)));

  const selectedKey = cityKey(selectedCity);

  const savedKeys = new Set(savedCities.map(cityKey));

  const isFavorite =
    savedKeys.has(selectedKey) && !removingKeys.includes(selectedKey);

  /* ---- Persistência ---- */

  useEffect(() => {
    if (savedCities.length === 0) {
      removeStorage(FAVORITES_KEY);

      removeStorage(OLD_FAVORITES_KEY); // evita ressuscitar favoritos de versões antigas

      return;
    }

    writeStorage(
      FAVORITES_KEY,
      savedCities.map((city) => ({
        name: city.name,
        country: city.country,
        admin1: city.admin1,
        temperature: city.temperature,
        max: city.max,
        min: city.min,
        weatherCode: city.weatherCode,
        latitude: city.latitude,
        longitude: city.longitude,
      })),
    );
  }, [savedCities]);

    useEffect(() => {
    if (recentCities.length === 0) removeStorage(RECENT_KEY);
    else writeStorage(RECENT_KEY, recentCities);
  }, [recentCities]);

    useEffect(() => {
    if (cityKey(selectedCity) === cityKey(DEFAULT_CITY)) removeStorage(LAST_CITY_KEY);
    else writeStorage(LAST_CITY_KEY, selectedCity);
  }, [selectedCity]);

  /* ---- Carga inicial: última cidade vista (ou São Paulo) ---- */

  useEffect(() => {
    loadCity(initialCityRef.current, { remember: false });
  }, []);

  /* ---- Atualiza o clima dos favoritos ao abrir o app ---- */

  useEffect(() => {
    let cancelled = false;

    async function refreshSavedCities() {
      const citiesToUpdate = loadSavedCities();

      const updates = new globalThis.Map<string, CityWeatherSummary>();

      await Promise.all(
        citiesToUpdate.map(async (city) => {
          if (city.latitude === undefined || city.longitude === undefined) {
            return;
          }

          try {
            const data = await getWeather(city.latitude, city.longitude);

            updates.set(cityKey(city), getCitySummary(data));
          } catch (error) {
            console.error(`Erro ao atualizar ${city.name}:`, error);
          }
        }),
      );

      if (cancelled || updates.size === 0) return;

      // Mescla com a lista atual para não perder favoritos adicionados

      // enquanto a atualização estava em andamento.

      setSavedCities((currentCities) =>
        currentCities.map((city) => {
          const update = updates.get(cityKey(city));

          return update ? { ...city, ...update } : city;
        }),
      );
    }

    refreshSavedCities();

    return () => {
      cancelled = true;
    };
  }, []);

  /* ---- Sugestões enquanto digita (com debounce e cache) ---- */

  useEffect(() => {
    const query = search.trim();

    if (query.length < MIN_QUERY_LENGTH) {
      // A lista exibida é derivada da consulta atual, então sugestões antigas

      // ficam ocultas sem precisar atualizar estado durante o efeito.

      return;
    }

    const cacheKey = `${settings.language}:${query.toLowerCase()}`;

    const cached = suggestionCache.current.get(cacheKey);

    if (cached) {
      setSuggestions(cached);

      setSuggestionsFor(query);

      setSuggestionsLoading(false);

      return;
    }

    setSuggestionsLoading(true);

    const controller = new AbortController();

    const timer = window.setTimeout(async () => {
      try {
        const results = await searchCities(query, MAX_SUGGESTIONS, controller.signal, settings.language);

        suggestionCache.current.set(cacheKey, results);

        setSuggestions(results);

        setSuggestionsFor(query);
      } catch (error) {
        if ((error as Error).name === "AbortError") return;

        console.error("Erro ao buscar sugestões:", error);

        setSuggestions([]);

        setSuggestionsFor(query);
      } finally {
        if (!controller.signal.aborted) setSuggestionsLoading(false);
      }
    }, SUGGESTION_DELAY);

    return () => {
      window.clearTimeout(timer);

      controller.abort();
    };
  }, [search, settings.language]);

  /* ---- Navegação entre abas ---- */

  // Troca de aba, fecha o menu do celular e volta ao topo da página.

  function goToPage(page: WeatherPage) {
    setActivePage(page);

    setDockMenuOpen(false);

    window.scrollTo({ top: 0, behavior: reducedMotion ? "auto" : "smooth" });
  }

  /* ---- Carregar o clima de uma cidade ---- */

  async function loadCity(
    city: GeocodingResult,

    { remember = true }: { remember?: boolean } = {},
  ) {
    // Só a requisição mais recente pode atualizar a tela.

    const requestId = ++requestIdRef.current;

    setLoading(true);

    setErrorMessage("");

    try {
      const data = await getWeather(city.latitude, city.longitude);

      if (requestId !== requestIdRef.current) return;

      setSelectedCity(city);

            setWeather(data);

      setLastUpdated(Date.now());


      if (remember) {
        setRecentCities((current) =>
          [
            city,

            ...current.filter((item) => cityKey(item) !== cityKey(city)),
          ].slice(0, MAX_RECENT_CITIES),
        );
      }

      // Se a cidade é favorita, atualiza o cartão com o clima novo.

      setSavedCities((current) =>
        current.map((saved) =>
          cityKey(saved) === cityKey(city)
            ? { ...saved, ...getCitySummary(data) }
            : saved,
        ),
      );
    } catch (error) {
      if (requestId !== requestIdRef.current) return;

      console.error("Erro ao buscar o clima:", error);

      setErrorMessage(navigator.onLine ? t("error.weather") : t("error.offline"));
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }

  /* ---- Busca ---- */

  function closeSearch() {
    setIsSearchOpen(false);

    setActiveIndex(-1);
  }

  function selectOption(city: GeocodingResult) {
    setSearch(city.name);

    closeSearch();

    inputRef.current?.blur();

    void loadCity(city);
  }

  function handleSearchChange(event: ChangeEvent<HTMLInputElement>) {
    setSearch(event.target.value);

    setActiveIndex(-1);

    setIsSearchOpen(true);

    setErrorMessage("");
  }

  function handleSearchFocus(event: FocusEvent<HTMLInputElement>) {
    event.target.select();

    setIsSearchOpen(true);
  }

  function handleSearchBlur(event: FocusEvent<HTMLFormElement>) {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
      closeSearch();
    }
  }

  function handleSearchKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    const total = dropdownItems.length;

    if (event.key === "ArrowDown") {
      event.preventDefault();

      setIsSearchOpen(true);

      setActiveIndex((index) => (total ? (index + 1) % total : -1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();

      setIsSearchOpen(true);

      setActiveIndex((index) =>
        total ? (index <= 0 ? total - 1 : index - 1) : -1,
      );
    } else if (event.key === "Escape") {
      closeSearch();
    }
  }

  async function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    // 1) Item destacado com as setas.

    const highlighted = activeIndex >= 0 ? dropdownItems[activeIndex] : null;

    if (highlighted) {
      selectOption(highlighted);

      return;
    }

    if (!trimmedSearch) return;

    // 2) Primeira sugestão já carregada para o que foi digitado.

    if (suggestionsFor === trimmedSearch && currentSuggestions.length > 0) {
      selectOption(currentSuggestions[0]);

      return;
    }

    // 3) Sem sugestões prontas: busca direta.

    setLoading(true);

    setErrorMessage("");

    closeSearch();

    try {
      const [result] = await searchCities(trimmedSearch, 1, undefined, settings.language);

      if (!result) {
        setErrorMessage(t("error.cityNotFound"));

        setLoading(false);

        return;
      }

      selectOption(result);
    } catch (error) {
      console.error("Erro ao buscar a cidade:", error);

      setErrorMessage(t("error.city"));

      setLoading(false);
    }
  }

  function clearRecentCities() {
    setRecentCities([]);

    setActiveIndex(-1);
  }

  /* ---- Favoritos ---- */

  function removeCity(city: { name: string; country: string }) {
    const key = cityKey(city);

    if (removingKeys.includes(key)) return;

    // Primeiro toca a animação de saída; depois remove da lista.

    setRemovingKeys((current) => [...current, key]);

    window.setTimeout(() => {
      setSavedCities((current) =>
        current.filter((saved) => cityKey(saved) !== key),
      );

      setRemovingKeys((current) => current.filter((item) => item !== key));
    }, REMOVE_ANIMATION_MS);
  }

  function toggleFavoriteCity() {
    if (!weather || removingKeys.includes(selectedKey)) return;

    if (isFavorite) {
      removeCity(selectedCity);

      return;
    }

    const newCity: SavedCity = {
      name: selectedCity.name,

      country: selectedCity.country,

      admin1: selectedCity.admin1,

      latitude: selectedCity.latitude,

      longitude: selectedCity.longitude,

      ...getCitySummary(weather),
    };

    setSavedCities((current) => [
      newCity,

      ...current.filter((saved) => cityKey(saved) !== selectedKey),
    ]);
  }

  // Abre uma cidade salva: volta para a aba Início e carrega o clima dela.

  async function selectSavedCity(city: SavedCity) {
    let target: GeocodingResult | null = null;

    if (city.latitude !== undefined && city.longitude !== undefined) {
      target = {
        name: city.name,

        country: city.country,

        admin1: city.admin1,

        latitude: city.latitude,

        longitude: city.longitude,
      };
    } else {
      // Favorito antigo, sem coordenadas: descobre e grava no cartão.

      setLoading(true);

      setErrorMessage("");

      try {
        const [result] = await searchCities(city.name, 1, undefined, settings.language);

        if (result) {
          target = result;

          setSavedCities((current) =>
            current.map((saved) =>
              cityKey(saved) === cityKey(city)
                ? {
                    ...saved,

                    country: result.country,

                    admin1: result.admin1,

                    latitude: result.latitude,

                    longitude: result.longitude,
                  }
                : saved,
            ),
          );
        }
      } catch (error) {
        console.error("Erro ao localizar cidade favorita:", error);
      }

      if (!target) {
        setErrorMessage(t("error.locate", { name: city.name }));

        setLoading(false);

        return;
      }
    }

    goToPage("inicio");

    await loadCity(target, { remember: false });
  }

    /* ---- Atualização dos dados ---- */

  // Busca de novo o clima da cidade atual e avisa as outras abas para fazerem o mesmo.
  function refresh() {
    setRefreshKey((key) => key + 1);

    void loadCity(selectedCity, { remember: false });
  }

  // Estas referências guardam sempre a versão mais nova, para o relógio de atualização automática.
  const refreshRef = useRef(refresh);

  const lastUpdatedRef = useRef(lastUpdated);

  useEffect(() => {
    refreshRef.current = refresh;

    lastUpdatedRef.current = lastUpdated;
  });

  const autoRefreshMinutes = settings.data.autoRefreshMinutes;

  // Atualização automática: só com a aba visível e com internet; pausa e retoma sozinha.
  useEffect(() => {
    if (autoRefreshMinutes === 0) return;

    const interval = autoRefreshMinutes * 60 * 1000;

    const isDue = () =>
      document.visibilityState === "visible" &&
      navigator.onLine &&
      Date.now() - (lastUpdatedRef.current ?? 0) >= interval - 1000;

    const check = () => {
      if (isDue()) refreshRef.current();
    };

    const timer = window.setInterval(check, 60 * 1000);

    document.addEventListener("visibilitychange", check);

    window.addEventListener("online", check);

    return () => {
      window.clearInterval(timer);

      document.removeEventListener("visibilitychange", check);

      window.removeEventListener("online", check);
    };
  }, [autoRefreshMinutes]);

  /* ---- Localização atual (só quando a pessoa pede ou já autorizou) ---- */

  // Usada pelo botão em Configurações. Se falhar, o erro volta para quem chamou.
  async function openCurrentLocation() {
    const { latitude, longitude } = await getCurrentCoordinates();

    goToPage("inicio");

    await loadCity(makeLocationCity(latitude, longitude, t("location.mine")), { remember: false });
  }

  // Ao abrir: se a pessoa escolheu "localização atual" e a permissão já foi dada, usamos.
  useEffect(() => {
    if (settings.startup.cityMode !== "location") return;

    let cancelled = false;

    void getLocationPermission().then(async (state) => {
      if (state !== "granted" || cancelled) return;

      try {
        const { latitude, longitude } = await getCurrentCoordinates();

        if (!cancelled) {
          await loadCity(makeLocationCity(latitude, longitude, t("location.mine")), { remember: false });
        }
      } catch (error) {
        console.error("Localização indisponível:", error);
      }
    });

        return () => {
      cancelled = true;
    };
    // Só ao abrir o app (mudar a configuração depois não deve buscar a localização de novo).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---- Dados locais (Configurações > Privacidade) ---- */

  function clearFavorites() {
    setSavedCities([]);
  }

  function clearRecents() {
    setRecentCities([]);
  }

  function clearAllLocalData() {
    setSavedCities([]);

    setRecentCities([]);

    resetSettings();

    ALL_LOCAL_KEYS.forEach(removeStorage);

    try {
      sessionStorage.removeItem(ALERTS_SENT_KEY);
    } catch {
      /* sem armazenamento de sessão: nada a apagar */
    }

    void loadCity(DEFAULT_CITY, { remember: false });
  }

  /* ---- Valores exibidos ---- */

  const CurrentWeatherIcon = weather
    ? getWeatherIcon(weather.current.weather_code)
    : CloudSun;

  const currentTemperature = weather
    ? Math.round(weather.current.temperature_2m)
    : null;

  const currentDescription = weather
    ? t(getWeatherDescriptionKey(weather.current.weather_code))
    : null;

  const realForecast: ForecastDay[] = weather ? getForecastDays(weather, locale, t("common.today")) : [];

  const hourlyForecast: HourlyItem[] = weather
    ? getHourlyForecast(weather, t("common.now"))
    : [];

  // A API retorna a data local da cidade no campo daily.time.

  // Interpretamos a data em UTC para evitar deslocamento pelo fuso do navegador.

  const today = weather?.daily.time[0]
    ? new Date(`${weather.daily.time[0]}T12:00:00Z`).toLocaleDateString(
        locale,
        {
          weekday: "long",

          day: "numeric",

          month: "long",

          timeZone: "UTC",
        },
      )
    : t("home.loadingDate");

  // Abas da barra de navegação.
  const pages: { id: WeatherPage; label: string; Icon: LucideIcon }[] = [
    { id: "inicio", label: t("nav.home"), Icon: Home },
    { id: "favoritos", label: t("nav.saved"), Icon: Bookmark },
    { id: "previsao", label: t("nav.forecast"), Icon: CalendarDays },
    { id: "mapas", label: t("nav.maps"), Icon: Map },
    { id: "qualidade-ar", label: t("nav.air"), Icon: Wind },
    { id: "configuracoes", label: t("nav.settings"), Icon: Settings },
  ];

    // Cidades salvas que têm coordenadas (as antigas podem não ter): servem para escolher a cidade padrão.
  const settingsCities: StoredCity[] = savedCities.flatMap(({ name, country, admin1, latitude, longitude }) =>
    latitude !== undefined && longitude !== undefined ? [{ name, country, admin1, latitude, longitude }] : [],
  );

  // Quadradinhos da Início, conforme escolhido em Configurações.
  const indicatorViews = settings.home.indicators.map((key) => buildIndicator(key, weather, units));

  // Avisos de chuva e trovoada calculados pela previsão (não são alertas oficiais).
  const rainHit = weather && settings.alerts.rain ? findRainAlert(weather, settings.alerts.rainThreshold) : null;

  const stormHit = weather && settings.alerts.storm ? findStormAlert(weather) : null;

  const allAlerts = [
    ...(rainHit
      ? [{ id: `${selectedKey}|rain|${rainHit.time}`, text: t("alert.rain", { value: rainHit.probability, hour: rainHit.hour }), Icon: CloudRain }]
      : []),
    ...(stormHit
      ? [{ id: `${selectedKey}|storm|${stormHit.time}`, text: t("alert.storm", { hour: stormHit.hour }), Icon: CloudLightning }]
      : []),
  ];

  const alertItems = allAlerts.filter((item) => !dismissedAlerts.includes(item.id));

  const allAlertsRef = useRef(allAlerts);

  useEffect(() => {
    allAlertsRef.current = allAlerts;
  });

  const alertKey = allAlerts.map((item) => item.id).join(",");

  // Notificação do navegador: só se a pessoa ativou e deu permissão; uma vez por aviso.
  useEffect(() => {
    if (!settings.alerts.browser || typeof Notification === "undefined") return;

    if (Notification.permission !== "granted") return;

    const sent = readSentAlerts();

    for (const item of allAlertsRef.current) {
      if (sent.includes(item.id)) continue;

      new Notification(t("alert.notificationTitle", { city: selectedCity.name }), { body: item.text, tag: item.id });

      sent.push(item.id);
    }

    writeSentAlerts(sent);
  }, [alertKey, settings.alerts.browser, selectedCity.name, t]);

  return (
    <div className="weather-app">
      {/* Fundo decorativo: aurora boreal animada */}

      <div className="aurora" aria-hidden="true">
        <span className="aurora-glow aurora-glow-green" />

        <span className="aurora-glow aurora-glow-blue" />

        <span className="aurora-glow aurora-glow-pink" />

        <span className="aurora-curtain aurora-curtain-one" />

        <span className="aurora-curtain aurora-curtain-two" />
      </div>

      {/* Na aba Início a logo aparece aberta no centro da página. */}

      {activePage !== "inicio" && (
        <div className="weather-brand-floating" aria-label="Weather Lab">
          <span className="weather-brand-icon" aria-hidden="true">
            <CloudSun size={24} strokeWidth={1.8} />
          </span>

          <span className="weather-brand-label">Weather Lab</span>
        </div>
      )}

      <nav className="liquid-dock" aria-label={t("nav.main")}>
        <div className="dock-items">
          {pages.map(({ id, label, Icon }) => (
            <button
              key={id}
              type="button"
              className={`dock-item ${activePage === id ? "dock-item-active" : ""}`}
              onClick={() => goToPage(id)}
              aria-label={label}
              title={label}
            >
              <Icon size={21} />

              <span>{label}</span>
            </button>
          ))}
        </div>

        <button
          type="button"
          className={`dock-item dock-menu-button ${dockMenuOpen ? "dock-item-active" : ""}`}
          onClick={() => setDockMenuOpen((open) => !open)}
          aria-label={dockMenuOpen ? t("nav.closeMenu") : t("nav.openMenu")}
          aria-expanded={dockMenuOpen}
        >
          {dockMenuOpen ? <X size={21} /> : <Menu size={21} />}

          <span>{t("nav.menu")}</span>
        </button>
      </nav>

      {dockMenuOpen && (
        <div className="dock-mobile-menu glass-panel" role="menu" aria-label={t("nav.more")}>
          {pages.slice(2).map(({ id, label, Icon }) => (
            <button key={id} type="button" role="menuitem" onClick={() => goToPage(id)}>
              <Icon size={18} />

              <span>{label}</span>
            </button>
          ))}
        </div>
      )}

      <main className="dashboard" id="inicio">
        {activePage === "inicio" && (
          <div className="home-brand">
            <span className="home-brand-icon" aria-hidden="true">
              <CloudSun size={30} strokeWidth={1.8} />
            </span>

            <span className="home-brand-label">Weather Lab</span>
          </div>
        )}

        {/* A busca fica em todas as abas, menos em Cidades salvas. */}

        {activePage !== "favoritos" && (
          <form
            className="search-bar glass-panel"
            onBlur={handleSearchBlur}
            onSubmit={handleSearch}
          >
            <MapPin className="search-location-icon" />

            <input
              ref={inputRef}
              aria-activedescendant={
                activeIndex >= 0 ? `suggestion-${activeIndex}` : undefined
              }
              aria-autocomplete="list"
              aria-controls="search-suggestions"
              aria-expanded={showDropdown}
              aria-label={t("search.label")}
              autoComplete="off"
              enterKeyHint="search"
              onChange={handleSearchChange}
              onClick={() => setIsSearchOpen(true)}
              onFocus={handleSearchFocus}
              onKeyDown={handleSearchKeyDown}
              placeholder={t("search.placeholder")}
              role="combobox"
              type="search"
              value={search}
            />

            <button aria-label={t("search.submit")} type="submit" disabled={loading}>
              <Search />
            </button>

            {showDropdown && (
              <div
                className="search-suggestions"
                // Evita que o campo perca o foco ao tocar na lista.

                onMouseDown={(event) => event.preventDefault()}
              >
                {!hasQuery && (
                  <div className="search-suggestions-header">
                    <span>{t("search.recent")}</span>

                    <button
                      className="search-suggestions-clear"
                      onClick={clearRecentCities}
                      type="button"
                    >
                      {t("search.clear")}
                    </button>
                  </div>
                )}

                {dropdownItems.length > 0 && (
                  <ul
                    aria-label={hasQuery ? t("search.suggestions") : t("search.recentList")}
                    id="search-suggestions"
                    role="listbox"
                  >
                    {dropdownItems.map((city, index) => (
                      <li
                        aria-selected={index === activeIndex}
                        className={`suggestion-item ${
                          index === activeIndex ? "suggestion-item-active" : ""
                        }`}
                        id={`suggestion-${index}`}
                        key={cityKey(city)}
                        onClick={() => selectOption(city)}
                        onMouseEnter={() => setActiveIndex(index)}
                        role="option"
                      >
                        {hasQuery ? <MapPin /> : <Clock />}

                        <span>
                          <strong>{city.name}</strong>

                          <small>{formatPlace(city)}</small>
                        </span>

                        {savedKeys.has(cityKey(city)) && (
                          <Heart className="suggestion-favorite" />
                        )}
                      </li>
                    ))}
                  </ul>
                )}

                {hasQuery &&
                  suggestionsLoading &&
                  dropdownItems.length === 0 && (
                    <div
                      aria-live="polite"
                      className="search-suggestions-status search-suggestions-loading"
                    >
                      {t("search.loading")}
                    </div>
                  )}

                {showEmpty && (
                  <div aria-live="polite" className="search-suggestions-status">
                    {t("search.empty")}
                  </div>
                )}
              </div>
            )}
          </form>
        )}

        {loading && <p role="status">{t("status.loadingWeather")}</p>}

        {errorMessage && <p role="alert">{errorMessage}</p>}

        {/* ---- Aba Início ---- */}

        {activePage === "inicio" && (
          <div className="home home-content">
            {alertItems.map((item) => (
              <div className="home-alert glass-panel" key={item.id} role="note">
                <item.Icon aria-hidden="true" />

                <div>
                  <strong>{item.text}</strong>

                  <small>{t("alert.disclaimer")}</small>
                </div>

                <button type="button" aria-label={t("common.close")} onClick={() => setDismissedAlerts((current) => [...current, item.id])}>
                  <X aria-hidden="true" />
                </button>
              </div>
            ))}

            <section className="home-grid">
              <article className="home-city glass-panel">
                <header className="home-city-header">
                  <div>
                    <h1>{selectedCity.name}</h1>

                    {formatPlace(selectedCity) && <p className="home-place">{formatPlace(selectedCity)}</p>}

                    <p className="home-date">{today}</p>

                    {lastUpdated !== null && (
                      <p className="home-updated">
                        {t("home.updatedAt", { time: new Date(lastUpdated).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" }) })}
                      </p>
                    )}
                  </div>

                  <div className="home-city-actions">
                    <button
                      aria-label={t("home.refresh")}
                      className={`favorite-button refresh-button ${loading ? "is-loading" : ""}`}
                      disabled={loading}
                      onClick={refresh}
                      title={t("home.refresh")}
                      type="button"
                    >
                      <RefreshCw />
                    </button>

                    <button
                      aria-label={isFavorite ? t("home.favoriteRemove") : t("home.favoriteAdd")}
                      aria-pressed={isFavorite}
                      className={`favorite-button ${isFavorite ? "favorite-button-active" : ""}`}
                      onClick={toggleFavoriteCity}
                      type="button"
                    >
                      <Heart fill={isFavorite ? "currentColor" : "none"} />
                    </button>
                  </div>
                </header>

                <div className="home-now">
                  <strong className="home-temp">{currentTemperature === null ? "--" : units.temperature(currentTemperature)}</strong>

                  <div className="home-weather-icon">{createElement(CurrentWeatherIcon)}</div>
                </div>

                <p className="home-condition">{currentDescription ?? t("common.loadingShort")}</p>

                <p className="home-feels">
                  {t("home.feels", { value: weather ? units.temperature(weather.current.apparent_temperature) : "--" })}
                </p>
              </article>

              <div className="home-stats">
                {indicatorViews.map(({ key, Icon, labelKey, value, unit }) => (
                  <article className={`home-stat home-stat-${key} glass-panel`} key={key}>
                    <span className="home-stat-icon">
                      <Icon />
                    </span>

                    <span className="home-stat-label">{t(labelKey)}</span>

                    <strong className="home-stat-value">
                      {value}

                      {unit && <small>{unit}</small>}
                    </strong>
                  </article>
                ))}
              </div>
            </section>

            {settings.home.mode === "detailed" && (
              <section className="home-section">
                <h2 className="home-section-title">{t("home.hourly")}</h2>

                <div className="home-hourly glass-panel">
                  <div className="home-hourly-list">
                    {!weather && (
                      <p className="home-empty" role="status">
                        {loading ? t("home.loadingHourly") : t("home.waiting")}
                      </p>
                    )}

                    {hourlyForecast.map(({ label, temperature, rain, Icon }, index) => (
                      <div className={`home-hour ${index === 0 ? "home-hour-active" : ""}`} key={`${label}-${index}`}>
                        <span className="home-hour-label">{label}</span>

                        <Icon className="home-hour-icon" />

                        <strong>{units.temperature(temperature)}</strong>

                        <small>
                          <Droplets />
                          {rain}%
                        </small>
                      </div>
                    ))}
                  </div>
                </div>
              </section>
            )}

            <section className="home-section">
              <h2 className="home-section-title">{t("home.daily")}</h2>

              <div className="home-daily">
                {!weather && (
                  <p className="home-empty" role="status">
                    {loading ? t("home.loadingDaily") : t("home.waiting")}
                  </p>
                )}

                {realForecast.map(({ day, max, min, rain, Icon }, index) => (
                  <article className={`home-day glass-panel ${index === 0 ? "home-day-active" : ""}`} key={`${day}-${index}`}>
                    <strong className="home-day-name">{day}</strong>

                    <Icon className="home-day-icon" />

                    <span className="home-day-max">{units.temperature(max)}</span>

                    <span className="home-day-min">{units.temperature(min)}</span>

                    <small>
                      <Droplets />
                      {rain}%
                    </small>
                  </article>
                ))}
              </div>
            </section>
          </div>
        )}

        {/* ---- Aba Cidades salvas ---- */}

        {activePage === "favoritos" && (
          <section className="saved-page" aria-labelledby="saved-page-title">
            <header className="saved-page-header">
              <h1 id="saved-page-title">{t("nav.saved")}</h1>

              <p>{savedCities.length === 1 ? t("saved.one", { count: 1 }) : t("saved.many", { count: savedCities.length })}</p>
            </header>

            <div className="saved-grid">
              {savedCities.map((city) => {
                const { name, temperature, max, min, Icon } = city;

                const isRemoving = removingKeys.includes(cityKey(city));

                return (
                  <article
                    aria-label={t("saved.view", { name })}
                    className={`saved-city-card glass-panel ${isRemoving ? "saved-city-card-removing" : ""}`}
                    key={cityKey(city)}
                    onClick={() => void selectSavedCity(city)}
                    onKeyDown={(event) => {
                      if (event.target !== event.currentTarget) return;

                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();

                        void selectSavedCity(city);
                      }
                    }}
                    role="button"
                    tabIndex={0}
                  >
                    <header>
                      <div>
                        <h3>{name}</h3>

                        <p>{formatPlace(city)}</p>
                      </div>

                      <button
                        aria-label={t("saved.remove", { name })}
                        onClick={(event) => {
                          event.stopPropagation();

                          removeCity(city);
                        }}
                        type="button"
                      >
                        <Heart />
                      </button>
                    </header>

                    <div className="saved-city-weather">
                      <Icon />

                      <strong>{units.temperature(temperature)}</strong>
                    </div>

                    <p className="saved-city-temperatures">
                      <span>{t("saved.max", { value: units.temperature(max) })}</span>

                      <i />

                      <span>{t("saved.min", { value: units.temperature(min) })}</span>
                    </p>
                  </article>
                );
              })}

              {savedCities.length === 0 && (
                <div className="empty-cities saved-empty glass-panel">
                  <p>{t("saved.emptyTitle")}</p>

                  <p>{t("saved.emptyHint")}</p>
                </div>
              )}
            </div>
          </section>
        )}

        {/* ---- Outras abas ---- */}

        {activePage === "qualidade-ar" && <AirQualityPage city={selectedCity} refreshKey={refreshKey} />}

        {activePage === "previsao" && <ForecastPage city={selectedCity} refreshKey={refreshKey} />}

        {activePage === "mapas" && <MapPage city={selectedCity} refreshKey={refreshKey} />}

        {activePage === "configuracoes" && (
          <SettingsPage
            currentCity={selectedCity}
            savedCities={settingsCities}
            recentCount={recentCities.length}
            lastUpdated={lastUpdated}
            loading={loading}
            onRefresh={refresh}
            searchCities={(query, signal) => searchCities(query, MAX_SUGGESTIONS, signal, settings.language)}
            onUseLocation={openCurrentLocation}
            onClearFavorites={clearFavorites}
            onClearRecents={clearRecents}
            onClearAll={clearAllLocalData}
          />
        )}
      </main>
    </div>
  );
}

// As configurações envolvem o app inteiro: todas as páginas leem da mesma fonte.
export default function AppWithSettings() {
  return (
    <SettingsProvider>
      <App />
    </SettingsProvider>
  );
}
