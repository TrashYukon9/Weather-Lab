
import { useRef, useState, type FormEvent } from "react";

import {
  Bookmark,
  ChevronLeft,
  ChevronRight,
  Cloud,
  CloudRain,
  CloudSun,
  Droplets,
  Heart,
  Home,
  MapPin,
  Moon,
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
  temperature: number;
  max: number;
  min: number;
  Icon: LucideIcon;
}

interface GeocodingResult {
  name: string;
  country: string;
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
}

const forecast: ForecastDay[] = [
  { day: "Hoje", max: 26, min: 17, rain: 20, Icon: CloudSun },
  { day: "Sex", max: 27, min: 18, rain: 10, Icon: Sun },
  { day: "Sáb", max: 24, min: 16, rain: 60, Icon: CloudRain },
  { day: "Dom", max: 25, min: 17, rain: 20, Icon: CloudSun },
  { day: "Seg", max: 27, min: 18, rain: 10, Icon: Sun },
  { day: "Ter", max: 24, min: 16, rain: 40, Icon: CloudRain },
  { day: "Qua", max: 23, min: 15, rain: 20, Icon: Cloud },
];

const initialCities: SavedCity[] = [
  {
    name: "Toronto",
    country: "Canadá",
    temperature: 18,
    max: 21,
    min: 13,
    Icon: Cloud,
  },
  {
    name: "Tóquio",
    country: "Japão",
    temperature: 22,
    max: 26,
    min: 19,
    Icon: Moon,
  },
  {
    name: "Paris",
    country: "França",
    temperature: 19,
    max: 23,
    min: 12,
    Icon: CloudSun,
  },
  {
    name: "Londres",
    country: "Reino Unido",
    temperature: 16,
    max: 19,
    min: 11,
    Icon: CloudRain,
  },
];

async function searchCity(
  city: string,
): Promise<GeocodingResult | null> {
  const response = await fetch(
    `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(
      city,
    )}&count=1&language=pt&format=json`,
  );

  if (!response.ok) {
    throw new Error("Não foi possível buscar a cidade.");
  }

  const data = await response.json();

  if (!data.results || data.results.length === 0) {
    return null;
  }

  const result = data.results[0];

  return {
    name: result.name,
    country: result.country,
    latitude: result.latitude,
    longitude: result.longitude,
  };
}

async function getWeather(
  latitude: number,
  longitude: number,
): Promise<WeatherResponse> {
  const response = await fetch(
    `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,relative_humidity_2m,apparent_temperature,wind_speed_10m,weather_code&hourly=precipitation_probability&forecast_days=1&timezone=auto`,
  );

  if (!response.ok) {
    throw new Error("Não foi possível buscar o clima.");
  }

  return response.json();
}

function getWeatherDescription(code: number): string {
  if (code === 0) return "Céu limpo";
  if (code === 1) return "Predominantemente limpo";
  if (code === 2) return "Parcialmente nublado";
  if (code === 3) return "Nublado";
  if (code === 45 || code === 48) return "Neblina";

  if (code >= 51 && code <= 57) {
    return "Garoa";
  }

  if (code >= 61 && code <= 67) {
    return "Chuva";
  }

  if (code >= 71 && code <= 77) {
    return "Neve";
  }

  if (code >= 80 && code <= 82) {
    return "Pancadas de chuva";
  }

  if (code >= 85 && code <= 86) {
    return "Pancadas de neve";
  }

  if (code >= 95) {
    return "Tempestade";
  }

  return "Condição meteorológica variável";
}

function getWeatherIcon(code: number): LucideIcon {
  if (code === 0) return Sun;
  if (code === 1 || code === 2) return CloudSun;
  if (code === 3 || code === 45 || code === 48) return Cloud;
  if (code >= 51) return CloudRain;

  return CloudSun;
}

function App() {
  const [search, setSearch] = useState("");
  const [isFavorite, setIsFavorite] = useState(false);
  const [savedCities, setSavedCities] =
    useState<SavedCity[]>(initialCities);

  const [weather, setWeather] =
    useState<WeatherResponse | null>(null);

  const [selectedCity, setSelectedCity] =
    useState<GeocodingResult | null>(null);

  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const savedListRef = useRef<HTMLDivElement>(null);

  async function handleSearch(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    const city = search.trim();

    if (!city) return;

    setLoading(true);
    setErrorMessage("");
    setWeather(null);

    try {
      const cityResult = await searchCity(city);

      if (!cityResult) {
        setSelectedCity(null);
        setErrorMessage(
          "Cidade não encontrada. Tente outro nome.",
        );
        return;
      }

      const weatherResult = await getWeather(
        cityResult.latitude,
        cityResult.longitude,
      );

      setSelectedCity(cityResult);
      setWeather(weatherResult);
      setIsFavorite(false);
    } catch (error) {
      console.error("Erro ao buscar o clima:", error);

      setErrorMessage(
        "Não foi possível consultar o clima. Tente novamente.",
      );
    } finally {
      setLoading(false);
    }
  }

  function removeCity(cityName: string) {
    setSavedCities((currentCities) =>
      currentCities.filter((city) => city.name !== cityName),
    );
  }

  function scrollSavedCities(direction: "left" | "right") {
    savedListRef.current?.scrollBy({
      left: direction === "right" ? 330 : -330,
      behavior: "smooth",
    });
  }

  const currentWeatherIcon = weather
    ? getWeatherIcon(weather.current.weather_code)
    : CloudSun;

  const currentTemperature = weather
    ? Math.round(weather.current.temperature_2m)
    : 23;

  const currentDescription = weather
    ? getWeatherDescription(weather.current.weather_code)
    : "Parcialmente nublado";

  const currentRainProbability = weather
    ? (() => {
        const index = weather.hourly.time.indexOf(
          weather.current.time,
        );

        return index >= 0
          ? weather.hourly.precipitation_probability[index]
          : 0;
      })()
    : 20;

  const cityName = selectedCity?.name ?? "São Paulo";
  const countryName = selectedCity?.country ?? "Brasil";

  const today = new Date().toLocaleDateString("pt-BR", {
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

        <nav
          className="navigation"
          aria-label="Navegação principal"
        >
          <a className="navigation-link active" href="#inicio">
            <Home />
            Início
          </a>

          <a
            className="navigation-link"
            href="#cidades-salvas"
          >
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
          onSubmit={handleSearch}
        >
          <MapPin className="search-location-icon" />

          <input
            aria-label="Pesquisar cidade"
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Pesquisar uma cidade..."
            type="search"
            value={search}
          />

          <button
            aria-label="Pesquisar"
            type="submit"
            disabled={loading}
          >
            <Search />
          </button>
        </form>

        {loading && (
          <p role="status">
            Buscando informações do clima...
          </p>
        )}

        {errorMessage && (
          <p role="alert">{errorMessage}</p>
        )}

        <section className="main-weather-grid">
          <article className="current-weather glass-panel">
            <header className="current-weather-header">
              <div>
                <h1>
                  <MapPin />
                  {cityName}, {countryName}
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
                onClick={() => setIsFavorite(!isFavorite)}
                type="button"
              >
                <Heart
                  fill={isFavorite ? "currentColor" : "none"}
                />
              </button>
            </header>

            <div className="current-weather-content">
              <div className="main-weather-icon">
                {(() => {
                  const Icon = currentWeatherIcon;
                  return <Icon />;
                })()}
              </div>

              <div className="temperature-information">
                <strong>{currentTemperature}°</strong>

                <h2>{currentDescription}</h2>

                <p>
                  <span>
                    Máx. {weather ? "--" : "26"}°
                  </span>
                  <i />
                  <span>
                    Mín. {weather ? "--" : "17"}°
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
                    ? `${Math.round(
                        weather.current.wind_speed_10m,
                      )} km/h`
                    : "14 km/h"}
                </strong>
              </div>

              <div className="weather-detail">
                <ThermometerSun />
                <span>Sensação</span>
                <strong>
                  {weather
                    ? `${Math.round(
                        weather.current.apparent_temperature,
                      )}°`
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
              {forecast.map(
                ({ day, max, min, rain, Icon }, index) => (
                  <div
                    className={`forecast-day ${
                      index === 0 ? "forecast-day-active" : ""
                    }`}
                    key={day}
                  >
                    <strong>{day}</strong>

                    <Icon className="forecast-icon" />

                    <span className="forecast-maximum">
                      {max}°
                    </span>

                    <span className="forecast-minimum">
                      {min}°
                    </span>

                    <small>
                      <Droplets />
                      {rain}%
                    </small>
                  </div>
                ),
              )}
            </div>
          </article>
        </section>

        <section
          className="saved-section"
          id="cidades-salvas"
        >
          <header className="saved-section-header">
            <div>
              <span>Cidades favoritas</span>
              <h2>Cidades salvas</h2>
            </div>

            <p>{savedCities.length} cidades</p>
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

            <div
              className="saved-cities-list"
              ref={savedListRef}
            >
              {savedCities.map(
                ({
                  name,
                  country,
                  temperature,
                  max,
                  min,
                  Icon,
                }) => (
                  <article
                    className="saved-city-card glass-panel"
                    key={name}
                  >
                    <header>
                      <div>
                        <h3>{name}</h3>
                        <p>{country}</p>
                      </div>

                      <button
                        aria-label={`Remover ${name} dos favoritos`}
                        onClick={() => removeCity(name)}
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
                ),
              )}

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

          <div
            className="carousel-indicators"
            aria-hidden="true"
          >
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
