/* ==========================================================================
   Weather Lab — dados e matemática do mapa (sem React e sem three.js)

   Ideia: pedimos à Open-Meteo o tempo em uma "grade" de pontos espalhados pelo
   planeta (um ponto a cada 15°). Depois suavizamos os valores entre os pontos e
   pintamos uma imagem do mundo inteiro, que o globo 3D usa como camada.
   ========================================================================== */

import type { TranslationKey } from "../i18n/translations";
import { MAP_CACHE_KEY } from "../settings/storage";

/* ------------------------------------------------------------------------ */
/* Camadas                                                                  */
/* ------------------------------------------------------------------------ */

export type LayerKey =
  | "clouds"
  | "temperature"
  | "precipitation"
  | "wind"
  | "pressure";

// Nomes das variáveis na API Open-Meteo.
type GridVariable =
  | "cloud_cover"
  | "temperature_2m"
  | "precipitation"
  | "wind_speed_10m"
  | "pressure_msl";

// "at" é o valor; entre dois pontos a cor e a opacidade são misturadas.
export interface ColorStop {
  at: number;

  color: string;

  alpha: number;
}

export interface LayerConfig {
  key: LayerKey;

    labelKey: TranslationKey; // nome da camada (traduzido na tela)


  variable: GridVariable;

  fallback: number; // usado se a API devolver "null" num ponto

  clamp: [number, number]; // limites físicos (evita valores impossíveis)

  stops: ColorStop[];
}

export const LAYERS: LayerConfig[] = [
  {
    key: "clouds",
    labelKey: "map.layer.clouds",
    variable: "cloud_cover",
    fallback: 0,
    clamp: [0, 100],
    stops: [
      { at: 0, color: "#ffffff", alpha: 0 },
      { at: 20, color: "#f1f6ff", alpha: 0.16 },
      { at: 50, color: "#f4f8ff", alpha: 0.55 },
      { at: 80, color: "#ffffff", alpha: 0.82 },
      { at: 100, color: "#ffffff", alpha: 0.92 },
    ],
  },
  {
    key: "temperature",
    labelKey: "map.layer.temperature",
    variable: "temperature_2m",
    fallback: 15,
    clamp: [-40, 50],
    stops: [
      { at: -30, color: "#5b3fc7", alpha: 0.75 },
      { at: -15, color: "#3a64e0", alpha: 0.75 },
      { at: 0, color: "#3aa8f0", alpha: 0.72 },
      { at: 10, color: "#4fe0c8", alpha: 0.7 },
      { at: 18, color: "#86e678", alpha: 0.7 },
      { at: 25, color: "#ffe066", alpha: 0.72 },
      { at: 32, color: "#ff9a3c", alpha: 0.75 },
      { at: 38, color: "#ff5a3c", alpha: 0.78 },
      { at: 45, color: "#c1243f", alpha: 0.8 },
    ],
  },
  {
    key: "precipitation",
    labelKey: "map.layer.precipitation",
    variable: "precipitation",
    fallback: 0,
    clamp: [0, 30],
    stops: [
      { at: 0, color: "#7fd8ff", alpha: 0 },
      { at: 0.1, color: "#7fd8ff", alpha: 0.35 },
      { at: 1, color: "#3ea0ff", alpha: 0.7 },
      { at: 3, color: "#3fd18a", alpha: 0.78 },
      { at: 7, color: "#ffd23c", alpha: 0.82 },
      { at: 14, color: "#ff6b3c", alpha: 0.86 },
      { at: 20, color: "#d13cff", alpha: 0.9 },
    ],
  },
  {
    key: "wind",
    labelKey: "map.layer.wind",
    variable: "wind_speed_10m",
    fallback: 0,
    clamp: [0, 140],
    stops: [
      { at: 0, color: "#2b4a7a", alpha: 0.15 },
      { at: 10, color: "#3a8dde", alpha: 0.45 },
      { at: 25, color: "#4fe0b0", alpha: 0.65 },
      { at: 40, color: "#ffe066", alpha: 0.72 },
      { at: 60, color: "#ff9a3c", alpha: 0.78 },
      { at: 80, color: "#e8402f", alpha: 0.82 },
      { at: 100, color: "#c13cff", alpha: 0.88 },
    ],
  },
  {
    key: "pressure",
    labelKey: "map.layer.pressure",
    variable: "pressure_msl",
    fallback: 1013,
    clamp: [900, 1080],
    stops: [
      { at: 980, color: "#d94c8a", alpha: 0.7 },
      { at: 995, color: "#9a6ae8", alpha: 0.65 },
      { at: 1005, color: "#4f8ff0", alpha: 0.6 },
      { at: 1013, color: "#5fe0d6", alpha: 0.5 },
      { at: 1022, color: "#9be88a", alpha: 0.6 },
      { at: 1032, color: "#ffd260", alpha: 0.68 },
      { at: 1045, color: "#ff8a3c", alpha: 0.75 },
    ],
  },
];

/* ------------------------------------------------------------------------ */
/* Grade de pontos e horários                                               */
/* ------------------------------------------------------------------------ */

export const LAT_START = -75;

export const LAT_STEP = 15;

export const ROWS = 11; // -75, -60 ... 75

export const LNG_START = -180;

export const LNG_STEP = 15;

export const COLS = 24; // -180, -165 ... 165

export const GRID_POINTS = ROWS * COLS;

// Horários que o mapa permite escolher (horas a partir de agora).
export const FORECAST_STEPS = [{ hours: 0 }, { hours: 6 }, { hours: 12 }, { hours: 24 }];

const LAST_HOUR = FORECAST_STEPS[FORECAST_STEPS.length - 1].hours;



const CACHE_MAX_AGE_MS = 45 * 60 * 1000; // reaproveita os dados por 45 minutos

// values[camada][horário][ponto da grade]
export interface MapGrid {
  savedAt: number;

  times: number[]; // segundos desde 1970 (UTC), um por horário

  values: Record<LayerKey, number[][]>;
}

/* ------------------------------------------------------------------------ */
/* API (Open-Meteo)                                                         */
/* ------------------------------------------------------------------------ */

function buildGridUrl(): string {
  const latitudes: number[] = [];

  const longitudes: number[] = [];

  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      latitudes.push(LAT_START + row * LAT_STEP);

      longitudes.push(LNG_START + col * LNG_STEP);
    }
  }

  const variables = LAYERS.map((layer) => layer.variable).join(",");

  return `https://api.open-meteo.com/v1/forecast?latitude=${latitudes.join(
    ",",
  )}&longitude=${longitudes.join(
    ",",
  )}&hourly=${variables}&forecast_hours=${LAST_HOUR + 1}&timeformat=unixtime`;
}

interface GridLocation {
  hourly: { time: number[] } & Record<GridVariable, (number | null)[]>;
}

// Transforma a resposta da API (uma lista com um item por ponto) na nossa estrutura.
export function parseGridResponse(json: unknown): MapGrid {
  if (!Array.isArray(json) || json.length !== GRID_POINTS) {
    throw new Error("Resposta inesperada da API do mapa.");
  }

  const locations = json as GridLocation[];

  const values = {} as Record<LayerKey, number[][]>;

  for (const layer of LAYERS) {
    values[layer.key] = FORECAST_STEPS.map(({ hours }) =>
      locations.map((location) => {
        const value = location.hourly[layer.variable]?.[hours];

        return typeof value === "number" ? value : layer.fallback;
      }),
    );
  }

  return {
    savedAt: Date.now(),

    times: FORECAST_STEPS.map(({ hours }) => locations[0].hourly.time[hours]),

    values,
  };
}

function isMapGrid(value: unknown): value is MapGrid {
  if (typeof value !== "object" || value === null) return false;

  const grid = value as Partial<MapGrid>;

  if (typeof grid.savedAt !== "number" || !Array.isArray(grid.times)) {
    return false;
  }

  if (grid.times.length !== FORECAST_STEPS.length || !grid.values) return false;

  return LAYERS.every((layer) => {
    const steps = grid.values?.[layer.key];

    return (
      Array.isArray(steps) &&
      steps.length === FORECAST_STEPS.length &&
      steps.every((step) => Array.isArray(step) && step.length === GRID_POINTS)
    );
  });
}

function readGridCache(): MapGrid | null {
  try {
    const raw = localStorage.getItem(MAP_CACHE_KEY);

    if (!raw) return null;

    const data: unknown = JSON.parse(raw);

    if (!isMapGrid(data)) return null;

    return Date.now() - data.savedAt < CACHE_MAX_AGE_MS ? data : null;
  } catch {
    return null;
  }
}

function writeGridCache(grid: MapGrid) {
  try {
    localStorage.setItem(MAP_CACHE_KEY, JSON.stringify(grid));
  } catch (error) {
    console.error("Erro ao salvar o cache do mapa:", error);
  }
}

// Busca a grade (ou reaproveita a que já foi baixada nos últimos 45 minutos).
export async function getMapGrid(signal: AbortSignal, force = false): Promise<MapGrid> {
  const cached = force ? null : readGridCache();

  if (cached) return cached;

  const response = await fetch(buildGridUrl(), { signal });

  if (!response.ok) {
    throw new Error("Não foi possível buscar os dados do mapa.");
  }

  const grid = parseGridResponse(await response.json());

  writeGridCache(grid);

  return grid;
}

/* ------------------------------------------------------------------------ */
/* Suavização entre os pontos da grade (interpolação cúbica)                */
/* ------------------------------------------------------------------------ */

// Para um ponto do mundo, quais 4 linhas/colunas da grade usar e com que peso.
interface AxisSample {
  indices: number[];

  weights: number[];
}

// Pesos de Catmull-Rom: curva suave que passa pelos pontos da grade.
function cubicWeights(t: number): number[] {
  const t2 = t * t;

  const t3 = t2 * t;

  return [
    -0.5 * t3 + t2 - 0.5 * t,

    1.5 * t3 - 2.5 * t2 + 1,

    -1.5 * t3 + 2 * t2 + 0.5 * t,

    0.5 * t3 - 0.5 * t2,
  ];
}

// Latitude: nos polos usamos a linha mais próxima.
export function sampleRow(lat: number): AxisSample {
  const position = Math.min(
    Math.max((lat - LAT_START) / LAT_STEP, 0),

    ROWS - 1,
  );

  const base = Math.min(Math.floor(position), ROWS - 1);

  const t = base === ROWS - 1 ? 0 : position - base;

  return {
    indices: [base - 1, base, base + 1, base + 2].map((index) =>
      Math.min(Math.max(index, 0), ROWS - 1),
    ),

    weights: cubicWeights(t),
  };
}

// Longitude: o mundo "dá a volta" (depois de 165° volta para -180°).
export function sampleColumn(lng: number): AxisSample {
  const raw = (lng - LNG_START) / LNG_STEP;

  const position = ((raw % COLS) + COLS) % COLS;

  const base = Math.floor(position);

  return {
    indices: [base - 1, base, base + 1, base + 2].map(
      (index) => (index + COLS) % COLS,
    ),

    weights: cubicWeights(position - base),
  };
}

function clamp(value: number, [min, max]: [number, number]): number {
  return Math.min(Math.max(value, min), max);
}

// Valor de uma camada em qualquer ponto do mundo.
export function sampleAt(
  values: number[],

  lat: number,

  lng: number,

  limits: [number, number],
): number {
  const row = sampleRow(lat);

  const column = sampleColumn(lng);

  let sum = 0;

  for (let i = 0; i < 4; i++) {
    let rowSum = 0;

    for (let j = 0; j < 4; j++) {
      rowSum +=
        column.weights[j] * values[row.indices[i] * COLS + column.indices[j]];
    }

    sum += row.weights[i] * rowSum;
  }

  return clamp(sum, limits);
}

/* ------------------------------------------------------------------------ */
/* Cores                                                                    */
/* ------------------------------------------------------------------------ */

const LOOKUP_SIZE = 512;

function hexToRgb(hex: string): [number, number, number] {
  const value = parseInt(hex.slice(1), 16);

  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

// Mistura as cores entre os dois "stops" que cercam o valor.
function colorAt(stops: ColorStop[], value: number): [number, number, number, number] {
  const first = stops[0];

  const last = stops[stops.length - 1];

  if (value <= first.at) return [...hexToRgb(first.color), first.alpha];

  if (value >= last.at) return [...hexToRgb(last.color), last.alpha];

  let index = 0;

  while (stops[index + 1].at < value) index++;

  const from = stops[index];

  const to = stops[index + 1];

  const f = (value - from.at) / (to.at - from.at);

  const a = hexToRgb(from.color);

  const b = hexToRgb(to.color);

  return [
    a[0] + (b[0] - a[0]) * f,

    a[1] + (b[1] - a[1]) * f,

    a[2] + (b[2] - a[2]) * f,

    from.alpha + (to.alpha - from.alpha) * f,
  ];
}

// Tabela pronta de cores (evita misturar cores para cada um dos 500 mil pixels).
function buildLookup(layer: LayerConfig): Uint8Array {
  const [min, max] = layer.clamp;

  const table = new Uint8Array(LOOKUP_SIZE * 4);

  for (let i = 0; i < LOOKUP_SIZE; i++) {
    const value = min + (i / (LOOKUP_SIZE - 1)) * (max - min);

    const [r, g, b, a] = colorAt(layer.stops, value);

    table.set([r, g, b, a * 255], i * 4);
  }

  return table;
}

/* ------------------------------------------------------------------------ */
/* Imagem do mundo inteiro                                                  */
/* ------------------------------------------------------------------------ */

interface AxisCache {
  rows: AxisSample[];

  columns: AxisSample[];
}

const axisCache = new Map<string, AxisCache>();

function getAxes(width: number, height: number): AxisCache {
  const key = `${width}x${height}`;

  let axes = axisCache.get(key);

  if (!axes) {
    axes = {
      // linha 0 = polo sul (é a ordem que a textura do three.js espera)
      rows: Array.from({ length: height }, (_, y) =>
        sampleRow(-90 + ((y + 0.5) / height) * 180),
      ),

      columns: Array.from({ length: width }, (_, x) =>
        sampleColumn(-180 + ((x + 0.5) / width) * 360),
      ),
    };

    axisCache.set(key, axes);
  }

  return axes;
}

// Gera os pixels (RGBA) da camada: uma imagem "equirretangular" do planeta.
// A linha 0 é o polo sul e a última é o polo norte.
export function renderLayerPixels(
  values: number[],

  layer: LayerConfig,

  width: number,

  height: number,
): Uint8Array {
  const { rows, columns } = getAxes(width, height);

  const lookup = buildLookup(layer);

  const [min, max] = layer.clamp;

  const output = new Uint8Array(width * height * 4);

  for (let y = 0; y < height; y++) {
    const row = rows[y];

    for (let x = 0; x < width; x++) {
      const column = columns[x];

      let sum = 0;

      for (let i = 0; i < 4; i++) {
        const base = row.indices[i] * COLS;

        let rowSum = 0;

        for (let j = 0; j < 4; j++) {
          rowSum += column.weights[j] * values[base + column.indices[j]];
        }

        sum += row.weights[i] * rowSum;
      }

      const value = Math.min(Math.max(sum, min), max);

      const lookupIndex =
        Math.round(((value - min) / (max - min)) * (LOOKUP_SIZE - 1)) * 4;

      output.set(lookup.subarray(lookupIndex, lookupIndex + 4), (y * width + x) * 4);
    }
  }

  return output;
}

/* ------------------------------------------------------------------------ */
/* Textos e legenda                                                         */
/* ------------------------------------------------------------------------ */

// Faixa de cores da legenda (CSS), na mesma escala da camada.
export function legendGradient(layer: LayerConfig): string {
  const first = layer.stops[0].at;

  const last = layer.stops[layer.stops.length - 1].at;

  const parts = layer.stops.map((stop) => {
    const [r, g, b] = hexToRgb(stop.color);

    const position = ((stop.at - first) / (last - first)) * 100;

    return `rgba(${r}, ${g}, ${b}, ${stop.alpha}) ${position.toFixed(1)}%`;
  });

  return `linear-gradient(90deg, ${parts.join(", ")})`;
}

export function legendRange(layer: LayerConfig): [number, number] {
  return [layer.stops[0].at, layer.stops[layer.stops.length - 1].at];
}
