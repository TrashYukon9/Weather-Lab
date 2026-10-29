import { useEffect, useState, type CSSProperties } from "react";

import { Clock, HeartPulse, MapPin, RefreshCw } from "lucide-react";

import type { TranslationKey } from "../i18n/translations";
import { useI18n } from "../i18n/useI18n";

import "./AirQualityPage.css";

/* ------------------------------------------------------------------------ */
/* Tipos e constantes                                                       */
/* ------------------------------------------------------------------------ */

// A página só precisa destes campos da cidade (a GeocodingResult do App.tsx já serve).
interface AirQualityCity {
  name: string;

  country: string;

  latitude: number;

  longitude: number;
}

interface AirQualityPageProps {
  city: AirQualityCity;

  // Aumenta quando o usuário pede "atualizar" (ou na atualização automática).
  refreshKey: number;
}

interface AqiLevel {
  max: number; // maior valor do AQI que ainda pertence a este nível
  labelKey: TranslationKey;
  color: string;
  adviceKey: TranslationKey;
}

// Níveis do AQI dos EUA (0 a 500). Cada faixa tem uma cor e uma orientação.
const AQI_LEVELS: AqiLevel[] = [
  { max: 50, labelKey: "aq.level.good", color: "#63f59f", adviceKey: "aq.advice.good" },
  { max: 100, labelKey: "aq.level.moderate", color: "#ffd260", adviceKey: "aq.advice.moderate" },
  { max: 150, labelKey: "aq.level.sensitive", color: "#ffa45c", adviceKey: "aq.advice.sensitive" },
  { max: 200, labelKey: "aq.level.unhealthy", color: "#ff7a8a", adviceKey: "aq.advice.unhealthy" },
  { max: 300, labelKey: "aq.level.veryUnhealthy", color: "#c58bff", adviceKey: "aq.advice.veryUnhealthy" },
  { max: 500, labelKey: "aq.level.hazardous", color: "#ff5fa2", adviceKey: "aq.advice.hazardous" },
];

// Poluentes exibidos. "key" é a concentração; "aqiKey" é o AQI individual dele
// (usado para colorir o cartão). Os nomes são os da API Open-Meteo.
const POLLUTANTS = [
  {
    key: "pm2_5",
    aqiKey: "us_aqi_pm2_5",
    symbol: "PM2,5",
    nameKey: "aq.pollutant.pm25",
  },
  {
    key: "pm10",
    aqiKey: "us_aqi_pm10",
    symbol: "PM10",
    nameKey: "aq.pollutant.pm10",
  },
  {
    key: "ozone",
    aqiKey: "us_aqi_ozone",
    symbol: "O₃",
    nameKey: "aq.pollutant.o3",
  },
  {
    key: "nitrogen_dioxide",
    aqiKey: "us_aqi_nitrogen_dioxide",
    symbol: "NO₂",
    nameKey: "aq.pollutant.no2",
  },
  {
    key: "sulphur_dioxide",
    aqiKey: "us_aqi_sulphur_dioxide",
    symbol: "SO₂",
    nameKey: "aq.pollutant.so2",
  },
  {
    key: "carbon_monoxide",
    aqiKey: "us_aqi_carbon_monoxide",
    symbol: "CO",
    nameKey: "aq.pollutant.co",
  },
] as const;

const POLLUTANT_UNIT = "µg/m³";

const HOURS_IN_CHART = 24;

type Pollutant = (typeof POLLUTANTS)[number];

// O TypeScript monta este tipo a partir da lista acima:
// { pm2_5: number | null, us_aqi_pm2_5: number | null, ... }
type PollutantValues = Record<
  Pollutant["key"] | Pollutant["aqiKey"],
  number | null
>;

interface AirQualityResponse {
  current: PollutantValues & {
    time: string;

    us_aqi: number | null;
  };

  hourly: {
    time: string[];

    us_aqi: (number | null)[];
  };
}

// Guarda a resposta junto com a "chave" do pedido que a gerou.
// data === null significa que o pedido falhou.
interface AirQualityResult {
  requestKey: string;

  data: AirQualityResponse | null;
}

interface HourlyPoint {
  hour: string;

  aqi: number | null;
}

// Lista de variáveis pedidas à API, montada a partir de POLLUTANTS.
const CURRENT_VARIABLES = [
  "us_aqi",

  ...POLLUTANTS.flatMap((pollutant) => [pollutant.key, pollutant.aqiKey]),
].join(",");

/* ------------------------------------------------------------------------ */
/* Utilidades                                                               */
/* ------------------------------------------------------------------------ */

async function getAirQuality(
  latitude: number,

  longitude: number,

  signal: AbortSignal,
): Promise<AirQualityResponse> {
  const response = await fetch(
    `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${latitude}&longitude=${longitude}&current=${CURRENT_VARIABLES}&hourly=us_aqi&forecast_days=2&timezone=auto`,

    { signal },
  );

  if (!response.ok) {
    throw new Error("Não foi possível buscar a qualidade do ar.");
  }

  return response.json();
}

function getAqiLevel(aqi: number | null): AqiLevel | null {
  if (aqi === null) return null;

  return (
    AQI_LEVELS.find((level) => aqi <= level.max) ??
    AQI_LEVELS[AQI_LEVELS.length - 1]
  );
}

// Posição (em %) do marcador na escala. Cada nível ocupa o mesmo espaço,
// e o marcador anda dentro da faixa do nível em que o AQI está.
function getScalePosition(aqi: number): number {
  const found = AQI_LEVELS.findIndex((level) => aqi <= level.max);

  const index = found === -1 ? AQI_LEVELS.length - 1 : found;

  const start = index === 0 ? 0 : AQI_LEVELS[index - 1].max;

  const progress = Math.min((aqi - start) / (AQI_LEVELS[index].max - start), 1);

  const position = ((index + progress) / AQI_LEVELS.length) * 100;

  return Math.min(Math.max(position, 2), 98);
}

// Passa a cor do nível para o CSS através de uma variável (--level-color).
function levelStyle(level: AqiLevel | null): CSSProperties {
  return { "--level-color": level?.color ?? "#9db0bd" } as CSSProperties;
}

function formatValue(value: number | null, locale: string): string {
  return value === null
    ? "—"
    : value.toLocaleString(locale, { maximumFractionDigits: 1 });
}

// Pega as próximas 24 horas, começando na hora atual.
function getNextHours(data: AirQualityResponse): HourlyPoint[] {
  const currentHour = data.current.time.slice(0, 13);

  const start = Math.max(
    data.hourly.time.findIndex((time) => time.slice(0, 13) === currentHour),

    0,
  );

  return data.hourly.time
    .slice(start, start + HOURS_IN_CHART)

    .map((time, index) => ({
      hour: `${time.slice(11, 13)}h`,

      aqi: data.hourly.us_aqi[start + index] ?? null,
    }));
}

/* ------------------------------------------------------------------------ */
/* Pequenos componentes                                                     */
/* ------------------------------------------------------------------------ */

// Barra com os 6 níveis e um marcador mostrando onde o AQI atual está.
function AqiScale({ aqi }: { aqi: number }) {
  const { t } = useI18n();

  return (
    <div className="air-scale" aria-hidden="true">
      <div className="air-scale-track">
        {AQI_LEVELS.map((level) => (
          <span key={level.max} style={{ background: level.color }} />
        ))}

        <i
          className="air-scale-marker"
          style={{ left: `${getScalePosition(aqi)}%` }}
        />
      </div>

      <div className="air-scale-labels">
        <span>{t("aq.level.good")}</span>

        <span>{t("aq.level.hazardous")}</span>
      </div>
    </div>
  );
}

// Gráfico de barras do AQI nas próximas 24 horas.
function HourlyChart({ points }: { points: HourlyPoint[] }) {
  const { t } = useI18n();

  const valid = points.filter(
    (point): point is HourlyPoint & { aqi: number } => point.aqi !== null,
  );

  if (valid.length === 0) {
    return (
      <p className="air-empty">
        {t("aq.noHourly")}
      </p>
    );
  }

  // A escala vai pelo menos até 100, para barras baixas não parecerem altas.
  const scaleMax = Math.max(100, ...valid.map((point) => point.aqi));

  const best = valid.reduce((a, b) => (b.aqi < a.aqi ? b : a));

  const worst = valid.reduce((a, b) => (b.aqi > a.aqi ? b : a));

  return (
    <>
      <div
        className="air-chart"
        role="img"
        aria-label={t("aq.chartLabel")}
      >
        {points.map((point, index) => {
          const level = getAqiLevel(point.aqi);

          const height =
            point.aqi === null ? 0 : Math.max((point.aqi / scaleMax) * 100, 4);

          const tooltip = `${point.hour}: ${
            point.aqi === null ? t("common.noData") : `AQI ${point.aqi}`
          }${level ? `, ${t(level.labelKey)}` : ""}`;

          return (
            <div
              className="air-chart-column"
              key={`${point.hour}-${index}`}
              title={tooltip}
            >
              <div className="air-chart-area">
                <span
                  className="air-chart-bar"
                  style={{
                    ...levelStyle(level),

                    height: `${height}%`,

                    animationDelay: `${index * 25}ms`,
                  }}
                />
              </div>

              <small>
                {index === 0 ? t("common.now") : index % 3 === 0 ? point.hour : ""}
              </small>
            </div>
          );
        })}
      </div>

      <div className="air-forecast-summary">
        <span>
          {t("aq.bestHour")}: <strong>{best.hour}</strong>, AQI {best.aqi}
        </span>

        <span>
          {t("aq.worstHour")}: <strong>{worst.hour}</strong>, AQI {worst.aqi}
        </span>
      </div>
    </>
  );
}

function PollutantCard({
  pollutant,

  value,

  aqi,
}: {
  pollutant: Pollutant;

  value: number | null;

  aqi: number | null;
}) {
    const { t, locale } = useI18n();

  const level = getAqiLevel(aqi);

  return (
    <article className="pollutant-card glass-panel" style={levelStyle(level)}>
      <header>
        <span className="pollutant-symbol">{pollutant.symbol}</span>

        <span className="pollutant-level">{level ? t(level.labelKey) : t("common.noData")}</span>
      </header>

      <strong>
        {formatValue(value, locale)}

        {value !== null && <small>{POLLUTANT_UNIT}</small>}
      </strong>

      <p>{t(pollutant.nameKey)}</p>
    </article>
  );
}

// Todo o conteúdo que depende dos dados já carregados.
function AirQualityContent({ data }: { data: AirQualityResponse }) {
  const { t } = useI18n();

  const aqi =
    data.current.us_aqi === null ? null : Math.round(data.current.us_aqi);

  const level = getAqiLevel(aqi);

  return (
    <>
      <div className="air-grid">
        <article className="air-current glass-panel" style={levelStyle(level)}>
          <h2 className="air-card-title">{t("aq.current")}</h2>

          <div className="air-index">
            <div className="air-badge">
              <strong>{aqi ?? "—"}</strong>

              <span>AQI</span>
            </div>

            <div className="air-summary">
              <h3>{level ? t(level.labelKey) : t("common.noData")}</h3>

              <p className="air-advice">
                <HeartPulse aria-hidden="true" />

                <span>
                  {level ? t(level.adviceKey) : t("aq.noData")}
                </span>
              </p>
            </div>
          </div>

          {aqi !== null && <AqiScale aqi={aqi} />}
        </article>

        <article className="air-forecast glass-panel">
          <h2 className="air-card-title">{t("aq.next24")}</h2>

          <HourlyChart points={getNextHours(data)} />
        </article>
      </div>

      <header className="air-section-header">
        <h2>{t("aq.pollutants")}</h2>

        <p>{t("aq.concentration")}</p>
      </header>

      <div className="air-pollutants">
        {POLLUTANTS.map((pollutant) => (
          <PollutantCard
            key={pollutant.key}
            pollutant={pollutant}
            value={data.current[pollutant.key]}
            aqi={data.current[pollutant.aqiKey]}
          />
        ))}
      </div>

      <p className="air-footnote">
        {t("aq.footnote")}
      </p>
    </>
  );
}

/* ------------------------------------------------------------------------ */
/* Página                                                                   */
/* ------------------------------------------------------------------------ */

function AirQualityPage({ city, refreshKey }: AirQualityPageProps) {
  const { t } = useI18n();

  // "attempt" aumenta a cada clique em "Tentar novamente" e refaz o pedido.
  const [attempt, setAttempt] = useState(0);

  const [result, setResult] = useState<AirQualityResult | null>(null);

  // Identifica o pedido atual (cidade + tentativa).
  const requestKey = `${city.latitude},${city.longitude},${attempt},${refreshKey}`;

  useEffect(() => {
    const controller = new AbortController();

    getAirQuality(city.latitude, city.longitude, controller.signal)
      .then((data) => setResult({ requestKey, data }))

      .catch((error: unknown) => {
        if ((error as Error).name === "AbortError") return;

        console.error("Erro ao buscar a qualidade do ar:", error);

        setResult({ requestKey, data: null });
      });

    // Se a cidade mudar no meio do pedido, cancela o antigo.
    return () => controller.abort();
  }, [city.latitude, city.longitude, requestKey]);

  // Só vale a resposta que pertence ao pedido atual; senão, está carregando.
  const currentResult = result?.requestKey === requestKey ? result : null;

  const isLoading = currentResult === null;

  const data = currentResult?.data ?? null;

  const cityLabel = [city.name, city.country].filter(Boolean).join(", ");

  const updatedAt = data ? data.current.time.slice(11, 16) : null;

  return (
    <section className="air-page" aria-labelledby="air-page-title">
      <header className="air-header">
        <h1 id="air-page-title">{t("nav.air")}</h1>

        <p className="air-meta">
          <span>
            <MapPin aria-hidden="true" />

            {cityLabel}
          </span>

          {updatedAt && (
            <span>
              <Clock aria-hidden="true" />
              {t("common.dataAt", { time: updatedAt })}
            </span>
          )}
        </p>
      </header>

      {isLoading && (
        <p className="air-status" role="status">
          {t("aq.loading")}
        </p>
      )}

      {!isLoading && !data && (
        <div className="air-error glass-panel" role="alert">
          <p>
            {t("aq.error")}
          </p>

          <button type="button" onClick={() => setAttempt((n) => n + 1)}>
            <RefreshCw aria-hidden="true" />
            {t("common.retry")}
          </button>
        </div>
      )}

      {data && <AirQualityContent data={data} />}
    </section>
  );
}

export default AirQualityPage;
