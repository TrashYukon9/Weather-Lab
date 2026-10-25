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

import {
  ArrowDown,
  ArrowUp,
  Bookmark,
  Clock,
  Cloud,
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

    weather_code: number[];
  };
}

const FAVORITES_KEY = "weather-lab-favorites";

const OLD_FAVORITES_KEY = "weather-lab-saved-cities";

const RECENT_KEY = "weather-lab-recent";

const LAST_CITY_KEY = "weather-lab-last-city";

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

function getWeatherDescription(code: number): string {
  if (code === 0) return "Céu limpo";

  if (code === 1) return "Predominantemente limpo";

  if (code === 2) return "Parcialmente nublado";

  if (code === 3) return "Nublado";

  if (code === 45 || code === 48) return "Neblina";

  if (code >= 51 && code <= 57) return "Garoa";

  if (code >= 61 && code <= 67) return "Chuva";

  if (code >= 71 && code <= 77) return "Neve";

  if (code >= 80 && code <= 82) return "Pancadas de chuva";

  if (code >= 85 && code <= 86) return "Pancadas de neve";

  if (code >= 95) return "Tempestade";

  return "Condição meteorológica variável";
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

function readStorage(key: string): unknown {
  try {
    const raw = localStorage.getItem(key);

    return raw ? JSON.parse(raw) : null;
  } catch (error) {
    console.error(`Erro ao ler ${key}:`, error);

    return null;
  }
}

function writeStorage(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.error(`Erro ao salvar ${key}:`, error);
  }
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
    temperature: Math.round(data.current.temperature_2m),

    max: Math.round(data.daily.temperature_2m_max[0] ?? 0),

    min: Math.round(data.daily.temperature_2m_min[0] ?? 0),

    Icon: getWeatherIcon(data.current.weather_code),

    weatherCode: data.current.weather_code,
  };
}

function getForecastDays(data: WeatherResponse): ForecastDay[] {
  return data.daily.time.map((date, index) => {
    const weekday = new Date(`${date}T12:00:00Z`)

      .toLocaleDateString("pt-BR", {
        weekday: "short",

        timeZone: "UTC",
      })

      .replace(".", "");

    return {
      day:
        index === 0
          ? "Hoje"
          : weekday.charAt(0).toUpperCase() + weekday.slice(1),

      max: Math.round(data.daily.temperature_2m_max[index]),

      min: Math.round(data.daily.temperature_2m_min[index]),

      rain: data.daily.precipitation_probability_max[index] ?? 0,

      Icon: getWeatherIcon(data.daily.weather_code[index]),
    };
  });
}

// Previsão por hora: começa na hora atual e avança de 3 em 3 horas.

function getHourlyForecast(data: WeatherResponse): HourlyItem[] {
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
      label: position === 0 ? "Agora" : `${data.hourly.time[index].slice(11, 13)}h`,

      temperature: Math.round(data.hourly.temperature_2m[index]),

      rain: data.hourly.precipitation_probability[index] ?? 0,

      Icon: getWeatherIcon(data.hourly.weather_code[index]),
    }));
}

/* ------------------------------------------------------------------------ */

/* API (Open-Meteo)                                                         */

/* ------------------------------------------------------------------------ */

async function searchCities(
  query: string,

  count = MAX_SUGGESTIONS,

  signal?: AbortSignal,
): Promise<GeocodingResult[]> {
  const response = await fetch(
    `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(
      query,
    )}&count=${count}&language=pt&format=json`,

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
    `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,relative_humidity_2m,apparent_temperature,wind_speed_10m,weather_code&hourly=precipitation_probability,temperature_2m,weather_code&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code&forecast_days=7&timezone=auto`,
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

  const [activePage, setActivePage] = useState<WeatherPage>("inicio");

  const [dockMenuOpen, setDockMenuOpen] = useState(false);

  // Clima e favoritos

  const [selectedCity, setSelectedCity] = useState<GeocodingResult>(
    () => loadLastCity() ?? DEFAULT_CITY,
  );

  const [weather, setWeather] = useState<WeatherResponse | null>(null);

  const [savedCities, setSavedCities] = useState<SavedCity[]>(() =>
    loadSavedCities(),
  );

  const [removingKeys, setRemovingKeys] = useState<string[]>([]);

  const [loading, setLoading] = useState(true);

  const [errorMessage, setErrorMessage] = useState("");

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
    writeStorage(RECENT_KEY, recentCities);
  }, [recentCities]);

  useEffect(() => {
    writeStorage(LAST_CITY_KEY, selectedCity);
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

    const cacheKey = query.toLowerCase();

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
        const results = await searchCities(
          query,

          MAX_SUGGESTIONS,

          controller.signal,
        );

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
  }, [search]);

  /* ---- Navegação entre abas ---- */

  // Troca de aba, fecha o menu do celular e volta ao topo da página.

  function goToPage(page: WeatherPage) {
    setActivePage(page);

    setDockMenuOpen(false);

    window.scrollTo({ top: 0, behavior: "smooth" });
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

      setErrorMessage("Não foi possível consultar o clima. Tente novamente.");
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
      const [result] = await searchCities(trimmedSearch, 1);

      if (!result) {
        setErrorMessage("Cidade não encontrada. Tente outro nome.");

        setLoading(false);

        return;
      }

      selectOption(result);
    } catch (error) {
      console.error("Erro ao buscar a cidade:", error);

      setErrorMessage("Não foi possível buscar a cidade. Tente novamente.");

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
        const [result] = await searchCities(city.name, 1);

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
        setErrorMessage(`Não foi possível localizar ${city.name}.`);

        setLoading(false);

        return;
      }
    }

    goToPage("inicio");

    await loadCity(target, { remember: false });
  }

  /* ---- Valores exibidos ---- */

  const CurrentWeatherIcon = weather
    ? getWeatherIcon(weather.current.weather_code)
    : CloudSun;

  const currentTemperature = weather
    ? Math.round(weather.current.temperature_2m)
    : null;

  const currentDescription = weather
    ? getWeatherDescription(weather.current.weather_code)
    : null;

  const realForecast: ForecastDay[] = weather ? getForecastDays(weather) : [];

  const hourlyForecast: HourlyItem[] = weather
    ? getHourlyForecast(weather)
    : [];

  // A API retorna a data local da cidade no campo daily.time.

  // Interpretamos a data em UTC para evitar deslocamento pelo fuso do navegador.

  const today = weather?.daily.time[0]
    ? new Date(`${weather.daily.time[0]}T12:00:00Z`).toLocaleDateString(
        "pt-BR",
        {
          weekday: "long",

          day: "numeric",

          month: "long",

          timeZone: "UTC",
        },
      )
    : "Carregando data local...";

  // Abas que aparecem na barra de navegação (além de Início e Cidades salvas).

  const extraPages = [
    { id: "previsao", label: "Previsão", Icon: CalendarDays },

    { id: "mapas", label: "Mapas", Icon: Map },

    { id: "qualidade-ar", label: "Qualidade do ar", Icon: Wind },

    { id: "configuracoes", label: "Configurações", Icon: Settings },
  ];

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

      <nav className="liquid-dock" aria-label="Navegação principal">
        <div className="dock-items">
          <button
            type="button"
            className={`dock-item ${activePage === "inicio" ? "dock-item-active" : ""}`}
            onClick={() => goToPage("inicio")}
            aria-label="Início"
            title="Início"
          >
            <Home size={21} />

            <span>Início</span>
          </button>

          <button
            type="button"
            className={`dock-item ${activePage === "favoritos" ? "dock-item-active" : ""}`}
            onClick={() => goToPage("favoritos")}
            aria-label="Cidades salvas"
            title="Cidades salvas"
          >
            <Bookmark size={21} />

            <span>Cidades salvas</span>
          </button>

          {extraPages.map(({ id, label, Icon }) => (
            <button
              key={id}
              type="button"
              className={`dock-item ${activePage === id ? "dock-item-active" : ""}`}
              onClick={() => goToPage(id as WeatherPage)}
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
          aria-label={dockMenuOpen ? "Fechar menu" : "Abrir menu"}
          aria-expanded={dockMenuOpen}
        >
          {dockMenuOpen ? <X size={21} /> : <Menu size={21} />}

          <span>Menu</span>
        </button>
      </nav>

      {dockMenuOpen && (
        <div
          className="dock-mobile-menu glass-panel"
          role="menu"
          aria-label="Mais opções"
        >
          {extraPages.map(({ id, label, Icon }) => (
            <button
              key={id}
              type="button"
              role="menuitem"
              onClick={() => goToPage(id as WeatherPage)}
            >
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
              aria-label="Pesquisar cidade"
              autoComplete="off"
              enterKeyHint="search"
              onChange={handleSearchChange}
              onClick={() => setIsSearchOpen(true)}
              onFocus={handleSearchFocus}
              onKeyDown={handleSearchKeyDown}
              placeholder="Pesquisar uma cidade..."
              role="combobox"
              type="search"
              value={search}
            />

            <button aria-label="Pesquisar" type="submit" disabled={loading}>
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
                    <span>Pesquisas recentes</span>

                    <button
                      className="search-suggestions-clear"
                      onClick={clearRecentCities}
                      type="button"
                    >
                      Limpar
                    </button>
                  </div>
                )}

                {dropdownItems.length > 0 && (
                  <ul
                    aria-label={hasQuery ? "Sugestões de cidades" : "Recentes"}
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
                      Buscando cidades...
                    </div>
                  )}

                {showEmpty && (
                  <div aria-live="polite" className="search-suggestions-status">
                    Nenhuma cidade encontrada.
                  </div>
                )}
              </div>
            )}
          </form>
        )}

        {loading && <p role="status">Buscando informações do clima...</p>}

        {errorMessage && <p role="alert">{errorMessage}</p>}

        {/* ---- Aba Início ---- */}

        {activePage === "inicio" && (
          <div className="home home-content">
            <section className="home-grid">
              <article className="home-city glass-panel">
                <header className="home-city-header">
                  <div>
                    <h1>{selectedCity.name}</h1>

                    <p className="home-place">{formatPlace(selectedCity)}</p>

                    <p className="home-date">{today}</p>
                  </div>

                  <button
                    aria-label={
                      isFavorite
                        ? "Remover cidade dos favoritos"
                        : "Adicionar cidade aos favoritos"
                    }
                    aria-pressed={isFavorite}
                    className={`favorite-button ${
                      isFavorite ? "favorite-button-active" : ""
                    }`}
                    onClick={toggleFavoriteCity}
                    type="button"
                  >
                    <Heart fill={isFavorite ? "currentColor" : "none"} />
                  </button>
                </header>

                <div className="home-now">
                  <strong className="home-temp">
                    {currentTemperature ?? "--"}°
                  </strong>

                  <div className="home-weather-icon">
                    {createElement(CurrentWeatherIcon)}
                  </div>
                </div>

                <p className="home-condition">
                  {currentDescription ?? "Carregando..."}
                </p>

                <p className="home-feels">
                  Sensação térmica de{" "}
                  {weather
                    ? Math.round(weather.current.apparent_temperature)
                    : "--"}
                  °
                </p>
              </article>

              <div className="home-stats">
                <article className="home-stat home-stat-wind glass-panel">
                  <span className="home-stat-icon">
                    <Wind />
                  </span>

                  <span className="home-stat-label">Vento</span>

                  <strong className="home-stat-value">
                    {weather ? Math.round(weather.current.wind_speed_10m) : "—"}

                    <small>km/h</small>
                  </strong>
                </article>

                <article className="home-stat home-stat-humidity glass-panel">
                  <span className="home-stat-icon">
                    <Droplets />
                  </span>

                  <span className="home-stat-label">Umidade</span>

                  <strong className="home-stat-value">
                    {weather ? weather.current.relative_humidity_2m : "—"}

                    <small>%</small>
                  </strong>
                </article>

                <article className="home-stat home-stat-max glass-panel">
                  <span className="home-stat-icon">
                    <ArrowUp />
                  </span>

                  <span className="home-stat-label">Máxima</span>

                  <strong className="home-stat-value">
                    {weather
                      ? `${Math.round(weather.daily.temperature_2m_max[0])}°`
                      : "—"}
                  </strong>
                </article>

                <article className="home-stat home-stat-min glass-panel">
                  <span className="home-stat-icon">
                    <ArrowDown />
                  </span>

                  <span className="home-stat-label">Mínima</span>

                  <strong className="home-stat-value">
                    {weather
                      ? `${Math.round(weather.daily.temperature_2m_min[0])}°`
                      : "—"}
                  </strong>
                </article>
              </div>
            </section>

            <section className="home-section">
              <h2 className="home-section-title">Previsão por hora</h2>

              <div className="home-hourly glass-panel">
                <div className="home-hourly-list">
                  {!weather && (
                    <p className="home-empty" role="status">
                      {loading
                        ? "Carregando previsão por hora..."
                        : "A previsão ficará disponível quando o clima for carregado."}
                    </p>
                  )}

                  {hourlyForecast.map(
                    ({ label, temperature, rain, Icon }, index) => (
                      <div
                        className={`home-hour ${
                          index === 0 ? "home-hour-active" : ""
                        }`}
                        key={`${label}-${index}`}
                      >
                        <span className="home-hour-label">{label}</span>

                        <Icon className="home-hour-icon" />

                        <strong>{temperature}°</strong>

                        <small>
                          <Droplets />
                          {rain}%
                        </small>
                      </div>
                    ),
                  )}
                </div>
              </div>
            </section>

            <section className="home-section">
              <h2 className="home-section-title">
                Previsão para os próximos 7 dias
              </h2>

              <div className="home-daily">
                {!weather && (
                  <p className="home-empty" role="status">
                    {loading
                      ? "Carregando previsão real..."
                      : "A previsão ficará disponível quando o clima for carregado."}
                  </p>
                )}

                {realForecast.map(({ day, max, min, rain, Icon }, index) => (
                  <article
                    className={`home-day glass-panel ${
                      index === 0 ? "home-day-active" : ""
                    }`}
                    key={`${day}-${index}`}
                  >
                    <strong className="home-day-name">{day}</strong>

                    <Icon className="home-day-icon" />

                    <span className="home-day-max">{max}°</span>

                    <span className="home-day-min">{min}°</span>

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
              <h1 id="saved-page-title">Cidades salvas</h1>

              <p>
                {savedCities.length}{" "}
                {savedCities.length === 1 ? "cidade" : "cidades"}
              </p>
            </header>

            <div className="saved-grid">
              {savedCities.map((city) => {
                const { name, temperature, max, min, Icon } = city;

                const isRemoving = removingKeys.includes(cityKey(city));

                return (
                  <article
                    aria-label={`Ver clima de ${name}`}
                    className={`saved-city-card glass-panel ${
                      isRemoving ? "saved-city-card-removing" : ""
                    }`}
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
                        aria-label={`Remover ${name} dos favoritos`}
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

                      <strong>{temperature}°</strong>
                    </div>

                    <p className="saved-city-temperatures">
                      <span>Máx. {max}°</span>

                      <i />

                      <span>Mín. {min}°</span>
                    </p>
                  </article>
                );
              })}

              {savedCities.length === 0 && (
                <div className="empty-cities saved-empty glass-panel">
                  <p>Nenhuma cidade salva ainda.</p>

                  <p>
                    Toque no coração, no cartão da cidade na aba Início, para
                    salvá-la aqui.
                  </p>
                </div>
              )}
            </div>
          </section>
        )}

        {/* ---- Outras abas ---- */}

        {activePage === "qualidade-ar" && (
          <AirQualityPage city={selectedCity} />
        )}

        {activePage === "previsao" && <ForecastPage city={selectedCity} />}

        {activePage === "mapas" && <MapPage city={selectedCity} />}

        {activePage === "configuracoes" && (
          <div className="empty-cities glass-panel">
            Esta aba ainda está em construção. Por enquanto, você pode usar a
            aba "Início" para ver o clima e a previsão.
          </div>
        )}
      </main>
    </div>
  );
}

export default App;