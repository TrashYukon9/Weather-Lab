import {
  useEffect,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";

import {
  Clock,
  CloudLightning,
  CloudRain,
  Droplets,
  Eye,
  Gauge,
  MapPin,
  Minus,
  Moon,
  RefreshCw,
  Sun,
  Sunset,
  TrendingDown,
  TrendingUp,
  Wind,
  type LucideIcon,
} from "lucide-react";

import type { TranslationKey } from "../i18n/translations";
import { useI18n } from "../i18n/useI18n";
import { useUnits } from "../settings/units";

import "./ForecastPage.css";

/* ------------------------------------------------------------------------ */
/* Tipos e constantes                                                       */
/* ------------------------------------------------------------------------ */

// A página só precisa destes campos da cidade (a GeocodingResult do App.tsx já serve).
interface ForecastCity {
  name: string;

  country: string;

  latitude: number;

  longitude: number;
}

interface ForecastPageProps {
  city: ForecastCity;

  // Aumenta quando o usuário pede "atualizar" (ou na atualização automática).
  refreshKey: number;
}

interface ForecastResponse {
  utc_offset_seconds: number;

  current: {
    time: string;

    relative_humidity_2m: number;

    pressure_msl: number;

    cloud_cover: number;

    precipitation: number;

    wind_speed_10m: number;

    wind_direction_10m: number;

    wind_gusts_10m: number;
  };

  hourly: {
    time: string[];

    uv_index: (number | null)[];

    visibility: (number | null)[];

    dew_point_2m: (number | null)[];

    precipitation_probability: (number | null)[];

    precipitation: (number | null)[];

    weather_code: (number | null)[];

    pressure_msl: (number | null)[];

    wind_gusts_10m: (number | null)[];
  };

  daily: {
    time: string[];

    sunrise: (string | null)[];

    sunset: (string | null)[];

    daylight_duration: (number | null)[];

    uv_index_max: (number | null)[];

    precipitation_sum: (number | null)[];

    precipitation_hours: (number | null)[];

    wind_gusts_10m_max: (number | null)[];

    wind_direction_10m_dominant: (number | null)[];
  };
}

// Guarda a resposta junto com a "chave" do pedido que a gerou.
// data === null significa que o pedido falhou.
interface ForecastResult {
  requestKey: string;

  data: ForecastResponse | null;
}

// Um ponto por hora, já organizado para os cartões usarem.
interface HourPoint {
  time: string;

  uv: number | null;

  visibility: number | null;

  dewPoint: number | null;

  probability: number | null;

  precipitation: number | null;

  code: number | null;

  pressure: number | null;

  gust: number | null;
}

interface Level {
  max: number;
  labelKey: TranslationKey;
  color: string;
  adviceKey: TranslationKey;
}

const FORECAST_QUERY = [
  "current=relative_humidity_2m,pressure_msl,cloud_cover,precipitation,wind_speed_10m,wind_direction_10m,wind_gusts_10m",

  "hourly=uv_index,visibility,dew_point_2m,precipitation_probability,precipitation,weather_code,pressure_msl,wind_gusts_10m",

  "daily=sunrise,sunset,daylight_duration,uv_index_max,precipitation_sum,precipitation_hours,wind_gusts_10m_max,wind_direction_10m_dominant",

  "forecast_days=2",

  "timezone=auto",
].join("&");

const HOURS_AHEAD = 24;

// Escala internacional do índice UV.
const UV_LEVELS: Level[] = [
  { max: 2, labelKey: "fc.uv.low", color: "#63f59f", adviceKey: "fc.uv.lowAdvice" },
  { max: 5, labelKey: "fc.uv.moderate", color: "#ffd260", adviceKey: "fc.uv.moderateAdvice" },
  { max: 7, labelKey: "fc.uv.high", color: "#ffa45c", adviceKey: "fc.uv.highAdvice" },
  { max: 10, labelKey: "fc.uv.veryHigh", color: "#ff7a8a", adviceKey: "fc.uv.veryHighAdvice" },
  { max: Infinity, labelKey: "fc.uv.extreme", color: "#c58bff", adviceKey: "fc.uv.extremeAdvice" },
];

const DIRECTION_KEYS: TranslationKey[] = ["dir.n", "dir.ne", "dir.e", "dir.se", "dir.s", "dir.sw", "dir.w", "dir.nw"];

const SYNODIC_MONTH = 29.530588853; // dias entre duas luas novas

const KNOWN_NEW_MOON = Date.UTC(2000, 0, 6, 18, 14); // uma lua nova de referência

const MOON_PHASES: TranslationKey[] = ["moon.new", "moon.waxingCrescent", "moon.firstQuarter", "moon.waxingGibbous", "moon.full", "moon.waningGibbous", "moon.lastQuarter", "moon.waningCrescent"];

/* ------------------------------------------------------------------------ */
/* Utilidades                                                               */
/* ------------------------------------------------------------------------ */

async function getForecast(
  latitude: number,

  longitude: number,

  signal: AbortSignal,
): Promise<ForecastResponse> {
  const response = await fetch(
    `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&${FORECAST_QUERY}`,

    { signal },
  );

  if (!response.ok) {
    throw new Error("Não foi possível buscar a previsão.");
  }

  return response.json();
}

// Passa a cor do nível para o CSS através de uma variável (--level-color).
function levelStyle(color: string): CSSProperties {
  return { "--level-color": color } as CSSProperties;
}

function formatNumber(value: number, locale: string): string {
  return value.toLocaleString(locale, { maximumFractionDigits: 1 });
}

function hourLabel(time: string): string {
  return `${time.slice(11, 13)}h`;
}

// Os horários da API são da cidade, sem fuso. Tratamos todos como UTC só para
// poder subtrair um do outro (a diferença continua correta).
function toMinutes(time: string): number {
  return Date.parse(`${time}Z`) / 60000;
}

function formatMinutes(minutes: number): string {
  const total = Math.round(minutes);

  const hours = Math.floor(total / 60);

  return hours > 0 ? `${hours}h ${total % 60}min` : `${total}min`;
}

function getDirectionKey(degrees: number): TranslationKey {
  return DIRECTION_KEYS[Math.round(degrees / 45) % 8];
}

function getHourIndex(data: ForecastResponse): number {
  const currentHour = data.current.time.slice(0, 13);

  return Math.max(
    data.hourly.time.findIndex((time) => time.slice(0, 13) === currentHour),

    0,
  );
}

// Próximas 24 horas, começando na hora atual (hours[0] = agora).
function getNextHours(data: ForecastResponse): HourPoint[] {
  const start = getHourIndex(data);

  const { hourly } = data;

  return hourly.time.slice(start, start + HOURS_AHEAD).map((time, offset) => {
    const index = start + offset;

    return {
      time,

      uv: hourly.uv_index[index] ?? null,

      visibility: hourly.visibility[index] ?? null,

      dewPoint: hourly.dew_point_2m[index] ?? null,

      probability: hourly.precipitation_probability[index] ?? null,

      precipitation: hourly.precipitation[index] ?? null,

      code: hourly.weather_code[index] ?? null,

      pressure: hourly.pressure_msl[index] ?? null,

      gust: hourly.wind_gusts_10m[index] ?? null,
    };
  });
}

function getMoonInfo(data: ForecastResponse) {
  // Instante atual em UTC: horário da cidade menos o fuso dela.
  const nowUtc =
    Date.parse(`${data.current.time}Z`) - data.utc_offset_seconds * 1000;

  const days = (nowUtc - KNOWN_NEW_MOON) / 86400000;

  const age = ((days % SYNODIC_MONTH) + SYNODIC_MONTH) % SYNODIC_MONTH;

  const phase = age / SYNODIC_MONTH; // 0 = nova, 0,5 = cheia

  return {
    phase,

    nameKey: MOON_PHASES[Math.round(phase * 8) % 8],

    illumination: (1 - Math.cos(2 * Math.PI * phase)) / 2,

    daysToFull: (SYNODIC_MONTH / 2 - age + SYNODIC_MONTH) % SYNODIC_MONTH,
  };
}

function getUvLevel(uv: number): Level {
  const rounded = Math.round(uv);

  return UV_LEVELS.find((level) => rounded <= level.max) ?? UV_LEVELS[4];
}

// Conforto do ar segundo o ponto de orvalho (°C).
function getComfort(dewPoint: number | null): { labelKey: TranslationKey; color: string } {
  if (dewPoint === null) return { labelKey: "common.noData", color: "#9db0bd" };
  if (dewPoint < 10) return { labelKey: "fc.comfort.dry", color: "#81c8ff" };
  if (dewPoint < 16) return { labelKey: "fc.comfort.comfortable", color: "#63f59f" };
  if (dewPoint < 21) return { labelKey: "fc.comfort.slightlyHumid", color: "#ffd260" };
  if (dewPoint < 24) return { labelKey: "fc.comfort.muggy", color: "#ffa45c" };
  return { labelKey: "fc.comfort.oppressive", color: "#ff7a8a" };
}

function getVisibilityKey(km: number): TranslationKey {
  if (km >= 10) return "fc.vis.excellent";
  if (km >= 5) return "fc.vis.good";
  if (km >= 2) return "fc.vis.reduced";
  if (km >= 1) return "fc.vis.low";
  return "fc.vis.veryLow";
}

function getCloudKey(cover: number): TranslationKey {
  if (cover < 10) return "fc.cloud.clear";
  if (cover < 30) return "fc.cloud.few";
  if (cover < 60) return "fc.cloud.partly";
  if (cover < 90) return "fc.cloud.mostly";
  return "fc.cloud.overcast";
}

/* ------------------------------------------------------------------------ */
/* Peças reutilizáveis                                                      */
/* ------------------------------------------------------------------------ */

// Moldura de todos os cartões: vidro, ícone e título.
function Card({
  title,

  Icon,

  className = "",

  style,

  children,
}: {
  title: string;

  Icon: LucideIcon;

  className?: string;

  style?: CSSProperties;

  children: ReactNode;
}) {
  return (
    <article className={`fc-card glass-panel ${className}`} style={style}>
      <h2 className="fc-card-title">
        <Icon aria-hidden="true" />

        {title}
      </h2>

      {children}
    </article>
  );
}

// Bússola: a seta fica na borda, apontando de onde o vento vem.
function Compass({ speed, unit, direction, label }: { speed: string; unit: string; direction: number; label: string }) {
  const { t } = useI18n();
  return (
    <svg className="fc-compass" viewBox="0 0 160 160" role="img" aria-label={label}>
      <circle className="fc-compass-disc" cx="80" cy="80" r="62" />
      {Array.from({ length: 36 }, (_, index) => {
        const angle = (index * 10 * Math.PI) / 180;
        const isLong = index % 9 === 0;
        const inner = isLong ? 62 : 66;
        return (
          <line key={index} className={isLong ? "fc-tick fc-tick-long" : "fc-tick"}
            x1={80 + 70 * Math.sin(angle)} y1={80 - 70 * Math.cos(angle)}
            x2={80 + inner * Math.sin(angle)} y2={80 - inner * Math.cos(angle)} />
        );
      })}
      <text className="fc-compass-letter" x="80" y="40" textAnchor="middle">{t("dir.short.n")}</text>
      <text className="fc-compass-letter" x="120" y="80" textAnchor="middle">{t("dir.short.e")}</text>
      <text className="fc-compass-letter" x="80" y="120" textAnchor="middle">{t("dir.short.s")}</text>
      <text className="fc-compass-letter" x="40" y="80" textAnchor="middle">{t("dir.short.w")}</text>
      <g className="fc-compass-arrow" style={{ transform: `rotate(${direction}deg)`, transformOrigin: "80px 80px" }}>
        <circle cx="80" cy="10" r="4.5" />
        <line x1="80" y1="14" x2="80" y2="24" />
        <polygon points="80,31 75,22 85,22" />
      </g>
      <text className="fc-compass-value" x="80" y="82" textAnchor="middle">{speed}</text>
      <text className="fc-compass-unit" x="80" y="98" textAnchor="middle">{unit}</text>
    </svg>
  );
}

// Mini gráfico de linha (usado na pressão).
function Sparkline({ values }: { values: number[] }) {
  const min = Math.min(...values);

  const max = Math.max(...values);

  const points = values.map((value, index) => {
    const x = (index / (values.length - 1)) * 100;

    const y = max === min ? 20 : 36 - ((value - min) / (max - min)) * 32;

    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  return (
    <svg
      className="fc-spark"
      viewBox="0 0 100 40"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <polygon className="fc-spark-area" points={`0,40 ${points.join(" ")} 100,40`} />

      <polyline className="fc-spark-line" points={points.join(" ")} />
    </svg>
  );
}

// Lua desenhada em SVG. A parte iluminada é um semicírculo + metade de uma elipse.
function MoonDisc({ phase, flip }: { phase: number; flip: boolean }) {
  const radius = 40;

  const cosine = Math.cos(phase * 2 * Math.PI);

  const terminatorRadius = Math.abs(cosine) * radius;

  const waxing = phase < 0.5;

  const outerSweep = waxing ? 1 : 0;

  const innerSweep = waxing ? (cosine > 0 ? 0 : 1) : cosine > 0 ? 1 : 0;

  const lit = `M 0 ${-radius} A ${radius} ${radius} 0 0 ${outerSweep} 0 ${radius} A ${terminatorRadius} ${radius} 0 0 ${innerSweep} 0 ${-radius} Z`;

  return (
    <svg className="fc-moon" viewBox="-44 -44 88 88" aria-hidden="true">
      <circle className="fc-moon-dark" r={radius} />

      {/* No hemisfério sul a Lua aparece "espelhada". */}
      <g transform={flip ? "scale(-1 1)" : undefined}>
        <path className="fc-moon-lit" d={lit} />
      </g>
    </svg>
  );
}

/* ------------------------------------------------------------------------ */
/* Cartões                                                                  */
/* ------------------------------------------------------------------------ */

function WindCard({ data }: { data: ForecastResponse }) {
  const { t } = useI18n();
  const units = useUnits();
  const { wind_speed_10m, wind_direction_10m, wind_gusts_10m } = data.current;
  const dominant = data.daily.wind_direction_10m_dominant[0] ?? null;
  const maxGust = data.daily.wind_gusts_10m_max[0] ?? null;
  const speed = units.windParts(wind_speed_10m);
  const from = t("fc.windFrom", { direction: t(getDirectionKey(wind_direction_10m)).toLowerCase() });

  return (
    <Card title={t("fc.wind")} Icon={Wind} className="fc-wind">
      <div className="fc-wind-body">
        <div className="fc-compass-wrap">
          <Compass speed={speed.value} unit={speed.unit} direction={wind_direction_10m} label={`${from}, ${speed.value} ${speed.unit}`} />
          <p className="fc-wind-from">{from}</p>
        </div>
        <ul className="fc-stats">
          <li><span>{t("fc.gustNow")}</span><strong>{units.wind(wind_gusts_10m)}</strong></li>
          <li><span>{t("fc.gustMax")}</span><strong>{maxGust === null ? "—" : units.wind(maxGust)}</strong></li>
          <li><span>{t("fc.dominant")}</span><strong>{dominant === null ? "—" : t(getDirectionKey(dominant))}</strong></li>
        </ul>
      </div>
    </Card>
  );
}

function UvCard({ data, hours }: { data: ForecastResponse; hours: HourPoint[] }) {
  const { t } = useI18n();
  const uv = hours[0]?.uv ?? null;
  const level = uv === null ? null : getUvLevel(uv);
  // Horário do pico: maior valor de hoje (as 24 primeiras horas da resposta).
  const today = data.hourly.uv_index.slice(0, 24);
  const peakIndex = today.reduce<number>((best, value, index) => ((value ?? -1) > (today[best] ?? -1) ? index : best), 0);
  const peakValue = data.daily.uv_index_max[0] ?? null;
  const position = uv === null ? 0 : Math.min(Math.max((uv / 12) * 100, 3), 97);

  return (
    <Card title={t("fc.uv")} Icon={Sun} style={levelStyle(level?.color ?? "#9db0bd")}>
      <div className="fc-value-row">
        <p className="fc-value">{uv === null ? "—" : Math.round(uv)}</p>
        <p className="fc-label">{level ? t(level.labelKey) : t("common.noData")}</p>
      </div>
      <div className="fc-uv-bar" aria-hidden="true">
        {uv !== null && <i className="fc-uv-marker" style={{ left: `${position}%` }} />}
      </div>
      {peakValue !== null && peakValue > 0 && (
        <p className="fc-caption">{t("fc.uvPeak", { value: Math.round(peakValue), hour: hourLabel(data.hourly.time[peakIndex]) })}</p>
      )}
      {level && <p className="fc-caption">{t(level.adviceKey)}</p>}
    </Card>
  );
}

function SunCard({ data }: { data: ForecastResponse }) {
  const { t } = useI18n();
  const sunrise = data.daily.sunrise[0];
  const sunset = data.daily.sunset[0];

  if (!sunrise || !sunset) {
    return (
      <Card title={t("fc.sun")} Icon={Sunset}>
        <p className="fc-caption">{t("fc.sunNone")}</p>
      </Card>
    );
  }

  const now = toMinutes(data.current.time);
  const rise = toMinutes(sunrise);
  const set = toMinutes(sunset);
  const isDay = now >= rise && now <= set;
  const progress = Math.min(Math.max((now - rise) / (set - rise), 0), 1);
  // Posição do sol no arco (semicírculo de raio 88 com centro em 100, 92).
  const angle = Math.PI * (1 - progress);
  const sunX = 100 + 88 * Math.cos(angle);
  const sunY = 92 - 88 * Math.sin(angle);
  const status =
    now < rise ? t("fc.sunRisesIn", { time: formatMinutes(rise - now) })
    : now > set ? t("fc.sunSet")
    : t("fc.sunUntilSet", { time: formatMinutes(set - now) });
  const daylight = data.daily.daylight_duration[0] ?? null;

  return (
    <Card title={t("fc.sun")} Icon={Sunset} className="fc-sun">
      <p className="fc-value">{sunset.slice(11, 16)}<small>{t("fc.sunsetLabel")}</small></p>
      <p className="fc-caption">{status}</p>
      <svg className="fc-sun-arc" viewBox="0 0 200 104" aria-hidden="true">
        <line className="fc-sun-horizon" x1="4" y1="92" x2="196" y2="92" />
        <path className="fc-sun-track" d="M 12 92 A 88 88 0 0 1 188 92" />
        <path className="fc-sun-progress" d="M 12 92 A 88 88 0 0 1 188 92" pathLength={100} strokeDasharray={`${progress * 100} 100`} />
        {isDay && <circle className="fc-sun-dot" cx={sunX} cy={sunY} r="7" />}
      </svg>
      <p className="fc-caption fc-sun-foot">
        {daylight === null
          ? t("fc.sunFootShort", { rise: sunrise.slice(11, 16) })
          : t("fc.sunFoot", { rise: sunrise.slice(11, 16), light: formatMinutes(daylight / 60) })}
      </p>
    </Card>
  );
}

function MoonCard({ data, latitude }: { data: ForecastResponse; latitude: number }) {
  const { t } = useI18n();
  const moon = getMoonInfo(data);
  const days = Math.round(moon.daysToFull);

  return (
    <Card title={t("fc.moon")} Icon={Moon}>
      <div className="fc-moon-row">
        <div>
          <p className="fc-label fc-label-plain">{t(moon.nameKey)}</p>
          <p className="fc-value">{Math.round(moon.illumination * 100)}<small>{t("fc.moonIllum")}</small></p>
        </div>
        <MoonDisc phase={moon.phase} flip={latitude < 0} />
      </div>
      <p className="fc-caption">
        {days === 0 ? t("fc.moonFullToday") : days === 1 ? t("fc.moonFullInOne") : t("fc.moonFullIn", { days })}
      </p>
    </Card>
  );
}

function HumidityCard({ data, hours }: { data: ForecastResponse; hours: HourPoint[] }) {
  const { t } = useI18n();
  const units = useUnits();
  const humidity = Math.round(data.current.relative_humidity_2m);
  const dewPoint = hours[0]?.dewPoint ?? null;
  const comfort = getComfort(dewPoint);

  return (
    <Card title={t("fc.humidity")} Icon={Droplets} className="fc-humidity" style={levelStyle(comfort.color)}>
      <div className="fc-water" aria-hidden="true">
        <div className="fc-water-fill" style={{ height: `${humidity}%` }} />
      </div>
      <p className="fc-value">{humidity}<small>%</small></p>
      <div className="fc-card-foot">
        <p className="fc-label">{t(comfort.labelKey)}</p>
        <p className="fc-caption">
          {dewPoint === null ? t("fc.dewPointNone") : t("fc.dewPoint", { value: units.temperature(dewPoint) })}
        </p>
      </div>
    </Card>
  );
}

function RainCard({ data, hours }: { data: ForecastResponse; hours: HourPoint[] }) {
  const { t } = useI18n();
  const units = useUnits();
  const raining = data.current.precipitation > 0;
  // A chuva "começa" na primeira hora com volume ou chance relevantes.
  const start = hours.find((hour) => (hour.precipitation ?? 0) >= 0.1 || (hour.probability ?? 0) >= 60);
  const peakValue = Math.max(0, ...hours.map((hour) => hour.precipitation ?? 0));
  const peakHour = hours.find((hour) => (hour.precipitation ?? 0) === peakValue);
  const peak =
    peakValue >= 0.1 && peakHour
      ? t("fc.rainPeak", { value: units.precipitation(peakValue, true), hour: hourLabel(peakHour.time) })
      : null;

  let summary = t("fc.rainNone");
  if (raining) {
    summary = peak ? t("fc.rainNowPeak", { peak }) : t("fc.rainNow");
  } else if (start) {
    summary = peak ? t("fc.rainStarts", { hour: hourLabel(start.time), peak }) : t("fc.rainStartsWeak", { hour: hourLabel(start.time) });
  }

  const sum = data.daily.precipitation_sum[0] ?? 0;
  const rainHours = data.daily.precipitation_hours[0] ?? 0;

  return (
    <Card title={t("fc.rain")} Icon={CloudRain} className="fc-wide">
      <p className="fc-sentence">{summary}</p>
      <dl className="fc-stat-row">
        <div><dt>{t("fc.rainTotal")}</dt><dd>{units.precipitation(sum)}</dd></div>
        <div><dt>{t("fc.rainHours")}</dt><dd>{Math.round(rainHours)} h</dd></div>
        <div><dt>{t("fc.rainPeakHour")}</dt><dd>{units.precipitation(peakValue, true)}</dd></div>
      </dl>
    </Card>
  );
}

function StormCard({ hours }: { hours: HourPoint[] }) {
  const { t } = useI18n();
  const units = useUnits();
  // Códigos 95 a 99 do WMO são trovoadas.
  const stormHours = hours.filter((hour) => (hour.code ?? 0) >= 95);
  const maxGust = Math.max(0, ...hours.map((hour) => hour.gust ?? 0));
  const gustHour = hours.find((hour) => (hour.gust ?? 0) === maxGust);

  let status = { label: t("fc.stormSafe"), color: "#63f59f", text: t("fc.stormSafeText") };
  if (stormHours.length > 0) {
    status = {
      label: t("fc.stormThunder"),
      color: "#ffa45c",
      text: t("fc.stormThunderText", { from: hourLabel(stormHours[0].time), to: hourLabel(stormHours[stormHours.length - 1].time) }),
    };
  } else if (maxGust >= 60) {
    status = { label: t("fc.stormGusts"), color: "#ffa45c", text: t("fc.stormGustsText") };
  }

  return (
    <Card title={t("fc.storm")} Icon={CloudLightning} className="fc-wide" style={levelStyle(status.color)}>
      <p className="fc-label fc-label-big">{status.label}</p>
      <p className="fc-sentence">{status.text}</p>
      <dl className="fc-stat-row">
        <div><dt>{t("fc.stormHours")}</dt><dd>{stormHours.length} h</dd></div>
        <div>
          <dt>{t("fc.stormMaxGust")}</dt>
          <dd>
            {units.wind(maxGust)}
            {gustHour && maxGust > 0 && ` ${t("fc.at", { hour: hourLabel(gustHour.time) })}`}
          </dd>
        </div>
      </dl>
    </Card>
  );
}

function PressureCard({ data, hours }: { data: ForecastResponse; hours: HourPoint[] }) {
  const { t } = useI18n();
  const units = useUnits();
  const pressure = data.current.pressure_msl;
  // Tendência: compara a pressão de agora com a de daqui a 3 horas (em hPa).
  const later = hours[3]?.pressure ?? null;
  const diff = later === null ? 0 : later - pressure;
  const trend =
    diff >= 1 ? { label: t("fc.trendUp"), note: t("fc.trendUpNote"), Icon: TrendingUp }
    : diff <= -1 ? { label: t("fc.trendDown"), note: t("fc.trendDownNote"), Icon: TrendingDown }
    : { label: t("fc.trendStable"), note: t("fc.trendStableNote"), Icon: Minus };
  const series = hours.map((hour) => hour.pressure).filter((value): value is number => value !== null);
  const shown = units.pressureParts(pressure);

  return (
    <Card title={t("fc.pressure")} Icon={Gauge} className="fc-wide">
      <div className="fc-pressure-body">
        <div className="fc-pressure-info">
          <p className="fc-value">{shown.value}<small>{shown.unit}</small></p>
          <p className="fc-trend"><trend.Icon aria-hidden="true" />{trend.label}</p>
          <p className="fc-caption">{trend.note}</p>
        </div>
        {series.length > 1 && (
          <div className="fc-spark-wrap">
            <Sparkline values={series} />
            <div className="fc-spark-labels"><span>{t("common.now")}</span><span>{t("fc.next24")}</span></div>
          </div>
        )}
      </div>
    </Card>
  );
}

function AtmosphereCard({ data, hours }: { data: ForecastResponse; hours: HourPoint[] }) {
  const { t, locale } = useI18n();
  const visibility = hours[0]?.visibility ?? null;
  const km = visibility === null ? null : visibility / 1000;
  const cover = Math.round(data.current.cloud_cover);

  return (
    <Card title={t("fc.atmosphere")} Icon={Eye} className="fc-wide">
      <div className="fc-metrics">
        <div className="fc-metric">
          <p className="fc-caption fc-caption-top">{t("fc.visibility")}</p>
          <p className="fc-value">{km === null ? "—" : formatNumber(Math.min(km, 99), locale)}{km !== null && <small>km</small>}</p>
          <p className="fc-caption">{km === null ? t("common.noData") : t(getVisibilityKey(km))}</p>
          <div className="fc-meter" aria-hidden="true"><i style={{ width: `${km === null ? 0 : Math.min(km / 20, 1) * 100}%` }} /></div>
        </div>
        <div className="fc-metric">
          <p className="fc-caption fc-caption-top">{t("fc.cloudCover")}</p>
          <p className="fc-value">{cover}<small>%</small></p>
          <p className="fc-caption">{t(getCloudKey(cover))}</p>
          <div className="fc-meter" aria-hidden="true"><i style={{ width: `${cover}%` }} /></div>
        </div>
      </div>
    </Card>
  );
}

// Todos os cartões, depois que os dados chegaram.
function ForecastContent({
  data,

  latitude,
}: {
  data: ForecastResponse;

  latitude: number;
}) {
  const hours = getNextHours(data);

  return (
    <div className="fc-grid">
      <WindCard data={data} />

      <UvCard data={data} hours={hours} />

      <SunCard data={data} />

      <MoonCard data={data} latitude={latitude} />

      <HumidityCard data={data} hours={hours} />

      <RainCard data={data} hours={hours} />

      <StormCard hours={hours} />

      <PressureCard data={data} hours={hours} />

      <AtmosphereCard data={data} hours={hours} />
    </div>
  );
}

/* ------------------------------------------------------------------------ */
/* Página                                                                   */
/* ------------------------------------------------------------------------ */

function ForecastPage({ city, refreshKey }: ForecastPageProps) {
  const { t } = useI18n();

  // "attempt" aumenta a cada clique em "Tentar novamente" e refaz o pedido.
  const [attempt, setAttempt] = useState(0);

  const [result, setResult] = useState<ForecastResult | null>(null);

  // Identifica o pedido atual (cidade + tentativa).
  const requestKey = `${city.latitude},${city.longitude},${attempt},${refreshKey}`;

  useEffect(() => {
    const controller = new AbortController();

    getForecast(city.latitude, city.longitude, controller.signal)
      .then((data) => setResult({ requestKey, data }))

      .catch((error: unknown) => {
        if ((error as Error).name === "AbortError") return;

        console.error("Erro ao buscar a previsão:", error);

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
    <section className="fc-page" aria-labelledby="forecast-page-title">
      <header className="fc-header">
        <h1 id="forecast-page-title">{t("nav.forecast")}</h1>

        <p className="fc-meta">
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
        <p className="fc-status" role="status">
          {t("fc.loading")}
        </p>
      )}

      {!isLoading && !data && (
        <div className="fc-error glass-panel" role="alert">
          <p>
            {t("fc.error")}
          </p>

          <button type="button" onClick={() => setAttempt((n) => n + 1)}>
            <RefreshCw aria-hidden="true" />
            {t("common.retry")}
          </button>
        </div>
      )}

      {data && <ForecastContent data={data} latitude={city.latitude} />}

      {data && (
        <p className="fc-footnote">
          {t("fc.footnote")}
        </p>
      )}
    </section>
  );
}

export default ForecastPage;
