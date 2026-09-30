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

function App() {
  const [search, setSearch] = useState("");
  const [isFavorite, setIsFavorite] = useState(false);
  const [savedCities, setSavedCities] =
    useState<SavedCity[]>(initialCities);

  const savedListRef = useRef<HTMLDivElement>(null);

  function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    // Na próxima etapa, chamaremos a API aqui.
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
        <form className="search-bar glass-panel" onSubmit={handleSearch}>
          <MapPin className="search-location-icon" />

          <input
            aria-label="Pesquisar cidade"
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Pesquisar uma cidade..."
            type="search"
            value={search}
          />

          <button aria-label="Pesquisar" type="submit">
            <Search />
          </button>
        </form>

        <section className="main-weather-grid">
          <article className="current-weather glass-panel">
            <header className="current-weather-header">
              <div>
                <h1>
                  <MapPin />
                  São Paulo, Brasil
                </h1>

                <p>Quinta-feira, 20 de agosto</p>
              </div>

              <button
                aria-label={
                  isFavorite
                    ? "Remover São Paulo dos favoritos"
                    : "Adicionar São Paulo aos favoritos"
                }
                aria-pressed={isFavorite}
                className={`favorite-button ${
                  isFavorite ? "favorite-button-active" : ""
                }`}
                onClick={() => setIsFavorite(!isFavorite)}
                type="button"
              >
                <Heart fill={isFavorite ? "currentColor" : "none"} />
              </button>
            </header>

            <div className="current-weather-content">
              <div className="main-weather-icon">
                <CloudSun />
              </div>

              <div className="temperature-information">
                <strong>23°</strong>
                <h2>Parcialmente nublado</h2>
                <p>
                  <span>Máx. 26°</span>
                  <i />
                  <span>Mín. 17°</span>
                </p>
              </div>
            </div>

            <div className="weather-details">
              <div className="weather-detail">
                <Droplets />
                <span>Umidade</span>
                <strong>64%</strong>
              </div>

              <div className="weather-detail">
                <Wind />
                <span>Vento</span>
                <strong>14 km/h</strong>
              </div>

              <div className="weather-detail">
                <ThermometerSun />
                <span>Sensação</span>
                <strong>24°</strong>
              </div>

              <div className="weather-detail">
                <CloudRain />
                <span>Chance de chuva</span>
                <strong>20%</strong>
              </div>
            </div>
          </article>

          <article className="forecast-panel glass-panel">
            <h2>Previsão para os próximos 7 dias</h2>

            <div className="forecast-list">
              {forecast.map(({ day, max, min, rain, Icon }, index) => (
                <div
                  className={`forecast-day ${
                    index === 0 ? "forecast-day-active" : ""
                  }`}
                  key={day}
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

            <div className="saved-cities-list" ref={savedListRef}>
              {savedCities.map(
                ({ name, country, temperature, max, min, Icon }) => (
                  <article className="saved-city-card glass-panel" key={name}>
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

interface GeoCodingResult {
  name: string;
  country: string;
  latitude: number;
  longitude: number;
}

interface WeatherResponse{
  current: {
    temperature_2m: number;
    relative_humidity_2m: number;
    apparent_temperature_2m: number;
    preciptation_probability: number;
    wind_speed_10m: number;
    weather_code: number;
  };
}