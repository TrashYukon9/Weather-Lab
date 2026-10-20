import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FocusEvent,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import {
  Bookmark,
  ChevronLeft,
  ChevronRight,
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
  ThermometerSun,
  Wind,
  type LucideIcon,
} from "lucide-react";
import "./App.css";

interface ForecastDay {
  day: string;
  max: number;
  min: number;
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

// Cidade exibida na primeira vez que o app abre.
const DEFAULT_CITY: GeocodingResult = {
  name: "São Paulo",
  country: "Brasil",
  admin1: "São Paulo",
  latitude: -23.5475,
  longitude: -46.6361,
};

// Dados de exemplo exibidos apenas enquanto o clima real ainda não carregou.
const forecast: ForecastDay[] = [
  { day: "Hoje", max: 26, min: 17, rain: 20, Icon: CloudSun },
  { day: "Sex", max: 27, min: 18, rain: 10, Icon: Sun },
  { day: "Sáb", max: 24, min: 16, rain: 60, Icon: CloudRain },
  { day: "Dom", max: 25, min: 17, rain: 20, Icon: CloudSun },
  { day: "Seg", max: 27, min: 18, rain: 10, Icon: Sun },
  { day: "Ter", max: 24, min: 16, rain: 40, Icon: CloudRain },
  { day: "Qua", max: 23, min: 15, rain: 20, Icon: Cloud },
];

/* ------------------------------------------------------------------------ */
/* Utilidades                                                               */
/* ------------------------------------------------------------------------ */

function getWeatherIcon(code: number): LucideIcon {
  if (code === 0) return Sun;
  if (code === 1 || code === 2) return CloudSun;
  if (code === 3 || code === 45 || code === 48) return Cloud;
  if (code >= 51) return CloudRain;
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

function getCurrentRainProbability(data: WeatherResponse): number {
  const index = data.hourly.time.indexOf(data.current.time);

  if (index >= 0) {
    return data.hourly.precipitation_probability[index] ?? 0;
  }

  // O horário atual vem em intervalos de 15 min; busca a hora cheia.
  const currentHour = data.current.time.slice(0, 13);
  const nextIndex = data.hourly.time.findIndex(
    (time) => time.slice(0, 13) >= currentHour,
  );

  return nextIndex >= 0
    ? (data.hourly.precipitation_probability[nextIndex] ?? 0)
    : 0;
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
    `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,relative_humidity_2m,apparent_temperature,wind_speed_10m,weather_code&hourly=precipitation_probability&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code&forecast_days=7&timezone=auto`,
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
  const savedListRef = useRef<HTMLDivElement>(null);
  const suggestionCache = useRef(new Map<string, GeocodingResult[]>());
  const requestIdRef = useRef(0);
  const initialCityRef = useRef(selectedCity);

  /* ---- Valores derivados ---- */

  const trimmedSearch = search.trim();
  const hasQuery = trimmedSearch.length >= MIN_QUERY_LENGTH;
  const dropdownItems = hasQuery ? suggestions : recentCities;
  const showEmpty =
    hasQuery &&
    !suggestionsLoading &&
    suggestionsFor === trimmedSearch &&
    suggestions.length === 0;
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---- Atualiza o clima dos favoritos ao abrir o app ---- */

  useEffect(() => {
    let cancelled = false;

    async function refreshSavedCities() {
      const citiesToUpdate = loadSavedCities();
      const updates = new Map<string, CityWeatherSummary>();

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
      setSuggestions([]);
      setSuggestionsLoading(false);
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
    if (suggestionsFor === trimmedSearch && suggestions.length > 0) {
      selectOption(suggestions[0]);
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

    document.getElementById("inicio")?.scrollIntoView({ behavior: "smooth" });

    await loadCity(target, { remember: false });
  }

  function scrollSavedCities(direction: "left" | "right") {
    savedListRef.current?.scrollBy({
      left: direction === "right" ? 330 : -330,
      behavior: "smooth",
    });
  }

  /* ---- Valores exibidos ---- */

  const CurrentWeatherIcon = weather
    ? getWeatherIcon(weather.current.weather_code)
    : CloudSun;

  const currentTemperature = weather
    ? Math.round(weather.current.temperature_2m)
    : 23;

  const currentDescription = weather
    ? getWeatherDescription(weather.current.weather_code)
    : "Parcialmente nublado";

  const currentRainProbability = weather
    ? getCurrentRainProbability(weather)
    : 20;

  const realForecast: ForecastDay[] = weather
    ? getForecastDays(weather)
    : forecast;

  const cityLabel = [selectedCity.name, selectedCity.country]
    .filter(Boolean)
    .join(", ");

  // O horário retornado já está no fuso da cidade pesquisada.
  const referenceDate = weather ? new Date(weather.current.time) : new Date();

  const today = referenceDate.toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  return (
    <div className="weather-app">
      <header className="topbar glass-panel">
        <a className="brand" href="#inicio">
          <span className="brand-mark">
            <CloudSun />
          </span>
          <span>
            Weather <strong>Lab</strong>
          </span>
        </a>

        <nav className="navigation" aria-label="Navegação principal">
          <a className="navigation-link active" href="#inicio">
            <Home />
            Início
          </a>

          <a className="navigation-link" href="#cidades-salvas">
            <Bookmark />
            Cidades salvas
          </a>
        </nav>

        <div className="topbar-status">
          <Sun />
          <span>Clima em tempo real</span>
        </div>
      </header>

      <main className="dashboard" id="inicio">
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
                <div
                  aria-live="polite"
                  className="search-suggestions-status"
                >
                  Nenhuma cidade encontrada.
                </div>
              )}
            </div>
          )}
        </form>

        {loading && <p role="status">Buscando informações do clima...</p>}

        {errorMessage && <p role="alert">{errorMessage}</p>}

        <section className="main-weather-grid">
          <article className="current-weather glass-panel">
            <header className="current-weather-header">
              <div>
                <h1>
                  <MapPin />
                  {cityLabel}
                </h1>
                <p>{today}</p>
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

            <div className="current-weather-content">
              <div className="main-weather-icon">
                <CurrentWeatherIcon />
              </div>

              <div className="temperature-information">
                <strong>{currentTemperature}°</strong>
                <h2>{currentDescription}</h2>

                <p>
                  <span>
                    Máx.{" "}
                    {weather
                      ? Math.round(weather.daily.temperature_2m_max[0])
                      : 26}
                    °
                  </span>
                  <i />
                  <span>
                    Mín.{" "}
                    {weather
                      ? Math.round(weather.daily.temperature_2m_min[0])
                      : 17}
                    °
                  </span>
                </p>
              </div>
            </div>

            <div className="weather-details">
              <div className="weather-detail">
                <Droplets />
                <span>Umidade</span>
                <strong>
                  {weather
                    ? `${weather.current.relative_humidity_2m}%`
                    : "64%"}
                </strong>
              </div>

              <div className="weather-detail">
                <Wind />
                <span>Vento</span>
                <strong>
                  {weather
                    ? `${Math.round(weather.current.wind_speed_10m)} km/h`
                    : "14 km/h"}
                </strong>
              </div>

              <div className="weather-detail">
                <ThermometerSun />
                <span>Sensação</span>
                <strong>
                  {weather
                    ? `${Math.round(weather.current.apparent_temperature)}°`
                    : "24°"}
                </strong>
              </div>

              <div className="weather-detail">
                <CloudRain />
                <span>Chance de chuva</span>
                <strong>{currentRainProbability}%</strong>
              </div>
            </div>
          </article>

          <article className="forecast-panel glass-panel">
            <h2>Previsão para os próximos 7 dias</h2>

            <div className="forecast-list">
              {realForecast.map(({ day, max, min, rain, Icon }, index) => (
                <div
                  className={`forecast-day ${
                    index === 0 ? "forecast-day-active" : ""
                  }`}
                  key={`${day}-${index}`}
                >
                  <strong>{day}</strong>
                  <Icon className="forecast-icon" />
                  <span className="forecast-maximum">{max}°</span>
                  <span className="forecast-minimum">{min}°</span>
                  <small>
                    <Droplets />
                    {rain}%
                  </small>
                </div>
              ))}
            </div>
          </article>
        </section>

        <section className="saved-section" id="cidades-salvas">
          <header className="saved-section-header">
            <div>
              <span>Cidades favoritas</span>
              <h2>Cidades salvas</h2>
            </div>
            <p>
              {savedCities.length}{" "}
              {savedCities.length === 1 ? "cidade" : "cidades"}
            </p>
          </header>

          <div className="saved-carousel">
            <button
              aria-label="Ver cidades anteriores"
              className="carousel-button carousel-button-left"
              onClick={() => scrollSavedCities("left")}
              type="button"
            >
              <ChevronLeft />
            </button>

            <div className="saved-cities-list" ref={savedListRef}>
              {savedCities.map((city) => {
                const { name, temperature, max, min, Icon } = city;
                const isRemoving = removingKeys.includes(cityKey(city));

                return (
                  <article
                    className={`saved-city-card glass-panel ${
                      isRemoving ? "saved-city-card-removing" : ""
                    }`}
                    key={cityKey(city)}
                    onClick={() => selectSavedCity(city)}
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
                <div className="empty-cities glass-panel">
                  Nenhuma cidade salva.
                </div>
              )}
            </div>

            <button
              aria-label="Ver próximas cidades"
              className="carousel-button carousel-button-right"
              onClick={() => scrollSavedCities("right")}
              type="button"
            >
              <ChevronRight />
            </button>
          </div>

          <div className="carousel-indicators" aria-hidden="true">
            <span className="active" />
            <span />
            <span />
            <span />
          </div>
        </section>
      </main>
    </div>
  );
}

export default App;